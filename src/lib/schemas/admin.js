import { z } from 'zod';

export const adminLoginSchema = z.object({
  email:    z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

export const adminCreateSchema = z.object({
  email:    z.string().trim().toLowerCase().email(),
  name:     z.string().trim().min(1).max(100),
  password: z.string().min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร').max(100),
  role:     z.enum(['owner', 'admin', 'editor']).default('admin'),
  active:   z.boolean().default(true),
});
