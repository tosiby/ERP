// =============================================================
// KJSIS — Marks Service Tests
// =============================================================

import { ExamLockedError, ForbiddenError, ValidationError } from '../utils/errors';

// Mock the DB module
jest.mock('../utils/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) => {
    const mockClient = { query: jest.fn() };
    return cb(mockClient);
  }),
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { query, withTransaction } from '../utils/db';
import * as MarksService from '../services/marks.service';

const mockQuery = query as jest.Mock;
const mockWithTransaction = withTransaction as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── saveMarksTotal ───────────────────────────────────────────

describe('saveMarksTotal', () => {
  const input = {
    exam_id: 'exam-uuid',
    subject_id: 'subject-uuid',
    division_id: 'division-uuid',
    marks: [
      { student_id: 'student-uuid-1', marks_obtained: 45, is_absent: false },
      { student_id: 'student-uuid-2', marks_obtained: 0,  is_absent: true },
    ],
  };

  const teacherId = 'teacher-uuid';

  it('throws ForbiddenError when teacher is not assigned to the subject', async () => {
    // Teacher ownership check returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      MarksService.saveMarksTotal(input, teacherId, 'teacher'),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ExamLockedError when exam is locked', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'map-id' }] })     // ownership check
      .mockResolvedValueOnce({ rows: [{ is_locked: true }] });  // exam check

    await expect(
      MarksService.saveMarksTotal(input, teacherId, 'teacher'),
    ).rejects.toThrow(ExamLockedError);
  });

  it('throws ValidationError when marks exceed total', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'map-id' }] })              // ownership
      .mockResolvedValueOnce({ rows: [{ is_locked: false }] })          // exam
      .mockResolvedValueOnce({ rows: [{ id: 'sec', entry_mode: 'total', total_marks: 40, passing_marks: 16 }] }) // config
      .mockResolvedValueOnce({ rows: [{ id: 'student-uuid-1' }, { id: 'student-uuid-2' }] }); // students

    const badInput = {
      ...input,
      marks: [{ student_id: 'student-uuid-1', marks_obtained: 99, is_absent: false }],
    };

    await expect(
      MarksService.saveMarksTotal(badInput, teacherId, 'teacher'),
    ).rejects.toThrow(ValidationError);
  });

  it('saves marks successfully in a transaction', async () => {
    const mockClient = { query: jest.fn() };
    mockWithTransaction.mockImplementationOnce(async (cb: (client: unknown) => Promise<unknown>) => cb(mockClient));

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'map-id' }] })              // ownership
      .mockResolvedValueOnce({ rows: [{ is_locked: false }] })          // exam
      .mockResolvedValueOnce({ rows: [{ id: 'sec', entry_mode: 'total', total_marks: 50, passing_marks: 20 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'student-uuid-1' }, { id: 'student-uuid-2' }] });

    await expect(
      MarksService.saveMarksTotal(input, teacherId, 'teacher'),
    ).resolves.toBeUndefined();

    expect(mockClient.query).toHaveBeenCalledTimes(2);
  });

  it('exam_cell can save marks without ownership check', async () => {
    const mockClient = { query: jest.fn() };
    mockWithTransaction.mockImplementationOnce(async (cb: (client: unknown) => Promise<unknown>) => cb(mockClient));

    mockQuery
      .mockResolvedValueOnce({ rows: [{ is_locked: false }] })          // exam (no ownership check for exam_cell)
      .mockResolvedValueOnce({ rows: [{ id: 'sec', entry_mode: 'total', total_marks: 50, passing_marks: 20 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'student-uuid-1' }, { id: 'student-uuid-2' }] });

    await expect(
      MarksService.saveMarksTotal(input, teacherId, 'exam_cell'),
    ).resolves.toBeUndefined();
  });
});

// ─── submitMarks ──────────────────────────────────────────────

describe('submitMarks', () => {
  it('throws ExamLockedError when exam is locked', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'map-id' }] })
      .mockResolvedValueOnce({ rows: [{ is_locked: true }] });

    await expect(
      MarksService.submitMarks(
        { exam_id: 'e1', subject_id: 's1', division_id: 'd1' },
        'teacher-1',
        'teacher',
      ),
    ).rejects.toThrow(ExamLockedError);
  });

  it('returns count of updated rows', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'map-id' }] })
      .mockResolvedValueOnce({ rows: [{ is_locked: false }] })
      .mockResolvedValueOnce({ rowCount: 25, rows: [] });

    const result = await MarksService.submitMarks(
      { exam_id: 'e1', subject_id: 's1', division_id: 'd1' },
      'teacher-1',
      'teacher',
    );

    expect(result.updated).toBe(25);
  });
});
