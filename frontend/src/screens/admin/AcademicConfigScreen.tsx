// =============================================================
// KJSIS — Academic Configuration Screen
//
// Allows super_admin / exam_cell to configure:
//   1. Exam types (code, label, default marks)
//   2. Term count (1–3)
//   3. Preview generated exams before committing
//   4. One-tap generation of all exam rows
// =============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import type { ExamType, Term, GeneratedExamPreview } from '../../types/terms';

// ── Replace with your actual API client / base URL ────────────
const API = async <T>(
  path: string,
  method = 'GET',
  body?: unknown,
  token?: string,
): Promise<T> => {
  const res = await fetch(`http://localhost:4000/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'API error');
  return json.data as T;
};

// ── Local exam-type draft (before saving) ────────────────────
interface ExamTypeDraft {
  key: string;   // local UUID for list rendering
  code: string;
  label: string;
  max_marks: string;       // string for TextInput
  passing_marks: string;
}

const newDraft = (): ExamTypeDraft => ({
  key:           String(Date.now() + Math.random()),
  code:          '',
  label:         '',
  max_marks:     '100',
  passing_marks: '35',
});

// ── Colour palette for term badges ───────────────────────────
const TERM_COLORS = ['#3b82f6', '#10b981', '#f59e0b'];

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────
interface Props {
  academicYearId: string;
  authToken: string;
}

const AcademicConfigScreen: React.FC<Props> = ({ academicYearId, authToken }) => {
  // ── State ──────────────────────────────────────────────────
  const [examTypeDrafts, setExamTypeDrafts] = useState<ExamTypeDraft[]>([newDraft()]);
  const [termCount, setTermCount]           = useState<1 | 2 | 3>(2);
  const [preview, setPreview]               = useState<GeneratedExamPreview[]>([]);
  const [savedExamTypes, setSavedExamTypes] = useState<ExamType[]>([]);
  const [savedTerms, setSavedTerms]         = useState<Term[]>([]);
  const [loading, setLoading]               = useState(false);
  const [savingTypes, setSavingTypes]       = useState(false);
  const [savingTerms, setSavingTerms]       = useState(false);
  const [generating, setGenerating]         = useState(false);
  const [activeTab, setActiveTab]           = useState<'types' | 'terms' | 'preview'>('types');

  // ── Load existing config ───────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [types, terms] = await Promise.all([
        API<ExamType[]>(
          `/admin/terms/exam-types?academic_year_id=${academicYearId}`,
          'GET', undefined, authToken,
        ),
        API<Term[]>(
          `/admin/terms?academic_year_id=${academicYearId}`,
          'GET', undefined, authToken,
        ),
      ]);

      setSavedExamTypes(types);
      setSavedTerms(terms);

      if (types.length > 0) {
        setExamTypeDrafts(types.map((t) => ({
          key:           t.id,
          code:          t.code,
          label:         t.label,
          max_marks:     String(t.max_marks_default),
          passing_marks: String(t.passing_marks_default),
        })));
      }

      if (terms.length > 0) {
        setTermCount(terms.length as 1 | 2 | 3);
      }
    } catch (err) {
      Alert.alert('Load Error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [academicYearId, authToken]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Fetch preview whenever types or termCount change ──────
  const refreshPreview = useCallback(async () => {
    try {
      const data = await API<GeneratedExamPreview[]>(
        `/admin/terms/preview?academic_year_id=${academicYearId}`,
        'GET', undefined, authToken,
      );
      setPreview(data);
    } catch { /* silent — preview is best-effort */ }
  }, [academicYearId, authToken]);

  useEffect(() => { refreshPreview(); }, [savedExamTypes, savedTerms, refreshPreview]);

  // ── Exam type draft helpers ───────────────────────────────
  const updateDraft = (key: string, field: keyof ExamTypeDraft, value: string) => {
    setExamTypeDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, [field]: field === 'code' ? value.toUpperCase() : value } : d)),
    );
  };

  const addType  = () => setExamTypeDrafts((p) => [...p, newDraft()]);
  const removeType = (key: string) => {
    if (examTypeDrafts.length === 1) {
      Alert.alert('Cannot Remove', 'At least one exam type is required.');
      return;
    }
    setExamTypeDrafts((p) => p.filter((d) => d.key !== key));
  };

  // ── Validation ───────────────────────────────────────────
  const validateDrafts = (): string | null => {
    const codes = examTypeDrafts.map((d) => d.code.trim());
    if (codes.some((c) => !c)) return 'All exam type codes are required.';
    if (new Set(codes).size !== codes.length) return 'Exam type codes must be unique.';

    for (const d of examTypeDrafts) {
      if (!d.label.trim())          return `Label is required for "${d.code}".`;
      const max  = parseInt(d.max_marks, 10);
      const pass = parseInt(d.passing_marks, 10);
      if (isNaN(max)  || max  <= 0) return `Max marks must be positive for "${d.code}".`;
      if (isNaN(pass) || pass <= 0) return `Passing marks must be positive for "${d.code}".`;
      if (pass >= max)               return `Passing marks must be less than max marks for "${d.code}".`;
    }
    return null;
  };

  // ── Save exam types ───────────────────────────────────────
  const saveExamTypes = async () => {
    const err = validateDrafts();
    if (err) { Alert.alert('Validation Error', err); return; }

    setSavingTypes(true);
    try {
      const saved = await API<ExamType[]>(
        '/admin/terms/exam-types',
        'PUT',
        {
          academic_year_id: academicYearId,
          exam_types: examTypeDrafts.map((d, i) => ({
            code:                  d.code.trim().toUpperCase(),
            label:                 d.label.trim(),
            max_marks_default:     parseInt(d.max_marks, 10),
            passing_marks_default: parseInt(d.passing_marks, 10),
            display_order:         i,
          })),
        },
        authToken,
      );
      setSavedExamTypes(saved);
      Alert.alert('Saved', `${saved.length} exam type(s) saved.`);
    } catch (err) {
      Alert.alert('Save Error', (err as Error).message);
    } finally {
      setSavingTypes(false);
    }
  };

  // ── Configure terms ───────────────────────────────────────
  const configureTerms = async () => {
    setSavingTerms(true);
    try {
      const saved = await API<Term[]>(
        '/admin/terms/configure',
        'POST',
        { academic_year_id: academicYearId, term_count: termCount },
        authToken,
      );
      setSavedTerms(saved);
      Alert.alert('Saved', `${saved.length} term(s) configured.`);
    } catch (err) {
      Alert.alert('Configure Error', (err as Error).message);
    } finally {
      setSavingTerms(false);
    }
  };

  // ── Generate exams ────────────────────────────────────────
  const generateExams = async () => {
    if (savedExamTypes.length === 0) {
      Alert.alert('Not Ready', 'Save exam types before generating exams.');
      return;
    }
    if (savedTerms.length === 0) {
      Alert.alert('Not Ready', 'Configure terms before generating exams.');
      return;
    }

    Alert.alert(
      'Generate Exams',
      `This will create ${preview.length} exam(s) in the database.\nAlready-existing exams will be skipped. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setGenerating(true);
            try {
              const result = await API<{ created: unknown[]; skipped: number }>(
                '/admin/terms/generate-exams',
                'POST',
                { academic_year_id: academicYearId },
                authToken,
              );
              Alert.alert(
                'Done',
                `${result.created.length} exam(s) created.\n${result.skipped} already existed.`,
              );
            } catch (err) {
              Alert.alert('Error', (err as Error).message);
            } finally {
              setGenerating(false);
            }
          },
        },
      ],
    );
  };

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading configuration…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Academic Configuration</Text>
        <Text style={styles.headerSub}>Define exam types and term structure</Text>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(['types', 'terms', 'preview'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'types' ? `Exam Types (${examTypeDrafts.length})` :
               tab === 'terms' ? `Terms (${termCount})` :
               `Preview (${preview.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* ── TAB: Exam Types ─────────────────────────────── */}
        {activeTab === 'types' && (
          <View>
            <Text style={styles.sectionHint}>
              Define exam templates. These are reused across all terms.
            </Text>

            {examTypeDrafts.map((draft, idx) => (
              <View key={draft.key} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardIndex}>Type {idx + 1}</Text>
                  <TouchableOpacity onPress={() => removeType(draft.key)}>
                    <Text style={styles.removeBtn}>✕ Remove</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.row}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Code *</Text>
                    <TextInput
                      style={styles.input}
                      value={draft.code}
                      onChangeText={(v) => updateDraft(draft.key, 'code', v)}
                      placeholder="MT"
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="characters"
                      maxLength={10}
                    />
                  </View>
                  <View style={[styles.field, { flex: 2, marginLeft: 8 }]}>
                    <Text style={styles.label}>Label *</Text>
                    <TextInput
                      style={styles.input}
                      value={draft.label}
                      onChangeText={(v) => updateDraft(draft.key, 'label', v)}
                      placeholder="Mid Term"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Max Marks</Text>
                    <TextInput
                      style={styles.input}
                      value={draft.max_marks}
                      onChangeText={(v) => updateDraft(draft.key, 'max_marks', v)}
                      keyboardType="numeric"
                      placeholder="100"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={[styles.field, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.label}>Pass Marks</Text>
                    <TextInput
                      style={styles.input}
                      value={draft.passing_marks}
                      onChangeText={(v) => updateDraft(draft.key, 'passing_marks', v)}
                      keyboardType="numeric"
                      placeholder="35"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.addBtn} onPress={addType}>
              <Text style={styles.addBtnText}>+ Add Exam Type</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, savingTypes && styles.btnDisabled]}
              onPress={saveExamTypes}
              disabled={savingTypes}
            >
              {savingTypes
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Save Exam Types</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── TAB: Terms ──────────────────────────────────── */}
        {activeTab === 'terms' && (
          <View>
            <Text style={styles.sectionHint}>
              Select how many terms this academic year has (1–3).
            </Text>

            <View style={styles.termPicker}>
              {([1, 2, 3] as const).map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.termOption,
                    termCount === n && { backgroundColor: TERM_COLORS[n - 1], borderColor: TERM_COLORS[n - 1] },
                  ]}
                  onPress={() => setTermCount(n)}
                >
                  <Text style={[
                    styles.termOptionText,
                    termCount === n && { color: '#fff', fontWeight: '700' },
                  ]}>
                    {n} {n === 1 ? 'Term' : 'Terms'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Visual term timeline */}
            <View style={styles.termTimeline}>
              {Array.from({ length: termCount }, (_, i) => (
                <View key={i} style={styles.termTimelineItem}>
                  <View style={[styles.termDot, { backgroundColor: TERM_COLORS[i] }]} />
                  <Text style={styles.termTimelineLabel}>Term {i + 1}</Text>
                  {i < termCount - 1 && <View style={styles.termConnector} />}
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, savingTerms && styles.btnDisabled]}
              onPress={configureTerms}
              disabled={savingTerms}
            >
              {savingTerms
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Save Term Configuration</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── TAB: Preview ────────────────────────────────── */}
        {activeTab === 'preview' && (
          <View>
            <Text style={styles.sectionHint}>
              Live preview of exams that will be generated.{'\n'}
              Each row is one exam in the database.
            </Text>

            {preview.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyText}>
                  Save exam types and configure terms to see a preview.
                </Text>
              </View>
            ) : (
              <>
                {/* Group by term */}
                {Array.from({ length: termCount }, (_, ti) => {
                  const termItems = preview.filter((p) => p.term_number === ti + 1);
                  if (termItems.length === 0) return null;
                  return (
                    <View key={ti} style={styles.previewGroup}>
                      <View style={[styles.previewGroupHeader, { backgroundColor: TERM_COLORS[ti] }]}>
                        <Text style={styles.previewGroupTitle}>Term {ti + 1}</Text>
                        <Text style={styles.previewGroupCount}>{termItems.length} exams</Text>
                      </View>
                      {termItems.map((item) => (
                        <View key={item.name} style={styles.previewRow}>
                          <View style={[styles.examCodeBadge, { backgroundColor: TERM_COLORS[ti] + '20' }]}>
                            <Text style={[styles.examCode, { color: TERM_COLORS[ti] }]}>
                              {item.name}
                            </Text>
                          </View>
                          <View style={styles.previewRowDetails}>
                            <Text style={styles.previewRowLabel}>{item.label}</Text>
                            <Text style={styles.previewRowMeta}>Max: {item.max_marks} marks</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={[styles.generateBtn, generating && styles.btnDisabled]}
                  onPress={generateExams}
                  disabled={generating}
                >
                  {generating
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <>
                        <Text style={styles.generateBtnIcon}>⚡</Text>
                        <Text style={styles.generateBtnText}>
                          Generate {preview.length} Exams
                        </Text>
                      </>
                    )
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f8fafc' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:{ marginTop: 12, color: '#64748b', fontSize: 14 },

  header:     { backgroundColor: '#1e293b', paddingHorizontal: 20, paddingVertical: 20, paddingTop: 48 },
  headerTitle:{ fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub:  { fontSize: 13, color: '#94a3b8', marginTop: 4 },

  // Tabs
  tabBar:       { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tab:          { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:    { borderBottomWidth: 2, borderBottomColor: '#3b82f6' },
  tabText:      { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  tabTextActive:{ color: '#3b82f6', fontWeight: '600' },

  body:       { flex: 1, padding: 16 },
  sectionHint:{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 18 },

  // Cards
  card:       { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardIndex:  { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  removeBtn:  { fontSize: 13, color: '#ef4444' },

  row:        { flexDirection: 'row', marginBottom: 8 },
  field:      {},
  label:      { fontSize: 12, fontWeight: '500', color: '#475569', marginBottom: 4 },
  input:      { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1e293b', backgroundColor: '#f8fafc' },

  addBtn:     { borderWidth: 1, borderColor: '#3b82f6', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 16, borderStyle: 'dashed' },
  addBtnText: { color: '#3b82f6', fontWeight: '600', fontSize: 14 },

  primaryBtn:     { backgroundColor: '#3b82f6', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled:    { opacity: 0.6 },

  // Term picker
  termPicker:       { flexDirection: 'row', gap: 12, marginBottom: 24 },
  termOption:       { flex: 1, borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 10, padding: 16, alignItems: 'center', backgroundColor: '#fff' },
  termOptionText:   { fontSize: 14, color: '#64748b', fontWeight: '500' },

  // Timeline
  termTimeline:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, paddingVertical: 16, backgroundColor: '#fff', borderRadius: 12 },
  termTimelineItem: { alignItems: 'center', position: 'relative' },
  termDot:          { width: 32, height: 32, borderRadius: 16, marginBottom: 6 },
  termTimelineLabel:{ fontSize: 12, color: '#475569', fontWeight: '500' },
  termConnector:    { position: 'absolute', top: 16, left: 32, right: -16, height: 2, backgroundColor: '#e2e8f0' },

  // Preview
  previewGroup:       { marginBottom: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  previewGroupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  previewGroupTitle:  { fontSize: 14, fontWeight: '700', color: '#fff' },
  previewGroupCount:  { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  previewRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  examCodeBadge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginRight: 12 },
  examCode:           { fontSize: 13, fontWeight: '700' },
  previewRowDetails:  { flex: 1 },
  previewRowLabel:    { fontSize: 14, color: '#1e293b', fontWeight: '500' },
  previewRowMeta:     { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  // Generate button
  generateBtn:     { backgroundColor: '#10b981', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, gap: 8 },
  generateBtnIcon: { fontSize: 18 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon:  { fontSize: 40, marginBottom: 12 },
  emptyText:  { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
});

export default AcademicConfigScreen;
