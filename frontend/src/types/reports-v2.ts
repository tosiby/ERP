// =============================================================
// KJSIS — Phase 4: Report V2 Frontend Types
// =============================================================

export interface ReportSettings {
  id: string;
  academic_year_id: string;
  school_name: string;
  logo_url: string | null;
  principal_name: string | null;
  show_rank: boolean;
  show_attendance: boolean;
  show_insights: boolean;
  show_ai_remarks: boolean;
  footer_text: string | null;
}

export interface ProgressCardExamColumn {
  exam_id: string;
  exam_name: string;
  exam_label: string;
  exam_type_code: string;
  term_number: number;
  max_marks: number;
}

export interface ProgressCardMarkCell {
  marks_obtained: number | null;
  is_absent: boolean;
}

export interface ProgressCardSubjectRow {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  display_order: number;
  marks: Record<string, ProgressCardMarkCell>;
  total_obtained: number;
  total_max: number;
  percentage: number;
  grade: string;
  is_passing: boolean;
}

export interface ProgressCardTotals {
  obtained: number;
  max: number;
  percentage: number;
  grade: string;
  rank: number | null;
  total_students: number;
  subjects_passed: number;
  subjects_failed: number;
}

export interface ProgressCardData {
  student: {
    id: string;
    name: string;
    admission_number: string;
    roll_number: number;
    class_name: string;
    division_name: string;
  };
  academic_year: { id: string; label: string };
  settings: ReportSettings;
  exam_columns: ProgressCardExamColumn[];
  subjects: ProgressCardSubjectRow[];
  totals: ProgressCardTotals;
  attendance: { total_working_days: number; total_absent: number; percentage: number } | null;
  remarks: Array<{ term_id: string | null; term_name: string | null; remark_text: string; is_ai_generated: boolean }>;
}

export interface ConsolidatedStudentRow {
  student_id: string;
  student_name: string;
  admission_number: string;
  roll_number: number;
  subject_totals: Record<string, { obtained: number; max: number; percentage: number; grade: string }>;
  grand_total_obtained: number;
  grand_total_max: number;
  grand_percentage: number;
  grand_grade: string;
  rank: number;
  subjects_passed: number;
  subjects_failed: number;
}

export interface ConsolidatedReportSubjectHeader {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  display_order: number;
  max_marks: number;
}

export interface ConsolidatedReport {
  division_id: string;
  class_name: string;
  division_name: string;
  academic_year: { id: string; label: string };
  exam_ids: string[];
  subject_headers: ConsolidatedReportSubjectHeader[];
  students: ConsolidatedStudentRow[];
  class_averages: Record<string, number>;
  class_pass_rates: Record<string, number>;
}

export interface ReportRemark {
  id: string;
  student_id: string;
  academic_year_id: string;
  term_id: string | null;
  remark_text: string;
  is_ai_generated: boolean;
  edited_by: string | null;
  created_at: string;
  updated_at: string;
}
