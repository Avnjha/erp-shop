import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getChallans, getChallan, createChallan, confirmChallan, cancelChallan } from './challans.controller';

const router = Router();
router.use(authenticate);

router.get('/', getChallans);
router.get('/:id', getChallan);

router.post(
  '/',
  authorize('admin', 'sales'),
  [
    body('customer_id').notEmpty().withMessage('Customer ID required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item required'),
    body('items.*.product_id').notEmpty().withMessage('Each item needs product_id'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Each item needs quantity >= 1'),
  ],
  validate,
  createChallan
);

router.patch('/:id/confirm', authorize('admin', 'sales'), confirmChallan);
router.patch('/:id/cancel', authorize('admin', 'sales'), cancelChallan);

export default router;
