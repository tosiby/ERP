// =============================================================
// KJSIS — Admin/Setup Zod Schemas
// =============================================================

import { z } from 'zod';

// Create Teacher
export const CreateTeacherSchema = z.object({
  name: z.string().trim().min(2).max(100),
  mobile: z
    .string()
    .trim()
    .min(10)
    .max(15)
    .regex(/^\d+$/, 'Mobile must contain only digits'),
  password: z.string().min(8),
  role: z.enum(['exam_cell', 'teacher', 'vp', 'principal']).default('teacher'),
});

// Assign teacher to subject + division
export const AssignTeacherSubjectSchema = z.object({
  teacher_id: z.string().uuid(),
  division_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  // Optional — controller falls back to the active academic year when omitted
  academic_year_id: z.string().uuid().optional(),
});

// Bulk assign (from CSV timetable import)
export const BulkAssignTeacherSchema = z.object({
  assignments: z.array(AssignTeacherSubjectSchema).min(1).max(500),
});

// Assign class teacher
export const AssignClassTeacherSchema = z.object({
  teacher_id: z.string().uuid(),
  division_id: z.string().uuid(),
  // Optional — controller falls back to the active academic year when omitted
  academic_year_id: z.string().uuid().optional(),
});

// Create exam
export const CreateExamSchema = z.object({
  name: z.string().trim().min(1).max(50),
  label: z.string().trim().max(100).optional(),
  academic_year_id: z.string().uuid(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// Configure subject × exam (total marks + entry mode)
export const ConfigureSubjectExamSchema = z.object({
  subject_id: z.string().uuid(),
  exam_id: z.string().uuid(),
  total_marks: z.number().int().positive(),
  passing_marks: z.number().int().positive(),
  entry_mode: z.enum(['total', 'component']).default('total'),
});

// Add component to subject × exam config
export const AddComponentSchema = z.object({
  subject_exam_config_id: z.string().uuid(),
  component_type: z.enum(['TH', 'PR', 'IA']),
  max_marks: z.number().int().positive(),
  display_order: z.number().int().min(0).default(0),
});

// Create division
export const CreateDivisionSchema = z.object({
  class_id: z.string().uuid(),
  name: z.string().trim().min(1).max(5),
});

// Lock exam
export const LockExamSchema = z.object({
  exam_id: z.string().uuid(),
});

export type CreateTeacherInput = z.infer<typeof CreateTeacherSchema>;
export type AssignTeacherSubjectInput = z.infer<typeof AssignTeacherSubjectSchema>;
export type BulkAssignTeacherInput = z.infer<typeof BulkAssignTeacherSchema>;
export type AssignClassTeacherInput = z.infer<typeof AssignClassTeacherSchema>;
export type CreateExamInput = z.infer<typeof CreateExamSchema>;
export type ConfigureSubjectExamInput = z.infer<typeof ConfigureSubjectExamSchema>;
export type AddComponentInput = z.infer<typeof AddComponentSchema>;
export type CreateDivisionInput = z.infer<typeof CreateDivisionSchema>;
