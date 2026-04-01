// =============================================================
// KJSIS — Marks Routes
// =============================================================

import { Router } from 'express';
import * as MarksController from '../controllers/marks.controller';
import { getMySubjects } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, Roles } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  BulkMarkEntrySchema,
  BulkComponentMarkEntrySchema,
  SubmitMarksSchema,
  LockSubjectMarksSchema,
  LockExamMarksSchema,
  MarksQuerySchema,
} from '../schemas/marks.schema';

const router = Router();

router.use(authenticate);

// ── Teacher ───────────────────────────────────────────────────

// GET /marks/my-subjects — subjects assigned to the calling teacher
router.get(
  '/my-subjects',
  authorize(...Roles.TEACHER_AND_ABOVE),
  getMySubjects,
);

// GET /marks?exam_id=&subject_id=&division_id=
router.get(
  '/',
  authorize(...Roles.TEACHER_AND_ABOVE),
  validate(MarksQuerySchema, 'query'),
  MarksController.getMarksSheet,
);

// POST /marks/total — save total-mode marks
router.post(
  '/total',
  authorize(...Roles.TEACHER_AND_ABOVE),
  validate(BulkMarkEntrySchema),
  MarksController.saveMarksTotal,
);

// POST /marks/component — save component-mode marks
router.post(
  '/component',
  authorize(...Roles.TEACHER_AND_ABOVE),
  validate(BulkComponentMarkEntrySchema),
  MarksController.saveMarksComponent,
);

// POST /marks/submit — move draft → submitted
router.post(
  '/submit',
  authorize(...Roles.TEACHER_AND_ABOVE),
  validate(SubmitMarksSchema),
  MarksController.submitMarks,
);

// ── Exam Cell / Admin only ────────────────────────────────────

// POST /marks/lock — lock a specific subject+division (submitted → locked)
router.post(
  '/lock',
  authorize(...Roles.ADMIN_EXAM),
  validate(LockSubjectMarksSchema),
  MarksController.lockMarks,
);

// POST /marks/lock-all — lock every subject in an exam at once
router.post(
  '/lock-all',
  authorize(...Roles.ADMIN_EXAM),
  validate(LockExamMarksSchema),
  MarksController.lockMarks,
);

// GET /marks/status/:exam_id — entry status dashboard
router.get(
  '/status/:exam_id',
  authorize(...Roles.ADMIN_EXAM),
  MarksController.getMarkEntryStatus,
);

export default router;
