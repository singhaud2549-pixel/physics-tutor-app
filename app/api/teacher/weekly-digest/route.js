import { createServerSupabase } from "../../../../lib/supabaseServer";
import { getAllFullById } from "../../../../lib/problems";
import { buildWeeklyDigest, WEEK_DAYS } from "../../../../lib/weeklyDigest";

export const dynamic = "force-dynamic";

// ร่างจดหมายรายสัปดาห์ของนักเรียน 1 คน — ตัวเลขดึงอัตโนมัติ ประโยคครูเติมเอง
// คำนวณฝั่งเซิร์ฟเวอร์ทั้งหมด ส่งเฉพาะข้อความร่าง ไม่มีเฉลย/trap ดิบหลุดไป
export async function GET(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const sb = createServerSupabase(token);
  if (!sb) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  const { data: auth } = await sb.auth.getUser(token);
  if (!auth?.user) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

  const studentId = new URL(request.url).searchParams.get("studentId");
  if (!studentId) return Response.json({ error: "ไม่ได้ระบุนักเรียน" }, { status: 400 });

  // RLS ยอมให้อ่านเฉพาะนักเรียนของครูคนนี้ — ไม่ใช่จะได้ 403
  const { data: student } = await sb
    .from("profiles")
    .select("user_id, display_name, grade")
    .eq("user_id", studentId)
    .maybeSingle();
  if (!student) {
    return Response.json({ error: "ไม่พบนักเรียนคนนี้ หรือไม่มีสิทธิ์ดู" }, { status: 403 });
  }

  const weekEnd = new Date();
  const weekStart = new Date(weekEnd.getTime() - WEEK_DAYS * 864e5);

  const [{ data: attempts }, { data: messages }, { data: sessions }] = await Promise.all([
    sb
      .from("attempts")
      .select(
        "problem_id, topic, answer, is_correct, hint_count, created_at, exam_set, seconds_on_problem, session_key",
      )
      .eq("user_id", studentId)
      .order("created_at", { ascending: false })
      .limit(5000),
    sb
      .from("hint_messages")
      .select("session_key, seq, role, text, seconds_on_problem, created_at, problem_id")
      .eq("user_id", studentId)
      .order("created_at", { ascending: false })
      .limit(1500),
    sb
      .from("exam_sessions")
      .select("exam_set, total, max, created_at")
      .eq("user_id", studentId)
      .gte("created_at", weekStart.toISOString())
      .order("created_at", { ascending: true }),
  ]);

  const transcriptsBySession = {};
  for (const m of messages || []) (transcriptsBySession[m.session_key] ||= []).push(m);
  for (const k of Object.keys(transcriptsBySession)) {
    transcriptsBySession[k].sort((a, b) => a.seq - b.seq);
  }

  return Response.json({
    student,
    digest: buildWeeklyDigest({
      studentName: student.display_name || "นักเรียน",
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      attempts: attempts || [],
      problemsById: getAllFullById(),
      transcriptsBySession,
      examSessions: sessions || [],
    }),
  });
}
