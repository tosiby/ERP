// =============================================================
// KJSIS — Database Connection Pool (PostgreSQL via pg)
// =============================================================

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from './logger';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX ?? '10'),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT ?? '30000'),
  // Default 10s — generous enough for Neon/Supabase cold-start wakeup
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT ?? '10000'),
  // Always enable SSL — required by hosted providers (Neon, Supabase, etc.)
  // rejectUnauthorized: false allows self-signed certs in dev without blocking
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(1);
});

// ─── Typed query helper ───────────────────────────────────────
export const query = async <T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> => {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    logger.debug('DB Query', { text, duration, rows: result.rowCount });
  }

  return result;
};

// ─── Transaction helper ───────────────────────────────────────
export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// ─── Health check ────────────────────────────────────────────
export const checkDbConnection = async (retries = 3, delayMs = 3000): Promise<boolean> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt < retries) {
        logger.warn(`DB connection attempt ${attempt}/${retries} failed — retrying in ${delayMs}ms`, { error: msg });
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        logger.error('DB connection failed after all retries', { error: msg });
      }
    }
  }
  return false;
};
