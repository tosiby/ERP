// =============================================================
// KJSIS — Express App Setup (Phase 2)
// =============================================================

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// ── Phase 1 Routes ────────────────────────────────────────────
import authRoutes       from './routes/auth.routes';
import marksRoutes      from './routes/marks.routes';
import attendanceRoutes from './routes/attendance.routes';
import adminRoutes      from './routes/admin.routes';
import reportsRoutes    from './routes/reports.routes';

// ── Phase 2 Routes ────────────────────────────────────────────
import studentImportRoutes from './routes/student-import.routes';
import notificationRoutes  from './routes/notifications.routes';
import aiInsightsRoutes    from './routes/ai-insights.routes';

// ── Phase 3 Routes ────────────────────────────────────────────
import termsRoutes from './routes/terms.routes';

import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';

const app = express();

// ── Security ─────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);  // trust X-Forwarded-For (needed for rate limiting behind proxy)
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }),
);

// ── Rate Limiting ────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX ?? '200'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests', code: 'RATE_LIMITED' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many login attempts', code: 'RATE_LIMITED' },
});

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 20,                     // 20 imports per hour
  message: { success: false, error: 'Import rate limit exceeded', code: 'RATE_LIMITED' },
});

app.use(globalLimiter);

// ── Body Parsing & Compression ───────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ── HTTP Logging ─────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
    }),
  );
}

// ── Health Check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
    },
  });
});

// ── API v1 Routes ─────────────────────────────────────────────
const api = express.Router();

// Phase 1
api.use('/auth',               authLimiter, authRoutes);
api.use('/marks',              marksRoutes);
api.use('/attendance',         attendanceRoutes);
api.use('/admin',              adminRoutes);
api.use('/reports',            reportsRoutes);

// Phase 2
api.use('/admin/students',     importLimiter, studentImportRoutes);
api.use('/notifications',      notificationRoutes);
api.use('/ai',                 aiInsightsRoutes);

// Phase 3
api.use('/admin/terms',        termsRoutes);

app.use('/api', api);

// ── 404 + Error Handling ─────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
