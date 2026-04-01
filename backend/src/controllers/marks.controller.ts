// =============================================================
// KJSIS — Marks Controller
// =============================================================

import { Request, Response, NextFunction } from 'express';
import * as MarksService from '../services/marks.service';
import { sendSuccess, sendCreated } from '../utils/response';

export const getMarksSheet = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = await MarksService.getMarksSheet(
      req.query as never,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
};

export const saveMarksTotal = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await MarksService.saveMarksTotal(req.body, req.user!.userId, req.user!.role);
    sendSuccess(res, null, 'Marks saved successfully');
  } catch (err) {
    next(err);
  }
};

export const saveMarksComponent = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await MarksService.saveMarksComponent(req.body, req.user!.userId, req.user!.role);
    sendSuccess(res, null, 'Component marks saved successfully');
  } catch (err) {
    next(err);
  }
};

export const submitMarks = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await MarksService.submitMarks(
      req.body,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, `${result.updated} mark(s) submitted successfully`);
  } catch (err) {
    next(err);
  }
};

export const lockMarks = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await MarksService.lockMarks(req.body, req.user!.userId);
    sendSuccess(res, result, `${result.locked} mark(s) locked successfully`);
  } catch (err) {
    next(err);
  }
};

export const getMarkEntryStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { exam_id } = req.params;
    const data = await MarksService.getMarkEntryStatus(exam_id);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
};
