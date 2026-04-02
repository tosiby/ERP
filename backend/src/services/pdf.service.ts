// =============================================================
// KJSIS — PDF Generation Service
//
// Uses a singleton Puppeteer browser instance (one per process).
// Pages are created per-request and closed immediately after.
//
// Exports:
//   htmlToPdf()                — generic HTML → Buffer
//   generateProgressCardPdf()  — FullReport → PDF Buffer
//   streamBulkProgressCards()  — generator → ZIP stream
// =============================================================

import puppeteer, { Browser } from 'puppeteer';
import archiver from 'archiver';
import { Response } from 'express';
import { logger } from '../utils/logger';
import { FullReport } from './reportBuilder.service';
import { renderProgressCard } from '../templates/progress-card.template';
import { renderConsolidatedReport } from '../templates/consolidated-report.template';
import { ConsolidatedReport } from '../types';

// ─── Singleton Browser ────────────────────────────────────────

let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser?.connected) return _browser;
  if (_launching) return _launching;

  _launching = puppeteer
    .launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',   // essential on constrained servers
      ],
    })
    .then((b) => {
      _browser = b;
      _launching = null;
      logger.info('Puppeteer browser launched');
      return b;
    });

  return _launching;
}

// Graceful shutdown
['exit', 'SIGTERM', 'SIGINT'].forEach((sig) =>
  process.once(sig, () => { _browser?.close().catch(() => {}); }),
);

// ─── Core: HTML → PDF Buffer ──────────────────────────────────

export async function htmlToPdf(
  html: string,
  options?: { landscape?: boolean; format?: 'A4' | 'A3' | 'Letter' },
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });
    const raw = await page.pdf({
      format: options?.format ?? 'A4',
      landscape: options?.landscape ?? false,
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });
    return Buffer.from(raw);
  } finally {
    await page.close();
  }
}

// ─── Progress Card PDF ────────────────────────────────────────

export async function generateProgressCardPdf(report: FullReport): Promise<Buffer> {
  const html = renderProgressCard(report);
  return htmlToPdf(html, { format: 'A4' });
}

// ─── Consolidated Report PDF ──────────────────────────────────

export async function generateConsolidatedPdf(
  report: ConsolidatedReport,
  academicYearLabel: string,
  schoolName?: string,
): Promise<Buffer> {
  const html = renderConsolidatedReport(report, academicYearLabel, schoolName);
  return htmlToPdf(html, { format: 'A3', landscape: true });
}

// ─── Bulk: Generator → ZIP Stream ────────────────────────────
//
// Accepts an AsyncGenerator that yields {name, pdfBuffer | error}.
// Streams each PDF into a ZIP archive piped directly to `res`.
// Memory usage is bounded: one PDF buffer in memory at a time.

interface BulkStats {
  success: number;
  failed: number;
  errors: Array<{ filename: string; error: string }>;
}

export async function streamBulkZip(
  res: Response,
  _zipFilename: string,
  entries: AsyncGenerator<{ filename: string; buffer?: Buffer; error?: string }>,
): Promise<BulkStats> {
  const stats: BulkStats = { success: 0, failed: 0, errors: [] };

  const archive = archiver('zip', { zlib: { level: 6 } });

  // Propagate archiver errors to response
  archive.on('error', (err) => {
    logger.error('ZIP archive error', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'ZIP generation failed' });
    }
  });

  archive.pipe(res);

  for await (const entry of entries) {
    if (entry.buffer) {
      archive.append(entry.buffer, { name: entry.filename });
      stats.success++;
    } else {
      stats.failed++;
      stats.errors.push({ filename: entry.filename, error: entry.error ?? 'Unknown' });
    }
  }

  await archive.finalize();
  return stats;
}

/**
 * High-level helper: build PDFs from a division report generator and stream as ZIP.
 * Used by the bulk-progress-cards endpoint.
 */
export async function streamBulkProgressCards(
  res: Response,
  generator: ReturnType<typeof import('./reportBuilder.service').buildDivisionReports>,
  zipFilename: string,
): Promise<BulkStats> {
  async function* toPdfEntries(): AsyncGenerator<{ filename: string; buffer?: Buffer; error?: string }> {
    for await (const item of generator) {
      const safeName = item.student.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
      const filename = `${safeName}_${item.student.admission_number}.pdf`;

      if ('error' in item && item.error) {
        yield { filename, error: item.error };
        continue;
      }

      try {
        const buffer = await generateProgressCardPdf(item.report!);
        yield { filename, buffer };
      } catch (err) {
        yield { filename, error: err instanceof Error ? err.message : 'PDF generation failed' };
      }
    }
  }

  return streamBulkZip(res, zipFilename, toPdfEntries());
}
