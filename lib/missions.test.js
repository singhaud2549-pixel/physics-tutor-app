import { describe, it, expect } from "vitest";
import { buildMissions } from "./missions";

// รอยต่อเดียวของเฟส 3 — ป้อน attempts + คลัง เช็คลำดับงานและงบเวลา

const P = (id, topic, difficulty, trapPairs = [], extra = {}) => ({
  id,
  topic,
  difficulty,
  statement: id,
  traps: trapPairs.map(([token, tag]) => `ตอบ ${token} — จุดผิด ${tag}`),
  trapTags: trapPairs.map(([, tag]) => tag),
  trapRefs: trapPairs.map(() => null),
  ...extra,
});

const problems = {
  K1: P("K1", "จลนศาสตร์", 2, [["180", "#พลาด/เงื่อนไข"]]),
  K2: P("K2", "จลนศาสตร์", 3, [["36", "#พลาด/เงื่อนไข"]]),
  K3: P("K3", "จลนศาสตร์", 1, [["50", "#พลาด/เงื่อนไข"]]),
  N1: P("N1", "นิวตัน", 2, [["40", "#พลาด/แผนภาพแรง"]]),
  N2: P("N2", "นิวตัน", 4, [["41", "#พลาด/แผนภาพแรง"]]),
  E1: P("E1", "พลังงาน", 2),
  X1: P("X1", "ของไหล", 5, [], { examSet: "MOCK-1" }), // ข้อสอบ — ต้องไม่โผล่ในภารกิจ
};

const at = (problem_id, answer, is_correct, created_at, topic) => ({
  problem_id,
  answer,
  is_correct,
  created_at,
  topic,
});

describe("buildMissions", () => {
  it("เด็กใหม่ไม่มีประวัติ → ได้งานเปิดบทใหม่", () => {
    const r = buildMissions({ attempts: [], problemsById: problems, budgetMinutes: 30 });
    expect(r.missions.length).toBeGreaterThan(0);
    expect(r.missions[0].kind).toBe("new");
    expect(r.done).toBe(false);
  });

  it("ปิดของค้างก่อน: งานซ่อมต้องมาก่อนงานบทใหม่", () => {
    const r = buildMissions({
      attempts: [at("K1", "180", false, "2026-08-20T10:00:00Z", "จลนศาสตร์")],
      problemsById: problems,
      budgetMinutes: 60,
    });
    expect(r.missions[0].kind).toBe("repair");
    expect(r.missions[0].title).toContain("#พลาด/เงื่อนไข");
  });

  it("งบจำกัด → งานรวมไม่เกินงบ ยกเว้นชิ้นแรกชิ้นเดียวที่ยอมเกินได้", () => {
    // งานแรก est 8 นาทีต่องบ 5 นาที → ต้องมา 1 ชิ้น (ยอมเกิน) แล้วหยุด
    const over = buildMissions({
      attempts: [at("N1", "40", false, "2026-08-20T10:00:00Z", "นิวตัน")],
      problemsById: problems,
      budgetMinutes: 5,
    });
    expect(over.missions.length).toBe(1);
    expect(over.missions[0].kind).toBe("repair");
    // งบพอ → รวมต้องไม่เกินงบ
    const fit = buildMissions({
      attempts: [at("K1", "180", false, "2026-08-20T10:00:00Z", "จลนศาสตร์")],
      problemsById: problems,
      budgetMinutes: 5,
    });
    expect(fit.missions.length).toBeGreaterThanOrEqual(1);
    expect(fit.totalMinutes).toBeLessThanOrEqual(5);
  });

  it("ไม่เกิน 5 ชิ้นต่องบเหลือเฟือ", () => {
    const r = buildMissions({ attempts: [], problemsById: problems, budgetMinutes: 120 });
    expect(r.missions.length).toBeLessThanOrEqual(5);
  });

  it("ข้อสอบไม่โผล่ในภารกิจ + เคารพเพดานครู", () => {
    const r = buildMissions({
      attempts: [],
      problemsById: problems,
      budgetMinutes: 120,
      maxDifficulty: 2,
    });
    const ids = r.missions.map((m) => m.problemId);
    expect(ids).not.toContain("X1");
    expect(ids).not.toContain("N2"); // ยาก 4 เกินเพดาน 2
    expect(ids).toContain("E1");
  });

  it("บทที่มีงานซ่อมแล้ว ไม่ได้งาน weak ซ้ำซ้อน", () => {
    const r = buildMissions({
      attempts: [at("K1", "180", false, "2026-08-20T10:00:00Z", "จลนศาสตร์")],
      problemsById: problems,
      budgetMinutes: 120,
    });
    const kinds = r.missions.map((m) => `${m.kind}:${m.topic}`);
    expect(kinds.filter((k) => k === "weak:จลนศาสตร์")).toHaveLength(0);
  });

  it("ทำครบทุกข้อแล้ว → done", () => {
    const all = ["K1", "K2", "K3", "N1", "N2", "E1"].map((id, i) =>
      at(id, "ok", true, `2026-08-2${i}T10:00:00Z`, problems[id].topic),
    );
    const r = buildMissions({ attempts: all, problemsById: problems, budgetMinutes: 30 });
    expect(r.done).toBe(true);
    expect(r.missions).toHaveLength(0);
  });
});
