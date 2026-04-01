// =============================================================
// KJSIS — Student Import Controller
// =============================================================

import { Request, Response, NextFunction } from 'express';
import * as StudentImportService from '../services/student-import.service';
import { sendSuccess } from '../utils/response';
import { ValidationError } from '../utils/errors';

export const importStudents = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded. Send file in multipart/form-data field "file"');
    }

    const mimeType = req.file.mimetype;
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel',                                           // .xls
      'text/csv',                                                            // .csv
    ];
    if (!allowed.includes(mimeType)) {
      throw new ValidationError('Invalid file type. Upload .xlsx, .xls, or .csv');
    }

    const body = req.body as { academic_year_id?: string; dry_run?: string };
    const dryRun = body.dry_run === 'true' || body.dry_run === '1';

    const result = await StudentImportService.importStudents(
      req.file.buffer,
      mimeType,
      body.academic_year_id,
      dryRun,
    );

    const message = dryRun
      ? `Dry-run: ${result.success_count} valid, ${result.failed_count} failed, ${result.skip_count} existing`
      : `Import complete: ${result.success_count} inserted, ${result.failed_count} failed, ${result.skip_count} skipped`;

    sendSuccess(res, result, message, dryRun ? 200 : 201);
  } catch (err) {
    next(err);
  }
};
