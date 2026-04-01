// =============================================================
// KJSIS — Reports Controller
// =============================================================

import { Request, Response, NextFunction } from 'express';
import * as ReportsService from '../services/reports.service';
import { sendSuccess } from '../utils/response';

export const getSubjectReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { subject_id, exam_id, division_id } = req.query as Record<string, string>;
    const data = await ReportsService.getSubjectReport(
      subject_id, exam_id, division_id, req.user!.userId, req.user!.role,
    );
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const getConsolidatedReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { division_id, exam_id } = req.query as Record<string, string>;
    const data = await ReportsService.getConsolidatedReport(
      division_id, exam_id, req.user!.userId, req.user!.role,
    );
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const getClassPerformance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await ReportsService.getClassPerformance(req.params.examId);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const getSubjectAnalysis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await ReportsService.getSubjectAnalysis(req.params.examId);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const getStudentReportCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await ReportsService.getStudentReportCard(req.params.studentId);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const getAtRiskStudents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { division_id, mark_threshold, attendance_threshold } = req.query as Record<string, string>;
    const data = await ReportsService.getAtRiskStudents(
      division_id,
      mark_threshold ? parseFloat(mark_threshold) : 40,
      attendance_threshold ? parseFloat(attendance_threshold) : 75,
    );
    sendSuccess(res, data);
  } catch (err) { next(err); }
};
