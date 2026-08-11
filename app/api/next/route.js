import { getAllPublic } from "../../../lib/problems";

export const dynamic = "force-dynamic";

// แนะนำโจทย์ข้อต่อไป (adaptive)
// หลัก: ทบทวนข้อที่เคยพลาด → ฝึกแนวเดิมให้แม่น → พอเก่งแล้วเลื่อนแนวถัดไป
export async function POST(request) {
  // currentSolved = false → นักเรียนขอดูเฉลยข้อนี้ (ยังทำเองไม่ได้)
  // ข้อนี้ต้องยังนับว่า "ยังไม่ผ่าน" เพื่อวนกลับมาให้ทบทวนวันหลัง แต่ไม่เด้งซ้ำทันทีตอนนี้
  const { currentId, history = [], currentSolved = true } = await request.json();
  const all = getAllPublic();
  const byId = {};
  for (const p of all) byId[p.id] = p;
  const current = byId[currentId];
  if (!current) return Response.json({ done: false, nextId: null, reason: "" });

  const pool = all.filter((p) => p.topic === current.topic); // ในบทเดียวกัน

  // สถานะจากประวัติ
  const solved = new Set();
  const wrong = new Set();
  for (const h of history) {
    if (h.is_correct) solved.add(h.problem_id);
    else wrong.add(h.problem_id);
  }
  if (currentSolved) solved.add(currentId); // เพิ่งทำข้อนี้ถูก

  const isSolved = (id) => solved.has(id);
  const wrongUnsolved = (id) => wrong.has(id) && !solved.has(id);

  // จัดกลุ่มตามแนวย่อย + ลำดับแนว (ความยากต่ำสุดก่อน)
  const subs = {};
  for (const p of pool) (subs[p.subskill || "อื่น ๆ"] ||= []).push(p);
  const subOrder = Object.keys(subs).sort((a, b) => {
    const minA = Math.min(...subs[a].map((p) => p.difficulty));
    const minB = Math.min(...subs[b].map((p) => p.difficulty));
    return minA - minB || subs[a][0].id.localeCompare(subs[b][0].id);
  });

  const unsolvedInSub = (s) =>
    (subs[s] || [])
      .filter((p) => !isSolved(p.id) && p.id !== currentId)
      .sort((a, b) => a.difficulty - b.difficulty);

  const curSub = current.subskill || "อื่น ๆ";

  // แนว "ผ่าน" = ทำครบทุกข้อในแนว หรือ 3 ครั้งล่าสุดในแนวนี้ถูกหมด
  const subCleared = (s) => {
    if ((subs[s] || []).every((p) => isSolved(p.id))) return true;
    const inSub = history.filter((h) => byId[h.problem_id]?.subskill === s);
    const last3 = inSub.slice(-3);
    return last3.length >= 3 && last3.every((h) => h.is_correct);
  };

  const send = (nextId, reason, done = false) =>
    Response.json({ done, nextId, reason });

  // 1) ทบทวนข้อที่เคยพลาดและยังไม่ผ่าน (แนวปัจจุบันก่อน แล้วค่อยแนวอื่น)
  // ข้อที่เพิ่งดูเฉลยไปเมื่อกี้ไม่ต้องเด้งซ้ำทันที (เพิ่งเห็นวิธีทำไปสด ๆ)
  const reinforce = [
    ...(subs[curSub] || []).filter((p) => wrongUnsolved(p.id)),
    ...pool.filter((p) => wrongUnsolved(p.id) && p.subskill !== curSub),
  ]
    .filter((p) => p.id !== currentId)
    .sort((a, b) => a.difficulty - b.difficulty);
  if (reinforce.length)
    return send(reinforce[0].id, "ทบทวนข้อที่เคยพลาดให้แม่นขึ้น");

  // 2) แนวปัจจุบันยังไม่ผ่าน → ข้อถัดไปในแนวเดิม (ง่ายไปยาก)
  if (!subCleared(curSub)) {
    const next = unsolvedInSub(curSub)[0];
    if (next) return send(next.id, "ฝึกแนวเดิมต่อให้แม่นขึ้น");
  }

  // 3) เลื่อนไปแนวถัดไปที่ยังมีข้อไม่ผ่าน
  const curIdx = subOrder.indexOf(curSub);
  const rotated = [...subOrder.slice(curIdx + 1), ...subOrder.slice(0, curIdx + 1)];
  for (const s of rotated) {
    const next = unsolvedInSub(s)[0];
    if (next) return send(next.id, `เก่งแนวนี้แล้ว 💪 ไปแนวถัดไป: ${s}`);
  }

  // 4) ทำครบบทแล้ว
  return send(null, "ทำครบบทนี้แล้ว เก่งมาก! 🎉", true);
}
