import { matchTrap } from "./misconception";

// สร้างรายงานจุดผิดรายคนสำหรับผู้สอน
//
// ฟังก์ชันบริสุทธิ์: รับข้อมูลเข้า → คืนรายงาน ไม่แตะฐานข้อมูล ไม่แตะเครือข่าย
// นี่คือ "รอยต่อ" เดียวที่ใช้ทดสอบฟีเจอร์นี้ — ตรรกะทั้งหมดอยู่ที่นี่
// (จับคู่ trap · นับป้ายชั้น 1 · นับหัวข้อ · แบ่งช่วงเวลา · จัดอันดับ)
// ส่วน route/หน้าเว็บ/สิทธิ์ เป็นแค่ท่อส่งของ

const UNKNOWN = "ยังไม่รู้สาเหตุ";

// เรียงอันดับ: ถี่มากก่อน · เท่ากันเรียงตามที่เจอล่าสุด · เท่ากันอีกเรียงตามชื่อ (ให้ลำดับคงที่)
function rank(groups) {
  return Object.values(groups).sort(
    (a, b) =>
      b.count - a.count ||
      String(b.lastSeen).localeCompare(String(a.lastSeen)) ||
      String(a.key).localeCompare(String(b.key)),
  );
}

function summarise(rows) {
  const byTag = {};
  const byTopic = {};

  for (const r of rows) {
    // นับหัวข้อจากทุกครั้งที่ตอบ (ต้องรู้ว่าผิดกี่ครั้งจากที่ทำไปกี่ครั้ง)
    const t = (byTopic[r.topic] ||= {
      key: r.topic,
      topic: r.topic,
      count: 0,
      total: 0,
      lastSeen: null,
    });
    t.total += 1;
    if (r.isCorrect) continue;
    t.count += 1;
    if (!t.lastSeen || r.createdAt > t.lastSeen) t.lastSeen = r.createdAt;

    // ป้ายชั้น 1 — ข้อที่จับคู่ trap ไม่ได้ ไปรวมกันในถังเดียว (เป็นคิวให้ AI ช่วยเดาต่อ)
    const key = r.tag || UNKNOWN;
    const g = (byTag[key] ||= {
      key,
      tag: r.tag,
      matched: Boolean(r.tag),
      count: 0,
      lastSeen: null,
      trapRefs: {},
      items: [],
    });
    g.count += 1;
    if (!g.lastSeen || r.createdAt > g.lastSeen) g.lastSeen = r.createdAt;
    if (r.trapRef) g.trapRefs[r.trapRef] = (g.trapRefs[r.trapRef] || 0) + 1;
    g.items.push(r);
  }

  const wrong = rows.filter((r) => !r.isCorrect).length;
  return {
    totals: {
      attempts: rows.length,
      wrong,
      correct: rows.length - wrong,
      hints: rows.reduce((s, r) => s + r.hintCount, 0),
    },
    byTag: rank(byTag).map((g) => ({
      ...g,
      // เรียงเลขดัชนี trap ที่พบในกลุ่มนี้ จากที่เจอบ่อยสุด
      trapRefs: Object.entries(g.trapRefs)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([ref, count]) => ({ ref, count })),
      items: g.items.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    })),
    byTopic: rank(byTopic).filter((t) => t.count > 0),
  };
}

export function buildReport({ attempts = [], problemsById = {}, since = null } = {}) {
  const rows = attempts.map((a) => {
    const p = problemsById[a.problem_id] || null;
    const hit = a.is_correct ? null : matchTrap(p, a.answer);
    return {
      problemId: a.problem_id,
      topic: a.topic || p?.topic || "อื่น ๆ",
      subskill: p?.subskill || "",
      difficulty: p?.difficulty ?? null,
      statement: p?.statement || "",
      answer: a.answer,
      isCorrect: Boolean(a.is_correct),
      hintCount: a.hint_count || 0,
      createdAt: a.created_at,
      examSet: a.exam_set || null,
      misconception: hit?.text || null,
      tag: hit?.tag || null,
      trapRef: hit?.trapRef || null,
    };
  });
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  // ตัดช่วง "ตั้งแต่คาบที่แล้ว" — ไม่มีจุดตัด = ยังไม่เคยเปิดรายงาน ให้ถือว่าใหม่ทั้งหมด
  const recent = since ? rows.filter((r) => r.createdAt && r.createdAt > since) : rows;

  return {
    since,
    recent: { from: since, ...summarise(recent) },
    all: summarise(rows),
  };
}
