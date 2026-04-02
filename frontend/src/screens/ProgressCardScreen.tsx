// =============================================================
// KJSIS — Progress Card Screen
// Displays a student's full progress card with dynamic exam columns.
// Supports term-wise and full-year view, remarks, PDF download.
// =============================================================

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, RefreshControl,
  Dimensions,
} from 'react-native';
import ExportButtons from '../components/ExportButtons';
import type {
  ProgressCardData, ProgressCardExamColumn, ProgressCardSubjectRow,
} from '../types/reports-v2';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Colour helpers ───────────────────────────────────────────
const GRADE_COLOR: Record<string, string> = {
  'A+': '#15803d', 'A': '#16a34a', 'B+': '#2563eb',
  'B': '#3b82f6',  'C': '#d97706', 'D': '#b45309', 'F': '#dc2626',
};

function gradeColor(g: string): string { return GRADE_COLOR[g] ?? '#374151'; }
function pctColor(p: number): string {
  return p >= 75 ? '#15803d' : p >= 50 ? '#d97706' : '#dc2626';
}

// ─── API call stubs (replace with your actual API client) ─────
const API_BASE = 'http://localhost:4000/api';

async function fetchProgressCard(
  studentId: string,
  academicYearId?: string,
  termId?: string,
  token?: string,
): Promise<ProgressCardData> {
  const params = new URLSearchParams({ student_id: studentId });
  if (academicYearId) params.set('academic_year_id', academicYearId);
  if (termId) params.set('term_id', termId);

  const res = await fetch(`${API_BASE}/reports-v2/progress-card?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to load progress card');
  return json.data;
}

async function saveRemark(
  studentId: string,
  academicYearId: string,
  termId: string | null,
  text: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/reports-v2/remarks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ student_id: studentId, academic_year_id: academicYearId, term_id: termId, remark_text: text }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to save remark');
}

async function generateRemark(
  studentId: string,
  academicYearId: string,
  termId: string | null,
  token: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/reports-v2/remarks/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ student_id: studentId, academic_year_id: academicYearId, term_id: termId ?? undefined, overwrite: true }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to generate remark');
  return json.data.remark_text as string;
}

// ─── Sub-components ───────────────────────────────────────────

interface MarksTableProps {
  columns: ProgressCardExamColumn[];
  subjects: ProgressCardSubjectRow[];
  totals: ProgressCardData['totals'];
  settings: ProgressCardData['settings'];
}

function MarksTable({ columns, subjects, totals, settings }: MarksTableProps) {
  // Group columns by term
  const termNumbers = [...new Set(columns.map((c) => c.term_number))].sort((a, b) => a - b);
  const TERM_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

  const COL_SUBJECT = 120;
  const COL_MARK = 46;
  const COL_TOTAL = 60;
  const COL_PCT = 52;
  const COL_GRADE = 42;
  const totalWidth = COL_SUBJECT + columns.length * COL_MARK + COL_TOTAL + COL_PCT + COL_GRADE;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={{ width: totalWidth }}>
        {/* Term group header */}
        <View style={styles.tableRow}>
          <View style={[styles.headerCell, { width: COL_SUBJECT }]}>
            <Text style={styles.headerText}>Subject</Text>
          </View>
          {termNumbers.map((tn) => {
            const cols = columns.filter((c) => c.term_number === tn);
            return (
              <View
                key={tn}
                style={[styles.headerCell, { width: cols.length * COL_MARK, backgroundColor: TERM_COLORS[(tn - 1) % TERM_COLORS.length] }]}
              >
                <Text style={styles.headerText}>Term {tn}</Text>
              </View>
            );
          })}
          <View style={[styles.headerCell, { width: COL_TOTAL }]}><Text style={styles.headerText}>Total</Text></View>
          <View style={[styles.headerCell, { width: COL_PCT }]}><Text style={styles.headerText}>%</Text></View>
          <View style={[styles.headerCell, { width: COL_GRADE }]}><Text style={styles.headerText}>Gr.</Text></View>
        </View>

        {/* Exam name subheader */}
        <View style={styles.tableRow}>
          <View style={{ width: COL_SUBJECT, backgroundColor: '#374151' }} />
          {columns.map((col) => (
            <View key={col.exam_id} style={[styles.subHeaderCell, { width: COL_MARK }]}>
              <Text style={styles.subHeaderText}>{col.exam_name}</Text>
              <Text style={[styles.subHeaderText, { fontSize: 9 }]}>{col.max_marks}</Text>
            </View>
          ))}
          <View style={{ width: COL_TOTAL + COL_PCT + COL_GRADE, backgroundColor: '#374151' }} />
        </View>

        {/* Subject rows */}
        {subjects.map((sub, idx) => (
          <View key={sub.subject_id} style={[styles.tableRow, { backgroundColor: idx % 2 === 0 ? '#fff' : '#f9fafb' }]}>
            <View style={[styles.dataCell, { width: COL_SUBJECT, alignItems: 'flex-start', paddingLeft: 6 }]}>
              <Text style={[styles.dataCellText, { fontWeight: '500' }]} numberOfLines={2}>{sub.subject_name}</Text>
            </View>
            {columns.map((col) => {
              const cell = sub.marks[col.exam_id];
              return (
                <View key={col.exam_id} style={[styles.dataCell, { width: COL_MARK }]}>
                  {cell?.is_absent ? (
                    <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '600' }}>AB</Text>
                  ) : cell?.marks_obtained != null ? (
                    <Text style={{ fontSize: 11, color: '#111' }}>{cell.marks_obtained}</Text>
                  ) : (
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>—</Text>
                  )}
                </View>
              );
            })}
            <View style={[styles.dataCell, { width: COL_TOTAL }]}>
              <Text style={{ fontSize: 11 }}>{sub.total_obtained}/{sub.total_max}</Text>
            </View>
            <View style={[styles.dataCell, { width: COL_PCT }]}>
              <Text style={{ fontSize: 11, color: pctColor(sub.percentage) }}>{sub.percentage.toFixed(1)}%</Text>
            </View>
            <View style={[styles.dataCell, { width: COL_GRADE }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: gradeColor(sub.grade) }}>{sub.grade}</Text>
            </View>
          </View>
        ))}

        {/* Totals row */}
        <View style={[styles.tableRow, { backgroundColor: '#e8f4fd' }]}>
          <View style={[styles.dataCell, { width: COL_SUBJECT, alignItems: 'flex-start', paddingLeft: 6 }]}>
            <Text style={{ fontSize: 11, fontWeight: '700' }}>GRAND TOTAL</Text>
          </View>
          {columns.map((col) => <View key={col.exam_id} style={{ width: COL_MARK }} />)}
          <View style={[styles.dataCell, { width: COL_TOTAL }]}>
            <Text style={{ fontSize: 11, fontWeight: '700' }}>{totals.obtained}/{totals.max}</Text>
          </View>
          <View style={[styles.dataCell, { width: COL_PCT }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: pctColor(totals.percentage) }}>{totals.percentage.toFixed(1)}%</Text>
          </View>
          <View style={[styles.dataCell, { width: COL_GRADE }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: gradeColor(totals.grade) }}>{totals.grade}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Remark Editor ────────────────────────────────────────────
interface RemarkEditorProps {
  remark: ProgressCardData['remarks'][number] | undefined;
  label: string;
  studentId: string;
  academicYearId: string;
  termId: string | null;
  token: string;
  onSaved: (text: string) => void;
}

function RemarkEditor({ remark, label, studentId, academicYearId, termId, token, onSaved }: RemarkEditorProps) {
  const [text, setText] = useState(remark?.remark_text ?? '');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await saveRemark(studentId, academicYearId, termId, text.trim(), token);
      onSaved(text.trim());
      Alert.alert('Saved', 'Remark saved successfully.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const generated = await generateRemark(studentId, academicYearId, termId, token);
      setText(generated);
      onSaved(generated);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to generate');
    } finally { setGenerating(false); }
  };

  return (
    <View style={styles.remarkBox}>
      <Text style={styles.remarkLabel}>{label}</Text>
      {remark?.is_ai_generated && (
        <View style={styles.aiBadge}>
          <Text style={styles.aiBadgeText}>AI Generated</Text>
        </View>
      )}
      <TextInput
        style={styles.remarkInput}
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={3}
        placeholder="Enter remark..."
        placeholderTextColor="#9ca3af"
      />
      <View style={styles.remarkActions}>
        <TouchableOpacity style={styles.generateBtn} onPress={handleGenerate} disabled={generating}>
          {generating
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.generateBtnText}>Generate AI</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────

interface ProgressCardScreenProps {
  studentId: string;
  academicYearId?: string;
  token: string;
  canEdit?: boolean;   // class teacher / exam_cell / admin
  onBulkExport?: () => void;  // navigate to BulkExportScreen
}

export default function ProgressCardScreen({ studentId, academicYearId, token, canEdit = false, onBulkExport }: ProgressCardScreenProps) {
  const [data, setData] = useState<ProgressCardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'full' | 'term'>('full');
  const [localRemarks, setLocalRemarks] = useState<Record<string, string>>({});

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const termId = viewMode === 'term' ? selectedTermId : undefined;
      const card = await fetchProgressCard(studentId, academicYearId, termId, token);
      setData(card);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId, academicYearId, token, viewMode, selectedTermId]);

  React.useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading progress card…</Text>
      </View>
    );
  }

  if (!data) return null;

  // Derive unique terms from exam columns
  const terms = [...new Map(
    data.exam_columns.map((c) => [c.term_number, { term_number: c.term_number }]),
  ).values()].sort((a, b) => a.term_number - b.term_number);

  const annualRemark = data.remarks.find((r) => r.term_id === null);
  const termRemarksMap = new Map(data.remarks.filter((r) => r.term_id).map((r) => [r.term_id!, r]));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.schoolName}>{data.settings.school_name}</Text>
        <Text style={styles.headerSub}>Progress Card — {data.academic_year.label}</Text>
      </View>

      {/* Student Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{data.student.name}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Adm. No.</Text>
            <Text style={styles.infoValue}>{data.student.admission_number}</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Class</Text>
            <Text style={styles.infoValue}>{data.student.class_name} — Div {data.student.division_name}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Roll No.</Text>
            <Text style={styles.infoValue}>{data.student.roll_number}</Text>
          </View>
        </View>
      </View>

      {/* Summary Pills */}
      <View style={styles.pillRow}>
        <View style={[styles.pill, { backgroundColor: '#dbeafe' }]}>
          <Text style={[styles.pillValue, { color: '#1d4ed8' }]}>{data.totals.percentage.toFixed(1)}%</Text>
          <Text style={styles.pillLabel}>Overall</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: '#dcfce7' }]}>
          <Text style={[styles.pillValue, { color: '#15803d' }]}>{data.totals.grade}</Text>
          <Text style={styles.pillLabel}>Grade</Text>
        </View>
        {data.settings.show_rank && data.totals.rank && (
          <View style={[styles.pill, { backgroundColor: '#fef9c3' }]}>
            <Text style={[styles.pillValue, { color: '#854d0e' }]}>{data.totals.rank}/{data.totals.total_students}</Text>
            <Text style={styles.pillLabel}>Rank</Text>
          </View>
        )}
        {data.settings.show_attendance && data.attendance && (
          <View style={[styles.pill, { backgroundColor: data.attendance.percentage >= 75 ? '#dcfce7' : '#fee2e2' }]}>
            <Text style={[styles.pillValue, { color: data.attendance.percentage >= 75 ? '#15803d' : '#dc2626' }]}>
              {data.attendance.percentage.toFixed(0)}%
            </Text>
            <Text style={styles.pillLabel}>Attend.</Text>
          </View>
        )}
        <View style={[styles.pill, { backgroundColor: '#fce7f3' }]}>
          <Text style={[styles.pillValue, { color: '#9d174d' }]}>{data.totals.subjects_passed}/{data.totals.subjects_passed + data.totals.subjects_failed}</Text>
          <Text style={styles.pillLabel}>Passed</Text>
        </View>
      </View>

      {/* View Mode Toggle */}
      {terms.length > 1 && (
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'full' && styles.toggleBtnActive]}
            onPress={() => { setViewMode('full'); setSelectedTermId(undefined); }}
          >
            <Text style={[styles.toggleText, viewMode === 'full' && styles.toggleTextActive]}>Full Year</Text>
          </TouchableOpacity>
          {terms.map((t) => (
            <TouchableOpacity
              key={t.term_number}
              style={[styles.toggleBtn, viewMode === 'term' && selectedTermId && styles.toggleBtnActive]}
              onPress={() => { setViewMode('term'); }}
            >
              <Text style={[styles.toggleText, viewMode === 'term' && styles.toggleTextActive]}>Term {t.term_number}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Marks Table */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subject-wise Marks</Text>
        <MarksTable
          columns={data.exam_columns}
          subjects={data.subjects}
          totals={data.totals}
          settings={data.settings}
        />
      </View>

      {/* Attendance Detail */}
      {data.settings.show_attendance && data.attendance && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attendance</Text>
          <View style={styles.attRow}>
            <Text style={styles.attText}>
              Present: {data.attendance.total_working_days - data.attendance.total_absent} / {data.attendance.total_working_days} days
            </Text>
            <View style={styles.attBar}>
              <View style={[styles.attFill, {
                width: `${Math.min(data.attendance.percentage, 100)}%` as any,
                backgroundColor: data.attendance.percentage >= 75 ? '#16a34a' : '#dc2626',
              }]} />
            </View>
          </View>
        </View>
      )}

      {/* Remarks Section */}
      {data.settings.show_ai_remarks && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remarks</Text>
          {canEdit && (
            <RemarkEditor
              remark={annualRemark}
              label="Annual Remark"
              studentId={studentId}
              academicYearId={data.academic_year.id}
              termId={null}
              token={token}
              onSaved={(text) => setLocalRemarks((prev) => ({ ...prev, annual: text }))}
            />
          )}
          {!canEdit && annualRemark && (
            <View style={styles.remarkDisplay}>
              <Text style={styles.remarkDisplayText}>{localRemarks['annual'] ?? annualRemark.remark_text}</Text>
            </View>
          )}
        </View>
      )}

      {/* AI Insights (shown when insights data present on FullReport) */}
      {(data as any).insights && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Insights</Text>
          {/* Risk badge */}
          {(() => {
            const insights = (data as any).insights;
            const riskColors: Record<string, string> = { low: '#dcfce7', medium: '#fef9c3', high: '#fee2e2', critical: '#fecaca' };
            const riskTextColors: Record<string, string> = { low: '#15803d', medium: '#854d0e', high: '#b91c1c', critical: '#7f1d1d' };
            return (
              <>
                <View style={[styles.insightBadge, { backgroundColor: riskColors[insights.risk_level] ?? '#f3f4f6' }]}>
                  <Text style={[styles.insightBadgeText, { color: riskTextColors[insights.risk_level] ?? '#374151' }]}>
                    Risk: {insights.risk_level.toUpperCase()} ({insights.risk_score}/100)
                    {'  '}Trend: {insights.trend === 'improving' ? '↑' : insights.trend === 'declining' ? '↓' : '→'} {insights.trend}
                  </Text>
                </View>
                {insights.suggestions?.map((s: string, i: number) => (
                  <Text key={i} style={styles.insightSuggestion}>• {s}</Text>
                ))}
              </>
            );
          })()}
        </View>
      )}

      {/* Export: Download + Share */}
      <View style={[styles.section, { paddingBottom: 4 }]}>
        <Text style={styles.sectionTitle}>Export</Text>
        <ExportButtons
          pdfUrl={`${API_BASE}/reports/progress-card/pdf?student_id=${studentId}${academicYearId ? `&academic_year_id=${academicYearId}` : ''}${selectedTermId ? `&term_id=${selectedTermId}` : ''}`}
          filename={`progress-card-${data.student.admission_number}-${data.academic_year.label}.pdf`}
          token={token}
          size="md"
        />
        {onBulkExport && (
          <TouchableOpacity style={styles.bulkBtn} onPress={onBulkExport}>
            <Text style={styles.bulkBtnText}>Bulk Export (Entire Division) →</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#6b7280', fontSize: 14 },

  header: { backgroundColor: '#1e40af', padding: 20, alignItems: 'center' },
  schoolName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#bfdbfe', fontSize: 13, marginTop: 2 },

  infoCard: { backgroundColor: '#fff', margin: 12, borderRadius: 10, padding: 14, elevation: 2 },
  infoRow: { flexDirection: 'row', marginBottom: 8 },
  infoItem: { flex: 1 },
  infoLabel: { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#111', marginTop: 2 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 4 },
  pill: { flex: 1, minWidth: 64, borderRadius: 10, padding: 10, alignItems: 'center' },
  pillValue: { fontSize: 16, fontWeight: '700' },
  pillLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },

  toggleRow: { flexDirection: 'row', paddingHorizontal: 12, marginVertical: 8, gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#e5e7eb', alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#3b82f6' },
  toggleText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  toggleTextActive: { color: '#fff' },

  section: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 10, borderRadius: 10, padding: 14, elevation: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 10 },

  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerCell: { backgroundColor: '#1f2937', justifyContent: 'center', alignItems: 'center', padding: 6, borderRightWidth: 1, borderRightColor: '#374151' },
  headerText: { color: '#fff', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  subHeaderCell: { backgroundColor: '#374151', justifyContent: 'center', alignItems: 'center', padding: 4, borderRightWidth: 1, borderRightColor: '#4b5563' },
  subHeaderText: { color: '#d1d5db', fontSize: 10, textAlign: 'center' },
  dataCell: { justifyContent: 'center', alignItems: 'center', padding: 4, borderRightWidth: 1, borderRightColor: '#f3f4f6', minHeight: 32 },
  dataCellText: { fontSize: 11, color: '#111' },

  attRow: { gap: 8 },
  attText: { fontSize: 12, color: '#374151' },
  attBar: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  attFill: { height: '100%', borderRadius: 4 },

  remarkBox: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, marginBottom: 10 },
  remarkLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 },
  aiBadge: { backgroundColor: '#ede9fe', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6 },
  aiBadgeText: { fontSize: 10, color: '#7c3aed', fontWeight: '600' },
  remarkInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, padding: 8, fontSize: 12, color: '#111', minHeight: 70, textAlignVertical: 'top' },
  remarkActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  generateBtn: { flex: 1, backgroundColor: '#7c3aed', borderRadius: 6, padding: 8, alignItems: 'center' },
  generateBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 6, padding: 8, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  remarkDisplay: { backgroundColor: '#f9fafb', borderRadius: 6, padding: 10 },
  remarkDisplayText: { fontSize: 12, color: '#374151', lineHeight: 18 },

  insightBadge: { borderRadius: 8, padding: 10, marginBottom: 8 },
  insightBadgeText: { fontSize: 12, fontWeight: '700' },
  insightSuggestion: { fontSize: 12, color: '#374151', marginBottom: 4, lineHeight: 17 },

  bulkBtn: { marginTop: 10, borderWidth: 1, borderColor: '#2563eb', borderRadius: 8, padding: 10, alignItems: 'center' },
  bulkBtnText: { fontSize: 12, color: '#2563eb', fontWeight: '600' },
});
