// =============================================================
// KJSIS — Admin Controller
// =============================================================

import { Request, Response, NextFunction } from 'express';
import * as AdminService from '../services/admin.service';
import { sendSuccess, sendCreated } from '../utils/response';

// ── Teachers ──────────────────────────────────────────────────

export const createTeacher = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.createTeacher(req.body);
    sendCreated(res, data, 'Teacher created successfully');
  } catch (err) { next(err); }
};

export const getAllTeachers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.getAllTeachers();
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const toggleUserActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const data = await AdminService.toggleUserActive(id, is_active);
    sendSuccess(res, data, `User ${is_active ? 'activated' : 'deactivated'}`);
  } catch (err) { next(err); }
};

// ── Divisions ────────────────────────────────────────────────

export const createDivision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.createDivision(req.body);
    sendCreated(res, data, 'Division created');
  } catch (err) { next(err); }
};

export const getDivisionsByClass = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.getDivisionsByClass(req.params.classId);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

// ── Exams ────────────────────────────────────────────────────

export const createExam = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.createExam(req.body);
    sendCreated(res, data, 'Exam created');
  } catch (err) { next(err); }
};

export const getExams = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.getExamsByYear(req.query.academic_year_id as string);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const lockExam = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.lockExam(req.params.examId, req.user!.userId);
    sendSuccess(res, data, 'Exam locked successfully');
  } catch (err) { next(err); }
};

// ── Subject-Exam Config ──────────────────────────────────────

export const configureSubjectExam = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.configureSubjectExam(req.body);
    sendSuccess(res, data, 'Subject-exam configuration saved');
  } catch (err) { next(err); }
};

export const getSubjectExamConfigs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.getSubjectExamConfigs(req.params.examId);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const addComponent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.addComponent(req.body);
    sendCreated(res, data, 'Component added');
  } catch (err) { next(err); }
};

// ── Teacher Assignments ──────────────────────────────────────

export const assignTeacherSubject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.assignTeacherSubject(req.body);
    sendCreated(res, data, 'Teacher assigned to subject');
  } catch (err) { next(err); }
};

export const bulkAssignTeacherSubject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.bulkAssignTeacherSubject(req.body);
    sendSuccess(res, data, `${data.assigned} assignments saved`);
  } catch (err) { next(err); }
};

export const assignClassTeacher = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.assignClassTeacher(req.body);
    sendCreated(res, data, 'Class teacher assigned');
  } catch (err) { next(err); }
};

export const getClassTeachers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.getClassTeachers(req.query.academic_year_id as string);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

// ── Subjects + Classes ───────────────────────────────────────

export const getSubjectsByClass = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.getSubjectsByClass(req.params.classId);
    sendSuccess(res, data);
  } catch (err) { next(err); }
};

export const getAllClasses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AdminService.getAllClasses();
    sendSuccess(res, data);
  } catch (err) { next(err); }
};
