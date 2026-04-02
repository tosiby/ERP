// =============================================================
// KJSIS — Phase 4: Reporting System Schemas (Zod)
// =============================================================

import { z } from 'zod';

// ─── Progress Card Query ──────────────────────────────────────
export const ProgressCardQuerySchema = z.object({
  student_id:      z.string().uuid(),
  academic_year_id: z.string().uuid().optional(),
  // optional: filter to one term
  term_id:         z.string().uuid().optional(),
});
export type ProgressCardQuery = z.infer<typeof ProgressCardQuerySchema>;

// ─── Consolidated Report Query ────────────────────────────────
export const ConsolidatedQuerySchema = z.object({
  division_id:      z.string().uuid(),
  academic_year_id: z.string().uuid().optional(),
  // optional: comma-separated exam_ids to include; default = all in academic year
  exam_ids:         z.string().optional(),
  term_id:          z.string().uuid().optional(),
});
export type ConsolidatedQuery = z.infer<typeof ConsolidatedQuerySchema>;

// ─── PDF Export Query ─────────────────────────────────────────
export const PdfProgressCardQuerySchema = ProgressCardQuerySchema;
export type PdfProgressCardQuery = ProgressCardQuery;

export const PdfConsolidatedQuerySchema = ConsolidatedQuerySchema;
export type PdfConsolidatedQuery = ConsolidatedQuery;

// ─── Remark Upsert ───────────────────────────────────────────
export const UpsertRemarkSchema = z.object({
  student_id:      z.string().uuid(),
  academic_year_id: z.string().uuid(),
  term_id:         z.string().uuid().nullable().default(null),
  remark_text:     z.string().min(1).max(1000).trim(),
});
export type UpsertRemarkInput = z.infer<typeof UpsertRemarkSchema>;

// ─── AI Remark Generation ─────────────────────────────────────
export const GenerateRemarksSchema = z.object({
  student_id:      z.string().uuid(),
  academic_year_id: z.string().uuid(),
  // Generate for specific term, or omit for annual remark
  term_id:         z.string().uuid().optional(),
  overwrite:       z.boolean().default(false),
});
export type GenerateRemarksInput = z.infer<typeof GenerateRemarksSchema>;

// ─── Bulk Progress Cards ──────────────────────────────────────
export const BulkProgressCardSchema = z.object({
  division_id:      z.string().uuid(),
  academic_year_id: z.string().uuid().optional(),
  term_id:          z.string().uuid().optional(),
});
export type BulkProgressCardInput = z.infer<typeof BulkProgressCardSchema>;

// ─── Report Settings Upsert ───────────────────────────────────
export const UpsertReportSettingsSchema = z.object({
  academic_year_id: z.string().uuid(),
  school_name:      z.string().min(1).max(255).trim().optional(),
  logo_url:         z.string().url().nullable().optional(),
  principal_name:   z.string().max(150).trim().nullable().optional(),
  show_rank:        z.boolean().optional(),
  show_attendance:  z.boolean().optional(),
  show_insights:    z.boolean().optional(),
  show_ai_remarks:  z.boolean().optional(),
  footer_text:      z.string().max(500).trim().nullable().optional(),
});
export type UpsertReportSettingsInput = z.infer<typeof UpsertReportSettingsSchema>;
