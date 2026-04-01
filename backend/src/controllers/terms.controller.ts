// =============================================================
// KJSIS — Terms & Exam Types Controller
// =============================================================

import { Request, Response, NextFunction } from 'express';
import * as TermsService from '../services/terms.service';
import { sendSuccess, sendCreated } from '../utils/response';

// ── Exam Types ────────────────────────────────────────────────

export const getExamTypes = async (
  req: Request, res: Response, next: NextFunction,
): Promise<void> => {
  try {
    const { academic_year_id } = req.query as { academic_year_id: string };
    const data = await TermsService.getExamTypes(academic_year_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const bulkUpsertExamTypes = async (
  req: Request, res: Response, next: NextFunction,
): Promise<void> => {
  try {
    const data = await TermsService.bulkUpsertExamTypes(req.body);
    sendSuccess(res, data, 'Exam types saved');
  } catch (err) { next(err); }
};

// ── Terms ─────────────────────────────────────────────────────

export const getTerms = async (
  req: Request, res: Response, next: NextFunction,
): Promise<void> => {
  try {
    const { academic_year_id } = req.query as { academic_year_id: string };
    const data = await TermsService.getTerms(academic_year_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const configureTerms = async (
  req: Request, res: Response, next: NextFunction,
): Promise<void> => {
  try {
    const data = await TermsService.configureTerms(req.body);
    sendSuccess(res, data, `${req.body.term_count} term(s) configured`);
  } catch (err) { next(err); }
};

// ── Exam Generation ───────────────────────────────────────────

export const previewExams = async (
  req: Request, res: Response, next: NextFunction,
): Promise<void> => {
  try {
    const { academic_year_id } = req.query as { academic_year_id: string };
    const data = await TermsService.previewGeneratedExams(academic_year_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const generateExams = async (
  req: Request, res: Response, next: NextFunction,
): Promise<void> => {
  try {
    const result = await TermsService.generateExams(req.body);
    const msg = `${result.created.length} exams created, ${result.skipped} already existed`;
    sendCreated(res, result, msg);
  } catch (err) { next(err); }
};
