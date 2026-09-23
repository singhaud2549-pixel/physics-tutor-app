import { describe, it, expect, vi } from "vitest";
import { componentHarness } from "./componentHarness.test-support";

async function setup() {
  const paths = [];
  let path = [];
  const ctx = {
    clearRect: () => { paths.length = 0; }, setTransform() {},
    beginPath: () => { path = []; },
    moveTo: (x, y) => path.push([x, y]), lineTo: (x, y) => path.push([x, y]),
    stroke: () => paths.push({ points: [...path], color: ctx.strokeStyle }),
  };
  const target = { clientWidth: 1000, scrollHeight: 1000 };
  const canvas = {
    style: {}, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000 }),
    setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn(),
  };
  let fit;
  const h = await componentHarness(new URL("../app/problem/[id]/ScratchPad.js", import.meta.url),
    { targetRef: { current: target } }, {
      canvas, PenDiagnostics: "pen-diagnostics", window: { devicePixelRatio: 1 },
      document: { body: { classList: { toggle() {}, remove() {} } } },
      ResizeObserver: class { constructor(fn) { fit = fn; } observe() {} disconnect() {} },
    });
  h.find((n) => n.props.className?.includes("scratch-mode")).props.onClick();
  h.render();
  const event = (id, x, type = "pen") => ({
    pointerId: id, pointerType: type, clientX: x, clientY: 10,
    currentTarget: canvas, preventDefault() {}, nativeEvent: {},
  });
  const fire = (name, id, x, type) => h.find((n) => n.type === "canvas").props[name]?.(event(id, x, type));
  return { h, paths, fire, fit, target };
}

describe("scratch pad input", () => {
  it("draws the whole quick stroke even when no move event is delivered", async () => {
    const s = await setup();
    for (let i = 0; i < 10; i++) {
      s.fire("onPointerDown", 1, 10);
      s.fire("onPointerUp", 1, 80);
    }
    expect(s.paths.filter((p) => p.points.some(([x]) => x === 80))).toHaveLength(10);
  });
  it("ignores fingers by default so a resting finger cannot block the pencil", async () => {
    const s = await setup();
    s.fire("onPointerDown", 1, 10, "touch");
    s.fire("onPointerMove", 1, 50, "touch");
    expect(s.paths).toHaveLength(0);
    s.fire("onPointerDown", 2, 20);
    s.fire("onPointerMove", 2, 80);
    s.fire("onPointerUp", 2, 80);
    expect(s.paths.some((p) => p.points.some(([x]) => x === 80))).toBe(true);
  });
  it("allows the next stroke after capture is lost", async () => {
    const s = await setup();
    s.fire("onPointerDown", 1, 10);
    s.fire("onPointerMove", 1, 40);
    s.fire("onLostPointerCapture", 1, 40);
    s.fire("onPointerDown", 2, 60);
    s.fire("onPointerMove", 2, 90);
    s.fire("onPointerUp", 2, 90);
    expect(s.paths.some((p) => p.points.some(([x]) => x === 90))).toBe(true);
  });
  it("keeps active ink visible when streamed hints resize the sheet", async () => {
    const s = await setup();
    s.fire("onPointerDown", 1, 10);
    s.fire("onPointerMove", 1, 40);
    s.target.scrollHeight = 1200;
    s.fit();
    expect(s.paths.some((p) => p.points.some(([x]) => x === 40))).toBe(true);
    expect(() => s.fire("onPointerMove", 1, 90)).not.toThrow();
  });
  it("does not draw a phantom endpoint on cancel and accepts the next stroke", async () => {
    const s = await setup();
    s.fire("onPointerDown", 1, 10);
    s.fire("onPointerMove", 1, 40);
    s.fire("onPointerCancel", 1, 999);
    s.fire("onLostPointerCapture", 1, 999);
    s.fire("onPointerDown", 1, 60);
    s.fire("onPointerUp", 1, 90);
    expect(s.paths.some((p) => p.points.some(([x]) => x === 999))).toBe(false);
    expect(s.paths.some((p) => p.points.some(([x]) => x === 90))).toBe(true);
  });
  it("still supports finger drawing when explicitly enabled", async () => {
    const s = await setup();
    s.h.find((n) => n.props.className?.includes("scratch-tool wide")).props.onClick();
    s.h.render();
    s.fire("onPointerDown", 1, 10, "touch");
    s.fire("onPointerUp", 1, 80, "touch");
    expect(s.paths.some((p) => p.points.some(([x]) => x === 80))).toBe(true);
  });
});
