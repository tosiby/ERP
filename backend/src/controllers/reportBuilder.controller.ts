// =============================================================
// KJSIS — Report Builder Controller
//
// Handles the canonical report endpoints:
//   GET  /api/reports/progress-card         → FullReport JSON
//   GET  /api/reports/progress-card/pdf     → PDF Buffer
//   POST /api/reports/bulk-progress-cards   → ZIP stream
//   GET  /api/reports/consolidated          → ConsolidatedReport JSON (rich)
//   GET  /api/reports/consolidated/pdf      → PDF Buffer (A3 landscape)
// =============================================================

import { Request, Response, NextFunction } from 'express';
import {
  buildFullReport,
  buildDivisionReports,
  getConsolidatedReportV2,
  getReportSettings,
} from '../services/reportBuilder.service';
import {
  generateProgressCardPdf,
  generateConsolidatedPdf,
  streamBulkProgressCards,
} from '../services/pdf.service';
import { sendSuccess, sendError } from '../utils/response';
import {
  ProgressCardQuerySchema,
  ConsolidatedQuerySchema,
  BulkProgressCardSchema,
} from '../schemas/reports-v2.schema';
import { logger } from '../utils/logger';
import { pool } from '../utils/db';

// ─── Helper: resolve current academic year ────────────────────
async function resolveYear(id?: string): Promise<{ id: string; label: string }> {
  const { rows } = await pool.query<{ id: string; label: string }>(
    id
      ? 'SELECT id, label FROM academic_years WHERE id = $1'
      : 'SELECT id, label FROM academic_years WHERE is_current = TRUE LIMIT 1',
    id ? [id] : [],
  );
  if (!rows[0]) throw Object.assign(new Error('Academic year not found'), { statusCode: 404 });
  return rows[0];
}

// ─── GET /progress-card ───────────────────────────────────────
export const getProgressCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { student_id, academic_year_id, term_id } = ProgressCardQuerySchema.parse(req.query);
    const report = await buildFullReport(student_id, academic_year_id, term_id);
    sendSuccess(res, report);
  } catch (err) { next(err); }
};

// ─── GET /progress-card/pdf ───────────────────────────────────
export const getProgressCardPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { student_id, academic_year_id, term_id } = ProgressCardQuerySchema.parse(req.query);
    const report = await buildFullReport(student_id, academic_year_id, term_id);
    const pdf = await generateProgressCardPdf(report);

    const filename = `progress-card_${report.student.admission_number}_${report.academic_year.label}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) { next(err); }
};

// ─── POST /bulk-progress-cards ────────────────────────────────
// Body: { division_id, academic_year_id?, term_id? }
// Response: application/zip stream
//
// Streaming design: PDFs are generated one-at-a-time and piped
// directly into archiver → response without accumulating in memory.
export const bulkProgressCards = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { division_id, academic_year_id, term_id } = BulkProgressCardSchema.parse(req.body);
    const year = await resolveYear(academic_year_id);

    // Validate division exists
    const { rows: divRows } = await pool.query<{ class_name: string; division_name: string }>(
      `SELECT cl.name AS class_name, d.name AS division_name
       FROM divisions d JOIN classes cl ON cl.id = d.class_id
       WHERE d.id = $1`,
      [division_id],
    );
    if (!divRows[0]) {
      sendError(res, 'Division not found', 404);
      return;
    }
    const { class_name, division_name } = divRows[0];

    // Set ZIP response headers before streaming begins
    const zipFilename = `progress-cards_${class_name}_Div${division_name}_${year.label}${term_id ? `_T${term_id.slice(0, 4)}` : ''}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Transfer-Encoding', 'chunked');

    // Stream — no await, generator is lazy
    const generator = buildDivisionReports(division_id, year.id, term_id);
    const stats = await streamBulkProgressCards(res, generator, zipFilename);

    logger.info('Bulk progress cards generated', {
      division_id,
      class: class_name,
      division: division_name,
      ...stats,
    });

    // Response already finished via archive.pipe(res) — do not write more
  } catch (err) { next(err); }
};

// ─── GET /consolidated ────────────────────────────────────────
// Rich version: uses reportBuilder's consolidated (dynamic terms, class avg, pass rates)
export const getConsolidated = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { division_id, academic_year_id, exam_ids, term_id } = ConsolidatedQuerySchema.parse(req.query);
    const report = await getConsolidatedReportV2(division_id, academic_year_id, exam_ids, term_id);
    sendSuccess(res, report);
  } catch (err) { next(err); }
};

// ─── GET /consolidated/pdf ────────────────────────────────────
export const getConsolidatedPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { division_id, academic_year_id, exam_ids, term_id } = ConsolidatedQuerySchema.parse(req.query);
    const report = await getConsolidatedReportV2(division_id, academic_year_id, exam_ids, term_id);
    const settings = await getReportSettings(report.academic_year.id);
    const pdf = await generateConsolidatedPdf(report, report.academic_year.label, settings?.school_name);

    const filename = `consolidated_${report.class_name}_Div${report.division_name}_${report.academic_year.label}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) { next(err); }
};
