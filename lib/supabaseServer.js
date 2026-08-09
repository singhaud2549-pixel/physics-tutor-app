import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// client ฝั่งเซิร์ฟเวอร์ สร้างใหม่ทุก request แนบ JWT ของ user ที่ล็อกอินอยู่เป็น header
// (ต่างจาก lib/supabaseClient.js ที่พึ่ง localStorage ซึ่งไม่มีบนเซิร์ฟเวอร์)
export function createServerSupabase(accessToken) {
  if (!url || !anonKey || !accessToken) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
