import Anthropic from "@anthropic-ai/sdk";
import { getExamProblemsFull } from "../../../lib/problems";
import { createServerSupabase } from "../../../lib/supabaseServer";

export const maxDuration = 60;

const HINT_DAILY_LIMIT_PER_USER = Number(process.env.HINT_DAILY_LIMIT_PER_USER || 60);
const HINT_DAILY_LIMIT_TOTAL = Number(process.env.HINT_DAILY_LIMIT_TOTAL || 500);

const SYSTEM_PROMPT = `คุณคือ "พี่" นักศึกษามหาวิทยาลัยที่เก่งฟิสิกส์และใจดี กำลังอ่านผลสอบของ "น้อง" ม.6 ที่เพิ่งทำข้อสอบจำลองเสร็จ

หน้าที่: เขียนคำวิเคราะห์สั้น ๆ สรุปว่าน้องพลาดเรื่องอะไรเป็นแพทเทิร์น โดยดูจากบท/แนวย่อย/จุดพลาดที่พบบ่อย (trap) ของข้อที่ตอบผิดทั้งหมด

กฎ:
1. พูดแบบพี่ติวน้อง อบอุ่น ให้กำลังใจ ห้ามตำหนิหรือทำให้รู้สึกแย่
2. ถ้าข้อที่ผิดหลายข้ออยู่บทเดียวกันหรือมี trap คล้ายกัน ให้ชี้แพทเทิร์นนั้นให้ชัด — นี่คือส่วนสำคัญที่สุด อย่าแค่ไล่บอกทีละข้อ
3. จบด้วยคำแนะนำสั้น ๆ ว่าควรกลับไปฝึกเรื่องอะไรก่อนเป็นอันดับแรก
4. ห้ามเฉลยคำตอบข้อไหนซ้ำ (น้องเห็นเฉลยในหน้าผลสอบอยู่แล้ว) ให้โฟกัสที่ "ภาพรวมของความเข้าใจผิด" แทนการพูดถึงข้อสอบทีละข้อ
5. ความยาวรวมไม่เกินประมาณ 120 คำ ตอบเป็นข้อความล้วน ไม่มีหัวข้อ/bullet/คำนำ`;

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const sb = accessToken ? createServerSupabase(accessToken) : null;
    const {
      data: { user } = {},
    } = sb ? await sb.auth.getUser(accessToken) : { data: {} };
    if (!user) {
      return Response.json({ error: "auth_required" }, { status: 401 });
    }

    const { examSet, wrongIds = [] } = await request.json();
    const problems = getExamProblemsFull(examSet);
    if (!problems.length) {
      return Response.json({ error: "ไม่พบชุดข้อสอบนี้" }, { status: 404 });
    }
    const byId = Object.fromEntries(problems.map((p) => [p.id, p]));
    const wrongItems = wrongIds.map((id) => byId[id]).filter(Boolean);

    if (!wrongItems.length) {
      return Response.json({
        analysis: "ทำถูกหมดทุกข้อเลยน้อง! เก่งมาก 🎉 ไม่มีจุดพลาดให้วิเคราะห์รอบนี้เลย",
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ analysis: null });
    }

    // ใช้โควตา AI เดียวกับ /api/hint (นับรวมกัน — กันคนแปลกหน้า/สแปมยิงฟรีไม่จำกัดเหมือนกัน)
    const { data: usage, error: usageErr } = await sb.rpc("increment_hint_usage");
    const { user_count, total_count } = usage?.[0] || {};
    if (!usageErr) {
      if (user_count > HINT_DAILY_LIMIT_PER_USER) {
        return Response.json({ error: "rate_limited" }, { status: 429 });
      }
      if (total_count > HINT_DAILY_LIMIT_TOTAL) {
        return Response.json({ error: "capacity" }, { status: 503 });
      }
    }

    const client = new Anthropic();
    const detail = wrongItems
      .map(
        (p, i) =>
          `${i + 1}. บท: ${p.topic || "-"}${p.subskill ? " · แนวย่อย: " + p.subskill : ""}\n   จุดพลาดที่พบบ่อยของข้อนี้: ${
            p.traps.length ? p.traps.join(" / ") : "(ไม่มีระบุ)"
          }`,
      )
      .join("\n\n");

    const context = `ผลสอบชุด ${examSet}: น้องตอบผิด ${wrongItems.length} จาก ${problems.length} ข้อ

รายการข้อที่ตอบผิด (ไม่ต้องพูดถึงทีละข้อ ให้มองภาพรวม):
${detail}

เขียนคำวิเคราะห์ภาพรวมให้น้องตามกฎที่กำหนด`;

    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: context }],
    });

    const analysis = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return Response.json({ analysis: analysis || null });
  } catch (err) {
    console.error(err);
    return Response.json({ analysis: null });
  }
}
