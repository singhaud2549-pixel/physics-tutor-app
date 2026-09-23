 // ผ่าผลสอบ — แยกคะแนนที่หายไปตามสาเหตุ ไม่ใช่แค่ถูก/ผิด
//
// ฟังก์ชันบริสุทธิ์: รับผลรายข้อ → คืน bucket รายข้อ + สรุป + ธงแรงตกท้าย
// ตามรอย lib/report.js — ตรรกะอยู่ที่นี่ที่เดียว หน้าเว็บเป็นแค่ท่อแสดงผล
// เกณฑ์เวลาปรับได้ที่ RUSH_SECONDS (ข้อสอบชุดนี้ให้ ~3 นาที/ข้อ ผิดใน 60 วิแรก = รีบ)

// ตอบผิดทั้งที่แทบไม่ใช้เวลาคิด + ไม่ขอใบ้ (โหมดข้อสอบไม่มีใบ้อยู่แล้ว)
export const RUSH_SECONDS = 60;

// สอบต้องมีอย่างน้อยกี่ข้อถึงจะประเมิน "แรงตกครึ่งหลัง" ได้ — น้อยกว่านี้สัญญาณรบกวนเยอะ
export const MIN_EXAM_FOR_FADE = 4;

// ครึ่งหลังต้องถูกน้อยกว่าครึ่งแรกอย่างน้อยกี่ข้อถึงจะนับว่าตก
export const FADE_GAP = 2;

export function classifyItem({ correct, answered, seconds } = {}) {
  if (correct) return "solid";
  if (!answered) return "unanswered";
  if (typeof seconds === "number" && seconds >= 0 && seconds <= RUSH_SECONDS) return "rushed";
  return "shaky";
}

export function buildDebrief(items = []) {
  const buckets = {};
  const summary = { total: items.length, solid: 0, rushed: 0, shaky: 0, unanswered: 0 };
  items.forEach((it, i) => {
    const b = classifyItem(it);
    buckets[it.id ?? i] = b;
    summary[b] += 1;
  });

  // แรงตกครึ่งหลัง — เทียบจำนวนข้อถูกครึ่งแรก vs ครึ่งหลังตามลำดับข้อสอบ
  let faded = false;
  if (items.length >= MIN_EXAM_FOR_FADE) {
    const half = Math.floor(items.length / 2);
    const firstHalf = items.slice(0, half).filter((it) => it.correct).length;
    const secondHalf = items.slice(half).filter((it) => it.correct).length;
    faded = secondHalf <= firstHalf - FADE_GAP;
  }

  return { buckets, summary, faded, wrong: summary.rushed + summary.shaky + summary.unanswered };
}
