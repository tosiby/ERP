// =============================================================
// KJSIS — TermPerformanceCard Component
//
// Displays a student's term-wise performance for one subject.
// Used inside Student Report Card screen.
//
// Props:
//   data      — StudentTermWiseProgress for one subject
//   expanded  — controls accordion open/closed state
//   onToggle  — called when user taps the card header
// =============================================================

import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import type { StudentTermWiseProgress, TermProgress } from '../types/terms';

// ── Grade → colour map (mirrors backend grade boundaries) ────
const GRADE_COLOR: Record<string, string> = {
  'A+': '#22c55e',
  'A':  '#4ade80',
  'B+': '#86efac',
  'B':  '#fbbf24',
  'C':  '#f97316',
  'D':  '#ef4444',
  'F':  '#7f1d1d',
};

const TERM_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

const TREND_CONFIG = {
  improving: { icon: '↑', color: '#22c55e', label: 'Improving' },
  declining:  { icon: '↓', color: '#ef4444', label: 'Declining' },
  stable:     { icon: '→', color: '#64748b', label: 'Stable'    },
};

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: Single Term Column
// ─────────────────────────────────────────────────────────────
const TermColumn: React.FC<{ term: TermProgress; color: string }> = ({ term, color }) => {
  const gradeColor = GRADE_COLOR[term.term_grade] ?? '#64748b';
  const pct = term.term_percentage;
  const barHeight = Math.max(4, (pct / 100) * 80); // max 80px bar

  return (
    <View style={colStyles.container}>
      {/* Bar chart */}
      <View style={colStyles.barTrack}>
        <View style={[colStyles.barFill, { height: barHeight, backgroundColor: color }]} />
      </View>

      {/* Percentage label */}
      <Text style={[colStyles.pct, { color }]}>{pct}%</Text>

      {/* Grade badge */}
      <View style={[colStyles.gradeBadge, { backgroundColor: gradeColor + '20' }]}>
        <Text style={[colStyles.gradeText, { color: gradeColor }]}>{term.term_grade}</Text>
      </View>

      {/* Term label */}
      <Text style={colStyles.termLabel}>{term.term_name}</Text>

      {/* Per-exam breakdown */}
      {term.exams.map((exam) => (
        <View key={exam.exam_id} style={colStyles.examRow}>
          <Text style={colStyles.examCode}>{exam.exam_type_code}</Text>
          <Text style={[colStyles.examMarks, exam.is_absent && { color: '#ef4444' }]}>
            {exam.is_absent ? 'AB' : `${exam.marks_obtained}/${exam.total_marks}`}
          </Text>
        </View>
      ))}
    </View>
  );
};

const colStyles = StyleSheet.create({
  container:  { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  barTrack:   { width: 32, height: 80, backgroundColor: '#f1f5f9', borderRadius: 4, justifyContent: 'flex-end', marginBottom: 4 },
  barFill:    { width: 32, borderRadius: 4 },
  pct:        { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  gradeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 },
  gradeText:  { fontSize: 11, fontWeight: '700' },
  termLabel:  { fontSize: 11, color: '#94a3b8', marginBottom: 6, textAlign: 'center' },
  examRow:    { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 2 },
  examCode:   { fontSize: 10, color: '#64748b', fontWeight: '500' },
  examMarks:  { fontSize: 10, color: '#475569' },
});

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
interface Props {
  data: StudentTermWiseProgress;
  expanded?: boolean;
  onToggle?: () => void;
}

const TermPerformanceCard: React.FC<Props> = ({
  data,
  expanded = false,
  onToggle,
}) => {
  const trend = TREND_CONFIG[data.overall_trend];

  // Calculate best and worst term
  const bestTerm  = [...data.terms].sort((a, b) => b.term_percentage - a.term_percentage)[0];
  const worstTerm = [...data.terms].sort((a, b) => a.term_percentage - b.term_percentage)[0];
  const hasDelta  = data.terms.length >= 2;
  const delta     = hasDelta
    ? data.terms[data.terms.length - 1].term_percentage - data.terms[0].term_percentage
    : 0;

  return (
    <View style={styles.card}>
      {/* Header — always visible */}
      <TouchableOpacity
        style={styles.header}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.subjectName}>{data.subject_name}</Text>
          <View style={styles.trendBadge}>
            <Text style={[styles.trendIcon, { color: trend.color }]}>{trend.icon}</Text>
            <Text style={[styles.trendLabel, { color: trend.color }]}>{trend.label}</Text>
            {hasDelta && (
              <Text style={[styles.trendDelta, { color: trend.color }]}>
                {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
              </Text>
            )}
          </View>
        </View>

        {/* Mini summary chips */}
        <View style={styles.headerRight}>
          {data.terms.map((t, i) => (
            <View key={t.term_id} style={[styles.miniChip, { backgroundColor: TERM_COLORS[i] }]}>
              <Text style={styles.miniChipText}>{t.term_percentage}%</Text>
            </View>
          ))}
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {/* Expanded Body */}
      {expanded && (
        <View style={styles.body}>
          {/* Bar chart row */}
          <View style={styles.chartRow}>
            {data.terms.map((term, i) => (
              <TermColumn key={term.term_id} term={term} color={TERM_COLORS[i]} />
            ))}
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{bestTerm?.term_grade ?? '—'}</Text>
              <Text style={styles.statLabel}>Best Grade</Text>
            </View>
            <View style={[styles.statBox, styles.statBoxMid]}>
              <Text style={styles.statValue}>{data.terms.length}</Text>
              <Text style={styles.statLabel}>Terms</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: trend.color }]}>
                {delta > 0 ? '+' : ''}{hasDelta ? delta.toFixed(1) + '%' : '—'}
              </Text>
              <Text style={styles.statLabel}>Progress</Text>
            </View>
          </View>

          {/* Absent warning */}
          {data.terms.some((t) => t.exams.some((e) => e.is_absent)) && (
            <View style={styles.absentWarning}>
              <Text style={styles.absentWarningText}>
                ⚠ Student was absent for one or more exams in this subject.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft:  { flex: 1 },
  subjectName: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  trendBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendIcon:   { fontSize: 14, fontWeight: '700' },
  trendLabel:  { fontSize: 12, fontWeight: '500' },
  trendDelta:  { fontSize: 12, fontWeight: '600' },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniChip:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  miniChipText:{ fontSize: 11, color: '#fff', fontWeight: '700' },
  chevron:     { fontSize: 10, color: '#94a3b8', marginLeft: 4 },

  body: { paddingHorizontal: 16, paddingBottom: 16 },

  chartRow: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },

  statsRow:    { flexDirection: 'row', marginTop: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  statBox:     { flex: 1, alignItems: 'center' },
  statBoxMid:  { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#f1f5f9' },
  statValue:   { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  statLabel:   { fontSize: 11, color: '#94a3b8', marginTop: 2 },

  absentWarning: {
    marginTop: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 10,
  },
  absentWarningText: { fontSize: 12, color: '#92400e' },
});

export default TermPerformanceCard;
