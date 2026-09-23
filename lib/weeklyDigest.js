import { buildReport } from "./report";
import { buildTrapBook } from "./trapMastery";

// จดหมายรายสัปดาห์ — ร่างสรุปให้นักเรียน 1 คนใน 7 วันให้ครูส่งต่อทาง LINE
//
// กฎเหล็ก (มติ 28 ส.ค. ข้อ 7): รุ่นแรกใช้ตัวเลขที่ตรวจสอบได้เท่านั้น
// ห้ามบทสรุปที่ AI เขียนเป็นย่อหน้า — ฟังก์ชันนี้แค่เรียงตัวเลขเป็นเทมเพลต
// ประโยคความเห็นเป็นของครูคนเดียว (ช่อง teacherNote ให้ครูเติมเอง)
//
// ฟังก์ชันบริสุทธิ์ — เทสต์ที่รอยต่อเดียว ไม่แตะ DB

export const WEEK_DAYS = 7;

const thDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
};

// เทียบสถานะสมุดกับดักต้นสัปดาห์ vs ตอนนี้ — หาตระกูลที่ปราบได้ใหม่/โดนใหม่ในสัปดาห์นี้
export function diffTrapBooks(before, after) {
  const prev = Object.fromEntries((before?.tags || []).map((t) => [t.tag, t.status]));
  const newlySlain = [];
  const newlyBitten = [];
  for (const t of after?.tags || []) {
    const p = prev[t.tag];
    if (t.status === "slain" && p !== "slain") newlySlain.push(t.tag);
    if (
      (t.status === "bitten" || t.status === "chasing") &&
      (p === "unseen" || p === "unbitten" || !p)
    ) {
      newlyBitten.push(t.tag);
    }
  }
  return { newlySlain, newlyBitten };
}

export function buildWeeklyDigest({
  studentName = "นักเรียน",
  weekStart,
  weekEnd,
  attempts = [],
  problemsById = {},
  transcriptsBySession = {},
  examSessions = [],
} = {}) {
  const start = weekStart || new Date(Date.now() - WEEK_DAYS * 864e5).toISOString();
  const end = weekEnd || new Date().toISOString();

  const report = buildReport({ attempts, problemsById, since: start, transcriptsBySession });
  const r = report.recent;
  const totals = r.totals;

  // สมุดกับดักต้นสัปดาห์ (ใช้ attempts ที่เกิดก่อนสัปดาห์นี้) vs ตอนนี้
  const beforeAttempts = (attempts || []).filter((a) => a.created_at && !(a.created_at > start));
  const bookNow = buildTrapBook({ attempts, problemsById });
  const { newlySlain, newlyBitten } = diffTrapBooks(
    buildTrapBook({ attempts: beforeAttempts, problemsById }),
    bookNow,
  );

  const topTags = r.byTag.filter((g) => g.matched).slice(0, 3);
  const exams = (examSessions || [])
    .filter((e) => e.created_at && e.created_at > start)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  const mmss = (s) =>
    typeof s !== "number" ? null : s < 60 ? `${s} วิ` : `${Math.floor(s / 60)} นาที ${s % 60} วิ`;
  const medianText = mmss(totals.medianSeconds);

  const lines = [`สรุปสัปดาห์ของ ${studentName} (${thDate(start)}–${thDate(end)})`, ""];
  if (!totals.attempts && !exams.length && !totals.questions) {
    lines.push("สัปดาห์นี้ยังไม่มีกิจกรรมในแอป");
  } else {
    if (totals.attempts) {
      lines.push(
        `ทำโจทย์ ${totals.attempts} ข้อ · ถูก ${totals.correct} · ผิด ${totals.wrong}` +
          (totals.questions ? ` · ถามพี่ AI ${totals.questions} ครั้ง` : "") +
          (medianText ? ` · เวลาข้อละประมาณ ${medianText}` : ""),
      );
    }
    if (topTags.length) {
      lines.push(`จุดที่ผิดซ้ำบ่อย: ${topTags.map((g) => `${g.tag} (${g.count} ครั้ง)`).join(", ")}`);
    }
    const bs = bookNow.summary;
    const trapLine =
      `กับดัก: ปราบแล้ว ${bs.slain} ตระกูล` +
      (newlySlain.length ? ` (ใหม่สัปดาห์นี้: ${newlySlain.join(", ")})` : "") +
      (bs.bitten + bs.chasing
        ? ` · ยังค้าง ${bs.bitten + bs.chasing} ตระกูล` +
          (newlyBitten.length ? ` (โดนใหม่: ${newlyBitten.join(", ")})` : "")
        : "");
    lines.push(trapLine);
    for (const e of exams) {
      lines.push(`สอบจำลอง ${e.exam_set || ""}: ได้ ${e.total}/${e.max}`.trim());
    }
  }
  lines.push("", "ครูเติมเอง (ความเห็น/สิ่งที่นัดกัน): ");

  return {
    text: lines.join("\n"),
    stats: {
      attempts: totals.attempts,
      correct: totals.correct,
      wrong: totals.wrong,
      questions: totals.questions,
      medianSeconds: totals.medianSeconds,
      topTags: topTags.map((g) => ({ tag: g.tag, count: g.count })),
      trapSummary: bookNow.summary,
      newlySlain,
      newlyBitten,
      exams: exams.map((e) => ({
        examSet: e.exam_set,
        total: e.total,
        max: e.max,
        createdAt: e.created_at,
      })),
    },
    weekStart: start,
    weekEnd: end,
  };
}
