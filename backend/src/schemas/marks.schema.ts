// =============================================================
// KJSIS — Marks Zod Schemas
// =============================================================

import { z } from 'zod';

// Single mark row for total-mode entry
const TotalMarkRow = z.object({
  student_id: z.string().uuid('Invalid student ID'),
  marks_obtained: z.number().min(0, 'Marks cannot be negative'),
  is_absent: z.boolean().optional().default(false),
});

// Single mark row for component-mode entry
const ComponentMarkRow = z.object({
  student_id: z.string().uuid('Invalid student ID'),
  component_id: z.string().uuid('Invalid component ID'),
  marks_obtained: z.number().min(0, 'Marks cannot be negative'),
  is_absent: z.boolean().optional().default(false),
});

// Bulk mark entry (teacher submits all students at once)
export const BulkMarkEntrySchema = z.object({
  exam_id: z.string().uuid('Invalid exam ID'),
  subject_id: z.string().uuid('Invalid subject ID'),
  division_id: z.string().uuid('Invalid division ID'),
  marks: z
    .array(TotalMarkRow)
    .min(1, 'At least one mark entry is required')
    .max(100, 'Too many entries in a single request'),
});

// Bulk component mark entry
export const BulkComponentMarkEntrySchema = z.object({
  exam_id: z.string().uuid('Invalid exam ID'),
  subject_id: z.string().uuid('Invalid subject ID'),
  division_id: z.string().uuid('Invalid division ID'),
  marks: z
    .array(ComponentMarkRow)
    .min(1, 'At least one mark entry is required')
    .max(500, 'Too many entries in a single request'),
});

// Submit marks (changes status from draft → submitted)
export const SubmitMarksSchema = z.object({
  exam_id: z.string().uuid('Invalid exam ID'),
  subject_id: z.string().uuid('Invalid subject ID'),
  division_id: z.string().uuid('Invalid division ID'),
});

// Lock a single subject+division (submitted → locked)
export const LockSubjectMarksSchema = z.object({
  exam_id:     z.string().uuid('Invalid exam ID'),
  subject_id:  z.string().uuid('Invalid subject ID'),
  division_id: z.string().uuid('Invalid division ID'),
});

// Lock ALL subjects for an entire exam at once (bulk operation)
export const LockExamMarksSchema = z.object({
  exam_id: z.string().uuid('Invalid exam ID'),
});

// Query params for fetching marks
export const MarksQuerySchema = z.object({
  exam_id: z.string().uuid('Invalid exam ID'),
  subject_id: z.string().uuid('Invalid subject ID'),
  division_id: z.string().uuid('Invalid division ID'),
});

export type BulkMarkEntryInput        = z.infer<typeof BulkMarkEntrySchema>;
export type BulkComponentMarkEntryInput = z.infer<typeof BulkComponentMarkEntrySchema>;
export type SubmitMarksInput          = z.infer<typeof SubmitMarksSchema>;
export type LockSubjectMarksInput     = z.infer<typeof LockSubjectMarksSchema>;
export type LockExamMarksInput        = z.infer<typeof LockExamMarksSchema>;
export type MarksQueryInput           = z.infer<typeof MarksQuerySchema>;
