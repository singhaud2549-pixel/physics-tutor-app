import { createServerSupabase } from "../../../lib/supabaseServer";
import { getAllFullById } from "../../../lib/problems";
import { buildMissions } from "../../../lib/missions";

export const dynamic = "force-dynamic";

// ภารกิจรายวันของตัวเอง — ?budget=15|30|45|60 (นาที) default 30
// คำนวณฝั่งเซิร์ฟเวอร์ทั้งหมด ส่งเฉพาะรายการงาน ไม่มีเฉลย/trap ดิบหลุดไป
export async function GET(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const sb = createServerSupabase(token);
  if (!sb) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  const { data: auth } = await sb.auth.getUser(token);
  if (!auth?.user) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

  const budget = Number(new URL(request.url).searchParams.get("budget")) || 30;

  const [{ data: attempts }, { data: profile }] = await Promise.all([
    sb
      .from("attempts")
      .select("problem_id, topic, answer, is_correct, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(5000),
    sb.from("profiles").select("max_difficulty").eq("user_id", auth.user.id).maybeSingle(),
  ]);

  return Response.json(
    buildMissions({
      attempts: attempts || [],
      problemsById: getAllFullById(),
      budgetMinutes: budget,
      maxDifficulty: profile?.max_difficulty ?? null,
    }),
  );
}
