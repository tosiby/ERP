// =============================================================
// KJSIS — Auth Routes (Phase 2)
// =============================================================

import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  LoginSchema,
  ChangePasswordSchema,
  RefreshTokenSchema,
  LogoutSchema,
  RegisterFcmTokenSchema,
} from '../schemas/auth.schema';

const router = Router();

// ── Public ────────────────────────────────────────────────────
router.post('/login',   validate(LoginSchema),        AuthController.login);
router.post('/refresh', validate(RefreshTokenSchema), AuthController.refresh);
router.post('/logout',  validate(LogoutSchema),       AuthController.logout);

// ── Protected ─────────────────────────────────────────────────
router.use(authenticate);

router.get('/me',                AuthController.getMyProfile);
router.post('/logout-all',       AuthController.logoutAll);
router.patch('/change-password', validate(ChangePasswordSchema), AuthController.changePassword);
router.post('/fcm-token',        validate(RegisterFcmTokenSchema), AuthController.registerFcmToken);

// NOTE: GET /my-subjects lives at GET /marks/my-subjects (not an auth concern)

export default router;
