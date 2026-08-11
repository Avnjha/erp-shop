import bcrypt from 'bcryptjs';
import pool from './pool';

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding database...');

    // Seed users
    const users = [
      { name: 'Admin User', email: 'admin@erpshop.com', password: 'Admin@123', role: 'admin' },
      { name: 'Sales User', email: 'sales@erpshop.com', password: 'Sales@123', role: 'sales' },
      { name: 'Warehouse User', email: 'warehouse@erpshop.com', password: 'Warehouse@123', role: 'warehouse' },
      { name: 'Accounts User', email: 'accounts@erpshop.com', password: 'Accounts@123', role: 'accounts' },
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [u.name, u.email, hash, u.role]
      );
    }
    console.log('✅ Users seeded.');

    // Seed product categories
    const categories = ['Electronics', 'Clothing', 'Food & Beverages', 'Hardware', 'Stationery'];
    const catIds: Record<string, string> = {};

    for (const cat of categories) {
      const res = await client.query(
        `INSERT INTO product_categories (name)
         VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [cat]
      );
      catIds[cat] = res.rows[0].id;
    }
    console.log('✅ Categories seeded.');

    // Get admin user id for created_by
    const adminRes = await client.query(`SELECT id FROM users WHERE email = 'admin@erpshop.com'`);
    const adminId = adminRes.rows[0]?.id;

    // Seed products
    const products = [
      { name: 'LED Bulb 9W', sku: 'ELEC-001', category: 'Electronics', unit_price: 85.00, current_stock: 200, min_stock_alert: 20, location: 'Rack A1' },
      { name: 'Extension Board 6 Socket', sku: 'ELEC-002', category: 'Electronics', unit_price: 350.00, current_stock: 80, min_stock_alert: 10, location: 'Rack A2' },
      { name: 'Cotton T-Shirt White XL', sku: 'CLO-001', category: 'Clothing', unit_price: 220.00, current_stock: 150, min_stock_alert: 15, location: 'Rack B1' },
      { name: 'Biscuit Packet 200g', sku: 'FOOD-001', category: 'Food & Beverages', unit_price: 30.00, current_stock: 500, min_stock_alert: 50, location: 'Rack C1' },
      { name: 'Hammer 500g', sku: 'HW-001', category: 'Hardware', unit_price: 180.00, current_stock: 60, min_stock_alert: 5, location: 'Rack D1' },
      { name: 'Ball Pen Blue Box', sku: 'STAT-001', category: 'Stationery', unit_price: 120.00, current_stock: 300, min_stock_alert: 30, location: 'Rack E1' },
    ];

    for (const p of products) {
      await client.query(
        `INSERT INTO products (name, sku, category_id, unit_price, current_stock, min_stock_alert, location, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (sku) DO NOTHING`,
        [p.name, p.sku, catIds[p.category], p.unit_price, p.current_stock, p.min_stock_alert, p.location, adminId]
      );
    }
    console.log('✅ Products seeded.');

    // Seed sample customers
    const customers = [
      { name: 'Ramesh Sharma', mobile: '9876543210', email: 'ramesh@example.com', business_name: 'Sharma Traders', gst_number: '07AABCS1429B1ZB', customer_type: 'Wholesale', address: 'Delhi', status: 'Active' },
      { name: 'Suresh Gupta', mobile: '9812345678', email: 'suresh@example.com', business_name: 'Gupta Distributors', gst_number: null, customer_type: 'Distributor', address: 'Mumbai', status: 'Active' },
      { name: 'Priya Singh', mobile: '9700001111', email: null, business_name: null, gst_number: null, customer_type: 'Retail', address: 'Bangalore', status: 'Lead' },
    ];

    for (const c of customers) {
      await client.query(
        `INSERT INTO customers (name, mobile, email, business_name, gst_number, customer_type, address, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING`,
        [c.name, c.mobile, c.email, c.business_name, c.gst_number, c.customer_type, c.address, c.status, adminId]
      );
    }
    console.log('✅ Customers seeded.');

    console.log('\n🎉 Database seeded successfully!');
    console.log('\nTest Credentials:');
    console.log('  admin@erpshop.com    / Admin@123');
    console.log('  sales@erpshop.com    / Sales@123');
    console.log('  warehouse@erpshop.com / Warehouse@123');
    console.log('  accounts@erpshop.com / Accounts@123');
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
