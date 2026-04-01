// =============================================================
// KJSIS — Reports Routes
// =============================================================

import { Router } from 'express';
import * as ReportsController from '../controllers/reports.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, Roles } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

// Subject report — Teacher (own subjects only) + Exam Cell + Admin
router.get(
  '/subject',
  authorize(...Roles.TEACHER_AND_ABOVE),
  ReportsController.getSubjectReport,
);

// Consolidated — Class teacher (own division) + Exam Cell + Admin
router.get(
  '/consolidated',
  authorize(...Roles.ALL_STAFF),
  ReportsController.getConsolidatedReport,
);

// Student report card — All staff (teacher sees own-division students; enforced in controller)
router.get(
  '/student/:studentId',
  authorize(...Roles.ALL_STAFF),
  ReportsController.getStudentReportCard,
);

// Class performance — Exam Cell + Leadership
router.get(
  '/class-performance/:examId',
  authorize(...Roles.REPORTS_ACCESS),
  ReportsController.getClassPerformance,
);

// Subject analysis — Exam Cell + Leadership
router.get(
  '/subject-analysis/:examId',
  authorize(...Roles.REPORTS_ACCESS),
  ReportsController.getSubjectAnalysis,
);

// At-risk students — Leadership + Exam Cell
router.get(
  '/at-risk',
  authorize(...Roles.REPORTS_ACCESS),
  ReportsController.getAtRiskStudents,
);

export default router;
