// =============================================================
// KJSIS — Phase 4: Reports V2 Controller
// =============================================================

import { Request, Response, NextFunction } from 'express';
import * as ReportsV2 from '../services/reports-v2.service';
import * as RemarksService from '../services/remarks.service';
import { htmlToPdf } from '../services/pdf.service';
import { renderProgressCard } from '../templates/progress-card.template';
import { renderConsolidatedReport } from '../templates/consolidated-report.template';
import { sendSuccess, sendCreated } from '../utils/response';
import {
  ProgressCardQuerySchema,
  ConsolidatedQuerySchema,
  UpsertRemarkSchema,
  GenerateRemarksSchema,
  UpsertReportSettingsSchema,
} from '../schemas/reports-v2.schema';

// ─── Progress Card ────────────────────────────────────────────
export const getProgressCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = ProgressCardQuerySchema.parse(req.query);
    const data = await ReportsV2.getProgressCard(query.student_id, query.academic_year_id, query.term_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const downloadProgressCardPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = ProgressCardQuerySchema.parse(req.query);
    const data = await ReportsV2.getProgressCard(query.student_id, query.academic_year_id, query.term_id);
    const html = renderProgressCard(data);
    const pdf = await htmlToPdf(html, { format: 'A4' });

    const filename = `progress-card-${data.student.admission_number}-${data.academic_year.label}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) { next(err); }
};

// ─── Consolidated Report ──────────────────────────────────────
export const getConsolidatedReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = ConsolidatedQuerySchema.parse(req.query);
    const data = await ReportsV2.getConsolidatedReportV2(
      query.division_id, query.academic_year_id, query.exam_ids, query.term_id,
    );
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const downloadConsolidatedPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = ConsolidatedQuerySchema.parse(req.query);
    const data = await ReportsV2.getConsolidatedReportV2(
      query.division_id, query.academic_year_id, query.exam_ids, query.term_id,
    );
    const settings = await ReportsV2.getReportSettings(data.academic_year.id);
    const html = renderConsolidatedReport(data, data.academic_year.label, settings?.school_name);
    const pdf = await htmlToPdf(html, { format: 'A3', landscape: true });

    const filename = `consolidated-${data.class_name}-${data.division_name}-${data.academic_year.label}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) { next(err); }
};

// ─── Remarks ─────────────────────────────────────────────────
export const getRemarks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { student_id, academic_year_id } = req.query as Record<string, string>;
    const data = await RemarksService.getRemarksForStudent(student_id, academic_year_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const upsertRemark = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = UpsertRemarkSchema.parse(req.body);
    const remark = await RemarksService.upsertRemark(
      input.student_id, input.academic_year_id, input.term_id,
      input.remark_text, req.user!.userId,
    );
    sendSuccess(res, remark);
  } catch (err) { next(err); }
};

export const generateRemark = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = GenerateRemarksSchema.parse(req.body);
    const remark = await RemarksService.generateAIRemark(
      input.student_id, input.academic_year_id, input.term_id, input.overwrite,
    );
    sendCreated(res, remark, 'Remark generated');
  } catch (err) { next(err); }
};

export const generateRemarksForDivision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { division_id, academic_year_id, term_id, overwrite } = req.body as Record<string, string>;
    const result = await RemarksService.generateRemarksForDivision(
      division_id, academic_year_id, term_id, overwrite === 'true',
    );
    sendSuccess(res, result, `Generated ${result.generated} remarks`);
  } catch (err) { next(err); }
};

// ─── Report Settings ──────────────────────────────────────────
export const getReportSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { academic_year_id } = req.query as { academic_year_id: string };
    const settings = await ReportsV2.getReportSettings(academic_year_id);
    sendSuccess(res, settings);
  } catch (err) { next(err); }
};

export const upsertReportSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = UpsertReportSettingsSchema.parse(req.body);
    const settings = await ReportsV2.upsertReportSettings(input);
    sendSuccess(res, settings, 'Settings saved');
  } catch (err) { next(err); }
};
