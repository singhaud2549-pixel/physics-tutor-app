import { describe, it, expect } from "vitest";
import { buildDebrief, classifyItem } from "./debrief";

// รอยต่อเดียวของเฟส 1 — ป้อนผลรายข้อ เช็ค bucket ที่ออกมา ไม่แตะ DB/เครือข่าย

const item = (id, correct, answered, seconds) => ({ id, correct, answered, seconds });

describe("classifyItem", () => {
  it("ตอบถูก = solid ไม่สนเวลา", () => {
    expect(classifyItem(item("Q1", true, true, 5)).valueOf()).toBe("solid");
    expect(classifyItem(item("Q1", true, true, 600)).valueOf()).toBe("solid");
  });

  it("ไม่ตอบ = unanswered", () => {
    expect(classifyItem(item("Q1", false, false, null))).toBe("unanswered");
  });

  it("ตอบผิดใน 60 วิ = rushed", () => {
    expect(classifyItem(item("Q1", false, true, 30))).toBe("rushed");
    expect(classifyItem(item("Q1", false, true, 60))).toBe("rushed");
  });

  it("ตอบผิดช้ากว่า 60 วิ = shaky", () => {
    expect(classifyItem(item("Q1", false, true, 61))).toBe("shaky");
    expect(classifyItem(item("Q1", false, true, 300))).toBe("shaky");
  });

  it("ไม่มีเวลา (เซสชันเก่า/รีเฟรชกลางคัน) → ตกเป็น shaky ไม่พัง", () => {
    expect(classifyItem(item("Q1", false, true, null))).toBe("shaky");
    expect(classifyItem(item("Q1", false, true, undefined))).toBe("shaky");
  });
});

describe("buildDebrief", () => {
  it("นับสรุปครบทุก bucket", () => {
    const r = buildDebrief([
      item("Q1", true, true, 120),
      item("Q2", false, true, 20),
      item("Q3", false, true, 200),
      item("Q4", false, false, null),
    ]);
    expect(r.summary).toMatchObject({ total: 4, solid: 1, rushed: 1, shaky: 1, unanswered: 1 });
    expect(r.wrong).toBe(3);
    expect(r.buckets).toEqual({ Q1: "solid", Q2: "rushed", Q3: "shaky", Q4: "unanswered" });
  });

  it("ครึ่งหลังตกเกิน 2 ข้อ = faded", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `Q${i + 1}`,
      // ครึ่งแรกถูกหมด ครึ่งหลังผิดหมด
      correct: i < 5,
      answered: true,
      seconds: 120,
    }));
    expect(buildDebrief(items).faded).toBe(true);
  });

  it("ตกข้อเดียว = ยังไม่นับว่า faded", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `Q${i + 1}`,
      correct: i !== 8, // ผิดข้อเดียวในครึ่งหลัง
      answered: true,
      seconds: 120,
    }));
    expect(buildDebrief(items).faded).toBe(false);
  });

  it("ข้อสอบสั้นกว่า 4 ข้อ → ไม่ประเมิน faded", () => {
    const r = buildDebrief([
      item("Q1", true, true, 10),
      item("Q2", false, true, 10),
    ]);
    expect(r.faded).toBe(false);
  });

  it("ไม่มีข้อมูลเลย → สรุปศูนย์ ไม่ error", () => {
    const r = buildDebrief([]);
    expect(r.summary).toMatchObject({ total: 0, solid: 0, rushed: 0, shaky: 0, unanswered: 0 });
    expect(r.faded).toBe(false);
  });
});
