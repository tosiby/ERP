// =============================================================
// KJSIS — Report Settings Screen
// Configure school-level report card display options.
// Role: super_admin / exam_cell only.
// =============================================================

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Switch, RefreshControl,
} from 'react-native';
import type { ReportSettings } from '../types/reports-v2';

const API_BASE = 'http://localhost:4000/api';

async function fetchSettings(academicYearId: string, token: string): Promise<ReportSettings | null> {
  const res = await fetch(`${API_BASE}/reports-v2/settings?academic_year_id=${academicYearId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!json.success) return null;
  return json.data;
}

async function saveSettings(settings: Partial<ReportSettings> & { academic_year_id: string }, token: string): Promise<ReportSettings> {
  const res = await fetch(`${API_BASE}/reports-v2/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(settings),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to save settings');
  return json.data;
}

// ─── Toggle Row Component ─────────────────────────────────────
interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (val: boolean) => void;
}

function ToggleRow({ label, description, value, onChange }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
        thumbColor={value ? '#fff' : '#f4f3f4'}
      />
    </View>
  );
}

// ─── Text Field Component ─────────────────────────────────────
interface FieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  multiline?: boolean;
}

function Field({ label, value, onChange, placeholder, multiline }: FieldProps) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        multiline={multiline}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────
interface ReportSettingsScreenProps {
  academicYearId: string;
  academicYearLabel: string;
  token: string;
}

export default function ReportSettingsScreen({ academicYearId, academicYearLabel, token }: ReportSettingsScreenProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Form state
  const [schoolName, setSchoolName] = useState('K.J. School');
  const [logoUrl, setLogoUrl] = useState('');
  const [principalName, setPrincipalName] = useState('');
  const [showRank, setShowRank] = useState(true);
  const [showAttendance, setShowAttendance] = useState(true);
  const [showInsights, setShowInsights] = useState(true);
  const [showAiRemarks, setShowAiRemarks] = useState(true);
  const [footerText, setFooterText] = useState('');

  const applySettings = (s: ReportSettings) => {
    setSchoolName(s.school_name);
    setLogoUrl(s.logo_url ?? '');
    setPrincipalName(s.principal_name ?? '');
    setShowRank(s.show_rank);
    setShowAttendance(s.show_attendance);
    setShowInsights(s.show_insights);
    setShowAiRemarks(s.show_ai_remarks);
    setFooterText(s.footer_text ?? '');
    setDirty(false);
  };

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const s = await fetchSettings(academicYearId, token);
      if (s) applySettings(s);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [academicYearId, token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveSettings({
        academic_year_id: academicYearId,
        school_name: schoolName.trim() || undefined,
        logo_url: logoUrl.trim() || null,
        principal_name: principalName.trim() || null,
        show_rank: showRank,
        show_attendance: showAttendance,
        show_insights: showInsights,
        show_ai_remarks: showAiRemarks,
        footer_text: footerText.trim() || null,
      }, token);
      applySettings(saved);
      Alert.alert('Saved', 'Report settings saved successfully.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const markDirty = (setter: (v: any) => void) => (v: any) => { setter(v); setDirty(true); };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Report Card Settings</Text>
        <Text style={styles.headerSub}>{academicYearLabel}</Text>
      </View>

      {/* School Identity */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>School Identity</Text>
        <Field
          label="School Name"
          value={schoolName}
          onChange={markDirty(setSchoolName)}
          placeholder="e.g. K.J. School"
        />
        <Field
          label="Logo URL"
          value={logoUrl}
          onChange={markDirty(setLogoUrl)}
          placeholder="https://... (optional)"
        />
        <Field
          label="Principal's Name"
          value={principalName}
          onChange={markDirty(setPrincipalName)}
          placeholder="e.g. Dr. Rajesh Kumar"
        />
        <Field
          label="Footer Text"
          value={footerText}
          onChange={markDirty(setFooterText)}
          placeholder="e.g. This report is computer generated."
          multiline
        />
      </View>

      {/* Display Options */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Display Options</Text>
        <Text style={styles.cardDesc}>
          Control what information appears on printed progress cards and PDFs.
        </Text>

        <ToggleRow
          label="Show Class Rank"
          description="Display student's rank within division on the report card."
          value={showRank}
          onChange={markDirty(setShowRank)}
        />
        <View style={styles.divider} />

        <ToggleRow
          label="Show Attendance"
          description="Include attendance percentage and present/absent days."
          value={showAttendance}
          onChange={markDirty(setShowAttendance)}
        />
        <View style={styles.divider} />

        <ToggleRow
          label="Show AI Insights"
          description="Display performance insights section on consolidated reports."
          value={showInsights}
          onChange={markDirty(setShowInsights)}
        />
        <View style={styles.divider} />

        <ToggleRow
          label="Show AI-Generated Remarks"
          description="Show teacher remarks section (manually edited or AI generated)."
          value={showAiRemarks}
          onChange={markDirty(setShowAiRemarks)}
        />
      </View>

      {/* Preview Banner */}
      <View style={styles.previewBanner}>
        <Text style={styles.previewTitle}>Report Card Preview</Text>
        <View style={styles.previewCard}>
          <Text style={styles.previewSchoolName}>{schoolName || 'School Name'}</Text>
          <Text style={styles.previewSubtitle}>Progress Card — {academicYearLabel}</Text>
          <View style={styles.previewRow}>
            {showRank && <View style={styles.previewPill}><Text style={styles.previewPillText}>Rank: 3/40</Text></View>}
            {showAttendance && <View style={styles.previewPill}><Text style={styles.previewPillText}>Attend: 89%</Text></View>}
          </View>
          {showAiRemarks && (
            <View style={styles.previewRemark}>
              <Text style={styles.previewRemarkText}>
                <Text style={{ fontWeight: '600' }}>Remarks: </Text>
                {principalName ? `Verified by ${principalName}` : 'Teacher remarks will appear here.'}
              </Text>
            </View>
          )}
          <View style={styles.previewSig}>
            <Text style={styles.previewSigLine}>_________</Text>
            <Text style={styles.previewSigName}>{principalName || 'Principal'}</Text>
          </View>
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveBtn, !dirty && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !dirty}
      >
        {saving
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.saveBtnText}>{dirty ? 'Save Changes' : 'No Changes'}</Text>}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#6b7280', fontSize: 14 },

  header: { backgroundColor: '#1e40af', padding: 20, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#bfdbfe', fontSize: 13, marginTop: 2 },

  card: { backgroundColor: '#fff', margin: 12, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#6b7280', marginBottom: 14 },

  fieldRow: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 13, color: '#111' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: '#111', marginBottom: 2 },
  toggleDesc: { fontSize: 11, color: '#6b7280' },
  divider: { height: 1, backgroundColor: '#f3f4f6' },

  previewBanner: { margin: 12, marginBottom: 0 },
  previewTitle: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  previewCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: '#e5e7eb', elevation: 1 },
  previewSchoolName: { fontSize: 15, fontWeight: '700', color: '#1e40af', textAlign: 'center' },
  previewSubtitle: { fontSize: 11, color: '#6b7280', textAlign: 'center', marginBottom: 10 },
  previewRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  previewPill: { backgroundColor: '#dbeafe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  previewPillText: { fontSize: 11, color: '#1d4ed8', fontWeight: '600' },
  previewRemark: { backgroundColor: '#f9fafb', borderRadius: 6, padding: 8, marginBottom: 12 },
  previewRemarkText: { fontSize: 11, color: '#374151', lineHeight: 16 },
  previewSig: { alignItems: 'flex-end', marginTop: 8 },
  previewSigLine: { color: '#374151', fontSize: 13 },
  previewSigName: { fontSize: 10, color: '#6b7280' },

  saveBtn: { margin: 12, marginTop: 16, backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#93c5fd' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
