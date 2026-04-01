// =============================================================
// KJSIS — CSV Parser Utility
// Handles: BOM stripping, tab pollution, quoted fields,
//          empty lines, whitespace trimming
// =============================================================

import fs from 'fs';
import path from 'path';

export type CsvRow = Record<string, string>;

export interface ParseResult {
  rows: CsvRow[];
  headers: string[];
  totalLines: number;
  skippedLines: number;
}

/**
 * Synchronously parse a CSV file.
 * - Strips UTF-8 BOM
 * - Normalises CRLF → LF
 * - Trims all cell values
 * - Skips blank rows
 * - Returns typed row objects keyed by header
 */
export const parseCsv = (filePath: string): ParseResult => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  let raw = fs.readFileSync(filePath, 'utf-8');

  // Strip UTF-8 BOM
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  // Normalise line endings
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  if (lines.length === 0) throw new Error(`CSV file is empty: ${filePath}`);

  // Parse header row (first non-empty line)
  const headerLine = lines[0].trim();
  const headers = splitCsvLine(headerLine).map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'));

  const rows: CsvRow[] = [];
  let skippedLines = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { skippedLines++; continue; }

    const cells = splitCsvLine(line);
    if (cells.every((c) => !c.trim())) { skippedLines++; continue; }

    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header] = (cells[idx] ?? '').trim();
    });

    rows.push(row);
  }

  return { rows, headers, totalLines: lines.length - 1, skippedLines };
};

/**
 * Split a single CSV line respecting quoted fields.
 * e.g. '"ADITI A K",1854,I,A,1' → ['ADITI A K', '1854', 'I', 'A', '1']
 */
const splitCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
};

/** Resolve a file path relative to the import/ directory */
export const importFile = (filename: string): string => {
  return path.resolve(__dirname, '..', filename);
};
