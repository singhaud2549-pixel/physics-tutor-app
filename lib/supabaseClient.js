import { createClient } from "@supabase/supabase-js";

// ค่าเชื่อมต่อ Supabase — มาจาก .env.local (พี่ใส่หลังสมัคร Supabase)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ยังไม่ได้ตั้งค่า = แอปยังเปิดได้ปกติ (แค่ล็อกอิน/บันทึกจะยังไม่ทำงาน)
export const isSupabaseReady = Boolean(url && key);

export const supabase = isSupabaseReady ? createClient(url, key) : null;
