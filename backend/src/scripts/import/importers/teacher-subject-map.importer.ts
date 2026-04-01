// =============================================================
// KJSIS — Teacher Subject Map Importer
//
// Source: KJSIS_teacher_subject_map_FULL.csv
// Columns: teacher_name, class, division, subject
//
// This CSV is the messiest file — it comes from a timetable export
// and has many artefacts:
//   • Day prefixes:  "Mon\tEnglish" → strip day, keep subject
//   • Noise cols:    "V P Mam\tGeo" → use rightmost clean token
//   • Multi-subject: "Cca\tCca\tEvs" → skip (non-academic)
//   • Electives:     "Hin/Frn" → resolve to Hindi or French per student
//
// Steps:
//   1. Parse + normalise every row
//   2. Auto-create subjects (if not in DB for that class)
//   3. Resolve teacher names → user IDs
//   4. Resolve division → division IDs
//   5. Upsert teacher_subject_map rows
// =============================================================

import { PoolClient } from 'pg';
import { parseCsv, importFile } from '../utils/csv-parser';
import { normalizeSubject } from '../utils/subject-normalizer';
import { log } from '../utils/logger';

export interface TeacherSubjectMapResult {
  inserted:        number;
  skipped:         number;
  failed:          number;
  subjectsCreated: number;
}

// ─── Subject type classification ─────────────────────────────
const TERM_ONLY_SUBJECTS = new Set(['General Knowledge', 'Moral Science']);
const ELECTIVE_GROUPS: Record<string, string> = {
  'Hindi':   'hindi_french',
  'French':  'hindi_french',
};

// Subjects that are elective only for classes 7–8
const ELECTIVE_CLASSES = new Set([7, 8]);

// ─────────────────────────────────────────────────────────────
// PUBLIC
// ─────────────────────────────────────────────────────────────
export const importTeacherSubjectMap = async (
  client: PoolClient,
  academicYearId: string,
  nameToId: Map<string, string>,
  divisionIdMap: Map<string, string>,   // "grade:div" → division_id
  classIdMap:    Map<number, string>,   // grade → class_id
): Promise<TeacherSubjectMapResult> => {
  log.section('STEP 3 — Subjects & Teacher-Subject Map');

  const { rows } = parseCsv(importFile('KJSIS_teacher_subject_map_FULL.csv'));
  log.info(`Parsed ${rows.length} raw teacher-subject rows`);

  // ── Pass 1: collect all valid cleaned rows ────────────────────
  interface CleanRow {
    teacherName: string;
    grade:       number;
    division:    string;
    subject:     string;
  }

  const cleanRows: CleanRow[] = [];
  let rawSkipped = 0;

  for (const row of rows) {
    const rawTeacher  = (row['teacher_name'] ?? '').trim();
    const rawClass    = (row['class']        ?? '').trim();
    const rawDiv      = (row['division']     ?? '').trim().toUpperCase();
    const rawSubject  = (row['subject']      ?? '').trim();

    const grade = parseInt(rawClass, 10);
    if (isNaN(grade) || grade < 1 || grade > 12) { rawSkipped++; continue; }
    if (!rawDiv)                                  { rawSkipped++; continue; }
    if (!rawTeacher)                              { rawSkipped++; continue; }

    const subject = normalizeSubject(rawSubject);
    if (!subject) { rawSkipped++; continue; } // skip noise/CCA rows

    cleanRows.push({ teacherName: rawTeacher, grade, division: rawDiv, subject });
  }

  log.info(`Valid rows after normalisation: ${cleanRows.length} (${rawSkipped} noise rows skipped)`);

  // ── Pass 2: collect unique subjects per class ─────────────────
  // Map: "grade:SubjectName" → subject_id
  const subjectKeyToId = new Map<string, string>();

  // Pre-load existing subjects
  const existing = await client.query<{
    id: string; class_id: string; name: string;
  }>(
    `SELECT s.id, s.class_id, s.name
     FROM subjects s
     WHERE s.is_active = TRUE`,
  );

  // Map: "class_id:SubjectName" → subject_id
  const existingSubjMap = new Map(
    existing.rows.map((r) => [`${r.class_id}:${r.name.toLowerCase()}`, r.id]),
  );
  // Also map grade→classId for quick lookup
  const gradeToClassId = new Map(classIdMap.entries());

  // Collect unique (grade, subject) pairs
  const uniqueSubjects = new Map<string, { grade: number; name: string }>();
  for (const row of cleanRows) {
    const key = `${row.grade}:${row.subject}`;
    if (!uniqueSubjects.has(key)) {
      uniqueSubjects.set(key, { grade: row.grade, name: row.subject });
    }
  }

  log.info(`Unique subjects across all classes: ${uniqueSubjects.size}`);

  // ── Pass 3: auto-create missing subjects ──────────────────────
  let subjectsCreated = 0;

  for (const [key, { grade, name }] of uniqueSubjects.entries()) {
    const classId = gradeToClassId.get(grade);
    if (!classId) {
      log.warn(`No class found for grade ${grade} — skipping subject "${name}"`);
      continue;
    }

    const existKey = `${classId}:${name.toLowerCase()}`;
    if (existingSubjMap.has(existKey)) {
      subjectKeyToId.set(key, existingSubjMap.get(existKey)!);
      continue;
    }

    // Generate a code from the name
    const code = generateSubjectCode(name, grade);
    const isTermOnly = TERM_ONLY_SUBJECTS.has(name);
    const electiveGroup = ELECTIVE_CLASSES.has(grade) && ELECTIVE_GROUPS[name]
      ? ELECTIVE_GROUPS[name]
      : null;
    const isElective = electiveGroup !== null;

    try {
      const result = await client.query<{ id: string }>(
        `INSERT INTO subjects
           (name, code, class_id, subject_type, is_elective, elective_group)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (class_id, code) DO UPDATE
           SET name = EXCLUDED.name
         RETURNING id`,
        [
          name,
          code,
          classId,
          isTermOnly ? 'term_only' : 'regular',
          isElective,
          electiveGroup,
        ],
      );

      const subjectId = result.rows[0]?.id;
      if (subjectId) {
        subjectKeyToId.set(key, subjectId);
        existingSubjMap.set(existKey, subjectId);
        subjectsCreated++;
        log.success(`Subject: "${name}" for Class ${grade} (code: ${code})`);
      }
    } catch (err) {
      log.error(`Failed to create subject "${name}" for class ${grade}: ${(err as Error).message}`);
    }
  }

  // ── Pass 4: upsert teacher_subject_map ────────────────────────
  log.info('Inserting teacher-subject assignments…');

  // Deduplicate: one row per (teacher, division, subject, academic_year)
  const seen  = new Set<string>();
  let inserted = 0, skipped = 0, failed = 0;

  for (const row of cleanRows) {
    const divKey     = `${row.grade}:${row.division}`;
    const divisionId = divisionIdMap.get(divKey);
    const subjKey    = `${row.grade}:${row.subject}`;
    const subjectId  = subjectKeyToId.get(subjKey);
    const teacherId  = resolveTeacherId(row.teacherName, nameToId);

    if (!divisionId) {
      log.warn(`Division not found: Class ${row.grade}-${row.division} — skip "${row.teacherName}:${row.subject}"`);
      failed++;
      continue;
    }
    if (!subjectId) {
      log.warn(`Subject not resolved: "${row.subject}" (Class ${row.grade}) — skipping`);
      failed++;
      continue;
    }
    if (!teacherId) {
      log.warn(`Teacher not found: "${row.teacherName}" — skipping`);
      failed++;
      continue;
    }

    const dedupeKey = `${teacherId}:${divisionId}:${subjectId}`;
    if (seen.has(dedupeKey)) {
      skipped++;
      continue;
    }
    seen.add(dedupeKey);

    try {
      const result = await client.query<{ id: string }>(
        `INSERT INTO teacher_subject_map
           (teacher_id, division_id, subject_id, academic_year_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (teacher_id, division_id, subject_id, academic_year_id)
         DO UPDATE SET is_active = TRUE
         RETURNING id`,
        [teacherId, divisionId, subjectId, academicYearId],
      );
      if (result.rows[0]) inserted++;
    } catch (err) {
      const msg = (err as Error).message;
      // DB-level subject-class mismatch trigger fires here
      if (msg.includes('does not belong to the class')) {
        log.warn(`Subject class mismatch: "${row.subject}" ≠ Class ${row.grade} (teacher: ${row.teacherName})`);
      } else {
        log.error(`Map insert failed "${row.teacherName}→${row.subject}": ${msg}`);
      }
      failed++;
    }
  }

  log.summary('Teacher-Subject Map', inserted, skipped, failed);
  log.info(`Subjects auto-created: ${subjectsCreated}`);

  return { inserted, skipped, failed, subjectsCreated };
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Resolve a teacher name from the CSV to a DB user ID.
 * Tries exact match first, then partial (first name only) as fallback.
 */
const resolveTeacherId = (
  rawName: string,
  nameToId: Map<string, string>,
): string | null => {
  // 1. Exact lower-case match
  const exact = nameToId.get(rawName.toLowerCase());
  if (exact) return exact;

  // 2. First-word (first name) partial match
  const firstName = rawName.split(/\s+/)[0].toLowerCase();
  for (const [key, id] of nameToId.entries()) {
    if (key.startsWith(firstName + ' ') || key === firstName) return id;
  }

  return null;
};

/** Generate a short unique code for a subject in a class */
const generateSubjectCode = (name: string, grade: number): string => {
  const abbr = name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
    .slice(0, 6);
  // Grade-specific suffix prevents clashes (e.g. MATH7 vs MATH9)
  return `${abbr}${grade}`;
};
