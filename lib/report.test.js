import { describe, it, expect } from "vitest";
import { buildReport } from "./report";

// เทสต์ที่รอยต่อเดียวของฟีเจอร์นี้ — ป้อนประวัติการตอบ + ข้อมูลโจทย์ แล้วเช็ครายงานที่ออกมา
// ตรวจเฉพาะพฤติกรรมที่มองเห็นจากภายนอก ไม่แตะโครงสร้างข้อมูลข้างใน
// ไม่ต่อฐานข้อมูล ไม่ล็อกอิน — รันเสร็จในเสี้ยววินาที

// โจทย์จำลอง: เขียน trap คนละสำนวนแต่ป้ายเดียวกัน (นี่คือหัวใจของฟีเจอร์)
const problems = {
  A1: {
    id: "A1",
    topic: "จลนศาสตร์",
    traps: ["ตอบ 180 — คิดว่าความเร็วคงที่ ลืมว่ารถกำลังช้าลง"],
    trapTags: ["#พลาด/เงื่อนไข"],
    trapRefs: ["#trap/89"],
  },
  A2: {
    id: "A2",
    topic: "จลนศาสตร์",
    traps: ["ตอบ 36 — ใช้สูตรความเร่งคงที่ทั้งที่ a ไม่คงที่"],
    trapTags: ["#พลาด/เงื่อนไข"],
    trapRefs: ["#trap/89"],
  },
  B1: {
    id: "B1",
    topic: "โพรเจกไทล์",
    traps: ["ตอบ 40 — ลืมหาร 2"],
    trapTags: ["#พลาด/สูตรผิด"],
    trapRefs: ["#trap/1"],
  },
  C1: {
    id: "C1",
    topic: "ของไหล",
    traps: ["ตอบ 5 — อะไรสักอย่าง"], // ยังไม่ได้ติดป้าย
    trapTags: [null],
    trapRefs: [null],
  },
};

const at = (problem_id, answer, is_correct, created_at, extra = {}) => ({
  problem_id,
  topic: problems[problem_id]?.topic,
  answer,
  is_correct,
  created_at,
  hint_count: 0,
  ...extra,
});

const build = (attempts, since = null) => buildReport({ attempts, problemsById: problems, since });

describe("buildReport", () => {
  it("ตอบผิดตรงกับ trap → ขึ้นเป็นจุดผิดพร้อมป้ายที่ถูกต้อง", () => {
    const r = build([at("B1", "40", false, "2026-08-20T10:00:00Z")]);
    expect(r.all.byTag).toHaveLength(1);
    expect(r.all.byTag[0].tag).toBe("#พลาด/สูตรผิด");
    expect(r.all.byTag[0].matched).toBe(true);
    expect(r.all.byTag[0].trapRefs).toEqual([{ ref: "#trap/1", count: 1 }]);
  });

  it("ผิดคนละข้อคนละสำนวนแต่ป้ายเดียวกัน → นับรวมเป็นรายการเดียว", () => {
    const r = build([
      at("A1", "180", false, "2026-08-20T10:00:00Z"),
      at("A2", "36", false, "2026-08-21T10:00:00Z"),
    ]);
    expect(r.all.byTag).toHaveLength(1);
    expect(r.all.byTag[0].tag).toBe("#พลาด/เงื่อนไข");
    expect(r.all.byTag[0].count).toBe(2);
    expect(r.all.byTag[0].trapRefs).toEqual([{ ref: "#trap/89", count: 2 }]);
  });

  it("ตอบผิดที่ไม่ตรง trap ไหนเลย → เข้ากลุ่มข้อสันนิษฐาน แยกจากที่จับคู่ได้", () => {
    const r = build([
      at("B1", "40", false, "2026-08-20T10:00:00Z"),
      at("B1", "999", false, "2026-08-20T11:00:00Z"),
    ]);
    const unknown = r.all.byTag.find((g) => !g.matched);
    expect(unknown).toBeDefined();
    expect(unknown.count).toBe(1);
    expect(unknown.items[0].misconception).toBeNull();
    expect(r.all.byTag.filter((g) => g.matched)).toHaveLength(1);
  });

  it("โจทย์ที่ยังไม่ได้ติดป้าย → ไม่พัง และยังนับในแกนหัวข้อ", () => {
    const r = build([at("C1", "5", false, "2026-08-20T10:00:00Z")]);
    expect(r.all.byTag[0].matched).toBe(false);
    expect(r.all.byTag[0].items[0].misconception).toBe("อะไรสักอย่าง");
    expect(r.all.byTopic).toEqual([
      expect.objectContaining({ topic: "ของไหล", count: 1, total: 1 }),
    ]);
  });

  it("ตอบถูก → ไม่โผล่ในอันดับจุดผิด แต่ยังนับรวมในยอดที่ทำไป", () => {
    const r = build([
      at("B1", "20", true, "2026-08-20T10:00:00Z"),
      at("B1", "40", false, "2026-08-20T11:00:00Z"),
    ]);
    expect(r.all.totals).toMatchObject({ attempts: 2, correct: 1, wrong: 1 });
    expect(r.all.byTag).toHaveLength(1);
    expect(r.all.byTopic[0]).toMatchObject({ count: 1, total: 2 });
  });

  it("ตอบข้อเดิมผิดซ้ำหลายครั้ง → นับตามจำนวนครั้งจริง", () => {
    const r = build([
      at("B1", "40", false, "2026-08-20T10:00:00Z"),
      at("B1", "40", false, "2026-08-21T10:00:00Z"),
      at("B1", "40", false, "2026-08-22T10:00:00Z"),
    ]);
    expect(r.all.byTag[0].count).toBe(3);
    expect(r.all.byTag[0].trapRefs[0].count).toBe(3);
  });

  it("จุดตัดเวลา → ของเก่าหายจากช่วง 'ตั้งแต่คาบที่แล้ว' แต่ยังอยู่ในช่วงสะสม", () => {
    const r = build(
      [
        at("A1", "180", false, "2026-08-01T10:00:00Z"),
        at("B1", "40", false, "2026-08-25T10:00:00Z"),
      ],
      "2026-08-20T00:00:00Z",
    );
    expect(r.recent.totals.wrong).toBe(1);
    expect(r.recent.byTag[0].tag).toBe("#พลาด/สูตรผิด");
    expect(r.all.totals.wrong).toBe(2);
    expect(r.all.byTag).toHaveLength(2);
  });

  it("ไม่มีจุดตัดเวลา → ถือว่าใหม่ทั้งหมด", () => {
    const r = build([at("A1", "180", false, "2026-08-01T10:00:00Z")]);
    expect(r.recent.totals.attempts).toBe(1);
  });

  it("ไม่มีประวัติเลย / มีแต่คำตอบถูก → รายงานว่างที่อ่านรู้เรื่อง ไม่ใช่ error", () => {
    const empty = build([]);
    expect(empty.all.totals).toMatchObject({ attempts: 0, wrong: 0 });
    expect(empty.all.byTag).toEqual([]);
    expect(empty.all.byTopic).toEqual([]);

    const allRight = build([at("B1", "20", true, "2026-08-20T10:00:00Z")]);
    expect(allRight.all.byTag).toEqual([]);
    expect(allRight.all.byTopic).toEqual([]);
  });

  it("จัดอันดับจากถี่ไปน้อย และเสมอกันแล้วลำดับคงที่", () => {
    const attempts = [
      at("A1", "180", false, "2026-08-20T10:00:00Z"),
      at("A2", "36", false, "2026-08-20T11:00:00Z"),
      at("B1", "40", false, "2026-08-20T12:00:00Z"),
    ];
    const r = build(attempts);
    expect(r.all.byTag.map((g) => g.count)).toEqual([2, 1]);
    expect(r.all.byTag[0].tag).toBe("#พลาด/เงื่อนไข");

    // สลับลำดับข้อมูลเข้า → ผลต้องเหมือนเดิมเป๊ะ
    const shuffled = build([attempts[2], attempts[0], attempts[1]]);
    expect(shuffled.all.byTag.map((g) => g.key)).toEqual(r.all.byTag.map((g) => g.key));
  });

  it("นับจำนวนครั้งที่ขอคำใบ้รวมให้ด้วย", () => {
    const r = build([
      at("B1", "40", false, "2026-08-20T10:00:00Z", { hint_count: 3 }),
      at("B1", "20", true, "2026-08-20T11:00:00Z", { hint_count: 1 }),
    ]);
    expect(r.all.totals.hints).toBe(4);
  });
});
