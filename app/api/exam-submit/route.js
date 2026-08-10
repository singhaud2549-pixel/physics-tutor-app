import { getExamProblemsFull, getAllPublic } from "../../../lib/problems";
import { matchMisconception } from "../../../lib/misconception";

// เช็คคำตอบตัวเลข ยอมคลาดเคลื่อนตามที่โจทย์กำหนด (default 1%)
function isCorrectNumber(studentAnswer, correct, tolerance) {
  const num = parseFloat(String(studentAnswer ?? "").replace(/[^0-9.\-]/g, ""));
  if (Number.isNaN(num)) return false;
  const tol =
    tolerance && !Number.isNaN(tolerance)
      ? tolerance
      : Math.max(0.01, Math.abs(correct) * 0.01);
  return Math.abs(num - correct) <= tol;
}

// หาโจทย์ฝึกแยกบทที่ "แนวเดียวกัน" ให้ลองทำใหม่หลังตอบผิด — ใช้เช็คว่าเข้าใจจริงไหม
// (ไม่ใช่แค่จำเฉลยข้อเดิมได้) เทียบจากบทเดียวกัน + ระดับความยากใกล้เคียงที่สุด
function findSimilarProblem(p, pool) {
  const sameTopic = pool.filter((q) => q.topic === p.topic);
  if (!sameTopic.length) return null;
  sameTopic.sort(
    (a, b) =>
      Math.abs(a.difficulty - p.difficulty) - Math.abs(b.difficulty - p.difficulty) ||
      a.id.localeCompare(b.id),
  );
  return sameTopic[0].id;
}

export async function POST(request) {
  try {
    const { examSet, answers = {} } = await request.json();
    const problems = getExamProblemsFull(examSet);
    if (!problems.length) {
      return Response.json({ error: "ไม่พบชุดข้อสอบนี้" }, { status: 404 });
    }
    const practicePool = getAllPublic(); // คลังฝึกแยกบท (ไม่รวมข้อสอบ) — ไว้แนะนำข้อคล้ายกัน

    let total = 0;
    let max = 0;
    const results = problems.map((p) => {
      const yourAnswer = answers[p.id] ?? "";
      const isChoice = p.kind === "choice";
      const correct = isChoice
        ? String(yourAnswer).trim().toUpperCase() ===
          String(p.answerRaw || "").trim().toUpperCase()
        : isCorrectNumber(yourAnswer, p.answer, p.tolerance);
      const points = p.points || 0;
      max += points;
      if (correct) total += points;
      return {
        id: p.id,
        correct,
        yourAnswer: String(yourAnswer || ""),
        correctAnswer: isChoice ? p.answerRaw : `${p.answer}${p.unit ? " " + p.unit : ""}`,
        solution: p.solution || "",
        // จับคู่คำตอบผิด → trap ที่ตรง → อธิบายว่าเข้าใจผิดยังไง (เฉพาะข้อที่ตอบผิด)
        misconception: correct ? null : matchMisconception(p, yourAnswer),
        // แนะนำข้อฝึกแนวเดียวกันให้ลองใหม่ — เช็คว่าเข้าใจจริงไหม ไม่ใช่แค่จำเฉลยข้อนี้ได้
        similarProblemId: correct ? null : findSimilarProblem(p, practicePool),
        points,
        earnedPoints: correct ? points : 0,
      };
    });

    return Response.json({ total, max, results });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "ตรวจข้อสอบไม่สำเร็จ ลองใหม่อีกครั้งนะ" }, { status: 500 });
  }
}
