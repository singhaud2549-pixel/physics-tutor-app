import { createServerSupabase } from "../../../../lib/supabaseServer";

export const dynamic = "force-dynamic";

// ดึงบัญชีของผู้สอน + รายชื่อนักเรียนที่ผูกกับตัวเอง
// สิทธิ์บังคับด้วย RLS ที่ฐานข้อมูล (migration 005) — ที่นี่แค่เช็คซ้ำเพื่อให้ข้อความผิดพลาดอ่านรู้เรื่อง
async function auth(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const sb = createServerSupabase(token);
  if (!sb) return { error: "ยังไม่ได้ตั้งค่า Supabase หรือยังไม่ได้เข้าสู่ระบบ", status: 401 };
  const { data } = await sb.auth.getUser(token);
  if (!data?.user) return { error: "กรุณาเข้าสู่ระบบก่อน", status: 401 };
  return { sb, user: data.user };
}

export async function GET(request) {
  const a = await auth(request);
  if (a.error) return Response.json({ error: a.error }, { status: a.status });
  const { sb, user } = a;

  const { data: me } = await sb
    .from("profiles")
    .select("user_id, display_name, role, invite_code")
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.role !== "teacher") {
    return Response.json({ error: "บัญชีนี้ไม่ใช่ผู้สอน", role: me?.role || null }, { status: 403 });
  }

  const { data: students, error } = await sb
    .from("profiles")
    .select("user_id, display_name, grade, max_difficulty, last_reviewed_at, created_at")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ me, students: students || [] });
}

// แก้ข้อมูลนักเรียน (ชื่อเล่น / ระดับชั้น / เพดานระดับความยาก) หรือตั้งรหัสครูของตัวเอง
export async function POST(request) {
  const a = await auth(request);
  if (a.error) return Response.json({ error: a.error }, { status: a.status });
  const { sb, user } = a;
  const body = await request.json();

  if (body.inviteCode !== undefined) {
    const code = String(body.inviteCode || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      return Response.json({ error: "รหัสครูต้องเป็น A-Z หรือ 0-9 ยาว 4-12 ตัว" }, { status: 400 });
    }
    const { error } = await sb.from("profiles").update({ invite_code: code }).eq("user_id", user.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, inviteCode: code });
  }

  const { studentId, displayName, grade, maxDifficulty } = body;
  if (!studentId) return Response.json({ error: "ไม่ได้ระบุนักเรียน" }, { status: 400 });

  const patch = {};
  if (displayName !== undefined) patch.display_name = String(displayName).trim() || null;
  if (grade !== undefined) patch.grade = String(grade).trim() || null;
  if (maxDifficulty !== undefined)
    patch.max_difficulty =
      maxDifficulty === "" || maxDifficulty === null ? null : Number(maxDifficulty);

  const { error } = await sb.from("profiles").update(patch).eq("user_id", studentId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
