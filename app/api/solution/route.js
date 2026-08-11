import { getFull } from "../../../lib/problems";
import { createServerSupabase } from "../../../lib/supabaseServer";

export const dynamic = "force-dynamic";

// เปิดเฉลยให้นักเรียนที่ตันจริง ๆ (กดขอเองเท่านั้น)
// เฉลยไม่เคยถูกส่งไปฝั่งเบราว์เซอร์ล่วงหน้า — ต้องเรียกเส้นนี้ถึงจะได้ และต้องล็อกอินก่อน
// ไม่เรียก Claude เลย เลยไม่กินโควตา AI
export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const sb = accessToken ? createServerSupabase(accessToken) : null;
    const {
      data: { user } = {},
    } = sb ? await sb.auth.getUser(accessToken) : { data: {} };
    if (!user) {
      return Response.json(
        { error: "auth_required", message: "ต้องเข้าสู่ระบบก่อนนะ" },
        { status: 401 },
      );
    }

    const { problemId } = await request.json();
    const problem = getFull(problemId);
    if (!problem) {
      return Response.json(
        { error: "not_found", message: "ไม่พบโจทย์นี้ในคลัง" },
        { status: 404 },
      );
    }

    const isChoice = problem.kind === "choice";
    return Response.json({
      answer: isChoice
        ? `ข้อ ${problem.answerRaw}`
        : `${problem.answer}${problem.unit ? " " + problem.unit : ""}`,
      solution: problem.solution || "(โจทย์ข้อนี้ยังไม่ได้ใส่วิธีทำไว้)",
    });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "server_error", message: "ขออภัย ระบบมีปัญหาชั่วคราว ลองใหม่อีกครั้งนะ" },
      { status: 500 },
    );
  }
}
