import { Router } from 'express';
import { body } from 'express-validator';
import { login, getProfile, getUsers, createUser } from './auth.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

// POST /auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  validate,
  login
);

// GET /auth/profile
router.get('/profile', authenticate, getProfile);

// GET /auth/users  (admin only)
router.get('/users', authenticate, authorize('admin'), getUsers);

// POST /auth/users  (admin only)
router.post(
  '/users',
  authenticate,
  authorize('admin'),
  [
    body('name').notEmpty().withMessage('Name required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
    body('role').isIn(['admin', 'sales', 'warehouse', 'accounts']).withMessage('Invalid role'),
  ],
  validate,
  createUser
);

export default router;
