// =============================================================
// KJSIS — Student Import Service Tests (Phase 2)
// =============================================================

import * as XLSX from 'xlsx';
import { ValidationError } from '../utils/errors';

jest.mock('../utils/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) => {
    const mockClient = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'new-student-id' }] }) };
    return cb(mockClient);
  }),
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { query } from '../utils/db';
import * as ImportService from '../services/student-import.service';

const mockQuery = query as jest.Mock;

// ─── Helper: create minimal Excel buffer ─────────────────────
const makeExcelBuffer = (rows: Record<string, unknown>[]): Buffer => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
};

const VALID_ROWS = [
  { admission_number: 'ADM001', name: 'Rahul Kumar',  roll_number: 1, class_name: 'Class 7', division_name: 'A' },
  { admission_number: 'ADM002', name: 'Priya Nair',   roll_number: 2, class_name: 'Class 7', division_name: 'A', elective: 'Hindi' },
];

beforeEach(() => jest.clearAllMocks());

describe('importStudents — dry run', () => {
  it('validates rows without inserting', async () => {
    // academic year lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'year-id' }] });
    // classes
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'class7-id', name: 'Class 7' }] });
    // divisions
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'div-a-id', class_id: 'class7-id', name: 'A' }] });
    // existing admissions
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // elective subjects
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'hindi-id', name: 'Hindi', class_id: 'class7-id', is_elective: true, elective_group: 'hindi_french' }] });

    const buffer = makeExcelBuffer(VALID_ROWS);
    const result = await ImportService.importStudents(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', undefined, true);

    expect(result.dry_run).toBe(true);
    expect(result.success_count).toBe(2);
    expect(result.failed_count).toBe(0);
    expect(result.inserted_ids).toBeUndefined();
  });

  it('returns failed rows for invalid class names', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'year-id' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });       // no classes found
    mockQuery.mockResolvedValueOnce({ rows: [] });       // no divisions
    mockQuery.mockResolvedValueOnce({ rows: [] });       // no existing admissions
    mockQuery.mockResolvedValueOnce({ rows: [] });       // no electives

    const buffer = makeExcelBuffer([
      { admission_number: 'ADM003', name: 'Test', roll_number: 3, class_name: 'Class 99', division_name: 'Z' },
    ]);
    const result = await ImportService.importStudents(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', undefined, true);

    expect(result.failed_count).toBe(1);
    expect(result.failed_rows[0].reason).toMatch(/Class 99/);
  });
});

describe('importStudents — real run', () => {
  it('inserts valid students and returns inserted IDs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'year-id' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'class7-id', name: 'Class 7' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'div-a-id', class_id: 'class7-id', name: 'A' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });       // no existing
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'hindi-id', name: 'Hindi', class_id: 'class7-id', is_elective: true, elective_group: 'hindi_french' }] });

    const buffer = makeExcelBuffer(VALID_ROWS);
    const result = await ImportService.importStudents(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', undefined, false);

    expect(result.dry_run).toBe(false);
    expect(result.success_count).toBeGreaterThan(0);
    expect(result.inserted_ids).toBeDefined();
  });

  it('skips duplicate admission numbers without failing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'year-id' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'class7-id', name: 'Class 7' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'div-a-id', class_id: 'class7-id', name: 'A' }] });
    // ADM001 already exists
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id', admission_number: 'ADM001' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const buffer = makeExcelBuffer(VALID_ROWS);
    const result = await ImportService.importStudents(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', undefined, true);

    expect(result.skip_count).toBe(1);
    expect(result.success_count).toBe(1); // only ADM002
  });

  it('throws ValidationError when file has no data rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'year-id' }] });

    const buffer = makeExcelBuffer([]);
    await expect(
      ImportService.importStudents(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', undefined, true),
    ).rejects.toThrow(ValidationError);
  });
});
