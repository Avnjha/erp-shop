import { Response } from 'express';
import pool from '../../db/pool';
import { AuthRequest } from '../../types';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import { getPagination } from '../../utils/pagination';

export async function getProducts(req: AuthRequest, res: Response) {
  const { page, limit, search, category_id, low_stock } = req.query as Record<string, string>;
  const { page: p, limit: l, offset } = getPagination(page, limit);

  try {
    const conditions: string[] = ['pr.is_active = TRUE'];
    const params: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(pr.name ILIKE $${idx} OR pr.sku ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (category_id) { conditions.push(`pr.category_id = $${idx++}`); params.push(category_id); }
    if (low_stock === 'true') { conditions.push(`pr.current_stock <= pr.min_stock_alert`); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countRes = await pool.query(`SELECT COUNT(*) FROM products pr ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await pool.query(
      `SELECT pr.*, pc.name AS category_name
       FROM products pr
       LEFT JOIN product_categories pc ON pc.id = pr.category_id
       ${where}
       ORDER BY pr.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, l, offset]
    );

    return sendPaginated(res, dataRes.rows, total, p, l);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function getProduct(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(
      `SELECT pr.*, pc.name AS category_name
       FROM products pr
       LEFT JOIN product_categories pc ON pc.id = pr.category_id
       WHERE pr.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return sendError(res, 'Product not found', 404);
    return sendSuccess(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function createProduct(req: AuthRequest, res: Response) {
  const { name, sku, category_id, unit_price, current_stock, min_stock_alert, location } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO products (name, sku, category_id, unit_price, current_stock, min_stock_alert, location, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [name, sku, category_id || null, unit_price, current_stock || 0, min_stock_alert || 5, location || null, req.user?.userId]
    );

    // Log initial stock movement if stock > 0
    if (current_stock > 0) {
      await pool.query(
        `INSERT INTO stock_movements (product_id, quantity, movement_type, reason, created_by)
         VALUES ($1,$2,'IN','Initial stock',  $3)`,
        [result.rows[0].id, current_stock, req.user?.userId]
      );
    }

    return sendSuccess(res, result.rows[0], 'Product created', 201);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') return sendError(res, 'SKU already exists', 409);
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function updateProduct(req: AuthRequest, res: Response) {
  const { name, sku, category_id, unit_price, min_stock_alert, location } = req.body;
  try {
    const result = await pool.query(
      `UPDATE products SET name=$1, sku=$2, category_id=$3, unit_price=$4,
         min_stock_alert=$5, location=$6, updated_at=NOW()
       WHERE id=$7
       RETURNING *`,
      [name, sku, category_id || null, unit_price, min_stock_alert || 5, location || null, req.params.id]
    );
    if (!result.rows[0]) return sendError(res, 'Product not found', 404);
    return sendSuccess(res, result.rows[0], 'Product updated');
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') return sendError(res, 'SKU already exists', 409);
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function adjustStock(req: AuthRequest, res: Response) {
  const { quantity, movement_type, reason } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prodRes = await client.query('SELECT id, current_stock FROM products WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!prodRes.rows[0]) { await client.query('ROLLBACK'); return sendError(res, 'Product not found', 404); }

    const product = prodRes.rows[0];
    const newStock = movement_type === 'IN'
      ? product.current_stock + quantity
      : product.current_stock - quantity;

    if (newStock < 0) {
      await client.query('ROLLBACK');
      return sendError(res, `Insufficient stock. Available: ${product.current_stock}`, 400);
    }

    await client.query(
      'UPDATE products SET current_stock=$1, updated_at=NOW() WHERE id=$2',
      [newStock, req.params.id]
    );

    const mvmt = await client.query(
      `INSERT INTO stock_movements (product_id, quantity, movement_type, reason, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, quantity, movement_type, reason || null, req.user?.userId]
    );

    await client.query('COMMIT');
    return sendSuccess(res, { movement: mvmt.rows[0], new_stock: newStock }, 'Stock adjusted');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return sendError(res, 'Server error', 500);
  } finally {
    client.release();
  }
}

export async function getStockMovements(req: AuthRequest, res: Response) {
  const { page, limit } = req.query as Record<string, string>;
  const { page: p, limit: l, offset } = getPagination(page, limit);
  try {
    const countRes = await pool.query(
      'SELECT COUNT(*) FROM stock_movements WHERE product_id=$1',
      [req.params.id]
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(
      `SELECT sm.*, u.name AS created_by_name
       FROM stock_movements sm
       LEFT JOIN users u ON u.id = sm.created_by
       WHERE sm.product_id = $1
       ORDER BY sm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, l, offset]
    );
    return sendPaginated(res, result.rows, total, p, l);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function getCategories(_req: AuthRequest, res: Response) {
  try {
    const result = await pool.query('SELECT * FROM product_categories ORDER BY name');
    return sendSuccess(res, result.rows);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function createCategory(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(
      'INSERT INTO product_categories (name) VALUES ($1) RETURNING *',
      [req.body.name]
    );
    return sendSuccess(res, result.rows[0], 'Category created', 201);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') return sendError(res, 'Category already exists', 409);
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}
