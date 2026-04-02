// =============================================================
// KJSIS — Reports Router
//
// Canonical report endpoints (Phase 4 reportBuilder layer):
//   GET  /api/reports/progress-card
//   GET  /api/reports/progress-card/pdf
//   POST /api/reports/bulk-progress-cards
//   GET  /api/reports/consolidated            (rich, replaces Phase 1)
//   GET  /api/reports/consolidated/pdf
//
// Legacy Phase 1 endpoints (kept for backward compatibility):
//   GET  /api/reports/subject
//   GET  /api/reports/student/:studentId
//   GET  /api/reports/class-performance/:examId
//   GET  /api/reports/subject-analysis/:examId
//   GET  /api/reports/at-risk
// =============================================================

import { Router } from 'express';
import * as ReportsController from '../controllers/reports.controller';
import * as ReportBuilderController from '../controllers/reportBuilder.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, Roles } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

// ─── Phase 4: Canonical Report Endpoints ─────────────────────

// Progress card: full report JSON (marks + insights + remarks)
router.get(
  '/progress-card',
  authorize(...Roles.ALL_STAFF),
  ReportBuilderController.getProgressCard,
);

// Progress card: PDF download
router.get(
  '/progress-card/pdf',
  authorize(...Roles.ALL_STAFF),
  ReportBuilderController.getProgressCardPdf,
);

// Bulk progress cards: streams a ZIP of all students in a division
// Role: exam_cell / leadership (not individual teachers — too broad)
router.post(
  '/bulk-progress-cards',
  authorize(...Roles.REPORTS_ACCESS),
  ReportBuilderController.bulkProgressCards,
);

// Consolidated: rich class-wide mark list with rankings + insights
// (supersedes Phase 1 /consolidated which took a single exam_id)
router.get(
  '/consolidated',
  authorize(...Roles.REPORTS_ACCESS, 'teacher'),
  ReportBuilderController.getConsolidated,
);

// Consolidated: A3 PDF download
router.get(
  '/consolidated/pdf',
  authorize(...Roles.REPORTS_ACCESS),
  ReportBuilderController.getConsolidatedPdf,
);

// ─── Phase 1: Legacy Endpoints ───────────────────────────────

// Subject report — Teacher (own subjects) + Exam Cell + Admin
router.get(
  '/subject',
  authorize(...Roles.TEACHER_AND_ABOVE),
  ReportsController.getSubjectReport,
);

// Student report card (simple, Phase 1 version)
router.get(
  '/student/:studentId',
  authorize(...Roles.ALL_STAFF),
  ReportsController.getStudentReportCard,
);

// Class performance heatmap by exam
router.get(
  '/class-performance/:examId',
  authorize(...Roles.REPORTS_ACCESS),
  ReportsController.getClassPerformance,
);

// Subject distribution analysis
router.get(
  '/subject-analysis/:examId',
  authorize(...Roles.REPORTS_ACCESS),
  ReportsController.getSubjectAnalysis,
);

// At-risk students
router.get(
  '/at-risk',
  authorize(...Roles.REPORTS_ACCESS),
  ReportsController.getAtRiskStudents,
);

export default router;
