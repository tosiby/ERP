// =============================================================
// KJSIS — Student Import Zod Schemas
// =============================================================

import { z } from 'zod';

// A single student row from Excel/CSV
export const StudentRowSchema = z.object({
  admission_number: z
    .string()
    .trim()
    .min(1, 'Admission number is required')
    .max(30, 'Admission number too long'),
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long'),
  roll_number: z
    .union([z.number(), z.string()])
    .transform((v) => parseInt(String(v), 10))
    .pipe(z.number().int().positive('Roll number must be a positive integer')),
  class_name: z.string().trim().min(1, 'Class name is required'),       // e.g. "Class 7"
  division_name: z.string().trim().min(1, 'Division is required'),      // e.g. "A"
  elective: z.string().trim().optional(),                                // "Hindi" or "French"
});

// Import request body
export const ImportStudentsBodySchema = z.object({
  academic_year_id: z.string().uuid('Invalid academic year ID').optional(),
  dry_run: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true')
    .default(false),
});

export type StudentRowInput = z.infer<typeof StudentRowSchema>;
export type ImportStudentsBodyInput = z.infer<typeof ImportStudentsBodySchema>;
