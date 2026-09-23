import { describe, it, expect } from "vitest";
import { buildWeeklyDigest, diffTrapBooks } from "./weeklyDigest";

// รอยต่อเดียวของเฟส 4 — ป้อนข้อมูล 1 สัปดาห์ เช็คข้อความร่าง + สถิติ

const P = (id, topic, trapPairs = [], extra = {}) => ({
  id,
  topic,
  difficulty: 2,
  statement: id,
  traps: trapPairs.map(([token, tag]) => `ตอบ ${token} — จุดผิด ${tag}`),
  trapTags: trapPairs.map(([, tag]) => tag),
  trapRefs: trapPairs.map(() => null),
  ...extra,
});

const problems = {
  A1: P("A1", "จลนศาสตร์", [["180", "#พลาด/เงื่อนไข"]]),
  A2: P("A2", "จลนศาสตร์", [["36", "#พลาด/เงื่อนไข"]]),
  A3: P("A3", "จลนศาสตร์", [["50", "#พลาด/เงื่อนไข"]]),
  B1: P("B1", "นิวตัน", [["40", "#พลาด/สูตรผิด"]]),
};

const at = (problem_id, answer, is_correct, created_at, topic) => ({
  problem_id,
  answer,
  is_correct,
  created_at,
  topic,
});

const WEEK = {
  weekStart: "2026-09-14T00:00:00Z",
  weekEnd: "2026-09-21T00:00:00Z",
};

describe("buildWeeklyDigest", () => {
  it("ร่างมีตัวเลขครบ + ช่องครูเติมเองท้ายสุด", () => {
    const d = buildWeeklyDigest({
      studentName: "ฟีฟ่า",
      ...WEEK,
      attempts: [
        at("A1", "180", false, "2026-09-15T10:00:00Z", "จลนศาสตร์"),
        at("A2", "ok", true, "2026-09-16T10:00:00Z", "จลนศาสตร์"),
      ],
      problemsById: problems,
    });
    expect(d.text).toContain("ฟีฟ่า");
    expect(d.text).toContain("ทำโจทย์ 2 ข้อ · ถูก 1 · ผิด 1");
    expect(d.text).toContain("#พลาด/เงื่อนไข");
    expect(d.text.trimEnd()).toMatch(/ครูเติมเอง.*:\s*$/);
    expect(d.stats).toMatchObject({ attempts: 2, correct: 1, wrong: 1 });
  });

  it("ตระกูลที่ปราบได้ในสัปดาห์นี้โผล่ในจดหมาย", () => {
    const d = buildWeeklyDigest({
      studentName: "เด็ก",
      ...WEEK,
      attempts: [
        // ตกก่อนสัปดาห์นี้
        at("A1", "180", false, "2026-09-01T10:00:00Z", "จลนศาสตร์"),
        // ผ่าน 2 เปลือกใหม่ในสัปดาห์นี้ → ปราบแล้ว
        at("A2", "ok", true, "2026-09-15T10:00:00Z", "จลนศาสตร์"),
        at("A3", "ok", true, "2026-09-16T10:00:00Z", "จลนศาสตร์"),
      ],
      problemsById: problems,
    });
    expect(d.stats.newlySlain).toEqual(["#พลาด/เงื่อนไข"]);
    expect(d.text).toContain("ใหม่สัปดาห์นี้: #พลาด/เงื่อนไข");
  });

  it("สัปดาห์ว่าง → บอกว่าไม่มีกิจกรรม ไม่ใช่ตัวเลขศูนย์เพียวๆ", () => {
    const d = buildWeeklyDigest({ studentName: "เด็ก", ...WEEK, attempts: [], problemsById: problems });
    expect(d.text).toContain("ยังไม่มีกิจกรรมในแอป");
    expect(d.text).toContain("ครูเติมเอง");
  });

  it("มีสอบจำลองในสัปดาห์ → ขึ้นบรรทัดคะแนน", () => {
    const d = buildWeeklyDigest({
      studentName: "เด็ก",
      ...WEEK,
      attempts: [],
      problemsById: problems,
      examSessions: [
        { exam_set: "MOCK-ALEVEL-1", total: 24, max: 30, created_at: "2026-09-18T10:00:00Z" },
        { exam_set: "MOCK-ALEVEL-1", total: 10, max: 30, created_at: "2026-09-01T10:00:00Z" },
      ],
    });
    expect(d.text).toContain("สอบจำลอง MOCK-ALEVEL-1: ได้ 24/30");
    expect(d.text).not.toContain("10/30"); // นอกสัปดาห์ไม่เอา
  });

  it("diffTrapBooks แยกปราบใหม่ vs โดนใหม่", () => {
    const before = {
      tags: [
        { tag: "#a", status: "bitten" },
        { tag: "#b", status: "unseen" },
      ],
    };
    const after = {
      tags: [
        { tag: "#a", status: "slain" },
        { tag: "#b", status: "bitten" },
      ],
    };
    expect(diffTrapBooks(before, after)).toEqual({
      newlySlain: ["#a"],
      newlyBitten: ["#b"],
    });
  });
});
