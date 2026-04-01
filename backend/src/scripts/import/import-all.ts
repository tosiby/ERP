#!/usr/bin/env ts-node
// =============================================================
// KJSIS — Master Import Script
//
// Runs all four importers in dependency order:
//   1. Teachers          (builds nameToId map)
//   2. Students          (builds classIdMap + divisionIdMap)
//   3. Teacher-Subject   (uses all three maps; auto-creates subjects)
//   4. Class Teachers    (uses nameToId + divisionIdMap)
//
// Usage:
//   npm run import:data
//   DATABASE_URL=... ts-node src/scripts/import/import-all.ts
//
// Safe to re-run — all importers are idempotent.
// =============================================================

import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from backend root before anything else
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });

import { Pool, PoolClient } from 'pg';
import { log } from './utils/logger';
import { extractTeacherNamesFromCsvs, importTeachers } from './importers/teachers.importer';
import { importStudents }                               from './importers/students.importer';
import { importTeacherSubjectMap }                      from './importers/teacher-subject-map.importer';
import { importClassTeachers }                          from './importers/class-teachers.importer';

// ─────────────────────────────────────────────────────────────
// Validate environment
// ─────────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  log.fatal('DATABASE_URL is not set. Please create a .env file or export the variable.');
}

// ─────────────────────────────────────────────────────────────
// DB pool (separate from the main app pool — scripts run standalone)
// ─────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const getActiveAcademicYear = async (client: PoolClient): Promise<string> => {
  const result = await client.query<{ id: string; label: string }>(
    `SELECT id, label FROM academic_years WHERE is_current = TRUE LIMIT 1`,
  );
  if (result.rows.length === 0) {
    throw new Error(
      'No active academic year found in DB. Run migrations and ensure one row has is_current=TRUE.',
    );
  }
  log.info(`Active academic year: ${result.rows[0].label} (${result.rows[0].id})`);
  return result.rows[0].id;
};

const printSummaryTable = (results: {
  teachers:      { inserted: number; skipped: number; failed: number };
  students:      { inserted: number; skipped: number; failed: number };
  teacherSubject:{ inserted: number; skipped: number; failed: number; subjectsCreated: number };
  classTeachers: { inserted: number; updated: number; skipped: number; failed: number };
}): void => {
  const BOLD  = '\x1b[1m';
  const CYAN  = '\x1b[36m';
  const GREEN = '\x1b[32m';
  const YELLOW= '\x1b[33m';
  const RED   = '\x1b[31m';
  const RESET = '\x1b[0m';

  console.log(`\n${BOLD}${CYAN}${'═'.repeat(65)}${RESET}`);
  console.log(`${BOLD}${CYAN}  IMPORT SUMMARY${RESET}`);
  console.log(`${BOLD}${CYAN}${'═'.repeat(65)}${RESET}`);

  const row = (
    label: string,
    ok: number,
    skipped: number,
    failed: number,
    extra = '',
  ) => {
    const pad = (s: string, w: number) => s.padEnd(w);
    console.log(
      `  ${BOLD}${pad(label, 22)}${RESET}` +
      `  ${GREEN}${String(ok).padStart(4)} ok${RESET}` +
      `  ${YELLOW}${String(skipped).padStart(4)} skipped${RESET}` +
      `  ${RED}${String(failed).padStart(4)} failed${RESET}` +
      (extra ? `  ${extra}` : ''),
    );
  };

  row('Teachers',          results.teachers.inserted,       results.teachers.skipped,       results.teachers.failed);
  row('Students',          results.students.inserted,       results.students.skipped,       results.students.failed);
  row('Teacher→Subject',   results.teacherSubject.inserted, results.teacherSubject.skipped, results.teacherSubject.failed,
      `(${results.teacherSubject.subjectsCreated} subjects created)`);
  row('Class Teachers',    results.classTeachers.inserted + results.classTeachers.updated,
      results.classTeachers.skipped, results.classTeachers.failed,
      `(${results.classTeachers.updated} updated)`);

  const totalFailed =
    results.teachers.failed +
    results.students.failed +
    results.teacherSubject.failed +
    results.classTeachers.failed;

  console.log(`\n  ${BOLD}Total failures: ${totalFailed === 0 ? GREEN : RED}${totalFailed}${RESET}`);
  console.log(`${BOLD}${CYAN}${'═'.repeat(65)}${RESET}\n`);
};

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
const main = async (): Promise<void> => {
  const startMs = Date.now();

  console.log('\n');
  log.section('KJSIS — Database Import Script');
  log.info(`Node: ${process.version}  |  ENV: ${process.env.NODE_ENV ?? 'development'}`);
  log.info(`DB:   ${maskUrl(process.env.DATABASE_URL!)}`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Active academic year ───────────────────────────────────
    const academicYearId = await getActiveAcademicYear(client);

    // ── Collect extra teacher names from the other CSVs ────────
    // (done before any DB writes so we can include them in the teachers step)
    log.info('Scanning other CSVs for teacher names…');
    const extraNames = extractTeacherNamesFromCsvs();
    log.info(`Found ${extraNames.length} unique teacher name(s) across all CSVs`);

    // ── Step 1: Teachers ───────────────────────────────────────
    const teachersResult = await importTeachers(client, extraNames);
    const { nameToId } = teachersResult;

    if (nameToId.size === 0) {
      log.fatal('No teachers were imported or found. Cannot continue without teacher IDs.');
    }

    // ── Step 2: Students (also creates classes + divisions) ────
    const studentsResult = await importStudents(client, academicYearId);
    const { classIdMap, divisionIdMap } = studentsResult;

    if (divisionIdMap.size === 0) {
      log.fatal('No divisions were created or found. Cannot continue.');
    }

    // ── Step 3: Teacher-Subject Map ────────────────────────────
    const teacherSubjectResult = await importTeacherSubjectMap(
      client,
      academicYearId,
      nameToId,
      divisionIdMap,
      classIdMap,
    );

    // ── Step 4: Class Teachers ─────────────────────────────────
    const classTeachersResult = await importClassTeachers(
      client,
      academicYearId,
      nameToId,
      divisionIdMap,
    );

    // ── Commit ─────────────────────────────────────────────────
    await client.query('COMMIT');
    log.success('Transaction committed successfully');

    // ── Summary ────────────────────────────────────────────────
    printSummaryTable({
      teachers:       teachersResult,
      students:       studentsResult,
      teacherSubject: teacherSubjectResult,
      classTeachers:  classTeachersResult,
    });

    log.done(Date.now() - startMs);

    const totalFailed =
      teachersResult.failed +
      studentsResult.failed +
      teacherSubjectResult.failed +
      classTeachersResult.failed;

    process.exit(totalFailed > 0 ? 1 : 0);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    log.fatal('Unhandled error — rolling back all changes', err);
  } finally {
    client.release();
    await pool.end();
  }
};

// ─────────────────────────────────────────────────────────────
// Mask sensitive credentials in log output
// ─────────────────────────────────────────────────────────────
const maskUrl = (url: string): string => {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return '[invalid url]';
  }
};

main().catch((err) => {
  log.fatal('Unexpected top-level error', err);
});
