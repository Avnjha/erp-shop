import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../../db/pool';
import { config } from '../../config';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthRequest } from '../../types';

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) return sendError(res, 'Invalid email or password', 401);
    if (!user.is_active) return sendError(res, 'Account is inactive', 403);

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return sendError(res, 'Invalid email or password', 401);

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    return sendSuccess(res, {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    }, 'Login successful');
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function getProfile(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE id = $1',
      [req.user?.userId]
    );
    if (!result.rows[0]) return sendError(res, 'User not found', 404);
    return sendSuccess(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function getUsers(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    return sendSuccess(res, result.rows);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}

export async function createUser(req: AuthRequest, res: Response) {
  const { name, email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, is_active, created_at`,
      [name, email.toLowerCase(), hash, role]
    );
    return sendSuccess(res, result.rows[0], 'User created', 201);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') return sendError(res, 'Email already exists', 409);
    console.error(err);
    return sendError(res, 'Server error', 500);
  }
}
