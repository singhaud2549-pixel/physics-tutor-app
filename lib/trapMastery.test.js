import { describe, it, expect } from "vitest";
import { buildTrapBook } from "./trapMastery";

// รอยต่อเดียวของเฟส 2 — ป้อน attempts + คลังโจทย์ เช็คสถานะรายป้าย

const P = (id, traps, trapTags, extra = {}) => ({
  id,
  topic: "จลนศาสตร์",
  traps,
  trapTags,
  trapRefs: trapTags.map(() => null),
  ...extra,
});

// คลังจำลอง: ป้าย A อยู่ 3 ข้อ (A1 exam, A2, A3 ฝึก) · ป้าย B อยู่ข้อเดียว · ป้าย C ไม่เคยแตะ
const problems = {
  A1: P("A1", ["ตอบ 180 — คิดว่าความเร็วคงที่"], ["#พลาด/เงื่อนไข"], { examSet: "MOCK-1" }),
  A2: P("A2", ["ตอบ 36 — ใช้สูตรเร่งคงที่ทั้งที่ a ไม่คงที่"], ["#พลาด/เงื่อนไข"]),
  A3: P("A3", ["ตอบ 50 — ลืมเทอม ut"], ["#พลาด/เงื่อนไข"]),
  B1: P("B1", ["ตอบ 40 — ลืมหาร 2"], ["#พลาด/สูตรผิด"]),
  C1: P("C1", ["ตอบ 5 — อะไรสักอย่าง"], ["#พลาด/หน่วย"]),
};

const at = (problem_id, answer, is_correct, created_at) => ({
  problem_id,
  answer,
  is_correct,
  created_at,
});

const statusOf = (book, tag) => book.tags.find((t) => t.tag === tag);

describe("buildTrapBook", () => {
  it("ตก A1 แล้วผ่าน A2+A3 เปลือกใหม่ = ปราบแล้ว", () => {
    const book = buildTrapBook({
      attempts: [
        at("A1", "180", false, "2026-08-20T10:00:00Z"),
        at("A2", "ok", true, "2026-08-21T10:00:00Z"),
        at("A3", "ok", true, "2026-08-22T10:00:00Z"),
      ],
      problemsById: problems,
    });
    const g = statusOf(book, "#พลาด/เงื่อนไข");
    expect(g.status).toBe("slain");
    expect(g).toMatchObject({ hits: 1, passes: 2 });
    expect(book.summary.slain).toBe(1);
  });

  it("ผ่านข้อเดิมที่เคยตกซ้ำไม่นับ — ยังโดนกินอยู่", () => {
    const book = buildTrapBook({
      attempts: [
        at("A1", "180", false, "2026-08-20T10:00:00Z"),
        at("A1", "ok", true, "2026-08-21T10:00:00Z"),
        at("A1", "ok", true, "2026-08-22T10:00:00Z"),
      ],
      problemsById: problems,
    });
    const g = statusOf(book, "#พลาด/เงื่อนไข");
    expect(g.status).toBe("bitten");
    expect(g.passes).toBe(0);
  });

  it("ตกแล้วผ่านเปลือกใหม่ 1 ครั้ง = กำลังไล่", () => {
    const book = buildTrapBook({
      attempts: [
        at("A1", "180", false, "2026-08-20T10:00:00Z"),
        at("A2", "ok", true, "2026-08-21T10:00:00Z"),
      ],
      problemsById: problems,
    });
    expect(statusOf(book, "#พลาด/เงื่อนไข").status).toBe("chasing");
  });

  it("ผ่านก่อนตกครั้งแรกไม่นับ", () => {
    const book = buildTrapBook({
      attempts: [
        at("A2", "ok", true, "2026-08-19T10:00:00Z"),
        at("A3", "ok", true, "2026-08-19T11:00:00Z"),
        at("A1", "180", false, "2026-08-20T10:00:00Z"),
      ],
      problemsById: problems,
    });
    const g = statusOf(book, "#พลาด/เงื่อนไข");
    expect(g.status).toBe("bitten");
    expect(g.passes).toBe(0);
  });

  it("ไม่มีเวลา (เซสชันเก่า) → นับ pass ทั้งหมด", () => {
    const book = buildTrapBook({
      attempts: [at("A1", "180", false), at("A2", "ok", true), at("A3", "ok", true)],
      problemsById: problems,
    });
    expect(statusOf(book, "#พลาด/เงื่อนไข").status).toBe("slain");
  });

  it("เจอแล้วไม่เคยพลาด = unbitten · ไม่เคยเจอ = unseen", () => {
    const book = buildTrapBook({
      attempts: [at("B1", "ok", true, "2026-08-20T10:00:00Z")],
      problemsById: problems,
    });
    expect(statusOf(book, "#พลาด/สูตรผิด").status).toBe("unbitten");
    expect(statusOf(book, "#พลาด/เงื่อนไข").status).toBe("unseen");
    expect(statusOf(book, "#พลาด/หน่วย").status).toBe("unseen");
    expect(book.summary).toMatchObject({ unbitten: 1, unseen: 2, total: 3 });
  });

  it("ตอบผิดไม่ตรง trap ไหนเลย → ไม่นับ hit", () => {
    const book = buildTrapBook({
      attempts: [at("B1", "999", false, "2026-08-20T10:00:00Z")],
      problemsById: problems,
    });
    expect(statusOf(book, "#พลาด/สูตรผิด").status).toBe("unbitten");
    expect(statusOf(book, "#พลาด/สูตรผิด").hits).toBe(0);
  });

  it("ลิงก์ซ่อมชี้ข้อฝึกเปลือกใหม่ ไม่ชี้ข้อสอบหรือข้อที่เคยตก", () => {
    const book = buildTrapBook({
      attempts: [at("A1", "180", false, "2026-08-20T10:00:00Z")],
      problemsById: problems,
    });
    // A1 เป็นข้อสอบ + เคยตกแล้ว → ต้องได้ A2 (ฝึก, เปลือกใหม่)
    expect(statusOf(book, "#พลาด/เงื่อนไข").practiceProblemId).toBe("A2");
  });

  it("ไม่มีข้อมูลเลย → ทุกป้าย unseen ไม่ error", () => {
    const book = buildTrapBook({ attempts: [], problemsById: problems });
    expect(book.summary).toMatchObject({ unseen: 3, total: 3 });
  });
});
