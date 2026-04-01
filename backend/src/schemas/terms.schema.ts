// =============================================================
// KJSIS — Terms & Exam Type Zod Schemas
// =============================================================

import { z } from 'zod';

// ── Exam Types ────────────────────────────────────────────────

export const CreateExamTypeSchema = z.object({
  academic_year_id:      z.string().uuid(),
  code:                  z.string().trim().min(1).max(20).toUpperCase(),
  label:                 z.string().trim().min(1).max(100),
  max_marks_default:     z.number().int().positive().default(100),
  passing_marks_default: z.number().int().positive().default(35),
  entry_mode_default:    z.enum(['total', 'component']).default('total'),
  display_order:         z.number().int().min(0).default(0),
}).refine(
  (d) => d.passing_marks_default < d.max_marks_default,
  { message: 'passing_marks_default must be less than max_marks_default', path: ['passing_marks_default'] },
);

export const UpdateExamTypeSchema = CreateExamTypeSchema.partial().omit({ academic_year_id: true });

export const BulkUpsertExamTypesSchema = z.object({
  academic_year_id: z.string().uuid(),
  exam_types: z
    .array(
      z.object({
        code:                  z.string().trim().min(1).max(20).toUpperCase(),
        label:                 z.string().trim().min(1).max(100),
        max_marks_default:     z.number().int().positive().default(100),
        passing_marks_default: z.number().int().positive().default(35),
        entry_mode_default:    z.enum(['total', 'component']).default('total'),
        display_order:         z.number().int().min(0).optional(),
      }),
    )
    .min(1, 'At least one exam type is required')
    .max(10)
    .refine(
      (types) => new Set(types.map((t) => t.code)).size === types.length,
      { message: 'Exam type codes must be unique' },
    ),
});

// ── Terms ─────────────────────────────────────────────────────

export const ConfigureTermsSchema = z.object({
  academic_year_id: z.string().uuid(),
  term_count:       z.number().int().min(1).max(3),
  terms: z
    .array(
      z.object({
        term_number: z.number().int().min(1).max(3),
        start_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    )
    .optional(),
}).refine(
  (d) => !d.terms || d.terms.length === d.term_count,
  { message: 'terms array length must match term_count', path: ['terms'] },
);

export const GenerateExamsSchema = z.object({
  academic_year_id: z.string().uuid(),
});

export const TermsQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

export type CreateExamTypeInput     = z.infer<typeof CreateExamTypeSchema>;
export type UpdateExamTypeInput     = z.infer<typeof UpdateExamTypeSchema>;
export type BulkUpsertExamTypesInput = z.infer<typeof BulkUpsertExamTypesSchema>;
export type ConfigureTermsInput     = z.infer<typeof ConfigureTermsSchema>;
export type GenerateExamsInput      = z.infer<typeof GenerateExamsSchema>;
export type TermsQueryInput         = z.infer<typeof TermsQuerySchema>;
