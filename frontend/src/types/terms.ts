// =============================================================
// KJSIS — Frontend Types: Terms & Exam Config
// =============================================================

export interface ExamType {
  id: string;
  academic_year_id: string;
  code: string;
  label: string;
  max_marks_default: number;
  passing_marks_default: number;
  entry_mode_default: 'total' | 'component';
  display_order: number;
}

export interface Term {
  id: string;
  academic_year_id: string;
  term_number: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

export interface GeneratedExamPreview {
  name: string;
  label: string;
  term_number: number;
  exam_type_code: string;
  max_marks: number;
}

// ── Student Progress ──────────────────────────────────────────

export interface TermMark {
  exam_id: string;
  exam_name: string;
  exam_type_code: string;
  marks_obtained: number;
  total_marks: number;
  percentage: number;
  is_absent: boolean;
}

export interface TermProgress {
  term_id: string;
  term_number: number;
  term_name: string;
  exams: TermMark[];
  term_percentage: number;
  term_grade: string;
}

export interface StudentTermWiseProgress {
  subject_id: string;
  subject_name: string;
  terms: TermProgress[];
  overall_trend: 'improving' | 'declining' | 'stable';
}
