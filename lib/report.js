import { matchTrap } from "./misconception";

// สร้างรายงานจุดผิดรายคนสำหรับผู้สอน
//
// ฟังก์ชันบริสุทธิ์: รับข้อมูลเข้า → คืนรายงาน ไม่แตะฐานข้อมูล ไม่แตะเครือข่าย
// นี่คือ "รอยต่อ" เดียวที่ใช้ทดสอบฟีเจอร์นี้ — ตรรกะทั้งหมดอยู่ที่นี่
// (จับคู่ trap · นับป้ายชั้น 1 · นับหัวข้อ · แบ่งช่วงเวลา · จัดอันดับ · คำถาม orphan)
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

// ดึง problemId จาก transcript (route รุ่นใหม่แนบ problem_id มาทุกข้อความ)
function sessionProblemId(transcript) {
  for (const m of transcript || []) {
    const id = m.problem_id || m.problemId || m.problemIdText;
    if (id) return id;
  }
  return null;
}

function sessionTime(transcript) {
  let latest = null;
  let maxSecs = null;
  for (const m of transcript || []) {
    if (m.created_at && (!latest || m.created_at > latest)) latest = m.created_at;
    if (typeof m.seconds_on_problem === "number" && m.seconds_on_problem > 0) {
      maxSecs = maxSecs === null ? m.seconds_on_problem : Math.max(maxSecs, m.seconds_on_problem);
    }
  }
  return { latest, maxSecs };
}

// รวมคำถามที่เด็กพิมพ์ถามจากทุก session (รวม orphan ที่ถามโดยยังไม่ส่งคำตอบ)
// คืนลิสต์เรียงใหม่สุดก่อน พร้อมคำตอบของ AI (hint ถัดไปใน session เดียวกัน)
function collectQuestions(transcriptsBySession, problemsById, since = null, limit = 50) {
  const out = [];
  for (const [sessionKey, list] of Object.entries(transcriptsBySession || {})) {
    const sorted = [...(list || [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const pid = sessionProblemId(sorted);
    const topic = (pid && problemsById[pid]?.topic) || null;
    for (let i = 0; i < sorted.length; i++) {
      const m = sorted[i];
      if (m.role !== "question") continue;
      if (since && m.created_at && !(m.created_at > since)) continue;
      // คำตอบของ AI = hint ถัดไปใน session เดียวกัน (ถ้ามี)
      const reply = sorted.slice(i + 1).find((x) => x.role === "hint")?.text || null;
      out.push({
        sessionKey,
        problemId: pid,
        topic,
        text: m.text,
        createdAt: m.created_at || null,
        secondsOnProblem:
          typeof m.seconds_on_problem === "number" ? m.seconds_on_problem : null,
        reply,
      });
    }
  }
  out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return out.slice(0, limit);
}

function summarise(displayRows, transcriptsBySession, sinceForQuestions = null) {
  const byTag = {};
  const byTopic = {};

  for (const r of displayRows) {
    // orphan (ถามโดยยังไม่ส่งคำตอบ) ไม่นับในแกนหัวข้อ — กันตัวเลข %ผิดเพี้ยน
    // แต่ยังนับในถัง UNKNOWN ด้านล่างเพื่อให้ครูเห็นว่ามี session ค้างอยู่
    if (!r.orphan) {
      const t = (byTopic[r.topic] ||= {
        key: r.topic,
        topic: r.topic,
        count: 0,
        total: 0,
        lastSeen: null,
      });
      t.total += 1;
      if (!t.lastSeen || (r.createdAt && r.createdAt > t.lastSeen)) t.lastSeen = r.createdAt;
      if (!r.isCorrect) t.count += 1;
    }
    if (r.isCorrect) continue;

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
    if (!g.lastSeen || (r.createdAt && r.createdAt > g.lastSeen)) g.lastSeen = r.createdAt;
    if (r.trapRef) g.trapRefs[r.trapRef] = (g.trapRefs[r.trapRef] || 0) + 1;
    g.items.push(r);
  }

  const realRows = displayRows.filter((r) => !r.orphan);
  const orphanCount = displayRows.length - realRows.length;
  const wrong = realRows.filter((r) => !r.isCorrect).length;
  const secs = displayRows
    .map((r) => r.secondsOnProblem)
    .filter((n) => typeof n === "number" && n > 0);

  // นับคำถามจากบทสนทนาทุก session (รวม orphan) — ไล่ทีละ session กันนับซ้ำ
  // เมื่อโจทย์ข้อเดียวตอบหลายครั้ง (session เดียวกัน)
  const seenSessions = new Set();
  let questions = 0;
  const countIn = (transcript) =>
    (transcript || []).filter((m) => m.role === "question").length;
  for (const r of displayRows) {
    if (!r.sessionKey || seenSessions.has(r.sessionKey)) continue;
    seenSessions.add(r.sessionKey);
    questions += countIn(r.transcript);
  }
  // session ที่ไม่มี attempts เลย (orphan ที่ problemId มองไม่เห็น) ก็นับด้วย
  for (const [key, list] of Object.entries(transcriptsBySession || {})) {
    if (seenSessions.has(key)) continue;
    seenSessions.add(key);
    questions += countIn(list);
  }

  return {
    totals: {
      attempts: realRows.length,
      wrong,
      correct: realRows.length - wrong,
      orphanSessions: orphanCount,
      sessions: seenSessions.size,
      hints: displayRows.reduce((s, r) => s + r.hintCount, 0),
      questions,
      // ใช้ค่ากลาง ไม่ใช่ค่าเฉลี่ย — กันกรณีเปิดหน้าโจทย์ทิ้งไว้แล้วตัวเลขเพี้ยน
      medianSeconds: secs.length
        ? secs.slice().sort((a, b) => a - b)[Math.floor(secs.length / 2)]
        : null,
      totalSeconds: secs.reduce((a, b) => a + b, 0),
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

export function buildReport({
  attempts = [],
  problemsById = {},
  since = null,
  transcriptsBySession = {},
} = {}) {
  const attemptSessionKeys = new Set(
    attempts.map((a) => a.session_key).filter(Boolean),
  );
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
      secondsOnProblem: a.seconds_on_problem ?? null,
      sessionKey: a.session_key || null,
      // บทสนทนากับ AI ของครั้งที่เปิดโจทย์นั้น — ผู้สอนใช้ดูว่าเด็กติดตรงไหนและ AI ใบ้ว่าอะไร
      transcript: a.session_key ? transcriptsBySession[a.session_key] || [] : [],
      misconception: hit?.text || null,
      tag: hit?.tag || null,
      trapRef: hit?.trapRef || null,
      orphan: false,
    };
  });

  // session ที่มีบทสนทนาแต่ไม่มี attempts (ถามอย่างเดียว/กดขอใบ้แล้วปิดหนี)
  // เดิมหลุดจากรายงานทั้งหมด — สร้างแถว orphan ให้ครูเห็น
  const orphans = [];
  for (const [sessionKey, list] of Object.entries(transcriptsBySession || {})) {
    if (attemptSessionKeys.has(sessionKey)) continue;
    const transcript = [...(list || [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    if (!transcript.length) continue;
    // ต้องมีกิจกรรมจริง (ไม่ใช่แค่เปิดหน้า) และต้องรู้ว่าเป็นข้อไหน
    const hasActivity = transcript.some((m) =>
      ["question", "ask", "student", "hint"].includes(m.role),
    );
    if (!hasActivity) continue;
    const problemId = sessionProblemId(transcript);
    if (!problemId) continue;
    const p = problemsById[problemId] || null;
    const { latest, maxSecs } = sessionTime(transcript);
    orphans.push({
      problemId,
      topic: p?.topic || "อื่น ๆ",
      subskill: p?.subskill || "",
      difficulty: p?.difficulty ?? null,
      statement: p?.statement || "",
      answer: "(ยังไม่ส่งคำตอบ)",
      isCorrect: false,
      hintCount: transcript.filter((m) => m.role === "hint").length,
      createdAt: latest,
      examSet: null,
      secondsOnProblem: maxSecs,
      sessionKey,
      transcript,
      misconception: null,
      tag: null,
      trapRef: null,
      orphan: true,
    });
  }

  const displayRows = [...rows, ...orphans];
  displayRows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  // ตัดช่วง "ตั้งแต่คาบที่แล้ว" — ไม่มีจุดตัด = ยังไม่เคยเปิดรายงาน ให้ถือว่าใหม่ทั้งหมด
  const recentRows = since
    ? displayRows.filter((r) => r.createdAt && r.createdAt > since)
    : displayRows;

  const recentSummary = summarise(recentRows, transcriptsBySession, since);
  const allSummary = summarise(displayRows, transcriptsBySession, null);

  return {
    since,
    recent: {
      from: since,
      ...recentSummary,
      recentQuestions: collectQuestions(transcriptsBySession, problemsById, since),
    },
    all: {
      ...allSummary,
      recentQuestions: collectQuestions(transcriptsBySession, problemsById, null),
    },
  };
}
