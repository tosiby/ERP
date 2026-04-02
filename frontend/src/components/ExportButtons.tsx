// =============================================================
// KJSIS — ExportButtons Component
//
// Reusable Download PDF + Share button pair.
// Works in both Expo and bare React Native (no native modules required).
//
// Download: opens the PDF URL in the system browser.
// Share:    uses Web Share API (Expo web) or native Share sheet (RN).
//
// Props:
//   pdfUrl       — full URL to the PDF endpoint (with auth token in query
//                  or handled by the parent via headers)
//   filename     — suggested save name for the file
//   token        — Bearer token; appended as ?token= query param
//   size         — 'sm' | 'md' | 'lg' (default 'md')
//   style        — additional container ViewStyle
// =============================================================

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, Alert, Linking, Share, ViewStyle,
} from 'react-native';

interface ExportButtonsProps {
  pdfUrl: string;
  filename?: string;
  token?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  onDownloadStart?: () => void;
  onDownloadEnd?: () => void;
}

const SIZE_MAP = {
  sm: { padding: 8,  fontSize: 11, iconSize: 13 },
  md: { padding: 12, fontSize: 13, iconSize: 15 },
  lg: { padding: 16, fontSize: 15, iconSize: 17 },
};

export default function ExportButtons({
  pdfUrl,
  filename = 'report.pdf',
  token,
  size = 'md',
  style,
  onDownloadStart,
  onDownloadEnd,
}: ExportButtonsProps) {
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Append auth token as query param so the browser can load the PDF
  // (Authorization header can't be set from Linking.openURL)
  const authenticatedUrl = token
    ? `${pdfUrl}${pdfUrl.includes('?') ? '&' : '?'}token=${token}`
    : pdfUrl;

  const { padding, fontSize, iconSize } = SIZE_MAP[size];

  const handleDownload = async () => {
    setDownloading(true);
    onDownloadStart?.();
    try {
      const supported = await Linking.canOpenURL(authenticatedUrl);
      if (!supported) {
        Alert.alert('Error', 'Cannot open PDF URL on this device.');
        return;
      }
      await Linking.openURL(authenticatedUrl);
    } catch (err) {
      Alert.alert('Download Error', err instanceof Error ? err.message : 'Failed to open PDF.');
    } finally {
      setDownloading(false);
      onDownloadEnd?.();
    }
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      await Share.share({
        message: `${filename}\n${authenticatedUrl}`,
        url: authenticatedUrl,      // iOS only — shows in native share sheet
        title: filename,
      });
    } catch (err) {
      // User cancelled share — not an error
      if (err instanceof Error && err.message !== 'User did not share') {
        Alert.alert('Share Error', err.message);
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={[styles.row, style]}>
      {/* Download PDF */}
      <TouchableOpacity
        style={[styles.btn, styles.downloadBtn, { padding }]}
        onPress={handleDownload}
        disabled={downloading}
        activeOpacity={0.8}
      >
        {downloading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Text style={[styles.icon, { fontSize: iconSize }]}>⬇</Text>
            <Text style={[styles.label, { fontSize }]}>Download PDF</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Share */}
      <TouchableOpacity
        style={[styles.btn, styles.shareBtn, { padding }]}
        onPress={handleShare}
        disabled={sharing}
        activeOpacity={0.8}
      >
        {sharing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Text style={[styles.icon, { fontSize: iconSize }]}>↑</Text>
            <Text style={[styles.label, { fontSize }]}>Share</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    gap: 6,
  },
  downloadBtn: {
    backgroundColor: '#2563eb',
  },
  shareBtn: {
    backgroundColor: '#059669',
  },
  icon: {
    color: '#fff',
    fontWeight: '700',
  },
  label: {
    color: '#fff',
    fontWeight: '700',
  },
});
