// =============================================================
// KJSIS — Teachers Importer
//
// Sources:
//   1. teachers.csv      (name, mobile, role)
//   2. teacher_subject_map CSV  (teacher_name column)
//   3. class_teachers CSV       (teacher_name column)
//
// Strategy:
//   - Build a deduplicated teacher roster from all three sources
//   - teachers.csv provides mobile numbers and roles
//   - Names found only in other CSVs get auto-generated mobiles
//   - UPSERT on mobile — safe to re-run (idempotent)
//   - Default password: "Teacher@123" (force-change on first login)
// =============================================================

import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { parseCsv, importFile } from '../utils/csv-parser';
import { log } from '../utils/logger';

const DEFAULT_PASSWORD = 'Teacher@123';
const BCRYPT_ROUNDS    = 10;

export interface TeacherRecord {
  name:   string;
  mobile: string;
  role:   string;
}

export interface TeachersImportResult {
  inserted: number;
  skipped:  number;
  failed:   number;
  /** Canonical name → DB user id (for downstream importers) */
  nameToId: Map<string, string>;
}

// ─────────────────────────────────────────────────────────────
// PUBLIC
// ─────────────────────────────────────────────────────────────
export const importTeachers = async (
  client: PoolClient,
  extraNames: string[] = [],        // names from other CSVs
): Promise<TeachersImportResult> => {
  log.section('STEP 1 — Teachers');

  // 1. Parse teachers.csv
  const { rows } = parseCsv(importFile('teachers.csv'));

  // Build map: normalised-name → TeacherRecord
  const teacherMap = new Map<string, TeacherRecord>();
  const mobileSet  = new Set<string>();
  let   autoMobile = 9400200001;

  for (const row of rows) {
    const name   = normaliseName(row['name']   ?? '');
    const mobile = (row['mobile'] ?? '').trim();
    const role   = sanitiseRole(row['role'] ?? 'teacher');

    if (!name) { log.warn(`Skipping teacher row — empty name`); continue; }
    if (!mobile || mobileSet.has(mobile)) {
      log.warn(`Teacher "${name}" has missing/duplicate mobile — auto-generating`);
    }

    const finalMobile = mobile && !mobileSet.has(mobile)
      ? mobile
      : String(autoMobile++);

    mobileSet.add(finalMobile);
    teacherMap.set(name.toLowerCase(), { name, mobile: finalMobile, role });
  }

  // 2. Add names from other CSVs that aren't in teachers.csv
  for (const raw of extraNames) {
    const name = normaliseName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (teacherMap.has(key)) continue;

    const mobile = String(autoMobile++);
    mobileSet.add(mobile);
    teacherMap.set(key, { name, mobile, role: 'teacher' });
    log.info(`Auto-adding teacher from other CSV: "${name}" (mobile: ${mobile})`);
  }

  if (teacherMap.size === 0) {
    log.warn('No teachers to import');
    return { inserted: 0, skipped: 0, failed: 0, nameToId: new Map() };
  }

  // 3. Hash password once (all teachers share the default password on import)
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  // 4. Fetch existing teachers from DB (mobile → id)
  const existing = await client.query<{ id: string; mobile: string; name: string }>(
    `SELECT id, mobile, name FROM users WHERE role IN ('teacher','exam_cell','vp','principal')`,
  );
  const existingByMobile = new Map(existing.rows.map((r) => [r.mobile, r.id]));
  const existingByName   = new Map(existing.rows.map((r) => [r.name.toLowerCase().trim(), r.id]));

  const nameToId: Map<string, string> = new Map();
  let inserted = 0, skipped = 0, failed = 0;

  // 5. Upsert each teacher
  for (const [key, teacher] of teacherMap.entries()) {
    try {
      // Try to find existing by mobile first, then by name
      const existingId =
        existingByMobile.get(teacher.mobile) ??
        existingByName.get(key);

      if (existingId) {
        // Already exists — just register name→id mapping, don't overwrite
        nameToId.set(key, existingId);
        // Also map the original-case name
        nameToId.set(teacher.name.toLowerCase(), existingId);
        log.skip(`Teacher "${teacher.name}" already exists — skipping`);
        skipped++;
        continue;
      }

      const result = await client.query<{ id: string }>(
        `INSERT INTO users (name, mobile, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (mobile) DO UPDATE
           SET name = EXCLUDED.name, role = EXCLUDED.role
         RETURNING id`,
        [teacher.name, teacher.mobile, passwordHash, teacher.role],
      );

      const id = result.rows[0]?.id;
      if (id) {
        nameToId.set(key, id);
        nameToId.set(teacher.name.toLowerCase(), id);
        log.success(`Teacher "${teacher.name}" (${teacher.mobile}) [${teacher.role}]`);
        inserted++;
      }
    } catch (err) {
      log.error(`Failed to insert teacher "${teacher.name}": ${(err as Error).message}`);
      failed++;
    }
  }

  log.summary('Teachers', inserted, skipped, failed);
  log.info(`Default password for all new teachers: ${DEFAULT_PASSWORD}`);

  return { inserted, skipped, failed, nameToId };
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Title-case and trim a teacher name */
const normaliseName = (raw: string): string => {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

const VALID_ROLES = new Set(['teacher', 'exam_cell', 'vp', 'principal', 'super_admin']);
const sanitiseRole = (raw: string): string => {
  const lower = raw.toLowerCase().trim().replace(/\s+/g, '_');
  return VALID_ROLES.has(lower) ? lower : 'teacher';
};

/**
 * Extract all unique teacher names from the teacher_subject_map
 * and class_teachers CSV files.
 */
export const extractTeacherNamesFromCsvs = (): string[] => {
  const names = new Set<string>();

  // from teacher_subject_map
  try {
    const { rows } = parseCsv(importFile('KJSIS_teacher_subject_map_FULL.csv'));
    for (const row of rows) {
      const name = (row['teacher_name'] ?? '').trim();
      if (name) names.add(name);
    }
  } catch { /* file may not exist */ }

  // from class_teachers
  try {
    const { rows } = parseCsv(importFile('KJSIS_class_teachers_FULL.csv'));
    for (const row of rows) {
      const name = (row['teacher_name'] ?? '').trim();
      if (name) names.add(name);
    }
  } catch { /* file may not exist */ }

  return Array.from(names);
};
