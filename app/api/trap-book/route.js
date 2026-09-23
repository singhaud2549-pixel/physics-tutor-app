import { createServerSupabase } from "../../../lib/supabaseServer";
import { getAllFullById } from "../../../lib/problems";
import { buildTrapBook } from "../../../lib/trapMastery";

export const dynamic = "force-dynamic";

// สมุดกับดักของตัวเอง — คำนวณฝั่งเซิร์ฟเวอร์ ส่งเฉพาะผลสรุป ไม่มีเฉลย/trap ดิบหลุดไป
export async function GET(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const sb = createServerSupabase(token);
  if (!sb) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  const { data: auth } = await sb.auth.getUser(token);
  if (!auth?.user) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

  const { data: attempts, error } = await sb
    .from("attempts")
    .select("problem_id, answer, is_correct, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    book: buildTrapBook({ attempts: attempts || [], problemsById: getAllFullById() }),
  });
}
