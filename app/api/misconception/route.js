import { getFull } from "../../../lib/problems";

export const dynamic = "force-dynamic";

// จับคู่คำตอบผิดของนักเรียน → trap ที่ตรง → คำอธิบายว่า "เข้าใจผิดยังไง"
// (trap รูปแบบ "ตอบ C — เอา... " หรือ "ตอบ 10 — ลืม...")
function matchMisconception(problem, answer) {
  if (!problem || !problem.traps || !problem.traps.length) return null;
  const ans = String(answer ?? "").trim().toUpperCase();
  for (const t of problem.traps) {
    const m = t.match(/^\s*(?:ตอบ|เลือก(?:ข้อ)?)\s*([^\s—:-]+)/);
    if (m && m[1].toUpperCase() === ans) {
      // เอาข้อความหลัง "—" (คำอธิบายจุดพลาด) ถ้าไม่มีก็คืนทั้งบรรทัด
      const idx = t.indexOf("—");
      return (idx >= 0 ? t.slice(idx + 1) : t).trim();
    }
  }
  return null;
}

export async function POST(request) {
  const { items = [] } = await request.json();
  const out = items.map(({ problemId, answer }) => ({
    problemId,
    answer,
    misconception: matchMisconception(getFull(problemId), answer),
  }));
  return Response.json(out);
}
