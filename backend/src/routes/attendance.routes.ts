// =============================================================
// KJSIS — Attendance Routes
// =============================================================

import { Router } from 'express';
import * as AttendanceController from '../controllers/attendance.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, Roles } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  MarkAttendanceSchema,
  SaturdayOverrideSchema,
  AttendanceQuerySchema,
  AttendanceSummaryQuerySchema,
} from '../schemas/attendance.schema';

const router = Router();

router.use(authenticate);

// POST /attendance — mark attendance (class teacher only)
router.post(
  '/',
  authorize('teacher', 'exam_cell', 'super_admin'),
  validate(MarkAttendanceSchema),
  AttendanceController.markAttendance,
);

// GET /attendance — fetch for a date or range
router.get(
  '/',
  authorize(...Roles.ALL_STAFF),
  validate(AttendanceQuerySchema, 'query'),
  AttendanceController.getAttendance,
);

// GET /attendance/summary — summary per student
router.get(
  '/summary',
  authorize(...Roles.ALL_STAFF),
  validate(AttendanceSummaryQuerySchema, 'query'),
  AttendanceController.getAttendanceSummary,
);

// POST /attendance/saturday-override
router.post(
  '/saturday-override',
  authorize('teacher', 'exam_cell', 'super_admin'),
  validate(SaturdayOverrideSchema),
  AttendanceController.overrideSaturday,
);

export default router;
