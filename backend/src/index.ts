import app from './app';
import { config } from './config';
import pool from './db/pool';

async function start() {
  // Verify DB connection
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Database connected');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`🚀 Server running on port ${config.port} [${config.nodeEnv}]`);
    console.log(`   Health: http://localhost:${config.port}/health`);
    console.log(`   API:    http://localhost:${config.port}/api`);
  });
}

start();
