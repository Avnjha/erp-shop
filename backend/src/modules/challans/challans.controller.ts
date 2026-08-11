import { Response } from 'express';
import pool from '../../db/pool';
import { AuthRequest } from '../../types';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import { getPagination } from '../../utils/pagination';

async function generateChallanNumber(client: typeof pool): Promise<string> {
  const now = new Date();
  const prefix = `CHN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const res = await client.query(
    `SELECT challan_number FROM challans WHERE challan_number LIKE $1 ORDER BY challan_number DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let seq = 1;
  if (res.rows[0]) {
    const last = res.rows[0].challan_number as string;
    seq = parseInt(last.split('-').pop() || '0', 10) + 1;
  }
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export async function getChallans(req: AuthRequest, res: Response) {
  const { page, limit, search, status, customer_id } = req.query as Record<string, string>;
  const { page: p, limit: l, offset } = getPagination(page, limit);
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(ch.challan_number ILIKE $${idx} OR c.name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (status) { conditions.push(`ch.status = $${idx++}`); params.push(status); }
    if (customer_id) { conditions.push(`ch.customer_id = $${idx++}`); params.push(customer_id); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM challans ch LEFT JOIN customers c ON c.id = ch.customer_id ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await pool.query(
      `SELECT ch.*, c.name AS customer_name, u.name AS created_by_name
       FROM challans ch
       LEFT JOIN customers c ON c.id = ch.customer_id
       LEFT JOIN users u ON u.id = ch.created_by
       ${where}
       ORDER BY ch.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, l, offset]
    );

    return sendPaginated(res, dataRes.rows, total, p, l);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function getChallan(req: AuthRequest, res: Response) {
  try {
    const challanRes = await pool.query(
      `SELECT ch.*, c.name AS customer_name, u.name AS created_by_name
       FROM challans ch
       LEFT JOIN customers c ON c.id = ch.customer_id
       LEFT JOIN users u ON u.id = ch.created_by
       WHERE ch.id = $1`,
      [req.params.id]
    );
    if (!challanRes.rows[0]) return sendError(res, 'Challan not found', 404);

    const itemsRes = await pool.query(
      `SELECT ci.*, p.name AS product_name, p.sku AS product_sku
       FROM challan_items ci
       LEFT JOIN products p ON p.id = ci.product_id
       WHERE ci.challan_id = $1
       ORDER BY ci.created_at`,
      [req.params.id]
    );

    return sendSuccess(res, { ...challanRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function createChallan(req: AuthRequest, res: Response) {
  const { customer_id, items, notes, status } = req.body;
  // items: [{ product_id, quantity }]
  const targetStatus = status === 'Confirmed' ? 'Confirmed' : 'Draft';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch customer snapshot
    const custRes = await client.query(
      'SELECT id, name, mobile, business_name, gst_number, address FROM customers WHERE id = $1',
      [customer_id]
    );
    if (!custRes.rows[0]) { await client.query('ROLLBACK'); return sendError(res, 'Customer not found', 404); }
    const customerSnapshot = custRes.rows[0];

    // Validate and collect product snapshots
    type ItemData = { product_id: string; quantity: number; unit_price: number; snapshot: object };
    const itemData: ItemData[] = [];
    let totalQty = 0;
    let totalAmt = 0;

    for (const item of items as { product_id: string; quantity: number }[]) {
      if (!item.product_id || !item.quantity || item.quantity < 1) {
        await client.query('ROLLBACK');
        return sendError(res, 'Each item must have product_id and quantity >= 1', 400);
      }

      const prodRes = await client.query(
        'SELECT id, name, sku, unit_price, current_stock FROM products WHERE id = $1 AND is_active = TRUE FOR UPDATE',
        [item.product_id]
      );
      if (!prodRes.rows[0]) {
        await client.query('ROLLBACK');
        return sendError(res, `Product ${item.product_id} not found`, 404);
      }

      const prod = prodRes.rows[0];

      // Check stock only if confirming
      if (targetStatus === 'Confirmed' && prod.current_stock < item.quantity) {
        await client.query('ROLLBACK');
        return sendError(res, `Insufficient stock for "${prod.name}". Available: ${prod.current_stock}, Requested: ${item.quantity}`, 400);
      }

      itemData.push({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: parseFloat(prod.unit_price),
        snapshot: { name: prod.name, sku: prod.sku, unit_price: prod.unit_price },
      });
      totalQty += item.quantity;
      totalAmt += item.quantity * parseFloat(prod.unit_price);
    }

    const challanNumber = await generateChallanNumber(pool);

    const challanRes = await client.query(
      `INSERT INTO challans (challan_number, customer_id, customer_snapshot, total_quantity, total_amount, status, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [challanNumber, customer_id, JSON.stringify(customerSnapshot), totalQty, totalAmt, targetStatus, notes || null, req.user?.userId]
    );
    const challan = challanRes.rows[0];

    // Insert items
    for (const item of itemData) {
      await client.query(
        `INSERT INTO challan_items (challan_id, product_id, product_snapshot, quantity, unit_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [challan.id, item.product_id, JSON.stringify(item.snapshot), item.quantity, item.unit_price]
      );
    }

    // Deduct stock if confirmed
    if (targetStatus === 'Confirmed') {
      for (const item of itemData) {
        await client.query(
          'UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, item.product_id]
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, quantity, movement_type, reason, reference_id, created_by)
           VALUES ($1,$2,'OUT',$3,$4,$5)`,
          [item.product_id, item.quantity, `Challan: ${challanNumber}`, challan.id, req.user?.userId]
        );
      }
    }

    await client.query('COMMIT');
    return sendSuccess(res, { ...challan, items: itemData }, 'Challan created', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return sendError(res, 'Server error', 500);
  } finally {
    client.release();
  }
}

export async function confirmChallan(req: AuthRequest, res: Response) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const challanRes = await client.query(
      'SELECT * FROM challans WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!challanRes.rows[0]) { await client.query('ROLLBACK'); return sendError(res, 'Challan not found', 404); }
    const challan = challanRes.rows[0];

    if (challan.status !== 'Draft') {
      await client.query('ROLLBACK');
      return sendError(res, `Cannot confirm challan with status: ${challan.status}`, 400);
    }

    const itemsRes = await client.query(
      'SELECT * FROM challan_items WHERE challan_id = $1',
      [challan.id]
    );

    // Check stock for all items first
    for (const item of itemsRes.rows) {
      const prodRes = await client.query(
        'SELECT id, name, current_stock FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      if (!prodRes.rows[0]) { await client.query('ROLLBACK'); return sendError(res, `Product not found`, 404); }
      if (prodRes.rows[0].current_stock < item.quantity) {
        await client.query('ROLLBACK');
        return sendError(res, `Insufficient stock for "${prodRes.rows[0].name}". Available: ${prodRes.rows[0].current_stock}, Required: ${item.quantity}`, 400);
      }
    }

    // Deduct stock
    for (const item of itemsRes.rows) {
      await client.query(
        'UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2',
        [item.quantity, item.product_id]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, quantity, movement_type, reason, reference_id, created_by)
         VALUES ($1,$2,'OUT',$3,$4,$5)`,
        [item.product_id, item.quantity, `Challan: ${challan.challan_number}`, challan.id, req.user?.userId]
      );
    }

    await client.query(
      "UPDATE challans SET status='Confirmed', updated_at=NOW() WHERE id=$1",
      [challan.id]
    );

    await client.query('COMMIT');
    return sendSuccess(res, { challan_number: challan.challan_number, status: 'Confirmed' }, 'Challan confirmed');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return sendError(res, 'Server error', 500);
  } finally {
    client.release();
  }
}

export async function cancelChallan(req: AuthRequest, res: Response) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const challanRes = await client.query(
      'SELECT * FROM challans WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!challanRes.rows[0]) { await client.query('ROLLBACK'); return sendError(res, 'Challan not found', 404); }
    const challan = challanRes.rows[0];

    if (challan.status === 'Cancelled') {
      await client.query('ROLLBACK');
      return sendError(res, 'Challan is already cancelled', 400);
    }

    // If confirmed, restore stock
    if (challan.status === 'Confirmed') {
      const itemsRes = await client.query(
        'SELECT * FROM challan_items WHERE challan_id = $1',
        [challan.id]
      );
      for (const item of itemsRes.rows) {
        await client.query(
          'UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, item.product_id]
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, quantity, movement_type, reason, reference_id, created_by)
           VALUES ($1,$2,'IN',$3,$4,$5)`,
          [item.product_id, item.quantity, `Cancelled Challan: ${challan.challan_number}`, challan.id, req.user?.userId]
        );
      }
    }

    await client.query(
      "UPDATE challans SET status='Cancelled', updated_at=NOW() WHERE id=$1",
      [challan.id]
    );

    await client.query('COMMIT');
    return sendSuccess(res, { challan_number: challan.challan_number, status: 'Cancelled' }, 'Challan cancelled');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return sendError(res, 'Server error', 500);
  } finally {
    client.release();
  }
}
