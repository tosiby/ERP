// =============================================================
// KJSIS — Student Import Service
// Supports: Excel (.xlsx/.xls) and CSV
// Features: validation, dry-run mode, elective assignment
// =============================================================

import * as XLSX from 'xlsx';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../utils/db';
import { ValidationError, ImportValidationError, ImportFailedRow } from '../utils/errors';
import { logger } from '../utils/logger';
import { StudentRowSchema, StudentRowInput } from '../schemas/student-import.schema';

// ─── Types ────────────────────────────────────────────────────
export interface ImportResult {
  dry_run: boolean;
  total_rows: number;
  success_count: number;
  skip_count: number;          // already exists — skipped, not error
  failed_count: number;
  failed_rows: ImportFailedRow[];
  inserted_ids?: string[];     // only populated on real run
}

// ─── Parse file buffer → raw rows ────────────────────────────
const parseFile = (buffer: Buffer, mimeType: string): Record<string, unknown>[] => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) throw new ValidationError('Excel file has no sheets');

  // json_with_default_value: treat empty cells as empty string
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,  // parse numbers as strings first (we coerce in Zod)
  });

  if (rows.length === 0) throw new ValidationError('File contains no data rows');
  if (rows.length > 1000) throw new ValidationError('Maximum 1000 students per import');

  return rows;
};

// ─── Normalise column names (case-insensitive, trim) ─────────
const normaliseRow = (raw: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    const normKey = key.toLowerCase().trim().replace(/\s+/g, '_');
    result[normKey] = typeof val === 'string' ? val.trim() : val;
  }
  return result;
};

// ─── Build lookup maps from DB ────────────────────────────────
const buildLookupMaps = async (academicYearId: string) => {
  // class name → id
  const classResult = await query<{ id: string; name: string }>(
    `SELECT id, name FROM classes WHERE is_active = TRUE`,
  );
  const classMap = new Map(classResult.rows.map((c) => [c.name.toLowerCase(), c.id]));

  // "class_id:division_name" → division id
  const divResult = await query<{ id: string; class_id: string; name: string }>(
    `SELECT id, class_id, name FROM divisions WHERE is_active = TRUE`,
  );
  const divMap = new Map(
    divResult.rows.map((d) => [`${d.class_id}:${d.name.toLowerCase()}`, d.id]),
  );

  // existing admission numbers (current year) → student id
  const admResult = await query<{ id: string; admission_number: string }>(
    `SELECT id, admission_number FROM students WHERE academic_year_id = $1`,
    [academicYearId],
  );
  const existingAdmissions = new Map(admResult.rows.map((s) => [s.admission_number, s.id]));

  // subject code → subject id (for elective assignment)
  const subjResult = await query<{ id: string; name: string; class_id: string; is_elective: boolean; elective_group: string | null }>(
    `SELECT id, name, class_id, is_elective, elective_group FROM subjects WHERE is_active = TRUE`,
  );
  const electiveSubjects = subjResult.rows.filter((s) => s.is_elective);

  return { classMap, divMap, existingAdmissions, electiveSubjects };
};

// =============================================================
// MAIN IMPORT FUNCTION
// =============================================================
export const importStudents = async (
  fileBuffer: Buffer,
  mimeType: string,
  academicYearId: string | undefined,
  dryRun: boolean,
): Promise<ImportResult> => {
  // Resolve current academic year
  const yearResult = await query<{ id: string }>(
    academicYearId
      ? `SELECT id FROM academic_years WHERE id = $1`
      : `SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1`,
    academicYearId ? [academicYearId] : [],
  );
  const year = yearResult.rows[0];
  if (!year) throw new ValidationError('No active academic year found');
  const resolvedYearId = year.id;

  // Parse raw rows from file
  const rawRows = parseFile(fileBuffer, mimeType);

  // Build DB lookup maps (one DB round-trip before the loop)
  const { classMap, divMap, existingAdmissions, electiveSubjects } =
    await buildLookupMaps(resolvedYearId);

  const failedRows: ImportFailedRow[] = [];
  const validStudents: Array<{
    rowIndex: number;
    parsed: StudentRowInput;
    divisionId: string;
    electiveSubjectId: string | null;
  }> = [];
  const skippedAdmissions: string[] = [];

  // ─── Validate every row ────────────────────────────────────
  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;  // +2 because row 1 = header
    const norm = normaliseRow(rawRows[i]);

    const parseResult = StudentRowSchema.safeParse(norm);
    if (!parseResult.success) {
      failedRows.push({
        row: rowNum,
        data: norm,
        reason: parseResult.error.issues.map((e) => e.message).join('; '),
      });
      continue;
    }

    const parsed = parseResult.data;

    // Class exists?
    const classId = classMap.get(parsed.class_name.toLowerCase());
    if (!classId) {
      failedRows.push({ row: rowNum, data: norm, reason: `Class '${parsed.class_name}' not found` });
      continue;
    }

    // Division exists?
    const divKey = `${classId}:${parsed.division_name.toLowerCase()}`;
    const divisionId = divMap.get(divKey);
    if (!divisionId) {
      failedRows.push({
        row: rowNum, data: norm,
        reason: `Division '${parsed.division_name}' not found in ${parsed.class_name}`,
      });
      continue;
    }

    // Duplicate admission number → skip (not error)
    if (existingAdmissions.has(parsed.admission_number)) {
      skippedAdmissions.push(parsed.admission_number);
      continue;
    }

    // Elective validation
    let electiveSubjectId: string | null = null;
    if (parsed.elective) {
      const matchingElective = electiveSubjects.find(
        (s) =>
          s.class_id === classId &&
          s.name.toLowerCase() === parsed.elective!.toLowerCase(),
      );
      if (!matchingElective) {
        failedRows.push({
          row: rowNum, data: norm,
          reason: `Elective '${parsed.elective}' not found for ${parsed.class_name}`,
        });
        continue;
      }
      electiveSubjectId = matchingElective.id;
    }

    validStudents.push({ rowIndex: rowNum, parsed, divisionId, electiveSubjectId });
  }

  // ─── Dry run — return validation results only ─────────────
  if (dryRun) {
    return {
      dry_run: true,
      total_rows: rawRows.length,
      success_count: validStudents.length,
      skip_count: skippedAdmissions.length,
      failed_count: failedRows.length,
      failed_rows: failedRows,
    };
  }

  // ─── Real run — insert in transaction ─────────────────────
  const insertedIds: string[] = [];

  await withTransaction(async (client: PoolClient) => {
    for (const { parsed, divisionId, electiveSubjectId } of validStudents) {
      const insertResult = await client.query<{ id: string }>(
        `INSERT INTO students
           (admission_number, name, roll_number, division_id, academic_year_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (admission_number) DO NOTHING
         RETURNING id`,
        [
          parsed.admission_number,
          parsed.name,
          parsed.roll_number,
          divisionId,
          resolvedYearId,
        ],
      );

      const studentId = insertResult.rows[0]?.id;
      if (!studentId) continue; // conflict — already exists

      insertedIds.push(studentId);

      // Assign elective subject
      if (electiveSubjectId) {
        await client.query(
          `INSERT INTO student_subjects (student_id, subject_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [studentId, electiveSubjectId],
        );
      }
    }
  });

  logger.info('Student import complete', {
    total: rawRows.length,
    inserted: insertedIds.length,
    skipped: skippedAdmissions.length,
    failed: failedRows.length,
    dryRun,
  });

  return {
    dry_run: false,
    total_rows: rawRows.length,
    success_count: insertedIds.length,
    skip_count: skippedAdmissions.length,
    failed_count: failedRows.length,
    failed_rows: failedRows,
    inserted_ids: insertedIds,
  };
};
