// =============================================================
// KJSIS — Notification Controller
// =============================================================

import { Request, Response, NextFunction } from 'express';
import * as NotifService from '../services/notification.service';
import { sendSuccess } from '../utils/response';

// GET /notifications?unread=&page=&limit=
export const getNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const onlyUnread = req.query.unread === 'true';
    const page       = Math.max(1, parseInt(req.query.page  as string ?? '1',  10) || 1);
    const limit      = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? '20', 10) || 20));
    const data = await NotifService.getMyNotifications(req.user!.userId, onlyUnread, page, limit);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

// POST /notifications/read  body: { ids: string[] }
export const markRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await NotifService.markNotificationsRead(req.user!.userId, req.body.ids);
    sendSuccess(res, null, 'Marked as read');
  } catch (err) { next(err); }
};

// POST /notifications/read-all
export const markAllRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await NotifService.markAllNotificationsRead(req.user!.userId);
    sendSuccess(res, null, 'All notifications marked as read');
  } catch (err) { next(err); }
};
