// =============================================================
// KJSIS — Progress Card HTML Template
// Renders school-style progress card to HTML string for Puppeteer
// =============================================================

import { ProgressCardData } from '../types';

const GRADE_COLOR: Record<string, string> = {
  'A+': '#1a7a4a', 'A': '#2d8a5e', 'B+': '#4a90d9',
  'B': '#5b9bd5', 'C': '#e6a817', 'D': '#e08c0b', 'F': '#c0392b',
};

function gradeCell(grade: string): string {
  const color = GRADE_COLOR[grade] ?? '#333';
  return `<span style="color:${color};font-weight:bold;">${grade}</span>`;
}

function markCell(
  marks: number | null,
  isAbsent: boolean,
  maxMarks: number,
): string {
  if (isAbsent) return `<span style="color:#c0392b;">AB</span>`;
  if (marks === null) return `<span style="color:#999;">—</span>`;
  return `${marks}<small style="color:#777;">/${maxMarks}</small>`;
}

function attBar(pct: number): string {
  const color = pct >= 85 ? '#1a7a4a' : pct >= 75 ? '#e6a817' : '#c0392b';
  return `<div style="display:inline-block;width:120px;height:10px;background:#e9ecef;border-radius:5px;vertical-align:middle;">
    <div style="width:${Math.min(pct, 100)}%;height:100%;background:${color};border-radius:5px;"></div>
  </div>
  <span style="margin-left:6px;">${pct.toFixed(1)}%</span>`;
}

export function renderProgressCard(data: ProgressCardData): string {
  const { student, academic_year, settings, exam_columns, subjects, totals, attendance, remarks } = data;

  // Group columns by term
  const termNumbers = [...new Set(exam_columns.map((c) => c.term_number))].sort();

  // Build column headers grouped by term
  const termColSpan: Record<number, number> = {};
  for (const col of exam_columns) {
    termColSpan[col.term_number] = (termColSpan[col.term_number] ?? 0) + 1;
  }

  const termHeaderRow = termNumbers
    .map(
      (tn) =>
        `<th colspan="${termColSpan[tn]}" style="background:#2c3e50;color:#fff;text-align:center;padding:6px;border:1px solid #ccc;">
          Term ${tn}
        </th>`,
    )
    .join('');

  const examHeaderRow = exam_columns
    .map(
      (col) =>
        `<th style="background:#34495e;color:#fff;text-align:center;padding:5px 4px;font-size:11px;border:1px solid #ccc;white-space:nowrap;">
          ${col.exam_name}<br/><small style="font-weight:normal;">${col.max_marks}</small>
        </th>`,
    )
    .join('');

  // Subject rows
  const subjectRows = subjects
    .map((sub) => {
      const cells = exam_columns
        .map((col) => {
          const cell = sub.marks[col.exam_id] ?? { marks_obtained: null, is_absent: false };
          return `<td style="text-align:center;padding:4px 6px;border:1px solid #ddd;font-size:12px;">
            ${markCell(cell.marks_obtained, cell.is_absent, col.max_marks)}
          </td>`;
        })
        .join('');

      const rowBg = sub.is_passing ? '#fff' : '#fff5f5';
      return `<tr style="background:${rowBg};">
        <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px;font-weight:500;">${sub.subject_name}</td>
        ${cells}
        <td style="text-align:center;padding:4px 6px;border:1px solid #ddd;font-size:12px;">${sub.total_obtained}/${sub.total_max}</td>
        <td style="text-align:center;padding:4px 6px;border:1px solid #ddd;font-size:12px;">${sub.percentage.toFixed(1)}%</td>
        <td style="text-align:center;padding:4px 6px;border:1px solid #ddd;font-size:12px;">${gradeCell(sub.grade)}</td>
      </tr>`;
    })
    .join('');

  // Totals row
  const totalCells = exam_columns.map(() => `<td style="border:1px solid #ddd;"></td>`).join('');

  // Remarks section
  const annualRemark = remarks.find((r) => r.term_id === null);
  const termRemarks = remarks.filter((r) => r.term_id !== null);

  const remarksHtml = remarks.length
    ? `<div class="remarks-section" style="margin-top:16px;padding:12px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;">
        <strong style="display:block;margin-bottom:8px;color:#2c3e50;">Teacher's Remarks</strong>
        ${termRemarks.map((r) => `
          <p style="margin:4px 0;font-size:12px;"><strong>${r.term_name ?? ''}:</strong> ${r.remark_text}</p>
        `).join('')}
        ${annualRemark ? `<p style="margin:8px 0 0;font-size:12px;"><strong>Annual:</strong> ${annualRemark.remark_text}</p>` : ''}
      </div>`
    : '';

  // Attendance section
  const attendanceHtml = settings.show_attendance && attendance
    ? `<tr>
        <td colspan="3" style="padding:6px 10px;font-size:12px;">
          <strong>Attendance:</strong> Present ${attendance.total_working_days - attendance.total_absent} / ${attendance.total_working_days} days
          &nbsp;&nbsp; ${attBar(attendance.percentage)}
        </td>
      </tr>`
    : '';

  // Rank section
  const rankHtml = settings.show_rank && totals.rank
    ? `<span style="margin-left:16px;">Rank: <strong>${totals.rank}</strong> / ${totals.total_students}</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    /* ── Reset ─────────────────────────────────────── */
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Page setup (Puppeteer reads @page) ─────────── */
    @page {
      size: A4 portrait;
      margin: 12mm 10mm;
    }

    /* ── Body: flex column so signature pins to bottom ─ */
    html, body {
      height: 100%;
    }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 12px;
      color: #222;
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }

    /* ── Typography ─────────────────────────────────── */
    h1 { font-size: 18px; }
    h2 { font-size: 13px; font-weight: 600; }

    /* ── Tables ─────────────────────────────────────── */
    table {
      border-collapse: collapse;
      width: 100%;
      /* Repeat <thead> on every printed page */
      border-spacing: 0;
    }
    thead {
      display: table-header-group;   /* repeats on each page */
    }
    tfoot {
      display: table-footer-group;
    }
    /* Prevent individual rows from splitting across pages */
    tr {
      page-break-inside: avoid;
      break-inside:      avoid;
    }
    /* Keep the marks table together if it fits; header always repeats */
    .marks-table {
      page-break-inside: auto;
    }

    /* ── Sections that must stay together ───────────── */
    .student-info,
    .summary-bar,
    .remarks-section {
      page-break-inside: avoid;
      break-inside:      avoid;
    }

    /* ── Signature: always at the bottom of the content ─ */
    .signature-block {
      margin-top: auto;             /* pushes to bottom in flex column */
      page-break-inside: avoid;
      break-inside:      avoid;
      padding-top: 24px;
    }

    /* ── Print media overrides ───────────────────────── */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="text-align:center;margin-bottom:16px;border-bottom:2px solid #2c3e50;padding-bottom:12px;">
    ${settings.logo_url ? `<img src="${settings.logo_url}" style="height:60px;margin-bottom:8px;" alt="Logo"/>` : ''}
    <h1 style="color:#2c3e50;">${settings.school_name}</h1>
    <h2>Progress Card — ${academic_year.label}</h2>
  </div>

  <!-- Student Info -->
  <table class="student-info" style="margin-bottom:14px;border:1px solid #dee2e6;">
    <tr>
      <td style="padding:6px 10px;width:50%;font-size:12px;"><strong>Name:</strong> ${student.name}</td>
      <td style="padding:6px 10px;font-size:12px;"><strong>Adm. No.:</strong> ${student.admission_number}</td>
    </tr>
    <tr>
      <td style="padding:6px 10px;font-size:12px;"><strong>Class:</strong> ${student.class_name} — Div ${student.division_name}</td>
      <td style="padding:6px 10px;font-size:12px;"><strong>Roll No.:</strong> ${student.roll_number}</td>
    </tr>
    ${attendanceHtml}
  </table>

  <!-- Marks Table -->
  <table class="marks-table">
    <thead>
      <tr>
        <th rowspan="2" style="background:#1a252f;color:#fff;padding:6px 8px;text-align:left;border:1px solid #ccc;min-width:130px;">Subject</th>
        ${termHeaderRow}
        <th rowspan="2" style="background:#1a252f;color:#fff;padding:6px 8px;text-align:center;border:1px solid #ccc;white-space:nowrap;">Total</th>
        <th rowspan="2" style="background:#1a252f;color:#fff;padding:6px 8px;text-align:center;border:1px solid #ccc;">%</th>
        <th rowspan="2" style="background:#1a252f;color:#fff;padding:6px 8px;text-align:center;border:1px solid #ccc;">Grade</th>
      </tr>
      <tr>${examHeaderRow}</tr>
    </thead>
    <tbody>
      ${subjectRows}
      <!-- Grand Total Row -->
      <tr style="background:#f0f4f8;font-weight:bold;">
        <td style="padding:6px 8px;border:1px solid #ccc;font-size:12px;">GRAND TOTAL</td>
        ${totalCells}
        <td style="text-align:center;padding:5px;border:1px solid #ccc;font-size:12px;">${totals.obtained}/${totals.max}</td>
        <td style="text-align:center;padding:5px;border:1px solid #ccc;font-size:12px;">${totals.percentage.toFixed(1)}%</td>
        <td style="text-align:center;padding:5px;border:1px solid #ccc;font-size:12px;">${gradeCell(totals.grade)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Summary Bar -->
  <div class="summary-bar" style="margin-top:12px;display:flex;gap:20px;flex-wrap:wrap;font-size:12px;align-items:center;">
    <span>Subjects Passed: <strong style="color:#1a7a4a;">${totals.subjects_passed}</strong></span>
    <span>Subjects Failed: <strong style="color:#c0392b;">${totals.subjects_failed}</strong></span>
    ${rankHtml}
  </div>

  <!-- Remarks -->
  ${remarksHtml}

  <!-- Signature Block (pinned to bottom via flex-column + margin-top:auto) -->
  <div class="signature-block" style="display:flex;justify-content:space-between;font-size:12px;">
    <div style="text-align:center;">
      <div style="width:120px;border-top:1px solid #333;padding-top:4px;">Class Teacher</div>
    </div>
    <div style="text-align:center;">
      <div style="width:120px;border-top:1px solid #333;padding-top:4px;">Parent / Guardian</div>
    </div>
    <div style="text-align:center;">
      <div style="width:120px;border-top:1px solid #333;padding-top:4px;">${settings.principal_name ?? 'Principal'}</div>
    </div>
  </div>

  ${settings.footer_text ? `<p style="margin-top:20px;font-size:10px;color:#777;text-align:center;">${settings.footer_text}</p>` : ''}
</body>
</html>`;
}
