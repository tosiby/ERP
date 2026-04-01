// =============================================================
// KJSIS — AI Insights Routes
// =============================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, Roles } from '../middleware/rbac.middleware';
import * as AIController from '../controllers/ai.controller';

const router = Router();
router.use(authenticate);
router.use(authorize(...Roles.REPORTS_ACCESS));

router.get('/report',                AIController.getReport);
router.get('/risk',                  AIController.getRiskProfiles);
router.get('/trends',                AIController.getTrends);
router.get('/subject-weakness',      AIController.getSubjectWeakness);
router.get('/teacher-effectiveness', AIController.getTeacherEffectiveness);
router.get('/attendance-risk',       AIController.getAttendanceRisk);

export default router;
