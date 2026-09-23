import { createServerSupabase } from "../../../../lib/supabaseServer";
import { getAllFullById } from "../../../../lib/problems";

export const dynamic = "force-dynamic";

// รวมสถิติรายข้อข้ามนักเรียนของครูคนนี้ — ไว้คัดข้อออก mock + รายงานผู้ปกครอง
// ไม่ส่งเฉลย/trap ดิบออกไป (ADR 0001) ส่งแค่ตัวเลขรวม + หัวข้อ/ระดับความยาก
function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export async function GET(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const sb = createServerSupabase(token);
  if (!sb) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  const { data: auth } = await sb.auth.getUser(token);
  if (!auth?.user) return Response.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

  const { data: me } = await sb
    .from("profiles")
    .select("role")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (me?.role !== "teacher") return Response.json({ error: "บัญชีนี้ไม่ใช่ผู้สอน" }, { status: 403 });

  const { data: students } = await sb
    .from("profiles")
    .select("user_id")
    .eq("teacher_id", auth.user.id);
  const ids = (students || []).map((s) => s.user_id);
  if (!ids.length) return Response.json({ stats: [], students: 0 });

  const { data: attempts } = await sb
    .from("attempts")
    .select("user_id, problem_id, topic, answer, is_correct, hint_count, seconds_on_problem, created_at")
    .in("user_id", ids)
    .order("created_at", { ascending: false })
    .limit(5000);

  const { data: messages } = await sb
    .from("hint_messages")
    .select("user_id, problem_id, role, session_key")
    .in("user_id", ids)
    .limit(5000);

  const problemsById = getAllFullById();
  const byProblem = {};
  const ensure = (pid) =>
    (byProblem[pid] ||= {
      problemId: pid,
      topic: problemsById[pid]?.topic || "อื่น ๆ",
      subskill: problemsById[pid]?.subskill || "",
      difficulty: problemsById[pid]?.difficulty ?? null,
      statement: (problemsById[pid]?.statement || "").slice(0, 120),
      students: new Set(),
      attempts: 0,
      wrong: 0,
      reveals: 0,
      secs: [],
      hints: 0,
      questions: 0,
      lastSeen: null,
    });

  for (const a of attempts || []) {
    if (!a.problem_id) continue;
    const g = ensure(a.problem_id);
    g.students.add(a.user_id);
    g.attempts += 1;
    if (!a.is_correct) g.wrong += 1;
    if (a.answer === "ขอดูเฉลย") g.reveals += 1;
    if (typeof a.seconds_on_problem === "number" && a.seconds_on_problem > 0) {
      g.secs.push(a.seconds_on_problem);
    }
    g.hints += a.hint_count || 0;
    if (!g.lastSeen || (a.created_at && a.created_at > g.lastSeen)) g.lastSeen = a.created_at;
  }
  for (const m of messages || []) {
    if (!m.problem_id || m.role !== "question") continue;
    const g = ensure(m.problem_id);
    g.students.add(m.user_id);
    g.questions += 1;
  }

  const stats = Object.values(byProblem).map((g) => ({
    problemId: g.problemId,
    topic: g.topic,
    subskill: g.subskill,
    difficulty: g.difficulty,
    statement: g.statement,
    students: g.students.size,
    attempts: g.attempts,
    wrong: g.wrong,
    wrongRate: g.attempts ? Math.round((g.wrong / g.attempts) * 100) : 0,
    reveals: g.reveals,
    medianSeconds: median(g.secs),
    avgHints: g.attempts ? Math.round((g.hints / g.attempts) * 10) / 10 : 0,
    questions: g.questions,
    lastSeen: g.lastSeen,
  }));
  stats.sort((a, b) => b.wrong - a.wrong || (b.medianSeconds || 0) - (a.medianSeconds || 0));

  return Response.json({ stats, students: ids.length });
}
