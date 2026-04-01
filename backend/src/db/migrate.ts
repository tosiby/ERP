#!/usr/bin/env ts-node
// =============================================================
// KJSIS — Database Migration Runner
// Runs all SQL files in src/db/migrations/ in filename order.
// Tracks applied migrations in a `schema_migrations` table.
// Safe to re-run — already-applied migrations are skipped.
// =============================================================

import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../..', '.env') });

import * as fs   from 'fs';
import { Pool }  from 'pg';

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const BOLD  = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW= '\x1b[33m';
const RED   = '\x1b[31m';
const CYAN  = '\x1b[36m';
const RESET = '\x1b[0m';

const ok   = (msg: string) => console.log(`  ${GREEN}[✔]${RESET} ${msg}`);
const skip = (msg: string) => console.log(`  ${YELLOW}[↷]${RESET} ${msg}`);
const fail = (msg: string) => console.log(`  ${RED}[✘]${RESET} ${msg}`);
const info = (msg: string) => console.log(`  ${msg}`);

const main = async () => {
  const client = await pool.connect();

  try {
    console.log(`\n${BOLD}${CYAN}${'─'.repeat(55)}${RESET}`);
    console.log(`${BOLD}${CYAN}  KJSIS — Running Migrations${RESET}`);
    console.log(`${BOLD}${CYAN}${'─'.repeat(55)}${RESET}\n`);

    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get list of already-applied migrations
    const applied = await client.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations ORDER BY filename`,
    );
    const appliedSet = new Set(applied.rows.map((r) => r.filename));

    // Read migration files sorted by name
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      info('No migration files found.');
      return;
    }

    let ran = 0, skipped = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        skip(`Already applied: ${file}`);
        skipped++;
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1)`,
          [file],
        );
        await client.query('COMMIT');
        ok(`Applied: ${file}`);
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        fail(`Failed: ${file}`);
        console.error(err);
        process.exit(1);
      }
    }

    console.log(
      `\n${BOLD}Done.${RESET}  ${GREEN}${ran} applied${RESET}  ${YELLOW}${skipped} skipped${RESET}\n`,
    );
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((err) => {
  console.error(`${RED}${BOLD}Fatal migration error:${RESET}`, err);
  process.exit(1);
});
