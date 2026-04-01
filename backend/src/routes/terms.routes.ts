// =============================================================
// KJSIS — Terms & Exam Types Routes
//
// Mounted at: /admin/terms
// =============================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, Roles } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import * as TermsController from '../controllers/terms.controller';
import {
  BulkUpsertExamTypesSchema,
  ConfigureTermsSchema,
  GenerateExamsSchema,
  TermsQuerySchema,
} from '../schemas/terms.schema';

const router = Router();
router.use(authenticate);
router.use(authorize(...Roles.ADMIN_EXAM));

// ── Exam Types ────────────────────────────────────────────────

// GET  /admin/terms/exam-types?academic_year_id=
router.get('/exam-types', validate(TermsQuerySchema, 'query'), TermsController.getExamTypes);

// PUT  /admin/terms/exam-types — bulk upsert (replaces list)
router.put('/exam-types', validate(BulkUpsertExamTypesSchema), TermsController.bulkUpsertExamTypes);

// ── Terms ─────────────────────────────────────────────────────

// GET  /admin/terms?academic_year_id=
router.get('/', validate(TermsQuerySchema, 'query'), TermsController.getTerms);

// POST /admin/terms/configure — set term count (1–3)
router.post('/configure', validate(ConfigureTermsSchema), TermsController.configureTerms);

// ── Exam Generation ───────────────────────────────────────────

// GET  /admin/terms/preview?academic_year_id= — live preview (no writes)
router.get('/preview', validate(TermsQuerySchema, 'query'), TermsController.previewExams);

// POST /admin/terms/generate-exams — materialise exam rows
router.post('/generate-exams', validate(GenerateExamsSchema), TermsController.generateExams);

export default router;
