// =============================================================
// KJSIS — Class Teachers Importer
//
// Source: KJSIS_class_teachers_FULL.csv
//   Columns: teacher_name, class (integer), division (letter)
//
// Strategy:
//   - Resolve division_id from classIdMap + divisionIdMap
//   - Resolve teacher_id from nameToId map (exact + first-name fallback)
//   - UPSERT on (division_id, academic_year_id) — one class teacher per division
//   - Skips rows where teacher or division cannot be resolved
// =============================================================

import { PoolClient } from 'pg';
import { parseCsv, importFile } from '../utils/csv-parser';
import { parseClassToGrade } from '../utils/roman-numerals';
import { log } from '../utils/logger';

export interface ClassTeachersImportResult {
  inserted: number;
  updated:  number;
  skipped:  number;
  failed:   number;
}

// ─────────────────────────────────────────────────────────────
// PUBLIC
// ─────────────────────────────────────────────────────────────
export const importClassTeachers = async (
  client: PoolClient,
  academicYearId: string,
  nameToId: Map<string, string>,
  divisionIdMap: Map<string, string>,   // key: "grade:DIVISION" e.g. "7:A"
): Promise<ClassTeachersImportResult> => {
  log.section('STEP 4 — Class Teachers');

  const { rows, skippedLines } = parseCsv(importFile('KJSIS_class_teachers_FULL.csv'));

  if (skippedLines > 0) {
    log.info(`Skipped ${skippedLines} blank/malformed lines in class_teachers CSV`);
  }

  if (rows.length === 0) {
    log.warn('No class teacher rows found — skipping');
    return { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  }

  let inserted = 0, updated = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const rawTeacher  = (row['teacher_name'] ?? '').trim();
    const rawClass    = (row['class']         ?? '').trim();
    const rawDivision = (row['division']       ?? '').trim().toUpperCase();

    // ── Validate required fields ──────────────────────────────
    if (!rawTeacher || !rawClass || !rawDivision) {
      log.warn(`Incomplete row — skipping: ${JSON.stringify(row)}`);
      skipped++;
      continue;
    }

    // ── Resolve grade number ──────────────────────────────────
    const grade = parseClassToGrade(rawClass);
    if (grade === null) {
      log.warn(`Cannot parse class "${rawClass}" for teacher "${rawTeacher}" — skipping`);
      skipped++;
      continue;
    }

    // ── Resolve division_id ───────────────────────────────────
    const divisionKey = `${grade}:${rawDivision}`;
    const divisionId  = divisionIdMap.get(divisionKey);
    if (!divisionId) {
      log.warn(`Division "${divisionKey}" not found in DB — skipping teacher "${rawTeacher}"`);
      skipped++;
      continue;
    }

    // ── Resolve teacher_id ────────────────────────────────────
    const teacherId = resolveTeacherId(rawTeacher, nameToId);
    if (!teacherId) {
      log.warn(`Teacher "${rawTeacher}" not found in DB — skipping class ${divisionKey}`);
      skipped++;
      continue;
    }

    // ── Upsert ────────────────────────────────────────────────
    try {
      const result = await client.query<{ id: string; xmax: string }>(
        `INSERT INTO class_teachers (division_id, teacher_id, academic_year_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (division_id, academic_year_id)
         DO UPDATE SET teacher_id = EXCLUDED.teacher_id
         RETURNING id, xmax::text`,
        [divisionId, teacherId, academicYearId],
      );

      // xmax = 0 → new insert; xmax != '0' → updated existing row
      const wasUpdated = result.rows[0]?.xmax !== '0';
      if (wasUpdated) {
        log.info(`Updated class teacher for ${divisionKey} → "${rawTeacher}"`);
        updated++;
      } else {
        log.success(`Class ${divisionKey} → "${rawTeacher}"`);
        inserted++;
      }
    } catch (err) {
      log.error(
        `Failed to assign "${rawTeacher}" to class ${divisionKey}: ${(err as Error).message}`,
      );
      failed++;
    }
  }

  log.summary('Class Teachers', inserted + updated, 0, failed);
  log.info(`  ${inserted} new assignments, ${updated} updated, ${skipped} skipped`);

  return { inserted, updated, skipped, failed };
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Resolve a teacher ID from the nameToId map.
 * Strategy:
 *   1. Exact match (lowercased, trimmed)
 *   2. First-name-only fallback — finds a unique match whose first token equals the input
 */
const resolveTeacherId = (
  rawName: string,
  nameToId: Map<string, string>,
): string | undefined => {
  const key = rawName.toLowerCase().trim();

  // 1. Exact match
  if (nameToId.has(key)) return nameToId.get(key);

  // 2. First-name fallback
  const firstName = key.split(/\s+/)[0];
  const candidates: string[] = [];
  for (const [mapKey, id] of nameToId.entries()) {
    if (mapKey.split(/\s+/)[0] === firstName) {
      candidates.push(id);
    }
  }

  if (candidates.length === 1) {
    log.info(`  Resolved "${rawName}" by first-name match`);
    return candidates[0];
  }

  if (candidates.length > 1) {
    log.warn(`  Ambiguous first-name match for "${rawName}" (${candidates.length} candidates) — skipping`);
  }

  return undefined;
};
