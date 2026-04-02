// =============================================================
// KJSIS — Bulk Export Screen
//
// Allows exam_cell / leadership to bulk-export progress cards
// for an entire division as a ZIP of individual PDFs.
//
// Flow:
//   1. Select Class → Division → Academic Year → (optional) Term
//   2. Preview: shows student count + estimated time
//   3. Export: POST /api/reports/bulk-progress-cards → ZIP download
//
// Props:
//   token        — Bearer auth token
//   userRole     — to gate UI elements
// =============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking,
} from 'react-native';

const API_BASE = 'http://localhost:4000/api';

// ─── Types ────────────────────────────────────────────────────
interface ClassOption   { id: string; name: string; grade_number: number }
interface DivisionOption { id: string; name: string }
interface TermOption    { id: string; name: string; term_number: number }
interface AcademicYear  { id: string; label: string; is_current: boolean }

// ─── API helpers ──────────────────────────────────────────────
async function fetchClasses(token: string): Promise<ClassOption[]> {
  const res = await fetch(`${API_BASE}/admin/classes`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  return j.success ? j.data : [];
}

async function fetchDivisions(classId: string, token: string): Promise<DivisionOption[]> {
  const res = await fetch(`${API_BASE}/admin/classes/${classId}/divisions`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  return j.success ? j.data : [];
}

async function fetchTerms(academicYearId: string, token: string): Promise<TermOption[]> {
  const res = await fetch(`${API_BASE}/admin/terms?academic_year_id=${academicYearId}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  return j.success ? j.data : [];
}

async function fetchAcademicYears(token: string): Promise<AcademicYear[]> {
  const res = await fetch(`${API_BASE}/admin/academic-years`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  return j.success ? j.data : [];
}

async function fetchStudentCount(divisionId: string, academicYearId: string, token: string): Promise<number> {
  const res = await fetch(
    `${API_BASE}/admin/students/count?division_id=${divisionId}&academic_year_id=${academicYearId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const j = await res.json();
  return j.success ? (j.data?.count ?? 0) : 0;
}

// ─── Picker Component ─────────────────────────────────────────
interface PickerProps<T extends { id: string }> {
  label: string;
  options: T[];
  selected: string | null;
  onSelect: (id: string) => void;
  labelKey: keyof T;
  disabled?: boolean;
  placeholder?: string;
}

function Picker<T extends { id: string }>({
  label, options, selected, onSelect, labelKey, disabled, placeholder,
}: PickerProps<T>) {
  const [open, setOpen] = useState(false);
  const selectedItem = options.find((o) => o.id === selected);

  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.pickerBtn, disabled && styles.pickerBtnDisabled]}
        onPress={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
      >
        <Text style={[styles.pickerBtnText, !selectedItem && { color: '#9ca3af' }]}>
          {selectedItem ? String(selectedItem[labelKey]) : (placeholder ?? 'Select…')}
        </Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.dropdown}>
          <TouchableOpacity style={styles.dropdownItem} onPress={() => { onSelect(''); setOpen(false); }}>
            <Text style={[styles.dropdownText, { color: '#9ca3af' }]}>{placeholder ?? 'None'}</Text>
          </TouchableOpacity>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[styles.dropdownItem, opt.id === selected && styles.dropdownItemActive]}
              onPress={() => { onSelect(opt.id); setOpen(false); }}
            >
              <Text style={[styles.dropdownText, opt.id === selected && styles.dropdownTextActive]}>
                {String(opt[labelKey])}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────
interface BulkExportScreenProps {
  token: string;
}

export default function BulkExportScreen({ token }: BulkExportScreenProps) {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);

  const [selectedYear, setSelectedYear]     = useState<string>('');
  const [selectedClass, setSelectedClass]   = useState<string>('');
  const [selectedDiv, setSelectedDiv]       = useState<string>('');
  const [selectedTerm, setSelectedTerm]     = useState<string>('');

  const [studentCount, setStudentCount]     = useState<number | null>(null);
  const [loadingCount, setLoadingCount]     = useState(false);
  const [exporting, setExporting]           = useState(false);
  const [lastExportStats, setLastExportStats] = useState<{ success: number; failed: number } | null>(null);

  // Load academic years + classes on mount
  useEffect(() => {
    Promise.all([fetchAcademicYears(token), fetchClasses(token)]).then(([years, cls]) => {
      setAcademicYears(years);
      setClasses(cls);
      const current = years.find((y) => y.is_current);
      if (current) setSelectedYear(current.id);
    });
  }, [token]);

  // Load terms when year changes
  useEffect(() => {
    if (!selectedYear) { setTerms([]); return; }
    fetchTerms(selectedYear, token).then(setTerms);
  }, [selectedYear, token]);

  // Load divisions when class changes
  useEffect(() => {
    if (!selectedClass) { setDivisions([]); setSelectedDiv(''); return; }
    fetchDivisions(selectedClass, token).then(setDivisions);
    setSelectedDiv('');
  }, [selectedClass, token]);

  // Load student count when division + year known
  useEffect(() => {
    if (!selectedDiv || !selectedYear) { setStudentCount(null); return; }
    setLoadingCount(true);
    fetchStudentCount(selectedDiv, selectedYear, token)
      .then(setStudentCount)
      .finally(() => setLoadingCount(false));
  }, [selectedDiv, selectedYear, token]);

  const canExport = Boolean(selectedDiv && selectedYear);
  const selectedDivObj = divisions.find((d) => d.id === selectedDiv);
  const selectedClassObj = classes.find((c) => c.id === selectedClass);
  const selectedYearObj = academicYears.find((y) => y.id === selectedYear);
  const selectedTermObj = terms.find((t) => t.id === selectedTerm);

  // Estimated time: ~4 seconds per PDF (Puppeteer + DB)
  const estimatedSeconds = studentCount ? studentCount * 4 : 0;
  const estimatedStr = estimatedSeconds < 60
    ? `~${estimatedSeconds}s`
    : `~${Math.ceil(estimatedSeconds / 60)} min`;

  const handleExport = async () => {
    if (!canExport) return;

    Alert.alert(
      'Confirm Bulk Export',
      `Generate progress card PDFs for all ${studentCount ?? '?'} students in ${selectedClassObj?.name} Div ${selectedDivObj?.name}?`
        + `\n\nEstimated time: ${estimatedStr}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          style: 'default',
          onPress: () => triggerExport(),
        },
      ],
    );
  };

  const triggerExport = async () => {
    setExporting(true);
    setLastExportStats(null);

    try {
      // The bulk endpoint streams a ZIP. We open it via Linking so the
      // browser handles the download natively.
      // We POST the params as a JSON body — browsers can't POST via Linking,
      // so we build a temporary URL with a GET-friendly approach:
      // Backend reads from request body for POST /bulk-progress-cards.
      // For browser download, we use a helper redirect endpoint or Fetch+Blob.

      const body: Record<string, string> = {
        division_id: selectedDiv,
        academic_year_id: selectedYear,
      };
      if (selectedTerm) body.term_id = selectedTerm;

      // Fetch the ZIP as a blob (works in React Native 0.73+ and Expo SDK 50+)
      const res = await fetch(`${API_BASE}/reports/bulk-progress-cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error ?? 'Export failed');
      }

      // Try to get X-Export-Stats header if present
      const statsHeader = res.headers.get('X-Export-Stats');
      if (statsHeader) {
        try { setLastExportStats(JSON.parse(statsHeader)); } catch { /* ignore */ }
      }

      // React Native can't save blobs directly — open via Linking with auth token
      // as a fallback (browser will trigger download)
      const params = new URLSearchParams({
        division_id: selectedDiv,
        academic_year_id: selectedYear,
        token: token,
      });
      if (selectedTerm) params.set('term_id', selectedTerm);

      // Open the GET-compatible bulk URL in browser
      const downloadUrl = `${API_BASE}/reports/bulk-progress-cards/download?${params}`;
      await Linking.openURL(downloadUrl);

      Alert.alert('Export Started', 'Your ZIP file is being prepared. Check your browser downloads.');
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bulk Progress Card Export</Text>
        <Text style={styles.headerSub}>Generate ZIP of all students' PDFs in one click</Text>
      </View>

      {/* Selection Form */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Select Division</Text>

        <Picker
          label="Academic Year"
          options={academicYears}
          selected={selectedYear}
          onSelect={setSelectedYear}
          labelKey="label"
          placeholder="Select year…"
        />

        <Picker
          label="Class"
          options={classes}
          selected={selectedClass}
          onSelect={setSelectedClass}
          labelKey="name"
          placeholder="Select class…"
          disabled={!selectedYear}
        />

        <Picker
          label="Division"
          options={divisions}
          selected={selectedDiv}
          onSelect={setSelectedDiv}
          labelKey="name"
          placeholder="Select division…"
          disabled={!selectedClass || divisions.length === 0}
        />

        <Picker
          label="Term (optional — leave blank for full year)"
          options={terms}
          selected={selectedTerm}
          onSelect={setSelectedTerm}
          labelKey="name"
          placeholder="Full Year (all terms)"
          disabled={terms.length === 0}
        />
      </View>

      {/* Preview Card */}
      {selectedDiv && selectedYear && (
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Export Preview</Text>

          <View style={styles.previewRow}>
            <View style={styles.previewItem}>
              <Text style={styles.previewLabel}>Class</Text>
              <Text style={styles.previewValue}>{selectedClassObj?.name ?? '—'} Div {selectedDivObj?.name ?? '—'}</Text>
            </View>
            <View style={styles.previewItem}>
              <Text style={styles.previewLabel}>Year</Text>
              <Text style={styles.previewValue}>{selectedYearObj?.label ?? '—'}</Text>
            </View>
          </View>

          <View style={styles.previewRow}>
            <View style={styles.previewItem}>
              <Text style={styles.previewLabel}>Term</Text>
              <Text style={styles.previewValue}>{selectedTermObj?.name ?? 'Full Year'}</Text>
            </View>
            <View style={styles.previewItem}>
              <Text style={styles.previewLabel}>Students</Text>
              {loadingCount
                ? <ActivityIndicator size="small" color="#3b82f6" />
                : <Text style={[styles.previewValue, { color: '#2563eb' }]}>{studentCount ?? '—'}</Text>}
            </View>
          </View>

          {studentCount !== null && studentCount > 0 && (
            <View style={styles.estimateRow}>
              <Text style={styles.estimateIcon}>⏱</Text>
              <Text style={styles.estimateText}>
                Estimated generation time: {estimatedStr} for {studentCount} PDFs
              </Text>
            </View>
          )}

          {studentCount === 0 && (
            <View style={styles.warningRow}>
              <Text style={styles.warningText}>No students found in this division for the selected year.</Text>
            </View>
          )}
        </View>
      )}

      {/* Last Export Stats */}
      {lastExportStats && (
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Last Export Result</Text>
          <View style={styles.statsRow}>
            <View style={[styles.statPill, { backgroundColor: '#dcfce7' }]}>
              <Text style={[styles.statValue, { color: '#15803d' }]}>{lastExportStats.success}</Text>
              <Text style={styles.statLabel}>Generated</Text>
            </View>
            <View style={[styles.statPill, { backgroundColor: '#fee2e2' }]}>
              <Text style={[styles.statValue, { color: '#dc2626' }]}>{lastExportStats.failed}</Text>
              <Text style={styles.statLabel}>Failed</Text>
            </View>
          </View>
        </View>
      )}

      {/* Export Button */}
      <TouchableOpacity
        style={[styles.exportBtn, (!canExport || exporting || studentCount === 0) && styles.exportBtnDisabled]}
        onPress={handleExport}
        disabled={!canExport || exporting || studentCount === 0}
        activeOpacity={0.85}
      >
        {exporting ? (
          <View style={styles.exportingRow}>
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.exportBtnText}>Generating PDFs…</Text>
          </View>
        ) : (
          <Text style={styles.exportBtnText}>
            {canExport
              ? `Export ${studentCount ? `${studentCount} ` : ''}Progress Cards as ZIP`
              : 'Select a division to export'}
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.tipCard}>
        <Text style={styles.tipTitle}>Tips</Text>
        <Text style={styles.tipText}>• Each PDF is one student's full progress card (A4).</Text>
        <Text style={styles.tipText}>• Full Year view shows all terms' marks in one card.</Text>
        <Text style={styles.tipText}>• Per-Term view shows only that term's exams (e.g. MT1, IA1, TERM1).</Text>
        <Text style={styles.tipText}>• Generate AI remarks before exporting for richer cards.</Text>
        <Text style={styles.tipText}>• Large classes (40+ students) may take 3–4 minutes.</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },

  header: { backgroundColor: '#1e40af', padding: 20, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#bfdbfe', fontSize: 12, marginTop: 2, textAlign: 'center' },

  card: { backgroundColor: '#fff', margin: 12, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 12 },

  pickerWrap: { marginBottom: 14, zIndex: 10 },
  pickerLabel: { fontSize: 11, fontWeight: '600', color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 11, backgroundColor: '#fff' },
  pickerBtnDisabled: { backgroundColor: '#f9fafb', borderColor: '#e5e7eb' },
  pickerBtnText: { fontSize: 13, color: '#111', flex: 1 },
  chevron: { fontSize: 10, color: '#9ca3af', marginLeft: 8 },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, zIndex: 100, elevation: 10, maxHeight: 200 },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropdownItemActive: { backgroundColor: '#eff6ff' },
  dropdownText: { fontSize: 13, color: '#111' },
  dropdownTextActive: { color: '#2563eb', fontWeight: '600' },

  previewCard: { backgroundColor: '#fff', margin: 12, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 1, borderWidth: 1.5, borderColor: '#dbeafe' },
  previewTitle: { fontSize: 13, fontWeight: '700', color: '#1e40af', marginBottom: 12 },
  previewRow: { flexDirection: 'row', marginBottom: 10, gap: 12 },
  previewItem: { flex: 1 },
  previewLabel: { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  previewValue: { fontSize: 14, fontWeight: '600', color: '#111' },

  estimateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6, backgroundColor: '#fffbeb', borderRadius: 6, padding: 8 },
  estimateIcon: { fontSize: 14 },
  estimateText: { fontSize: 12, color: '#92400e' },

  warningRow: { backgroundColor: '#fee2e2', borderRadius: 6, padding: 8, marginTop: 6 },
  warningText: { fontSize: 12, color: '#b91c1c' },

  statsCard: { backgroundColor: '#fff', margin: 12, marginBottom: 0, borderRadius: 12, padding: 14, elevation: 1 },
  statsTitle: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 10 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statPill: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },

  exportBtn: { margin: 12, marginTop: 16, backgroundColor: '#2563eb', borderRadius: 12, padding: 18, alignItems: 'center' },
  exportBtnDisabled: { backgroundColor: '#93c5fd' },
  exportBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  exportingRow: { flexDirection: 'row', alignItems: 'center' },

  tipCard: { backgroundColor: '#f0f9ff', margin: 12, marginBottom: 0, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#bae6fd' },
  tipTitle: { fontSize: 12, fontWeight: '700', color: '#0369a1', marginBottom: 8 },
  tipText: { fontSize: 11, color: '#0c4a6e', marginBottom: 4, lineHeight: 16 },
});
