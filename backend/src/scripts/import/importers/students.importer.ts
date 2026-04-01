// =============================================================
// KJSIS — Students Importer
//
// Source: students_clean.csv
// Columns: id, name, admission_no, class, division, roll_no
//
// Auto-creates:
//   • classes  (grade 1–12, name "Class N")
//   • divisions (A/B/C per class)
//
// Idempotent:
//   • ON CONFLICT (admission_number) DO NOTHING
//   • ON CONFLICT (division_id, roll_number, academic_year_id) DO NOTHING
// =============================================================

import { PoolClient } from 'pg';
import { parseCsv, importFile } from '../utils/csv-parser';
import { parseClassToGrade } from '../utils/roman-numerals';
import { log } from '../utils/logger';

export interface StudentsImportResult {
  inserted:      number;
  skipped:       number;
  failed:        number;
  classesCreated:    number;
  divisionsCreated:  number;
  /** class_id cache for downstream importers */
  classIdMap:    Map<number, string>;
  /** division_id cache: "grade:div" → id */
  divisionIdMap: Map<string, string>;
}

// ─────────────────────────────────────────────────────────────
// PUBLIC
// ─────────────────────────────────────────────────────────────
export const importStudents = async (
  client: PoolClient,
  academicYearId: string,
): Promise<StudentsImportResult> => {
  log.section('STEP 2 — Classes, Divisions & Students');

  const { rows, skippedLines } = parseCsv(importFile('students_clean.csv'));
  log.info(`Parsed ${rows.length} student rows (${skippedLines} blank lines skipped)`);

  // ── PASS 1: collect all unique class/division combos ─────────
  const combos = new Map<string, { grade: number; division: string }>();
  const badRows: string[] = [];

  for (const row of rows) {
    const grade = parseClassToGrade(row['class'] ?? '');
    const div   = (row['division'] ?? '').trim().toUpperCase();

    if (!grade || !div) {
      badRows.push(`row "${row['name']}" — unreadable class "${row['class']}" or division "${row['division']}"`);
      continue;
    }
    combos.set(`${grade}:${div}`, { grade, division: div });
  }

  if (badRows.length) {
    log.warn(`${badRows.length} rows have unreadable class/division — they will be skipped`);
  }

  // ── STEP 2a: Upsert Classes ───────────────────────────────────
  log.info('Ensuring classes exist…');
  const grades = [...new Set([...combos.values()].map((c) => c.grade))].sort((a, b) => a - b);

  const classIdMap = new Map<number, string>();
  let classesCreated = 0;

  for (const grade of grades) {
    const result = await client.query<{ id: string; created: boolean }>(
      `WITH ins AS (
         INSERT INTO classes (grade_number, name)
         VALUES ($1, $2)
         ON CONFLICT (grade_number) DO NOTHING
         RETURNING id, TRUE AS created
       )
       SELECT id, TRUE AS created FROM ins
       UNION ALL
       SELECT id, FALSE AS created FROM classes WHERE grade_number = $1 AND NOT EXISTS (SELECT 1 FROM ins)
       LIMIT 1`,
      [grade, `Class ${grade}`],
    );
    const row = result.rows[0];
    classIdMap.set(grade, row.id);
    if (row.created) {
      classesCreated++;
      log.success(`Created class: Class ${grade}`);
    }
  }

  // ── STEP 2b: Upsert Divisions ─────────────────────────────────
  log.info('Ensuring divisions exist…');
  const divisionIdMap = new Map<string, string>();
  let divisionsCreated = 0;

  for (const [key, { grade, division }] of combos.entries()) {
    const classId = classIdMap.get(grade);
    if (!classId) continue;

    const result = await client.query<{ id: string; created: boolean }>(
      `WITH ins AS (
         INSERT INTO divisions (class_id, name)
         VALUES ($1, $2)
         ON CONFLICT (class_id, name) DO NOTHING
         RETURNING id, TRUE AS created
       )
       SELECT id, TRUE AS created FROM ins
       UNION ALL
       SELECT id, FALSE AS created FROM divisions WHERE class_id = $1 AND name = $2 AND NOT EXISTS (SELECT 1 FROM ins)
       LIMIT 1`,
      [classId, division],
    );
    const row = result.rows[0];
    divisionIdMap.set(key, row.id);
    if (row.created) {
      divisionsCreated++;
      log.success(`Created division: Class ${grade} – ${division}`);
    }
  }

  // ── STEP 2c: Insert Students in batches of 100 ────────────────
  log.info(`Inserting ${rows.length} students…`);

  let inserted = 0, skipped = 0, failed = 0;
  const BATCH = 100;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    for (const row of batch) {
      const grade    = parseClassToGrade(row['class'] ?? '');
      const div      = (row['division'] ?? '').trim().toUpperCase();
      const name     = (row['name']     ?? '').trim();
      const admNo    = String(row['admission_no'] ?? '').trim();
      const rollNoRaw = (row['roll_no'] ?? row['roll_number'] ?? '').trim();
      const rollNo   = parseInt(rollNoRaw, 10);

      if (!grade || !div || !name || !admNo || isNaN(rollNo)) {
        log.warn(`Skipping student with missing fields: "${name}" admNo="${admNo}"`);
        failed++;
        continue;
      }

      const divisionId = divisionIdMap.get(`${grade}:${div}`);
      if (!divisionId) {
        log.error(`No division found for Class ${grade}-${div} — skipping "${name}"`);
        failed++;
        continue;
      }

      // Use SAVEPOINT so a constraint violation doesn't abort the whole transaction
      await client.query('SAVEPOINT sp_student');
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO students
             (admission_number, name, roll_number, division_id, academic_year_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (admission_number) DO NOTHING
           RETURNING id`,
          [admNo, name, rollNo, divisionId, academicYearId],
        );
        await client.query('RELEASE SAVEPOINT sp_student');

        if (result.rows[0]) {
          inserted++;
        } else {
          log.skip(`Student "${name}" (${admNo}) already exists`);
          skipped++;
        }
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT sp_student');
        await client.query('RELEASE SAVEPOINT sp_student');
        const msg = (err as Error).message;
        if (msg.includes('duplicate') || msg.includes('unique')) {
          log.skip(`Student "${name}" duplicate constraint — skipped`);
          skipped++;
        } else {
          log.error(`Failed inserting "${name}": ${msg}`);
          failed++;
        }
      }
    }
  }

  log.summary('Students', inserted, skipped, failed);
  log.info(`Classes ensured: ${grades.length} (${classesCreated} new)`);
  log.info(`Divisions ensured: ${combos.size} (${divisionsCreated} new)`);

  return {
    inserted, skipped, failed,
    classesCreated, divisionsCreated,
    classIdMap, divisionIdMap,
  };
};
