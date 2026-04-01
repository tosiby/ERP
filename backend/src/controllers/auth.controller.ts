// =============================================================
// KJSIS — Auth Controller (Phase 2: refresh + logout + FCM)
// =============================================================

import { Request, Response, NextFunction } from 'express';
import * as AuthService from '../services/auth.service';
import { sendSuccess } from '../utils/response';

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ipAddress = (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const result = await AuthService.login(req.body, ipAddress, userAgent);
    sendSuccess(res, result, 'Login successful');
  } catch (err) { next(err); }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await AuthService.refreshAccessToken(req.body.refresh_token);
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await AuthService.logout(req.body.refresh_token);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (err) { next(err); }
};

export const logoutAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await AuthService.logoutAll(req.user!.userId);
    sendSuccess(res, null, 'All sessions terminated');
  } catch (err) { next(err); }
};

export const registerFcmToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await AuthService.registerFcmToken(req.user!.userId, req.body.fcm_token, req.body.device);
    sendSuccess(res, null, 'FCM token registered');
  } catch (err) { next(err); }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await AuthService.changePassword(req.user!.userId, req.body);
    sendSuccess(res, null, 'Password changed successfully');
  } catch (err) { next(err); }
};

export const getMyProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const profile = await AuthService.getMyProfile(req.user!.userId);
    sendSuccess(res, profile);
  } catch (err) { next(err); }
};

export const getMySubjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const academicYearId = req.query.academic_year_id as string | undefined;
    const subjects = await AuthService.getMySubjects(req.user!.userId, academicYearId);
    sendSuccess(res, subjects);
  } catch (err) { next(err); }
};
