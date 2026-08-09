import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { getFull, imageDiskPath } from "../../../lib/problems";
import { createServerSupabase } from "../../../lib/supabaseServer";

const HINT_DAILY_LIMIT_PER_USER = Number(process.env.HINT_DAILY_LIMIT_PER_USER || 60);
const HINT_DAILY_LIMIT_TOTAL = Number(process.env.HINT_DAILY_LIMIT_TOTAL || 500);

// สตรีมคำใบ้ทีละคำ → เด็กเห็นตัวอักษรแรกใน ~1 วิ แทนที่จะจ้องหน้าเปล่า 7 วิ
export const maxDuration = 60;

// อ่านไฟล์รูปโจทย์ → บล็อกรูปแบบ base64 สำหรับส่งให้ Claude มอง (คืน null ถ้าไม่มี/อ่านไม่ได้)
function imageBlock(filename) {
  if (!filename) return null;
  try {
    const data = fs.readFileSync(imageDiskPath(filename)).toString("base64");
    const ext = path.extname(filename).toLowerCase();
    const media =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : "image/jpeg";
    return { type: "image", source: { type: "base64", media_type: media, data } };
  } catch (e) {
    console.warn("⚠️  อ่านรูปโจทย์ไม่ได้:", e.message);
    return null;
  }
}

// เช็คคำตอบตัวเลข ยอมคลาดเคลื่อนตามที่โจทย์กำหนด (default 1%)
function isCorrect(studentAnswer, correct, tolerance) {
  const num = parseFloat(String(studentAnswer).replace(/[^0-9.\-]/g, ""));
  if (Number.isNaN(num)) return false;
  const tol =
    tolerance && !Number.isNaN(tolerance)
      ? tolerance
      : Math.max(0.01, Math.abs(correct) * 0.01);
  return Math.abs(num - correct) <= tol;
}

const SYSTEM_PROMPT = `คุณคือ "พี่" นักศึกษามหาวิทยาลัยที่เก่งฟิสิกส์และใจดีมาก กำลังนั่งติว "น้อง" ม.6 ที่เตรียมสอบเข้ามหาลัย (TCAS/A-Level) อยู่ข้าง ๆ คุยกันแบบพี่ติวน้องสบาย ๆ เป็นกันเอง

น้องเพิ่งตอบผิด หรือกดขอคำใบ้เพราะคิดไม่ออก หน้าที่พี่คือ "ใบ้ทีละนิด" ให้น้องคิดต่อเองและหาจุดพลาดของตัวเองเจอ

โทนการพูด (สำคัญที่สุด — ต้องเหมือนพี่คนจริง ไม่ใช่ AI หรือหนังสือเรียน):
- พูดแบบพี่ที่สนิทกับน้อง เรียกตัวเองว่า "พี่" เรียกน้องว่า "น้อง" ใช้ภาษาพูดธรรมชาติเหมือนนั่งคุยกันจริง ๆ
- อบอุ่น ให้กำลังใจแบบพี่ มีลูกเล่นการพูดตามสถานการณ์ เช่น "เอ๊ะ ลองดูตรงนี้ก่อนสิ" "ใกล้ละน้อง!" "อืม ๆ เกือบละ" "ลองเช็กอีกทีนะ"
- ห้ามพูดแบบทางการหรือแบบตำรา ห้ามฟังดูเป็นสูตรสำเร็จ/หุ่นยนต์/รายการขั้นตอน ให้เหมือนพี่ชี้ให้ดูสด ๆ
- อีโมจิใส่ได้นิดหน่อยแบบธรรมชาติ ไม่ต้องมีทุกครั้ง อย่าให้ดูเป็นแพตเทิร์นซ้ำ ๆ

การให้กำลังใจ (สำคัญ — เพื่อไม่ให้น้องท้อ):
- ทุกคำใบ้ควรมี "กำลังใจ" สอดแทรกอยู่ ให้น้องรู้สึกว่าใกล้ทำได้แล้ว ไม่ใช่โง่หรือทำไม่ได้
- ชมความพยายาม/ชี้จุดที่น้องคิดถูกอยู่แล้วก่อน แล้วค่อยชวนแก้จุดที่พลาด (เช่น "ตั้งสมการถูกละนะ เหลือแค่ตรงนี้นิดเดียว")
- ทำให้ "การตอบผิด" เป็นเรื่องปกติ เช่น "ตรงนี้คนพลาดกันเยอะเลย ไม่ใช่น้องคนเดียว"
- ยิ่งน้องผิดหลายครั้ง (ดูจากจำนวนคำตอบผิดก่อนหน้า) ยิ่งต้องใจเย็นและให้กำลังใจมากขึ้น อย่าให้น้ำเสียงหงุดหงิดหรือกดดันเด็ดขาด — ค่อย ๆ ใบ้ให้ง่ายลงพร้อมบอกว่า "ไม่เป็นไรนะ ค่อย ๆ ไปด้วยกัน"

กฎเหล็ก (ห้ามข้าม):
1. ห้ามบอกคำตอบสุดท้ายเด็ดขาด และห้ามเฉลยวิธีทำทั้งหมด
2. ใบ้ครั้งละ "หนึ่งอย่าง" สั้น ๆ (1-3 ประโยค) พอให้น้องขยับต่อได้ ไม่จับมือทำทุกขั้น
3. เริ่มใบ้อ่อน ๆ ก่อน (ชวนดูว่าควรกลับไปดูตรงไหน / ใช้แนวคิดอะไร) ถ้ายังผิดซ้ำค่อยเจาะจงขึ้นทีละนิด
4. ถ้าคำตอบตรงกับ "จุดพลาดที่พบบ่อย (trap)" ให้ชวนน้องฉุกคิดตรงจุดที่เข้าใจผิด โดยไม่พูดตรง ๆ ว่าผิดเพราะอะไร
5. ตอบกลับมาเป็น "ข้อความที่พี่พูดกับน้อง" อย่างเดียว ห้ามมีคำนำ ห้ามขึ้นต้นว่า "คำใบ้:" หรือใส่หมายเลขข้อ`;

export async function POST(request) {
  try {
    // ต้องล็อกอินก่อนถึงจะใช้ /api/hint ได้ — กันคนแปลกหน้ายิงฟรีไม่จำกัด
    const authHeader = request.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const sb = accessToken ? createServerSupabase(accessToken) : null;
    const {
      data: { user } = {},
    } = sb ? await sb.auth.getUser(accessToken) : { data: {} };
    if (!user) {
      return Response.json(
        { error: "auth_required", message: "ต้องเข้าสู่ระบบก่อนขอคำใบ้นะ" },
        { status: 401 },
      );
    }

    const {
      problemId,
      studentAnswer,
      priorAttempts = [],
      priorHints = [],
      requestHint = false, // true = นักเรียนกดปุ่ม "ขอคำใบ้" ตอนคิดไม่ออก
    } = await request.json();

    // โหลดโจทย์ (พร้อมเฉลย/trap) จากคลัง — ฝั่งเซิร์ฟเวอร์เท่านั้น
    const problem = getFull(problemId);
    if (!problem) {
      return Response.json(
        { hint: "ไม่พบโจทย์นี้ในคลัง ลองกลับไปเลือกโจทย์ใหม่นะ" },
        { status: 200 },
      );
    }

    // เช็คถูก/ผิด — ปรนัยเทียบตัวอักษร, อัตนัยเทียบตัวเลข
    const isChoice = problem.kind === "choice";
    const answeredCorrect = isChoice
      ? String(studentAnswer || "").trim().toUpperCase() ===
        String(problem.answerRaw || "").trim().toUpperCase()
      : isCorrect(studentAnswer, problem.answer, problem.tolerance);

    // 1) ถ้าเป็นการ "ตอบคำตอบ" (ไม่ใช่ขอใบ้) และถูก → ไม่ต้องเรียก AI (ประหยัดค่า API)
    if (!requestHint && answeredCorrect) {
      return Response.json({
        correct: true,
        message: "เก่งมากน้อง! ถูกต้องเลย 🎉 เดี๋ยวไปลุยข้อต่อไปกัน",
      });
    }

    // 2) ตอบผิด หรือ กดขอคำใบ้ → ให้ AI ใบ้ทีละนิด
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { hint: "ยังไม่ได้ตั้งค่า API key — เปิดไฟล์ .env.local แล้วใส่ ANTHROPIC_API_KEY ก่อนนะ" },
        { status: 200 },
      );
    }

    // นับโควตาแบบ atomic (เฉพาะครั้งที่กำลังจะเรียก Claude จริง — ไม่นับตอนตอบถูกที่คืนฟรีไปแล้วด้านบน)
    const { data: usage, error: usageErr } = await sb.rpc("increment_hint_usage");
    const { user_count, total_count } = usage?.[0] || {};
    if (usageErr) {
      console.error("increment_hint_usage error:", usageErr);
    } else {
      if (user_count > HINT_DAILY_LIMIT_PER_USER) {
        return Response.json(
          {
            error: "rate_limited",
            message: `วันนี้ใช้คำใบ้ครบ ${HINT_DAILY_LIMIT_PER_USER} ครั้งแล้วนะ พรุ่งนี้มาใหม่ได้เลย`,
          },
          { status: 429 },
        );
      }
      if (total_count > HINT_DAILY_LIMIT_TOTAL) {
        return Response.json(
          {
            error: "capacity",
            message: "ตอนนี้มีคนขอคำใบ้เยอะมาก ระบบไม่ว่างชั่วคราว ลองใหม่อีกสักครู่นะ",
          },
          { status: 503 },
        );
      }
    }

    const client = new Anthropic();

    const choicesText = isChoice
      ? "\nตัวเลือก (โจทย์ปรนัย):\n" +
        problem.choices.map((c) => `${c.key}) ${c.text}`).join("\n") +
        `\nคำตอบที่ถูกคือข้อ ${problem.answerRaw} — ⚠️ ห้ามบอกนักเรียนว่าข้อไหนถูกเด็ดขาด ให้ชวนตัดช้อยส์ที่ผิดออก / คิดหาเหตุผลเอง\n`
      : "";

    const context = `โจทย์: ${problem.statement}
${choicesText}
เฉลย (สำหรับคุณดูเท่านั้น ห้ามบอกนักเรียน): ${problem.solution || "(ไม่มีเฉลยระบุไว้ ให้ใบ้จากหลักฟิสิกส์)"}
${isChoice ? "" : `คำตอบที่ถูก (ห้ามบอกนักเรียน): ${problem.answer} ${problem.unit || ""}\n`}
จุดพลาดที่พบบ่อย (trap):
${problem.traps.length ? problem.traps.map((t) => "- " + t).join("\n") : "(ไม่มีระบุ)"}

คำตอบผิดที่นักเรียนเคยตอบมาก่อนหน้านี้: ${
      priorAttempts.length ? priorAttempts.join(", ") : "(ยังไม่มี)"
    }
คำใบ้ที่คุณเคยให้ไปแล้ว (อย่าใบ้ซ้ำเดิม ให้เจาะจงขึ้น): ${
      priorHints.length ? priorHints.map((h, i) => `\n  ${i + 1}. ${h}`).join("") : "(ยังไม่มี — นี่คือคำใบ้แรก)"
    }

${
      requestHint
        ? "สถานะล่าสุด: นักเรียนคิดไม่ออก จึงกดปุ่ม \"ขอคำใบ้\" (ยังไม่ได้ตอบในรอบนี้) — ช่วยใบ้ให้ตั้งต้นคิดได้ ถ้ายังไม่เคยใบ้เลยให้เริ่มจากชวนดูว่าโจทย์ให้อะไรมาบ้าง/ควรใช้แนวคิดอะไร"
        : `คำตอบล่าสุดที่นักเรียนเพิ่งตอบผิด: ${studentAnswer}`
    }
${
      problem.image
        ? "\nหมายเหตุ: โจทย์นี้มีรูปประกอบแนบมาด้วย (ดูรูปด้านบน) นักเรียนเห็นรูปนี้อยู่ — ใช้ข้อมูล/ค่าตัวเลข/แผนภาพในรูปประกอบการใบ้ด้วย"
        : ""
    }
จงให้ "คำใบ้ถัดไปหนึ่งอย่าง" ตามกฎที่กำหนด`;

    // ถ้าโจทย์มีรูป → แนบรูปให้ Claude มองเห็น (วางรูปก่อนข้อความ)
    const img = imageBlock(problem.image);
    const userContent = img
      ? [img, { type: "text", text: context }]
      : context;

    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 400,
      // ใส่ cache_control ให้ system prompt — prompt ยาวคงที่ทุกครั้ง
      // แคชไว้แล้วรอบถัดไปประมวลผลเร็วขึ้นและถูกลง
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (e) {
          console.error("stream error:", e);
          // ส่งต่อไม่ได้แล้ว — บอกนักเรียนตรง ๆ ต่อท้ายส่วนที่ใบ้ไปแล้ว
          controller.enqueue(
            encoder.encode("\n\n(ขออภัย สัญญาณสะดุด ลองกดขอคำใบ้อีกครั้งนะ)"),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no", // กันตัวกลาง buffer ไว้จนหมดแล้วค่อยส่ง
      },
    });
  } catch (err) {
    console.error(err);
    return Response.json(
      { hint: "ขออภัย ระบบมีปัญหาชั่วคราว ลองส่งคำตอบใหม่อีกครั้งนะ" },
      { status: 200 },
    );
  }
}
