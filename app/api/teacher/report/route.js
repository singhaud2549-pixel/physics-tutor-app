import { createServerSupabase } from "../../../../lib/supabaseServer";
import { getAllFullById } from "../../../../lib/problems";
import { buildReport } from "../../../../lib/report";

export const dynamic = "force-dynamic";

// รายงานจุดผิดของนักเรียนหนึ่งคน
//
// คำนวณฝั่งเซิร์ฟเวอร์ทั้งหมดตาม ADR 0001 — เฉลยและข้อความ trap ดิบ
// ไม่ถูกส่งไปถึงเบราว์เซอร์ ส่งไปเฉพาะผลสรุปที่แสดงผลแล้ว
export async function POST(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const sb = createServerSupabase(token);
  if (!sb) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

  const { data: auth } = await sb.auth.getUser(token);
  if (!auth?.user) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

  const { studentId, markReviewed = false } = await request.json();
  if (!studentId) return Response.json({ error: "ไม่ได้ระบุนักเรียน" }, { status: 400 });

  // RLS ยอมให้อ่านแถวนี้เฉพาะเมื่อผู้เรียกเป็นครูของนักเรียนคนนี้จริง
  const { data: student } = await sb
    .from("profiles")
    .select("user_id, display_name, grade, max_difficulty, last_reviewed_at")
    .eq("user_id", studentId)
    .maybeSingle();

  if (!student) {
    return Response.json({ error: "ไม่พบนักเรียนคนนี้ หรือไม่มีสิทธิ์ดู" }, { status: 403 });
  }

  const { data: attempts, error } = await sb
    .from("attempts")
    .select("problem_id, topic, answer, is_correct, hint_count, created_at, exam_set")
    .eq("user_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const report = buildReport({
    attempts: attempts || [],
    problemsById: getAllFullById(),
    since: student.last_reviewed_at,
  });

  // ขยับจุดตัด "ตั้งแต่คาบที่แล้ว" เฉพาะตอนผู้สอนกดยืนยันเท่านั้น
  // (ถ้าขยับทุกครั้งที่เปิดหน้า เผลอรีเฟรชแล้วข้อมูลช่วงนี้จะหายไป)
  if (markReviewed) {
    await sb
      .from("profiles")
      .update({ last_reviewed_at: new Date().toISOString() })
      .eq("user_id", studentId);
  }

  return Response.json({ student, report });
}
