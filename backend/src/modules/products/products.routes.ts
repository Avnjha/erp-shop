import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  getProducts, getProduct, createProduct, updateProduct,
  adjustStock, getStockMovements, getCategories, createCategory
} from './products.controller';

const router = Router();
router.use(authenticate);

const productValidation = [
  body('name').notEmpty().withMessage('Name required'),
  body('sku').notEmpty().withMessage('SKU required'),
  body('unit_price').isFloat({ min: 0 }).withMessage('Valid unit price required'),
];

// Categories
router.get('/categories', getCategories);
router.post(
  '/categories',
  authorize('admin', 'warehouse'),
  [body('name').notEmpty().withMessage('Category name required')],
  validate,
  createCategory
);

// Products
router.get('/', getProducts);
router.get('/:id', getProduct);
router.post('/', authorize('admin', 'warehouse'), productValidation, validate, createProduct);
router.put('/:id', authorize('admin', 'warehouse'), productValidation, validate, updateProduct);

// Stock
router.get('/:id/movements', getStockMovements);
router.post(
  '/:id/adjust-stock',
  authorize('admin', 'warehouse'),
  [
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be positive integer'),
    body('movement_type').isIn(['IN', 'OUT']).withMessage('Movement type must be IN or OUT'),
  ],
  validate,
  adjustStock
);

export default router;
