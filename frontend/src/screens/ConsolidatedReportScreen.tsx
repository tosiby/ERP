// =============================================================
// KJSIS — Consolidated Report Screen
// Class-wise mark list with ranking, subject averages, pass rates.
// =============================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import type { ConsolidatedReport, ConsolidatedStudentRow } from '../types/reports-v2';
import ExportButtons from '../components/ExportButtons';

const API_BASE = 'http://localhost:4000/api';

const GRADE_COLOR: Record<string, string> = {
  'A+': '#15803d', 'A': '#16a34a', 'B+': '#2563eb',
  'B': '#3b82f6',  'C': '#d97706', 'D': '#b45309', 'F': '#dc2626',
};

async function fetchConsolidated(
  divisionId: string,
  academicYearId?: string,
  termId?: string,
  token?: string,
): Promise<ConsolidatedReport> {
  const params = new URLSearchParams({ division_id: divisionId });
  if (academicYearId) params.set('academic_year_id', academicYearId);
  if (termId) params.set('term_id', termId);

  const res = await fetch(`${API_BASE}/reports-v2/consolidated?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to load');
  return json.data;
}

// ─── Subject Header Row (horizontal scroll) ───────────────────
interface TableHeaderProps {
  data: ConsolidatedReport;
  COL: { roll: number; name: number; sub: number; total: number; pct: number; grade: number; fail: number };
}

function TableHeader({ data, COL }: TableHeaderProps) {
  return (
    <View style={styles.tableRow}>
      <View style={[styles.headerCell, { width: COL.roll }]}><Text style={styles.headerText}>#</Text></View>
      <View style={[styles.headerCell, { width: COL.name, alignItems: 'flex-start', paddingLeft: 6 }]}><Text style={styles.headerText}>Student</Text></View>
      {data.subject_headers.map((sub) => (
        <View key={sub.subject_id} style={[styles.headerCell, { width: COL.sub }]}>
          <Text style={styles.headerText} numberOfLines={2}>{sub.subject_code}</Text>
          <Text style={[styles.headerText, { fontSize: 9, fontWeight: '400' }]}>{sub.max_marks}</Text>
        </View>
      ))}
      <View style={[styles.headerCell, { width: COL.total }]}><Text style={styles.headerText}>Total</Text></View>
      <View style={[styles.headerCell, { width: COL.pct }]}><Text style={styles.headerText}>%</Text></View>
      <View style={[styles.headerCell, { width: COL.grade }]}><Text style={styles.headerText}>Gr.</Text></View>
      <View style={[styles.headerCell, { width: COL.fail }]}><Text style={styles.headerText}>F</Text></View>
    </View>
  );
}

// ─── Student Row ──────────────────────────────────────────────
interface StudentRowProps {
  student: ConsolidatedStudentRow;
  subjectIds: string[];
  idx: number;
  COL: { roll: number; name: number; sub: number; total: number; pct: number; grade: number; fail: number };
  onPress: (student: ConsolidatedStudentRow) => void;
}

function StudentRow({ student, subjectIds, idx, COL, onPress }: StudentRowProps) {
  const bg = idx % 2 === 0 ? '#fff' : '#f9fafb';
  const hasFailures = student.subjects_failed > 0;

  return (
    <TouchableOpacity style={[styles.tableRow, { backgroundColor: hasFailures ? '#fff9f9' : bg }]} onPress={() => onPress(student)}>
      <View style={[styles.dataCell, { width: COL.roll }]}>
        <Text style={styles.dataCellText}>{student.rank}</Text>
      </View>
      <View style={[styles.dataCell, { width: COL.name, alignItems: 'flex-start', paddingLeft: 6 }]}>
        <Text style={[styles.dataCellText, { fontWeight: '500' }]} numberOfLines={1}>{student.student_name}</Text>
        <Text style={{ fontSize: 9, color: '#9ca3af' }}>Roll {student.roll_number}</Text>
      </View>
      {subjectIds.map((subId) => {
        const s = student.subject_totals[subId];
        if (!s) return <View key={subId} style={[styles.dataCell, { width: COL.sub }]}><Text style={{ fontSize: 10, color: '#9ca3af' }}>—</Text></View>;
        return (
          <View key={subId} style={[styles.dataCell, { width: COL.sub }]}>
            <Text style={{ fontSize: 11, color: s.percentage < 40 ? '#dc2626' : '#111' }}>{s.obtained}</Text>
            <Text style={{ fontSize: 9, color: GRADE_COLOR[s.grade] ?? '#374151', fontWeight: '600' }}>{s.grade}</Text>
          </View>
        );
      })}
      <View style={[styles.dataCell, { width: COL.total }]}>
        <Text style={[styles.dataCellText, { fontWeight: '700' }]}>{student.grand_total_obtained}</Text>
      </View>
      <View style={[styles.dataCell, { width: COL.pct }]}>
        <Text style={{ fontSize: 11, color: student.grand_percentage >= 50 ? '#15803d' : '#dc2626', fontWeight: '600' }}>
          {student.grand_percentage.toFixed(1)}%
        </Text>
      </View>
      <View style={[styles.dataCell, { width: COL.grade }]}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: GRADE_COLOR[student.grand_grade] ?? '#374151' }}>{student.grand_grade}</Text>
      </View>
      <View style={[styles.dataCell, { width: COL.fail }]}>
        {hasFailures && <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700' }}>{student.subjects_failed}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ─── Subject Insights Section ─────────────────────────────────
function InsightsSection({ data }: { data: ConsolidatedReport }) {
  const subjects = [...data.subject_headers].sort(
    (a, b) => (data.class_averages[a.subject_id] ?? 0) - (data.class_averages[b.subject_id] ?? 0),
  );

  return (
    <View style={styles.insightsCard}>
      <Text style={styles.sectionTitle}>Subject Insights</Text>
      {subjects.map((sub) => {
        const avg = data.class_averages[sub.subject_id] ?? 0;
        const pr = data.class_pass_rates[sub.subject_id] ?? 0;
        const barColor = avg >= 70 ? '#16a34a' : avg >= 50 ? '#d97706' : '#dc2626';
        return (
          <View key={sub.subject_id} style={styles.insightRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.insightSubjectName}>{sub.subject_name}</Text>
              <View style={styles.insightBar}>
                <View style={[styles.insightFill, { width: `${Math.min(avg, 100)}%` as any, backgroundColor: barColor }]} />
              </View>
            </View>
            <View style={styles.insightStats}>
              <Text style={[styles.insightStat, { color: barColor }]}>{avg.toFixed(1)}% avg</Text>
              <Text style={[styles.insightStat, { color: pr >= 75 ? '#16a34a' : '#dc2626' }]}>{pr.toFixed(0)}% pass</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────
interface ConsolidatedReportScreenProps {
  divisionId: string;
  academicYearId?: string;
  token: string;
  onBulkExport?: () => void;
}

export default function ConsolidatedReportScreen({ divisionId, academicYearId, token, onBulkExport }: ConsolidatedReportScreenProps) {
  const [data, setData] = useState<ConsolidatedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'table' | 'insights'>('table');
  const [selectedStudent, setSelectedStudent] = useState<ConsolidatedStudentRow | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const report = await fetchConsolidated(divisionId, academicYearId, selectedTermId, token);
      setData(report);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [divisionId, academicYearId, token, selectedTermId]);

  React.useEffect(() => { load(); }, [load]);

  // PDF URL built dynamically — consumed by ExportButtons
  const getPdfUrl = () => {
    const params = new URLSearchParams({ division_id: divisionId });
    if (academicYearId) params.set('academic_year_id', academicYearId);
    if (selectedTermId) params.set('term_id', selectedTermId);
    return `${API_BASE}/reports/consolidated/pdf?${params}`;
  };

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading consolidated report…</Text>
      </View>
    );
  }

  if (!data) return null;

  const COL = { roll: 36, name: 130, sub: 50, total: 52, pct: 52, grade: 36, fail: 30 };
  const totalWidth = COL.roll + COL.name + data.subject_headers.length * COL.sub + COL.total + COL.pct + COL.grade + COL.fail;

  const classAvgPct = data.students.length
    ? data.students.reduce((s, st) => s + st.grand_percentage, 0) / data.students.length
    : 0;
  const passAll = data.students.filter((s) => s.subjects_failed === 0).length;

  return (
    <View style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{data.class_name} — Div {data.division_name}</Text>
          <Text style={styles.headerSub}>{data.academic_year.label} Consolidated Report</Text>
        </View>

        {/* Summary Pills */}
        <View style={styles.pillRow}>
          <View style={[styles.pill, { backgroundColor: '#dbeafe' }]}>
            <Text style={[styles.pillValue, { color: '#1d4ed8' }]}>{data.students.length}</Text>
            <Text style={styles.pillLabel}>Students</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: '#d1fae5' }]}>
            <Text style={[styles.pillValue, { color: '#065f46' }]}>{classAvgPct.toFixed(1)}%</Text>
            <Text style={styles.pillLabel}>Class Avg</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: '#dcfce7' }]}>
            <Text style={[styles.pillValue, { color: '#15803d' }]}>{passAll}</Text>
            <Text style={styles.pillLabel}>Passed All</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: '#fee2e2' }]}>
            <Text style={[styles.pillValue, { color: '#dc2626' }]}>{data.students.length - passAll}</Text>
            <Text style={styles.pillLabel}>Has Fail</Text>
          </View>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tab, activeTab === 'table' && styles.tabActive]} onPress={() => setActiveTab('table')}>
            <Text style={[styles.tabText, activeTab === 'table' && styles.tabTextActive]}>Mark List</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'insights' && styles.tabActive]} onPress={() => setActiveTab('insights')}>
            <Text style={[styles.tabText, activeTab === 'insights' && styles.tabTextActive]}>Insights</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'table' && (
          <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginHorizontal: 12 }}>
            <View style={{ width: totalWidth }}>
              <TableHeader data={data} COL={COL} />
              {data.students.map((student, idx) => (
                <StudentRow
                  key={student.student_id}
                  student={student}
                  subjectIds={data.subject_headers.map((s) => s.subject_id)}
                  idx={idx}
                  COL={COL}
                  onPress={(s) => setSelectedStudent(s)}
                />
              ))}

              {/* Class Average Row */}
              <View style={[styles.tableRow, { backgroundColor: '#f0f4f8' }]}>
                <View style={[styles.dataCell, { width: COL.roll }]} />
                <View style={[styles.dataCell, { width: COL.name, alignItems: 'flex-start', paddingLeft: 6 }]}>
                  <Text style={[styles.dataCellText, { fontWeight: '700' }]}>Class Avg</Text>
                </View>
                {data.subject_headers.map((sub) => (
                  <View key={sub.subject_id} style={[styles.dataCell, { width: COL.sub }]}>
                    <Text style={{ fontSize: 10, color: '#374151' }}>{(data.class_averages[sub.subject_id] ?? 0).toFixed(1)}%</Text>
                  </View>
                ))}
                <View style={[styles.dataCell, { width: COL.total }]} />
                <View style={[styles.dataCell, { width: COL.pct }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>{classAvgPct.toFixed(1)}%</Text>
                </View>
                <View style={{ width: COL.grade + COL.fail }} />
              </View>

              {/* Pass Rate Row */}
              <View style={[styles.tableRow, { backgroundColor: '#f8f9fa' }]}>
                <View style={[styles.dataCell, { width: COL.roll }]} />
                <View style={[styles.dataCell, { width: COL.name, alignItems: 'flex-start', paddingLeft: 6 }]}>
                  <Text style={[styles.dataCellText, { fontWeight: '700' }]}>Pass Rate</Text>
                </View>
                {data.subject_headers.map((sub) => {
                  const pr = data.class_pass_rates[sub.subject_id] ?? 0;
                  return (
                    <View key={sub.subject_id} style={[styles.dataCell, { width: COL.sub }]}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: pr >= 75 ? '#15803d' : '#dc2626' }}>{pr.toFixed(0)}%</Text>
                    </View>
                  );
                })}
                <View style={{ width: COL.total + COL.pct + COL.grade + COL.fail }} />
              </View>
            </View>
          </ScrollView>
        )}

        {activeTab === 'insights' && <InsightsSection data={data} />}

        {/* Export: Download PDF + Share + Bulk Export */}
        <View style={{ marginHorizontal: 12, marginTop: 8 }}>
          <ExportButtons
            pdfUrl={getPdfUrl()}
            filename={`consolidated-${data.class_name}-Div${data.division_name}-${data.academic_year.label}.pdf`}
            token={token}
            size="md"
          />
          {onBulkExport && (
            <TouchableOpacity style={styles.bulkBtn} onPress={onBulkExport}>
              <Text style={styles.bulkBtnText}>Bulk Export All Progress Cards (ZIP) →</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Student Detail Modal-style overlay */}
      {selectedStudent && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <TouchableOpacity style={styles.overlayClose} onPress={() => setSelectedStudent(null)}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.overlayName}>{selectedStudent.student_name}</Text>
            <Text style={styles.overlaySub}>Roll {selectedStudent.roll_number} · Rank {selectedStudent.rank}/{data.students.length}</Text>
            <Text style={[styles.overlayScore, { color: GRADE_COLOR[selectedStudent.grand_grade] ?? '#111' }]}>
              {selectedStudent.grand_percentage.toFixed(1)}% — Grade {selectedStudent.grand_grade}
            </Text>
            <Text style={styles.overlayPassed}>
              Passed: {selectedStudent.subjects_passed}  ·  Failed: <Text style={{ color: '#dc2626' }}>{selectedStudent.subjects_failed}</Text>
            </Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {data.subject_headers.map((sub) => {
                const s = selectedStudent.subject_totals[sub.subject_id];
                return (
                  <View key={sub.subject_id} style={styles.overlaySubRow}>
                    <Text style={styles.overlaySubName}>{sub.subject_name}</Text>
                    <Text style={[styles.overlaySubScore, { color: s && s.percentage < 40 ? '#dc2626' : '#111' }]}>
                      {s ? `${s.obtained}/${sub.max_marks} (${s.percentage.toFixed(1)}%)` : '—'}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#6b7280', fontSize: 14 },

  header: { backgroundColor: '#1e40af', padding: 18, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSub: { color: '#bfdbfe', fontSize: 12, marginTop: 2 },

  pillRow: { flexDirection: 'row', padding: 12, gap: 8 },
  pill: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  pillValue: { fontSize: 16, fontWeight: '700' },
  pillLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },

  tabRow: { flexDirection: 'row', marginHorizontal: 12, marginBottom: 10, backgroundColor: '#e5e7eb', borderRadius: 8, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  tabTextActive: { color: '#111' },

  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerCell: { backgroundColor: '#1f2937', justifyContent: 'center', alignItems: 'center', padding: 5, borderRightWidth: 1, borderRightColor: '#374151' },
  headerText: { color: '#fff', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  dataCell: { justifyContent: 'center', alignItems: 'center', padding: 4, borderRightWidth: 1, borderRightColor: '#f3f4f6', minHeight: 36 },
  dataCellText: { fontSize: 11, color: '#111' },

  insightsCard: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 10, borderRadius: 10, padding: 14, elevation: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 12 },
  insightRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  insightSubjectName: { fontSize: 12, fontWeight: '500', color: '#111', marginBottom: 4 },
  insightBar: { height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' },
  insightFill: { height: '100%', borderRadius: 3 },
  insightStats: { alignItems: 'flex-end', minWidth: 68 },
  insightStat: { fontSize: 11, fontWeight: '600' },

  bulkBtn: { marginTop: 10, borderWidth: 1, borderColor: '#2563eb', borderRadius: 8, padding: 10, alignItems: 'center' },
  bulkBtnText: { fontSize: 12, color: '#2563eb', fontWeight: '600' },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  overlayCard: { backgroundColor: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 400 },
  overlayClose: { position: 'absolute', top: 12, right: 12, backgroundColor: '#6b7280', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  overlayName: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 2 },
  overlaySub: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  overlayScore: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  overlayPassed: { fontSize: 12, color: '#374151', marginBottom: 12 },
  overlaySubRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  overlaySubName: { fontSize: 12, color: '#374151', flex: 1 },
  overlaySubScore: { fontSize: 12, fontWeight: '600' },
});
