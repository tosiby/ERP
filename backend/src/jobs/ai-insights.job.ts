// =============================================================
// KJSIS — Cron Job: AI Insights Generation
// Runs: every day at 11:00 PM (after school day ends)
// Action: pre-generates AI report and warms cache
// =============================================================

import { logger } from '../utils/logger';
import { generateInsightReport } from '../services/ai-engine.service';
import { setCache } from '../utils/cache';
import { broadcastNotification } from '../services/notification.service';
import { query } from '../utils/db';
import { auditLog } from '../services/audit.service';

export const runAIInsightsJob = async (): Promise<void> => {
  logger.info('[JOB] AI insights generation starting...');

  try {
    const report = await generateInsightReport();

    // Warm the cache so first load is instant
    setCache('ai:report:school', report, 12 * 60 * 60); // 12-hour TTL overnight

    // Notify leadership if any critical insights found
    const criticalInsights = report.insights.filter((i) => i.severity === 'critical');

    if (criticalInsights.length > 0) {
      const leaders = await query<{ id: string }>(
        `SELECT id FROM users WHERE role IN ('vp', 'principal', 'super_admin') AND is_active = TRUE`,
      );

      await broadcastNotification({
        userIds: leaders.rows.map((u) => u.id),
        type:    'at_risk_alert',
        title:   `🚨 ${criticalInsights.length} Critical Alert(s) Detected`,
        message: `AI analysis has found ${report.summary.critical_students} critical-risk students and ${report.summary.weak_subjects_count} weak subjects requiring immediate attention.`,
        metadata: {
          summary:          report.summary,
          critical_count:   criticalInsights.length,
          generated_at:     report.generated_at,
        },
      });
    }

    auditLog({
      userId: null,
      action: 'create',
      entityType: 'job:ai_insights',
      metadata: {
        summary:          report.summary,
        insights_count:   report.insights.length,
        generated_at:     report.generated_at,
      },
    });

    logger.info('[JOB] AI insights complete', { summary: report.summary });
  } catch (err) {
    logger.error('[JOB] AI insights generation failed', { err });
  }
};
