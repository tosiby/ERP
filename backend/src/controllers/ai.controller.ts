// =============================================================
// KJSIS — AI Insights Controller
// =============================================================

import { Request, Response, NextFunction } from 'express';
import * as AIEngine from '../services/ai-engine.service';
import { getCache, setCache } from '../utils/cache';
import { sendSuccess, sendError } from '../utils/response';

// GET /ai/report?division_id=
export const getReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const divisionId = req.query.division_id as string | undefined;
    const cacheKey   = `ai:report:${divisionId ?? 'school'}`;

    const cached = getCache<Awaited<ReturnType<typeof AIEngine.generateInsightReport>>>(cacheKey);
    if (cached) {
      sendSuccess(res, cached, 'AI insights (cached)');
      return;
    }

    const report = await AIEngine.generateInsightReport(divisionId);
    setCache(cacheKey, report, 30 * 60); // 30-min TTL
    sendSuccess(res, report, 'AI insights generated');
  } catch (err) { next(err); }
};

// GET /ai/risk?division_id=
export const getRiskProfiles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const divisionId = req.query.division_id as string | undefined;
    const data = await AIEngine.getRiskProfiles(divisionId);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

// GET /ai/trends?division_id=&subject_id=
export const getTrends = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { division_id, subject_id } = req.query as Record<string, string>;
    if (!division_id) {
      sendError(res, 'division_id is required', 400);
      return;
    }
    const data = await AIEngine.getTrendAnalysis(division_id, subject_id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

// GET /ai/subject-weakness
export const getSubjectWeakness = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cacheKey = 'ai:subject-weakness';
    const cached = getCache<Awaited<ReturnType<typeof AIEngine.getSubjectWeaknesses>>>(cacheKey);
    if (cached) {
      sendSuccess(res, cached);
      return;
    }
    const data = await AIEngine.getSubjectWeaknesses();
    setCache(cacheKey, data, 20 * 60); // 20-min TTL
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

// GET /ai/teacher-effectiveness
export const getTeacherEffectiveness = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AIEngine.getTeacherEffectiveness();
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

// GET /ai/attendance-risk?division_id=
export const getAttendanceRisk = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const divisionId = req.query.division_id as string | undefined;
    const data = await AIEngine.getAttendanceRisk(divisionId);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};
