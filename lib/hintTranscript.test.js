import { it, expect } from "vitest";
import { componentHarness } from "./componentHarness.test-support";

it("persists the complete streamed AI reply once, in conversation order", async () => {
  const saved = [];
  let readNext;
  const session = { access_token: "test-token", user: { id: "student" } };
  const h = await componentHarness(new URL("../app/problem/[id]/ProblemClient.js", import.meta.url),
    { problem: { id: "P-test", topic: "แรง", kind: "numeric", statement: "หาแรง" } }, {
      Link: "a", MathText: "math", ScratchPad: "scratch", isSupabaseReady: true,
      supabase: {
        auth: {
          getSession: async () => ({ data: { session } }),
          onAuthStateChange: () => ({ data: {} }),
        },
        from: () => ({ insert: async (rows) => { saved.push(...rows); return { error: null }; } }),
      },
      fetch: async () => ({
        ok: true, headers: { get: () => "text/plain" },
        body: { getReader: () => ({ read: () => new Promise((resolve) => { readNext = resolve; }) }) },
      }),
    });
  const settle = async () => { await new Promise((r) => setImmediate(r)); h.render(); };
  await settle();
  const request = h.find((n) => n.props.className === "hint-btn").props.onClick();
  await settle();
  for (const text of ["ลอง", "เขียนสมการ", " F = ma ก่อนนะ"]) {
    readNext({ done: false, value: new TextEncoder().encode(text) });
    await settle();
  }
  readNext({ done: true });
  await request;
  await settle();
  await settle();
  expect(saved.map((m) => [m.seq, m.role, m.text])).toEqual([
    [0, "ask", "ขอคำใบ้หน่อย 🙏"],
    [1, "hint", "ลองเขียนสมการ F = ma ก่อนนะ"],
  ]);
});
