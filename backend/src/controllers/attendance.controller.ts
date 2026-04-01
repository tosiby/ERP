// =============================================================
// KJSIS — Attendance Controller
// =============================================================

import { Request, Response, NextFunction } from 'express';
import * as AttendanceService from '../services/attendance.service';
import { sendSuccess } from '../utils/response';

export const markAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await AttendanceService.markAttendance(req.body, req.user!.userId);
    sendSuccess(res, result, 'Attendance marked successfully');
  } catch (err) {
    next(err);
  }
};

export const getAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = await AttendanceService.getAttendance(req.query as never);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
};

export const getAttendanceSummary = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = await AttendanceService.getAttendanceSummary(req.query as never);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
};

export const overrideSaturday = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await AttendanceService.overrideSaturday(
      req.body,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, null, 'Saturday override saved successfully');
  } catch (err) {
    next(err);
  }
};
