// =============================================================
// KJSIS — AI Engine Service Tests (Phase 2)
// =============================================================

jest.mock('../utils/db', () => ({ query: jest.fn() }));
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../utils/cache', () => ({
  getCache: jest.fn(() => null),
  setCache: jest.fn(),
}));

import { query } from '../utils/db';
import * as AIEngine from '../services/ai-engine.service';

const mockQuery = query as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('getRiskProfiles', () => {
  it('returns enriched risk profiles with correct risk level', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          student_id: 'stu-1', student_name: 'Rahul', roll_number: 1,
          class_name: 'Class 7', division_name: 'A',
          avg_marks_pct: '25',      // low marks → high risk
          total_absent: '20',
          total_working_days: '80',
          fail_count: '3',
          weak_subjects: 'Maths, Science',
        },
        {
          student_id: 'stu-2', student_name: 'Priya', roll_number: 2,
          class_name: 'Class 7', division_name: 'A',
          avg_marks_pct: '85',      // good marks → low risk
          total_absent: '2',
          total_working_days: '80',
          fail_count: '0',
          weak_subjects: '',
        },
      ],
    });

    const profiles = await AIEngine.getRiskProfiles();

    expect(profiles).toHaveLength(2);

    const rahul = profiles.find((p) => p.student_id === 'stu-1');
    expect(rahul).toBeDefined();
    expect(rahul!.risk_level).toMatch(/high|critical/);
    expect(rahul!.weak_subjects).toContain('Maths');

    const priya = profiles.find((p) => p.student_id === 'stu-2');
    expect(priya!.risk_level).toBe('low');
  });

  it('calculates attendance percentage correctly', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        student_id: 'stu-3', student_name: 'Test', roll_number: 3,
        class_name: 'Class 8', division_name: 'B',
        avg_marks_pct: '60',
        total_absent: '15',         // 15 absent out of 60 days = 75%
        total_working_days: '60',
        fail_count: '0', weak_subjects: '',
      }],
    });

    const profiles = await AIEngine.getRiskProfiles();
    expect(profiles[0].attendance_pct).toBe(75);
  });
});

describe('getSubjectWeaknesses', () => {
  it('labels subjects with critical severity when fail rate >= 50%', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        subject_name: 'Mathematics', class_name: 'Class 9', division_name: 'A',
        avg_marks_pct: '38', fail_rate_pct: '55', total_students: '40',
      }],
    });

    const weaknesses = await AIEngine.getSubjectWeaknesses();
    expect(weaknesses[0].severity).toBe('critical');
  });

  it('labels subjects with low severity when fail rate < 20%', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        subject_name: 'English', class_name: 'Class 5', division_name: 'B',
        avg_marks_pct: '72', fail_rate_pct: '10', total_students: '35',
      }],
    });

    const weaknesses = await AIEngine.getSubjectWeaknesses();
    expect(weaknesses[0].severity).toBe('low');
  });
});

describe('getAttendanceRisk', () => {
  it('identifies students with critical attendance risk', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        student_id: 'stu-4', student_name: 'Low Attend', division_name: 'A', class_name: 'Class 6',
        total_absent: '30',          // 50% absent out of 60 days → critical
        days_elapsed: '60',
        total_year_days: '180',
      }],
    });

    const risks = await AIEngine.getAttendanceRisk();
    expect(risks.length).toBeGreaterThan(0);
    const student = risks.find((r) => r.student_id === 'stu-4');
    expect(student?.risk_level).toMatch(/critical|danger/);
  });

  it('excludes safe students from results', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        student_id: 'stu-5', student_name: 'Safe', division_name: 'B', class_name: 'Class 6',
        total_absent: '2',           // 97% attendance → safe
        days_elapsed: '60',
        total_year_days: '180',
      }],
    });

    const risks = await AIEngine.getAttendanceRisk();
    expect(risks.find((r) => r.student_id === 'stu-5')).toBeUndefined();
  });
});

describe('generateInsightReport', () => {
  it('returns a report with all required sections', async () => {
    // Mock all parallel queries in generateInsightReport
    const emptyRows = { rows: [] };
    mockQuery
      .mockResolvedValueOnce(emptyRows)   // getRiskProfiles
      .mockResolvedValueOnce(emptyRows)   // getSubjectWeaknesses
      .mockResolvedValueOnce(emptyRows)   // getAttendanceRisk
      .mockResolvedValueOnce(emptyRows)   // getTeacherEffectiveness
      .mockResolvedValueOnce({ rows: [{ label: '2025-2026' }] }); // academic year

    const report = await AIEngine.generateInsightReport();

    expect(report).toHaveProperty('generated_at');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('insights');
    expect(report).toHaveProperty('risk_profiles');
    expect(report).toHaveProperty('attendance_risks');
    expect(report).toHaveProperty('subject_weaknesses');
    expect(report).toHaveProperty('teacher_effectiveness');
    expect(report.summary.critical_students).toBe(0);
  });
});
