// =============================================================
// KJSIS — Job Scheduler
// Uses node-cron. Only starts in production-like environments.
// All jobs are wrapped in try/catch — failure never crashes server.
// =============================================================

import cron from 'node-cron';
import { logger } from '../utils/logger';
import { runAttendanceSummaryJob } from './attendance-summary.job';
import { runWeeklyReportJob }      from './weekly-report.job';
import { runAIInsightsJob }        from './ai-insights.job';

interface JobDefinition {
  name: string;
  schedule: string;   // cron expression
  handler: () => Promise<void>;
  runOnStart?: boolean;
}

const JOBS: JobDefinition[] = [
  {
    name: 'Attendance Summary',
    schedule: '0 18 * * 1-6',   // 6:00 PM Mon–Sat
    handler: runAttendanceSummaryJob,
  },
  {
    name: 'Weekly Performance Report',
    schedule: '0 7 * * 1',      // 7:00 AM every Monday
    handler: runWeeklyReportJob,
  },
  {
    name: 'AI Insights Generation',
    schedule: '0 23 * * *',     // 11:00 PM daily
    handler: runAIInsightsJob,
    runOnStart: process.env.AI_INSIGHTS_ON_START === 'true',
  },
];

export const startScheduler = (): void => {
  if (process.env.DISABLE_CRON === 'true') {
    logger.info('Cron scheduler disabled via DISABLE_CRON env');
    return;
  }

  for (const job of JOBS) {
    const isValid = cron.validate(job.schedule);
    if (!isValid) {
      logger.error(`Invalid cron expression for job "${job.name}": ${job.schedule}`);
      continue;
    }

    cron.schedule(job.schedule, async () => {
      logger.info(`[CRON] Starting: ${job.name}`);
      try {
        await job.handler();
      } catch (err) {
        logger.error(`[CRON] Job "${job.name}" failed`, { err });
      }
    });

    logger.info(`[CRON] Scheduled: ${job.name} → ${job.schedule}`);

    // Optionally warm up on server start
    if (job.runOnStart) {
      logger.info(`[CRON] Running on start: ${job.name}`);
      job.handler().catch((err) =>
        logger.error(`[CRON] On-start run failed: ${job.name}`, { err }),
      );
    }
  }

  logger.info(`[CRON] ${JOBS.length} jobs scheduled`);
};
