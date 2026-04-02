// =============================================================
// KJSIS — Consolidated Report HTML Template
// =============================================================

import { ConsolidatedReport } from '../types';

const GRADE_COLOR: Record<string, string> = {
  'A+': '#1a7a4a', 'A': '#2d8a5e', 'B+': '#4a90d9',
  'B': '#5b9bd5', 'C': '#e6a817', 'D': '#e08c0b', 'F': '#c0392b',
};

function gradeColor(grade: string): string {
  return GRADE_COLOR[grade] ?? '#333';
}

export function renderConsolidatedReport(data: ConsolidatedReport, academicYearLabel: string, schoolName = 'K.J. School'): string {
  const { class_name, division_name, subject_headers, students, class_averages, class_pass_rates } = data;

  const subjectHeaderCols = subject_headers
    .map(
      (sub) =>
        `<th style="background:#34495e;color:#fff;padding:5px 4px;font-size:10px;text-align:center;border:1px solid #ccc;white-space:nowrap;max-width:70px;overflow:hidden;">
          ${sub.subject_code}<br/><small style="font-weight:normal;">${sub.max_marks}</small>
        </th>`,
    )
    .join('');

  const studentRows = students
    .map((st) => {
      const subCells = subject_headers
        .map((sub) => {
          const s = st.subject_totals[sub.subject_id];
          if (!s) return `<td style="text-align:center;border:1px solid #ddd;font-size:11px;">—</td>`;
          const color = s.percentage >= 40 ? '#222' : '#c0392b';
          return `<td style="text-align:center;border:1px solid #ddd;font-size:11px;color:${color};">
            ${s.obtained}<br/><small style="color:${gradeColor(s.grade)};font-weight:bold;">${s.grade}</small>
          </td>`;
        })
        .join('');

      const rowBg = st.subjects_failed > 0 ? '#fff9f9' : '#fff';
      return `<tr style="background:${rowBg};">
        <td style="padding:4px 6px;border:1px solid #ddd;font-size:11px;">${st.rank}</td>
        <td style="padding:4px 6px;border:1px solid #ddd;font-size:11px;">${st.roll_number}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;font-weight:500;">${st.student_name}</td>
        ${subCells}
        <td style="text-align:center;border:1px solid #ddd;font-size:11px;font-weight:bold;">${st.grand_total_obtained}</td>
        <td style="text-align:center;border:1px solid #ddd;font-size:11px;">${st.grand_percentage.toFixed(1)}%</td>
        <td style="text-align:center;border:1px solid #ddd;font-size:11px;color:${gradeColor(st.grand_grade)};font-weight:bold;">${st.grand_grade}</td>
        <td style="text-align:center;border:1px solid #ddd;font-size:11px;color:#c0392b;">${st.subjects_failed > 0 ? st.subjects_failed : ''}</td>
      </tr>`;
    })
    .join('');

  // Class average row
  const avgCells = subject_headers
    .map((sub) => `<td style="text-align:center;border:1px solid #ccc;font-size:11px;background:#f0f4f8;">${(class_averages[sub.subject_id] ?? 0).toFixed(1)}%</td>`)
    .join('');

  // Pass rate row
  const passCells = subject_headers
    .map((sub) => {
      const pr = class_pass_rates[sub.subject_id] ?? 0;
      const color = pr >= 75 ? '#1a7a4a' : pr >= 50 ? '#e6a817' : '#c0392b';
      return `<td style="text-align:center;border:1px solid #ccc;font-size:11px;background:#f8f9fa;color:${color};font-weight:bold;">${pr.toFixed(0)}%</td>`;
    })
    .join('');

  const totalStudents = students.length;
  const classAvgPct = totalStudents
    ? (students.reduce((s, st) => s + st.grand_percentage, 0) / totalStudents).toFixed(1)
    : '0';
  const classPassCount = students.filter((st) => st.subjects_failed === 0).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    /* ── Reset ─────────────────────────────────── */
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Page ──────────────────────────────────── */
    @page { size: A3 landscape; margin: 12mm 10mm; }

    /* ── Body ──────────────────────────────────── */
    html, body { height: 100%; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #222;
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }

    /* ── Tables ─────────────────────────────────── */
    table {
      border-collapse: collapse;
      width: 100%;
    }
    /* Repeat column headers on every printed page */
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    /* Prevent rows from splitting mid-row */
    tr {
      page-break-inside: avoid;
      break-inside:      avoid;
    }

    /* ── Signature: pin to bottom ───────────────── */
    .signature-block {
      margin-top: auto;
      page-break-inside: avoid;
      break-inside:      avoid;
      padding-top: 20px;
    }

    /* ── Print colours ──────────────────────────── */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="text-align:center;margin-bottom:14px;border-bottom:2px solid #2c3e50;padding-bottom:10px;">
    <h1 style="font-size:18px;color:#2c3e50;">${schoolName}</h1>
    <h2 style="font-size:13px;font-weight:600;">Consolidated Mark List — ${class_name} Div ${division_name} — ${academicYearLabel}</h2>
  </div>

  <!-- Summary -->
  <div style="display:flex;gap:24px;margin-bottom:12px;font-size:12px;flex-wrap:wrap;">
    <span>Total Students: <strong>${totalStudents}</strong></span>
    <span>Class Average: <strong>${classAvgPct}%</strong></span>
    <span>Passed All Subjects: <strong style="color:#1a7a4a;">${classPassCount}</strong></span>
    <span>Has Failures: <strong style="color:#c0392b;">${totalStudents - classPassCount}</strong></span>
  </div>

  <!-- Marks Table -->
  <table>
    <thead>
      <tr>
        <th style="background:#1a252f;color:#fff;padding:6px 5px;text-align:center;border:1px solid #ccc;font-size:11px;">Rank</th>
        <th style="background:#1a252f;color:#fff;padding:6px 5px;text-align:center;border:1px solid #ccc;font-size:11px;">Roll</th>
        <th style="background:#1a252f;color:#fff;padding:6px 8px;text-align:left;border:1px solid #ccc;font-size:11px;min-width:130px;">Student Name</th>
        ${subjectHeaderCols}
        <th style="background:#1a252f;color:#fff;padding:6px 5px;text-align:center;border:1px solid #ccc;font-size:11px;">Total</th>
        <th style="background:#1a252f;color:#fff;padding:6px 5px;text-align:center;border:1px solid #ccc;font-size:11px;">%</th>
        <th style="background:#1a252f;color:#fff;padding:6px 5px;text-align:center;border:1px solid #ccc;font-size:11px;">Grade</th>
        <th style="background:#1a252f;color:#fff;padding:6px 5px;text-align:center;border:1px solid #ccc;font-size:11px;">F</th>
      </tr>
    </thead>
    <tbody>
      ${studentRows}
      <!-- Class Average Row -->
      <tr style="background:#f0f4f8;font-weight:600;">
        <td colspan="3" style="padding:5px 8px;border:1px solid #ccc;font-size:11px;">Class Average</td>
        ${avgCells}
        <td colspan="3" style="text-align:center;border:1px solid #ccc;font-size:11px;">${classAvgPct}%</td>
        <td style="border:1px solid #ccc;"></td>
      </tr>
      <!-- Pass Rate Row -->
      <tr>
        <td colspan="3" style="padding:5px 8px;border:1px solid #ccc;font-size:11px;font-weight:600;">Pass Rate</td>
        ${passCells}
        <td colspan="4" style="border:1px solid #ccc;"></td>
      </tr>
    </tbody>
  </table>

  <!-- Footer -->
  <div style="margin-top:40px;display:flex;justify-content:space-between;font-size:11px;">
    <div><div style="width:120px;border-top:1px solid #333;padding-top:4px;text-align:center;">Exam Cell</div></div>
    <div><div style="width:120px;border-top:1px solid #333;padding-top:4px;text-align:center;">Principal</div></div>
  </div>
</body>
</html>`;
}
