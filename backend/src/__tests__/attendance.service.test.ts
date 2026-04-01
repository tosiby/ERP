// =============================================================
// KJSIS — Attendance Service Tests
// =============================================================

import { ForbiddenError, ValidationError } from '../utils/errors';

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

import { query } from '../utils/db';
import * as AttendanceService from '../services/attendance.service';

const mockQuery = query as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('markAttendance', () => {
  const input = {
    division_id: 'div-uuid',
    date: '2025-09-01',         // Monday
    absent_student_ids: ['student-uuid-1'],
    reasons: {},
  };

  it('throws ForbiddenError when caller is not class teacher', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // class teacher check fails

    await expect(
      AttendanceService.markAttendance(input, 'teacher-uuid'),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ValidationError when date is a Sunday', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ct-id' }] }); // class teacher OK

    const sundayInput = { ...input, date: '2025-08-31' }; // Sunday

    await expect(
      AttendanceService.markAttendance(sundayInput, 'teacher-uuid'),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when date is Saturday without override', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'ct-id' }] })  // class teacher OK
      .mockResolvedValueOnce({ rows: [] });                 // no Saturday override

    const saturdayInput = { ...input, date: '2025-08-30' }; // Saturday

    await expect(
      AttendanceService.markAttendance(saturdayInput, 'teacher-uuid'),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when a student is not in this division', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'ct-id' }] })  // class teacher OK
      // No Saturday check (Monday)
      .mockResolvedValueOnce({ rows: [] });                 // student validation fails

    await expect(
      AttendanceService.markAttendance(input, 'teacher-uuid'),
    ).rejects.toThrow(ValidationError);
  });

  it('marks attendance successfully (replaces existing)', async () => {
    const mockClient = { query: jest.fn() };
    const { withTransaction } = require('../utils/db') as { withTransaction: jest.Mock };
    withTransaction.mockImplementationOnce(async (cb: (client: unknown) => Promise<unknown>) => cb(mockClient));

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'ct-id' }] })              // class teacher
      .mockResolvedValueOnce({ rows: [{ id: 'student-uuid-1' }] });    // student validation

    const result = await AttendanceService.markAttendance(input, 'teacher-uuid');

    expect(result.marked).toBe(1);
    expect(mockClient.query).toHaveBeenCalledTimes(2); // DELETE + INSERT
  });

  it('marks zero absences (all present)', async () => {
    const mockClient = { query: jest.fn() };
    const { withTransaction } = require('../utils/db') as { withTransaction: jest.Mock };
    withTransaction.mockImplementationOnce(async (cb: (client: unknown) => Promise<unknown>) => cb(mockClient));

    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ct-id' }] }); // class teacher

    const allPresentInput = { ...input, absent_student_ids: [] };
    const result = await AttendanceService.markAttendance(allPresentInput, 'teacher-uuid');

    expect(result.marked).toBe(0);
    expect(mockClient.query).toHaveBeenCalledTimes(1); // only DELETE, no inserts
  });
});

describe('overrideSaturday', () => {
  it('saves a Saturday working override', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ct-id' }] }); // class teacher check
    mockQuery.mockResolvedValueOnce({ rows: [] });                 // upsert

    await expect(
      AttendanceService.overrideSaturday(
        { division_id: 'div-uuid', date: '2025-08-30', is_working: true },
        'teacher-uuid',
        'teacher',
      ),
    ).resolves.toBeUndefined();
  });
});
