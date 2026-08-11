import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  getCustomers, getCustomer, createCustomer, updateCustomer,
  addFollowup, getFollowups
} from './customers.controller';

const router = Router();

const customerValidation = [
  body('name').notEmpty().withMessage('Name required'),
  body('mobile').notEmpty().withMessage('Mobile required'),
  body('customer_type').isIn(['Retail', 'Wholesale', 'Distributor']).withMessage('Invalid customer type'),
];

// All routes require authentication
router.use(authenticate);

router.get('/', getCustomers);
router.get('/:id', getCustomer);
router.post('/', authorize('admin', 'sales'), customerValidation, validate, createCustomer);
router.put('/:id', authorize('admin', 'sales'), customerValidation, validate, updateCustomer);

// Follow-ups
router.get('/:id/followups', getFollowups);
router.post(
  '/:id/followups',
  authorize('admin', 'sales'),
  [body('note').notEmpty().withMessage('Note required')],
  validate,
  addFollowup
);

export default router;
