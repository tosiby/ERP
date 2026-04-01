// =============================================================
// KJSIS — Notification Routes
// =============================================================

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import * as NotificationController from '../controllers/notification.controller';

const router = Router();
router.use(authenticate);

router.get('/',         NotificationController.getNotifications);
router.post('/read',    validate(z.object({ ids: z.array(z.string().uuid()).min(1) })), NotificationController.markRead);
router.post('/read-all', NotificationController.markAllRead);

export default router;
