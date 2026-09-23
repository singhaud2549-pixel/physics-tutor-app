import { createServerSupabase } from "../../../lib/supabaseServer";

export const dynamic = "force-dynamic";

// heartbeat จากฝั่งเด็ก — บอกว่าตอนนี้เปิดโจทย์ข้อไหนอยู่
// เรียกทุก ~30 วิจาก /problem/[id] ถ้าตารางยังไม่ migrate จะ error เงียบฝั่ง client
export async function POST(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const sb = createServerSupabase(token);
  if (!sb) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

  const { data: auth } = await sb.auth.getUser(token);
  if (!auth?.user) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

  const { problemId } = await request.json().catch(() => ({}));
  if (!problemId || typeof problemId !== "string") {
    return Response.json({ error: "ไม่ได้ระบุข้อ" }, { status: 400 });
  }

  const { error } = await sb.from("presence").upsert(
    { user_id: auth.user.id, problem_id: problemId, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
