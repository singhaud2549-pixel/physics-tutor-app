import { buildTrapBook } from "./trapMastery";

// ภารกิจรายวัน — จัดงาน 3-5 ชิ้นข้ามบทตามงบเวลาที่เด็กมี
//
// ลำดับ (ยืม TUXA: ปิดของค้างก่อนเปิดของใหม่):
// 1) ซ่อมตระกูลกับดักที่ยังไม่ปราบ (bitten/chasing จาก lib/trapMastery.js)
// 2) ฝึกบทที่ผิดบ่อย (ยังไม่มีภารกิจซ่อมในบทนั้น)
// 3) เปิดบทใหม่ที่ยังไม่เคยแตะ
//
// งานทุกชิ้นเป็นโจทย์ฝึก (ไม่รวมข้อสอบ) ภายใต้เพดานระดับที่ครูตั้งไว้
// ฟังก์ชันบริสุทธิ์ — เทสต์ที่รอยต่อเดียว ไม่แตะ DB

export const MAX_MISSIONS = 5;

// เวลาประเมินต่อข้อตามระดับความยาก (นาที) — ไว้อธิบายว่าทำไมแผนนี้พอดีงบ
export const EST_BY_DIFFICULTY = { 1: 2, 2: 3, 3: 5, 4: 8, 5: 12 };

export function estMinutes(difficulty) {
  return EST_BY_DIFFICULTY[difficulty] || 5;
}

export function buildMissions({
  attempts = [],
  problemsById = {},
  budgetMinutes = 30,
  maxDifficulty = null,
} = {}) {
  const budget = Math.max(5, Number(budgetMinutes) || 30);
  // คลังฝึกภายใต้เพดานครู
  const pool = Object.values(problemsById || {}).filter(
    (p) => p && p.id && !p.examSet && (maxDifficulty == null || (p.difficulty || 2) <= maxDifficulty),
  );
  const byId = Object.fromEntries(pool.map((p) => [p.id, p]));

  const solved = new Set(
    (attempts || []).filter((a) => a.is_correct && a.problem_id).map((a) => a.problem_id),
  );
  const attemptedTopics = new Set();
  const wrongByTopic = {};
  for (const a of attempts || []) {
    const p = problemsById[a.problem_id];
    const topic = a.topic || p?.topic;
    if (!topic) continue;
    attemptedTopics.add(topic);
    if (!a.is_correct) wrongByTopic[topic] = (wrongByTopic[topic] || 0) + 1;
  }
  // tag → โจทย์ฝึกที่มี tag นี้ (เรียงง่ายไปยาก)
  const poolByTag = {};
  for (const p of pool) {
    for (const tag of new Set((p.trapTags || []).filter(Boolean))) {
      (poolByTag[tag] ||= []).push(p);
    }
  }
  for (const list of Object.values(poolByTag)) {
    list.sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2) || a.id.localeCompare(b.id));
  }

  const book = buildTrapBook({ attempts, problemsById });
  const missions = [];
  const used = new Set();
  let total = 0;
  const topicsWithRepair = new Set();

  // ใส่ได้เสมอถ้ายังเป็นชิ้นแรก (งบน้อยแค่ไหนก็ต้องมีงานเดียว) + ไม่เกิน 5 ชิ้น
  function push(m) {
    if (missions.length >= MAX_MISSIONS) return false;
    if (missions.length > 0 && total + m.estMinutes > budget) return false;
    missions.push(m);
    used.add(m.problemId);
    total += m.estMinutes;
    return true;
  }
  const pickUnsolved = (list) =>
    list.find((p) => !solved.has(p.id) && !used.has(p.id)) ||
    list.find((p) => !used.has(p.id)) ||
    null;

  // 1) ซ่อมตระกูลที่ยังไม่ปราบ — ต้องเป็นเปลือกใหม่เท่านั้น (หักข้อที่เคยตกออกก่อน)
  for (const t of book.tags) {
    if (t.status !== "bitten" && t.status !== "chasing") continue;
    const hitIds = new Set(t.hitProblemIds || []);
    const candidates = (poolByTag[t.tag] || []).filter((p) => !hitIds.has(p.id));
    const pick = pickUnsolved(candidates);
    if (!pick) continue;
    topicsWithRepair.add(pick.topic);
    push({
      kind: "repair",
      problemId: pick.id,
      topic: pick.topic,
      title: `ซ่อมตระกูล ${t.tag}`,
      reason: `ตกตระกูลนี้มา ${t.hits} ครั้ง — ปิดของค้างก่อนเปิดของใหม่`,
      estMinutes: estMinutes(pick.difficulty),
    });
  }

  // 2) บทที่ผิดบ่อย (ข้ามบทที่มีงานซ่อมแล้ว กันงานซ้ำซ้อน)
  const weakTopics = Object.entries(wrongByTopic)
    .filter(([topic]) => !topicsWithRepair.has(topic))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [topic, wrong] of weakTopics) {
    const list = pool
      .filter((p) => p.topic === topic)
      .sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2) || a.id.localeCompare(b.id));
    const pick = pickUnsolved(list);
    if (!pick) continue;
    push({
      kind: "weak",
      problemId: pick.id,
      topic,
      title: `ฝึกบท ${topic} ต่อ`,
      reason: `บทนี้ผิดมาแล้ว ${wrong} ครั้ง`,
      estMinutes: estMinutes(pick.difficulty),
    });
  }

  // 3) เปิดบทใหม่ที่ยังไม่เคยแตะ
  const freshTopics = [...new Set(pool.map((p) => p.topic))]
    .filter((t) => !attemptedTopics.has(t))
    .sort();
  for (const topic of freshTopics) {
    const list = pool
      .filter((p) => p.topic === topic)
      .sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2) || a.id.localeCompare(b.id));
    const pick = pickUnsolved(list);
    if (!pick) continue;
    push({
      kind: "new",
      problemId: pick.id,
      topic,
      title: `เริ่มบท ${topic}`,
      reason: "บทใหม่ที่ยังไม่เคยแตะ — เริ่มจากข้อง่ายสุด",
      estMinutes: estMinutes(pick.difficulty),
    });
  }

  return { missions, totalMinutes: total, budgetMinutes: budget, done: missions.length === 0 };
}
