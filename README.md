# ERP Shop — Wholesale Distribution Management System

A full-stack ERP/CRM system for wholesale/distribution companies.
Built with **Node.js + TypeScript + Express + PostgreSQL** on the backend and **React + TypeScript** on the frontend.

---

## Architecture

```
erp-shop/
├── backend/          # Node.js / TypeScript / Express REST API
│   └── src/
│       ├── config/           # env config
│       ├── db/               # pg pool, migrations, seeds
│       ├── middleware/        # auth (JWT), validation, error handler
│       ├── modules/
│       │   ├── auth/         # login, user management
│       │   ├── customers/    # CRM: customers + follow-ups
│       │   ├── products/     # inventory + stock movements
│       │   └── challans/     # sales challans (with stock deduction)
│       ├── types/            # shared TypeScript types
│       └── utils/            # response helpers, pagination
└── frontend/         # React / TypeScript SPA
    └── src/
        ├── api/              # axios instance + per-module API functions
        ├── context/          # AuthContext (JWT storage, role helpers)
        ├── components/       # layout (Sidebar, AppLayout), common (Spinner, Pagination)
        └── pages/            # auth, dashboard, customers, products, challans
```

### Key design decisions
- **Snapshot pattern**: Challan items store a product snapshot (name, SKU, price at time of creation) so historical data is preserved even if the product is later edited.
- **Transactional stock**: All stock movements use `BEGIN/COMMIT` with `FOR UPDATE` row locks to prevent race conditions.
- **Role-based access**: Every API route is protected by JWT middleware + role middleware (`authorize(...roles)`).
- **Pagination everywhere**: All list endpoints support `page`, `limit`, `search`, and domain-specific filters.

---

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 14+

---

## Local Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd erp-shop

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment

```bash
# backend/.env  (copy from .env.example and edit)
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/erp_shop
JWT_SECRET=your_secret_key_here
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
```

### 3. Create database and run migrations

```sql
-- In psql:
CREATE DATABASE erp_shop;
```

```bash
cd backend
npm run db:migrate    # creates all tables
npm run db:seed       # seeds test users, products, customers
```

### 4. Start the backend

```bash
cd backend
npm run dev           # starts on http://localhost:5000
```

### 5. Start the frontend

```bash
cd frontend
npm start             # starts on http://localhost:3000
```

---

## Test Credentials

| Role      | Email                    | Password       |
|-----------|--------------------------|----------------|
| Admin     | admin@erpshop.com        | Admin@123      |
| Sales     | sales@erpshop.com        | Sales@123      |
| Warehouse | warehouse@erpshop.com    | Warehouse@123  |
| Accounts  | accounts@erpshop.com     | Accounts@123   |

---

## API Endpoints

### Auth
| Method | Endpoint         | Auth | Description             |
|--------|-----------------|------|-------------------------|
| POST   | /api/auth/login  | —    | Login, returns JWT      |
| GET    | /api/auth/profile| JWT  | Get current user profile|
| GET    | /api/auth/users  | Admin| List all users          |
| POST   | /api/auth/users  | Admin| Create user             |

### Customers
| Method | Endpoint                        | Roles              | Description       |
|--------|---------------------------------|--------------------|-------------------|
| GET    | /api/customers                  | All                | List (paginated)  |
| POST   | /api/customers                  | Admin, Sales       | Create            |
| GET    | /api/customers/:id              | All                | Get detail        |
| PUT    | /api/customers/:id              | Admin, Sales       | Update            |
| GET    | /api/customers/:id/followups    | All                | Get follow-ups    |
| POST   | /api/customers/:id/followups    | Admin, Sales       | Add follow-up     |

### Products
| Method | Endpoint                        | Roles              | Description           |
|--------|---------------------------------|--------------------|-----------------------|
| GET    | /api/products                   | All                | List (paginated)      |
| POST   | /api/products                   | Admin, Warehouse   | Create                |
| GET    | /api/products/:id               | All                | Get detail            |
| PUT    | /api/products/:id               | Admin, Warehouse   | Update                |
| POST   | /api/products/:id/adjust-stock  | Admin, Warehouse   | Adjust stock (IN/OUT) |
| GET    | /api/products/:id/movements     | All                | Stock movement log    |
| GET    | /api/products/categories        | All                | List categories       |
| POST   | /api/products/categories        | Admin, Warehouse   | Create category       |

### Challans
| Method | Endpoint                   | Roles        | Description                            |
|--------|---------------------------|--------------|----------------------------------------|
| GET    | /api/challans              | All          | List (paginated)                       |
| POST   | /api/challans              | Admin, Sales | Create (Draft or Confirmed)            |
| GET    | /api/challans/:id          | All          | Get detail with line items             |
| PATCH  | /api/challans/:id/confirm  | Admin, Sales | Confirm draft (deducts stock)          |
| PATCH  | /api/challans/:id/cancel   | Admin, Sales | Cancel (restores stock if was confirmed)|

---

## Deployment

### Free Tier Options

**Frontend** → Vercel or Netlify
```bash
cd frontend
npm run build
# Upload the build/ folder to Vercel / Netlify
# Set REACT_APP_API_URL=https://your-backend.render.com/api
```

**Backend** → Render.com
- Create a new Web Service pointing to the `backend/` directory
- Build command: `npm install && npm run build`
- Start command: `node dist/index.js`
- Add all environment variables from `.env.example`

**Database** → Neon.tech or Supabase (free PostgreSQL)
- Create a database, copy the connection string
- Set `DATABASE_URL` on your backend service

### AWS (Bonus)
- EC2 (t2.micro free tier) for backend
- RDS PostgreSQL (db.t3.micro) for database
- S3 + CloudFront for frontend static hosting
- Use `pm2` to keep the Node process alive: `pm2 start dist/index.js`

---

## Docker Setup (Bonus)

```bash
# From project root
docker-compose up --build
```

This starts:
- PostgreSQL on port 5432
- Backend API on port 5000
- Frontend on port 3000

---

## Environment Variables Reference

### Backend
| Variable        | Description                        | Default                      |
|-----------------|------------------------------------|------------------------------|
| PORT            | HTTP server port                   | 5000                         |
| NODE_ENV        | Environment (development/production)| development                 |
| DATABASE_URL    | PostgreSQL connection string        | required                     |
| JWT_SECRET      | Secret key for signing JWTs         | required                     |
| JWT_EXPIRES_IN  | JWT token expiry                    | 7d                           |
| CORS_ORIGIN     | Allowed CORS origin                 | http://localhost:3000         |

### Frontend
| Variable              | Description                | Default              |
|-----------------------|----------------------------|----------------------|
| REACT_APP_API_URL     | Backend API base URL        | /api (via proxy)     |

---

## Known Limitations / Assumptions

1. No product image upload (AWS S3 bonus not implemented).
2. No PDF invoice export (bonus not implemented).
3. The "Accounts" role currently has read-only access; invoice/payment modules are out of scope.
4. Customer mobile numbers are stored as strings (no format validation beyond non-empty).
5. No soft-delete for products — `is_active` flag is set but no DELETE endpoint exposed.
6. Challan editing is not supported after creation; cancel and re-create to correct errors.
