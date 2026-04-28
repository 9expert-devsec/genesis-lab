import { z } from 'zod';

export const adminLoginSchema = z.object({
  email:    z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
  // Optional 6-digit TOTP — required at the credentials-provider
  // boundary only when the admin has `totpEnabled = true`. Form
  // submits empty string when the user is in step 1 of login.
  totp:     z.string().trim().regex(/^\d{6}$/, 'OTP ไม่ถูกต้อง').optional().or(z.literal('')),
});

export const adminCreateSchema = z.object({
  email:    z.string().trim().toLowerCase().email(),
  name:     z.string().trim().min(1).max(100),
  password: z.string().min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร').max(100),
  role:     z.enum(['owner', 'admin', 'editor']).default('admin'),
  active:   z.boolean().default(true),
});
