import { Response } from 'express';
import pool from '../../db/pool';
import { AuthRequest } from '../../types';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import { getPagination } from '../../utils/pagination';

export async function getCustomers(req: AuthRequest, res: Response) {
  const { page, limit, search, status, customer_type } = req.query as Record<string, string>;
  const { page: p, limit: l, offset } = getPagination(page, limit);

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(c.name ILIKE $${idx} OR c.mobile ILIKE $${idx} OR c.business_name ILIKE $${idx} OR c.email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (status) { conditions.push(`c.status = $${idx++}`); params.push(status); }
    if (customer_type) { conditions.push(`c.customer_type = $${idx++}`); params.push(customer_type); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM customers c ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await pool.query(
      `SELECT c.*, u.name AS created_by_name
       FROM customers c
       LEFT JOIN users u ON u.id = c.created_by
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, l, offset]
    );

    return sendPaginated(res, dataRes.rows, total, p, l);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function getCustomer(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS created_by_name
       FROM customers c
       LEFT JOIN users u ON u.id = c.created_by
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return sendError(res, 'Customer not found', 404);

    // Also fetch follow-ups
    const followups = await pool.query(
      `SELECT f.*, u.name AS created_by_name
       FROM customer_followups f
       LEFT JOIN users u ON u.id = f.created_by
       WHERE f.customer_id = $1
       ORDER BY f.created_at DESC`,
      [req.params.id]
    );

    return sendSuccess(res, { ...result.rows[0], followups: followups.rows });
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function createCustomer(req: AuthRequest, res: Response) {
  const { name, mobile, email, business_name, gst_number, customer_type, address, status, follow_up_date, notes } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO customers (name, mobile, email, business_name, gst_number, customer_type, address, status, follow_up_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [name, mobile, email || null, business_name || null, gst_number || null, customer_type, address || null, status || 'Lead', follow_up_date || null, notes || null, req.user?.userId]
    );
    return sendSuccess(res, result.rows[0], 'Customer created', 201);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function updateCustomer(req: AuthRequest, res: Response) {
  const { name, mobile, email, business_name, gst_number, customer_type, address, status, follow_up_date, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE customers SET
         name=$1, mobile=$2, email=$3, business_name=$4, gst_number=$5,
         customer_type=$6, address=$7, status=$8, follow_up_date=$9, notes=$10,
         updated_at=NOW()
       WHERE id=$11
       RETURNING *`,
      [name, mobile, email || null, business_name || null, gst_number || null, customer_type, address || null, status, follow_up_date || null, notes || null, req.params.id]
    );
    if (!result.rows[0]) return sendError(res, 'Customer not found', 404);
    return sendSuccess(res, result.rows[0], 'Customer updated');
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function addFollowup(req: AuthRequest, res: Response) {
  const { note, follow_up_date } = req.body;
  try {
    // Verify customer exists
    const cust = await pool.query('SELECT id FROM customers WHERE id = $1', [req.params.id]);
    if (!cust.rows[0]) return sendError(res, 'Customer not found', 404);

    const result = await pool.query(
      `INSERT INTO customer_followups (customer_id, note, follow_up_date, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.id, note, follow_up_date || null, req.user?.userId]
    );

    // Update customer follow_up_date if provided
    if (follow_up_date) {
      await pool.query(
        'UPDATE customers SET follow_up_date=$1, updated_at=NOW() WHERE id=$2',
        [follow_up_date, req.params.id]
      );
    }

    return sendSuccess(res, result.rows[0], 'Follow-up added', 201);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function getFollowups(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(
      `SELECT f.*, u.name AS created_by_name
       FROM customer_followups f
       LEFT JOIN users u ON u.id = f.created_by
       WHERE f.customer_id = $1
       ORDER BY f.created_at DESC`,
      [req.params.id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}
