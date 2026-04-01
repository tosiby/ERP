// =============================================================
// KJSIS — Admin Routes
// =============================================================

import { Router } from 'express';
import * as AdminController from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, Roles } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  CreateTeacherSchema,
  AssignTeacherSubjectSchema,
  BulkAssignTeacherSchema,
  AssignClassTeacherSchema,
  CreateExamSchema,
  ConfigureSubjectExamSchema,
  AddComponentSchema,
  CreateDivisionSchema,
} from '../schemas/admin.schema';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

// ── Public-ish reads (all authenticated staff) ───────────────
router.get('/classes',                       AdminController.getAllClasses);
router.get('/classes/:classId/subjects',     AdminController.getSubjectsByClass);
router.get('/classes/:classId/divisions',    AdminController.getDivisionsByClass);
router.get('/exams',                         AdminController.getExams);
router.get('/exams/:examId/config',          AdminController.getSubjectExamConfigs);
router.get('/class-teachers',                AdminController.getClassTeachers);

// ── Exam Cell + Super Admin ───────────────────────────────────
router.use(authorize(...Roles.ADMIN_EXAM));

// Teachers
router.post('/teachers',              validate(CreateTeacherSchema), AdminController.createTeacher);
router.get('/teachers',               AdminController.getAllTeachers);
router.patch(
  '/teachers/:id/toggle',
  validate(z.object({ is_active: z.boolean() })),
  AdminController.toggleUserActive,
);

// Divisions
router.post('/divisions',             validate(CreateDivisionSchema), AdminController.createDivision);

// Exams
router.post('/exams',                 validate(CreateExamSchema), AdminController.createExam);
router.post('/exams/:examId/lock',    AdminController.lockExam);

// Subject-Exam config
router.post('/subject-exam-config',   validate(ConfigureSubjectExamSchema), AdminController.configureSubjectExam);
router.post('/components',            validate(AddComponentSchema), AdminController.addComponent);

// Teacher assignments
router.post('/assign-teacher',        validate(AssignTeacherSubjectSchema), AdminController.assignTeacherSubject);
router.post('/assign-teacher/bulk',   validate(BulkAssignTeacherSchema), AdminController.bulkAssignTeacherSubject);
router.post('/assign-class-teacher',  validate(AssignClassTeacherSchema), AdminController.assignClassTeacher);

export default router;
