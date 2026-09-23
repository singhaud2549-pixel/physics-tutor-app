import { matchTrap } from "./misconception";

// สมุดกับดัก — สถานะรายตระกูลของนักเรียน 1 คน
//
// หน่วย = ป้าย #พลาด/tag (12 ป้าย ครอบคลุม trap 622/622)
// ไม่ใช่เลข #trap/N (มีแค่ 138/622 = 22% — เอามาเป็นหน่วยแล้วตัวเลขหลอก)
// ตรงกับแกน byTag ใน lib/report.js: ป้ายเดียวกันนับรวมกัน ไม่สนสำนวน
//
// กฎปราบ (ยืม TUXA มาปรับ): เคยตกตระกูลนี้ แล้วผ่านในโจทย์เปลือกใหม่
// (problem_id อื่น) 2 ครั้งขึ้นไป
// - ผ่านข้อเดิมที่เคยตกซ้ำไม่นับ (จำข้อได้ ≠ หลุดกับดัก)
// - ผ่านก่อนตกครั้งแรกไม่นับ (ยังไม่เคยตก = ยังไม่ได้ปราบอะไร)
// - ไม่มีเวลาบันทึก (เซสชันเก่า) → นับ pass ทั้งหมด ไม่กรองเวลา
//
// ฟังก์ชันบริสุทธิ์เหมือน lib/report.js — เทสต์ที่รอยต่อเดียว ไม่แตะ DB

export const PASSES_TO_SLAY = 2;

export const STATUS = {
  slain: "slain", // ปราบแล้ว
  chasing: "chasing", // กำลังไล่ (ผ่านเปลือกใหม่ 1 ครั้ง)
  bitten: "bitten", // ยังโดนกิน (ตกแล้ว ยังไม่ผ่านเปลือกใหม่เลย)
  unbitten: "unbitten", // เจอแล้วแต่ยังไม่เคยพลาด
  unseen: "unseen", // ยังไม่เคยเจอ
};

const ORDER = { bitten: 0, chasing: 1, unbitten: 2, slain: 3, unseen: 4 };

export function buildTrapBook({ attempts = [], problemsById = {} } = {}) {
  // 1) คลัง: tag → โจทย์ที่มี tag นี้ + ตัวอย่างข้อความ trap
  const bank = {};
  for (const [pid, p] of Object.entries(problemsById || {})) {
    const tags = p.trapTags || [];
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      if (!tag) continue;
      const g = (bank[tag] ||= { tag, problems: new Set(), example: null });
      g.problems.add(pid);
      if (g.example === null && p.traps?.[i]) g.example = p.traps[i];
    }
  }

  // 2) กวาด attempts: ตกตรง tag ไหน / ผ่านข้อที่มี tag ไหน
  const hitsByTag = {}; // tag → [{problemId, createdAt, text}]
  const passByTag = {}; // tag → Map(problemId → createdAt)
  const seenProblems = new Set();
  for (const a of attempts || []) {
    if (!a.problem_id) continue;
    seenProblems.add(a.problem_id);
    const p = problemsById[a.problem_id];
    if (!p) continue;
    if (a.is_correct) {
      for (const tag of new Set((p.trapTags || []).filter(Boolean))) {
        ((passByTag[tag] ||= new Map())).set(a.problem_id, a.created_at || null);
      }
    } else {
      const hit = matchTrap(p, a.answer);
      if (hit?.tag) {
        (hitsByTag[hit.tag] ||= []).push({
          problemId: a.problem_id,
          createdAt: a.created_at || null,
          text: hit.text,
        });
      }
    }
  }

  // 3) ตัดสินราย tag
  const tags = Object.values(bank).map((g) => {
    const hits = (hitsByTag[g.tag] || []).slice().sort((a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt)),
    );
    const firstHitAt = hits.map((h) => h.createdAt).filter(Boolean).sort()[0] || null;
    const hitIds = new Set(hits.map((h) => h.problemId));
    const passes = [];
    for (const [pid, at] of passByTag[g.tag] || []) {
      if (hitIds.has(pid)) continue; // ข้อเดิมที่เคยตกไม่นับ
      if (firstHitAt && at && !(at >= firstHitAt)) continue; // ผ่านก่อนตกไม่นับ
      passes.push({ problemId: pid, createdAt: at });
    }
    passes.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    const seen = [...g.problems].some((pid) => seenProblems.has(pid));
    let status;
    if (!hits.length) status = seen ? STATUS.unbitten : STATUS.unseen;
    else if (passes.length >= PASSES_TO_SLAY) status = STATUS.slain;
    else if (passes.length === 1) status = STATUS.chasing;
    else status = STATUS.bitten;

    const times = [...hits.map((h) => h.createdAt), ...passes.map((p) => p.createdAt)].filter(
      Boolean,
    );
    // โจทย์ซ่อม: ข้อฝึก (ไม่รวมข้อสอบ) เปลือกใหม่ที่มี tag นี้
    const practiceProblemId =
      [...g.problems]
        .filter((pid) => !problemsById[pid]?.examSet && !hitIds.has(pid))
        .sort()[0] || null;

    return {
      tag: g.tag,
      status,
      hits: hits.length,
      passes: passes.length,
      hitProblemIds: [...hitIds],
      lastSeen: times.sort().pop() || null,
      example: hits.length ? hits[hits.length - 1].text : g.example,
      practiceProblemId,
    };
  });
  tags.sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || b.hits - a.hits || a.tag.localeCompare(b.tag),
  );

  const summary = { slain: 0, chasing: 0, bitten: 0, unbitten: 0, unseen: 0, total: tags.length };
  for (const t of tags) summary[t.status] += 1;

  return { tags, summary };
}
