// =============================================================
// KJSIS — Phase 4: Reports V2 Routes
// =============================================================

import { Router } from 'express';
import * as ReportsV2Controller from '../controllers/reports-v2.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, Roles } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

// ── Progress Card ─────────────────────────────────────────────
// GET  /api/reports-v2/progress-card?student_id=&academic_year_id=&term_id=
router.get(
  '/progress-card',
  authorize(...Roles.ALL_STAFF),
  ReportsV2Controller.getProgressCard,
);

// GET  /api/reports-v2/progress-card/pdf?student_id=&academic_year_id=
router.get(
  '/progress-card/pdf',
  authorize(...Roles.ALL_STAFF),
  ReportsV2Controller.downloadProgressCardPdf,
);

// ── Consolidated Report ───────────────────────────────────────
// GET  /api/reports-v2/consolidated?division_id=&academic_year_id=&term_id=
router.get(
  '/consolidated',
  authorize(...Roles.REPORTS_ACCESS, 'teacher'),
  ReportsV2Controller.getConsolidatedReport,
);

// GET  /api/reports-v2/consolidated/pdf?division_id=&academic_year_id=
router.get(
  '/consolidated/pdf',
  authorize(...Roles.REPORTS_ACCESS),
  ReportsV2Controller.downloadConsolidatedPdf,
);

// ── Remarks ───────────────────────────────────────────────────
// GET  /api/reports-v2/remarks?student_id=&academic_year_id=
router.get(
  '/remarks',
  authorize(...Roles.ALL_STAFF),
  ReportsV2Controller.getRemarks,
);

// PUT  /api/reports-v2/remarks  (manual edit)
router.put(
  '/remarks',
  authorize(...Roles.ALL_STAFF),
  ReportsV2Controller.upsertRemark,
);

// POST /api/reports-v2/remarks/generate  (AI generate for one student)
router.post(
  '/remarks/generate',
  authorize(...Roles.REPORTS_ACCESS, 'teacher'),
  ReportsV2Controller.generateRemark,
);

// POST /api/reports-v2/remarks/generate-division  (bulk for whole division)
router.post(
  '/remarks/generate-division',
  authorize(...Roles.REPORTS_ACCESS),
  ReportsV2Controller.generateRemarksForDivision,
);

// ── Report Settings ───────────────────────────────────────────
// GET  /api/reports-v2/settings?academic_year_id=
router.get(
  '/settings',
  authorize(...Roles.ALL_STAFF),
  ReportsV2Controller.getReportSettings,
);

// PUT  /api/reports-v2/settings
router.put(
  '/settings',
  authorize(...Roles.ADMIN_EXAM),
  ReportsV2Controller.upsertReportSettings,
);

export default router;
