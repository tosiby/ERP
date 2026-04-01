// =============================================================
// KJSIS — Student Import Routes
// =============================================================

import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, Roles } from '../middleware/rbac.middleware';
import { sendError } from '../utils/response';
import * as StudentImportController from '../controllers/student-import.controller';

const router = Router();

const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

// Memory storage — buffer is passed directly to service (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,   // 5MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  },
});

router.use(authenticate);
router.use(authorize(...Roles.ADMIN_EXAM));

// POST /admin/students/import
// Body: multipart/form-data  { file, dry_run?, academic_year_id? }
router.post(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          sendError(res, 'File too large. Maximum size is 5MB.', 413);
        } else {
          sendError(res, `Upload error: ${err.message}`, 400);
        }
        return;
      }
      if (err instanceof Error && err.message === 'INVALID_FILE_TYPE') {
        sendError(res, 'Only .xlsx, .xls, and .csv files are supported.', 415);
        return;
      }
      if (err) { next(err); return; }
      next();
    });
  },
  StudentImportController.importStudents,
);

export default router;
