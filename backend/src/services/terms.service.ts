// =============================================================
// KJSIS — Terms & Exam Types Service
//
// Responsibilities:
//   1. Manage exam_types per academic year (CRUD + bulk upsert)
//   2. Configure term structure (1–3 terms per year)
//   3. Auto-generate exams from term × exam_type matrix
//   4. Provide term-wise exam structure for downstream services
// =============================================================

import { query, withTransaction } from '../utils/db';
import { AppError } from '../utils/errors';
import {
  ExamType, Term, Exam, GeneratedExamPreview,
} from '../types';
import {
  BulkUpsertExamTypesInput,
  ConfigureTermsInput,
  GenerateExamsInput,
} from '../schemas/terms.schema';

// ─────────────────────────────────────────────────────────────
// EXAM TYPES
// ─────────────────────────────────────────────────────────────

export const getExamTypes = async (academicYearId: string): Promise<ExamType[]> => {
  const result = await query<ExamType>(
    `SELECT * FROM exam_types
     WHERE academic_year_id = $1
     ORDER BY display_order, created_at`,
    [academicYearId],
  );
  return result.rows;
};

/**
 * Bulk upsert exam types for an academic year.
 * - Replaces existing types that share the same code.
 * - Deletes any codes NOT in the new list (clean slate per upsert).
 * - Minimum 1 type enforced by schema.
 */
export const bulkUpsertExamTypes = async (
  input: BulkUpsertExamTypesInput,
): Promise<ExamType[]> => {
  const { academic_year_id, exam_types } = input;

  // Check no type with existing marks is being deleted
  const incomingCodes = exam_types.map((t) => t.code.toUpperCase());

  const staleTypes = await query<{ code: string; has_marks: boolean }>(
    `SELECT et.code,
            EXISTS (
              SELECT 1 FROM exams e
              JOIN marks m ON m.exam_id = e.id
              WHERE e.exam_type_id = et.id
                AND m.status = 'locked'
            ) AS has_marks
     FROM exam_types et
     WHERE et.academic_year_id = $1
       AND et.code <> ALL($2::text[])`,
    [academic_year_id, incomingCodes],
  );

  const lockedTypes = staleTypes.rows.filter((r) => r.has_marks).map((r) => r.code);
  if (lockedTypes.length > 0) {
    throw new AppError(
      `Cannot remove exam types with locked marks: ${lockedTypes.join(', ')}`,
      409,
      'EXAM_TYPE_IN_USE',
    );
  }

  return withTransaction(async (client) => {
    // Delete removed types (no locked marks)
    await client.query(
      `DELETE FROM exam_types
       WHERE academic_year_id = $1
         AND code <> ALL($2::text[])`,
      [academic_year_id, incomingCodes],
    );

    // Upsert each incoming type
    const results: ExamType[] = [];
    for (let i = 0; i < exam_types.length; i++) {
      const t = exam_types[i];
      const code = t.code.toUpperCase();
      const order = t.display_order ?? i;

      const row = await client.query<ExamType>(
        `INSERT INTO exam_types
           (academic_year_id, code, label, max_marks_default, passing_marks_default,
            entry_mode_default, display_order)
         VALUES ($1,$2,$3,$4,$5,$6::entry_mode,$7)
         ON CONFLICT (academic_year_id, code) DO UPDATE SET
           label                 = EXCLUDED.label,
           max_marks_default     = EXCLUDED.max_marks_default,
           passing_marks_default = EXCLUDED.passing_marks_default,
           entry_mode_default    = EXCLUDED.entry_mode_default,
           display_order         = EXCLUDED.display_order,
           updated_at            = NOW()
         RETURNING *`,
        [academic_year_id, code, t.label, t.max_marks_default,
         t.passing_marks_default, t.entry_mode_default, order],
      );
      results.push(row.rows[0]);
    }

    return results.sort((a, b) => a.display_order - b.display_order);
  });
};

// ─────────────────────────────────────────────────────────────
// TERMS
// ─────────────────────────────────────────────────────────────

export const getTerms = async (academicYearId: string): Promise<Term[]> => {
  const result = await query<Term>(
    `SELECT * FROM terms
     WHERE academic_year_id = $1
     ORDER BY term_number`,
    [academicYearId],
  );
  return result.rows;
};

/**
 * Configure 1–3 terms for an academic year.
 * - Idempotent: re-running with same term_count is a no-op (except dates).
 * - Reducing term count (e.g. 3→2) is blocked if Term 3 has locked marks.
 * - Term names are auto-generated: "Term 1", "Term 2", "Term 3".
 */
export const configureTerms = async (input: ConfigureTermsInput): Promise<Term[]> => {
  const { academic_year_id, term_count, terms: termOverrides } = input;

  // Block reduction if higher-numbered terms have locked marks
  const lockedCheck = await query<{ term_number: number }>(
    `SELECT DISTINCT t.term_number
     FROM terms t
     JOIN exams e ON e.term_id = t.id
     JOIN marks m ON m.exam_id = e.id
     WHERE t.academic_year_id = $1
       AND t.term_number > $2
       AND m.status = 'locked'`,
    [academic_year_id, term_count],
  );

  if (lockedCheck.rows.length > 0) {
    const locked = lockedCheck.rows.map((r) => `Term ${r.term_number}`).join(', ');
    throw new AppError(
      `Cannot reduce terms — locked marks exist in: ${locked}`,
      409,
      'TERM_HAS_LOCKED_MARKS',
    );
  }

  return withTransaction(async (client) => {
    // Delete terms beyond the new count (cascade deletes their generated exams via SET NULL)
    await client.query(
      `DELETE FROM terms
       WHERE academic_year_id = $1 AND term_number > $2`,
      [academic_year_id, term_count],
    );

    const results: Term[] = [];
    for (let n = 1; n <= term_count; n++) {
      const override = termOverrides?.find((t) => t.term_number === n);
      const row = await client.query<Term>(
        `INSERT INTO terms (academic_year_id, term_number, name, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (academic_year_id, term_number) DO UPDATE SET
           name       = EXCLUDED.name,
           start_date = COALESCE(EXCLUDED.start_date, terms.start_date),
           end_date   = COALESCE(EXCLUDED.end_date,   terms.end_date),
           updated_at = NOW()
         RETURNING *`,
        [
          academic_year_id,
          n,
          `Term ${n}`,
          override?.start_date ?? null,
          override?.end_date   ?? null,
        ],
      );
      results.push(row.rows[0]);
    }

    return results;
  });
};

// ─────────────────────────────────────────────────────────────
// EXAM GENERATION
// ─────────────────────────────────────────────────────────────

/**
 * Preview what exams WOULD be generated — no DB writes.
 * Used by the frontend live preview panel.
 */
export const previewGeneratedExams = async (
  academicYearId: string,
): Promise<GeneratedExamPreview[]> => {
  const [examTypes, terms] = await Promise.all([
    getExamTypes(academicYearId),
    getTerms(academicYearId),
  ]);

  if (examTypes.length === 0) return [];
  if (terms.length === 0) return [];

  const previews: GeneratedExamPreview[] = [];
  for (const term of terms) {
    for (const et of examTypes) {
      previews.push({
        name:            `${et.code}${term.term_number}`,
        label:           `${et.label} — ${term.name}`,
        term_number:     term.term_number,
        exam_type_code:  et.code,
        max_marks:       et.max_marks_default,
      });
    }
  }
  return previews;
};

/**
 * Generate (upsert) all exams for the full term × exam_type matrix.
 * - Safe to re-run; existing exams are not overwritten.
 * - Returns newly created exams only.
 */
export const generateExams = async (input: GenerateExamsInput): Promise<{
  created: Exam[];
  skipped: number;
  preview: GeneratedExamPreview[];
}> => {
  const { academic_year_id } = input;

  const [examTypes, terms] = await Promise.all([
    getExamTypes(academic_year_id),
    getTerms(academic_year_id),
  ]);

  if (examTypes.length === 0) {
    throw new AppError(
      'No exam types configured for this academic year. Add at least one exam type first.',
      422,
      'NO_EXAM_TYPES',
    );
  }
  if (terms.length === 0) {
    throw new AppError(
      'No terms configured for this academic year. Configure terms first.',
      422,
      'NO_TERMS',
    );
  }

  const created: Exam[] = [];
  let skipped = 0;

  await withTransaction(async (client) => {
    for (const term of terms) {
      for (const et of examTypes) {
        const name  = `${et.code}${term.term_number}`;
        const label = `${et.label} — ${term.name}`;

        const row = await client.query<Exam & { xmax: string }>(
          `INSERT INTO exams
             (academic_year_id, term_id, exam_type_id, name, label,
              start_date, end_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT DO NOTHING
           RETURNING *, xmax::text`,
          [
            academic_year_id,
            term.id,
            et.id,
            name,
            label,
            term.start_date ?? null,
            term.end_date   ?? null,
          ],
        );

        if (row.rows[0]) {
          created.push(row.rows[0]);
        } else {
          skipped++;
        }
      }
    }
  });

  const preview = await previewGeneratedExams(academic_year_id);
  return { created, skipped, preview };
};

// ─────────────────────────────────────────────────────────────
// UTILITY — used by reports & AI engine
// ─────────────────────────────────────────────────────────────

/** Returns exam rows enriched with term_number + exam_type_code */
export const getExamsWithTermInfo = async (
  academicYearId: string,
): Promise<Array<Exam & { term_number: number | null; exam_type_code: string | null }>> => {
  const result = await query<Exam & { term_number: number | null; exam_type_code: string | null }>(
    `SELECT e.*,
            t.term_number,
            et.code AS exam_type_code
     FROM exams e
     LEFT JOIN terms      t  ON t.id  = e.term_id
     LEFT JOIN exam_types et ON et.id = e.exam_type_id
     WHERE e.academic_year_id = $1
       AND e.is_active = TRUE
     ORDER BY t.term_number NULLS LAST, et.display_order NULLS LAST`,
    [academicYearId],
  );
  return result.rows;
};
