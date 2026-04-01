// =============================================================
// KJSIS — Auth Zod Schemas (Phase 2: + refresh + FCM)
// =============================================================

import { z } from 'zod';

export const LoginSchema = z.object({
  mobile: z
    .string()
    .trim()
    .min(10, 'Mobile number must be at least 10 digits')
    .max(15, 'Mobile number must be at most 15 digits')
    .regex(/^\d+$/, 'Mobile number must contain only digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const ChangePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain uppercase, lowercase, and a number',
      ),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

export const LogoutSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

export const RegisterFcmTokenSchema = z.object({
  fcm_token: z.string().min(1, 'FCM token is required'),
  device: z.enum(['android', 'ios', 'web']).optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type RegisterFcmTokenInput = z.infer<typeof RegisterFcmTokenSchema>;
