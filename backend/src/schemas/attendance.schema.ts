// =============================================================
// KJSIS — Attendance Zod Schemas
// =============================================================

import { z } from 'zod';

// ISO date string validator (YYYY-MM-DD)
const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((d) => !isNaN(new Date(d).getTime()), 'Invalid date');

// Mark attendance for a specific date
// Teacher sends list of ABSENT student IDs only
export const MarkAttendanceSchema = z.object({
  division_id: z.string().uuid('Invalid division ID'),
  date: DateString,
  absent_student_ids: z
    .array(z.string().uuid('Invalid student ID'))
    .max(200, 'Too many students'),
  // Keys are student IDs; z.record() doesn't validate key format at runtime,
  // so we use z.string() for the key and validate UUID format in the service layer.
  reasons: z
    .record(z.string(), z.string().max(200))
    .optional()
    .default({}),   // { student_id: reason }
});

// Saturday override — mark a Saturday as working day
export const SaturdayOverrideSchema = z.object({
  division_id: z.string().uuid('Invalid division ID').optional(), // null = school-wide
  date: DateString.refine((d) => {
    const day = new Date(d).getDay();
    return day === 6; // 6 = Saturday
  }, 'Date must be a Saturday'),
  is_working: z.boolean(),
  override_reason: z.string().max(300).optional(),
});

// Query params for attendance fetch
export const AttendanceQuerySchema = z.object({
  division_id: z.string().uuid('Invalid division ID'),
  date: DateString.optional(),
  from_date: DateString.optional(),
  to_date: DateString.optional(),
  student_id: z.string().uuid('Invalid student ID').optional(),
});

// Attendance summary query
export const AttendanceSummaryQuerySchema = z.object({
  division_id: z.string().uuid('Invalid division ID'),
  from_date: DateString,
  to_date: DateString,
});

export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>;
export type SaturdayOverrideInput = z.infer<typeof SaturdayOverrideSchema>;
export type AttendanceQueryInput = z.infer<typeof AttendanceQuerySchema>;
export type AttendanceSummaryQueryInput = z.infer<typeof AttendanceSummaryQuerySchema>;
