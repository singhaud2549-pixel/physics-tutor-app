"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PenDiagnostics from "./PenDiagnostics";

// เขียนทับได้ทั้งหน้า แบบทำข้อสอบใน GoodNotes
//
// สองโหมด: ✏️ เขียน (จอรับปากกาอย่างเดียว) · ✋ ใช้งาน (กดปุ่ม/พิมพ์/เลื่อนได้ตามปกติ)
// รอยเขียนอยู่ในเครื่องนักเรียนเท่านั้น ไม่ได้ส่งไปเก็บที่ไหน — ปิดหน้าแล้วหาย
//
// อาการ "เขียนแล้วติดบ้างไม่ติดบ้าง" มาจากสถานะการลากค้าง ไม่ใช่ความเร็ว —
// ทุกทางที่ทำให้การลากจบต้องคืนสถานะให้ครบ ไม่งั้นเส้นถัดไปจะไม่ถูกรับเลย
// พฤติกรรมทั้งหมดนี้ถูกล็อกไว้ด้วย lib/scratchPad.test.js

const PENS = [
  { key: "black", color: "#1f2933", label: "ดำ" },
  { key: "red", color: "#d32f2f", label: "แดง" },
];

const LINE_W = 0.0035; // ความหนาเส้น เทียบกับความกว้างแผ่น
const ERASE_R = 0.025; // รัศมียางลบ เทียบกับความกว้างแผ่น
const MIN_STEP2 = 0.002 * 0.002; // ระยะขั้นต่ำระหว่างจุด (ยกกำลังสอง เลี่ยงการถอดราก)
const SMOOTH_STEPS = 6; // ซอยเส้นโค้งกี่ท่อน — 6 พอให้ตามองไม่เห็นเหลี่ยม โดยไม่กินแรงเครื่อง

// จุดกึ่งกลางระหว่างสองจุด
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// ลากเส้นโค้งผ่านจุด b โดยเริ่มที่กึ่งกลาง a-b และจบที่กึ่งกลาง b-c
//
// ปากกาบน iPad ส่งตำแหน่งแค่ 60 ครั้ง/วินาที (วัดจากเครื่องจริง = ทุก 16.7 ms)
// เขียนเร็ว ๆ จุดจะห่างกันหลายสิบพิกเซล ถ้าลากเส้นตรงเชื่อมจะได้เส้นเป็นเหลี่ยม ๆ
// ตาคนอ่านว่า "สะดุด/ค้าง" ทั้งที่โปรแกรมวาดทันทุกจุดแล้ว
// เขียนเป็น const ไม่ใช่ function เพราะตัวช่วยเทสต์หา component จากคำว่า
// "function" ตัวแรกในไฟล์ — ประกาศ function ไว้ก่อน ScratchPad แล้วมันจะหยิบผิดตัว
const curveThrough = (ctx, a, b, c, w) => {
  const m0 = mid(a, b);
  const m1 = mid(b, c);
  for (let i = 1; i <= SMOOTH_STEPS; i++) {
    const t = i / SMOOTH_STEPS;
    const u = 1 - t;
    ctx.lineTo(
      (u * u * m0[0] + 2 * u * t * b[0] + t * t * m1[0]) * w,
      (u * u * m0[1] + 2 * u * t * b[1] + t * t * m1[1]) * w,
    );
  }
};

export default function ScratchPad({ targetRef }) {
  const canvasRef = useRef(null);

  const strokesRef = useRef([]); // เส้นที่วาดเสร็จแล้ว
  const currentRef = useRef(null); // เส้นที่กำลังลากอยู่
  const drawingIdRef = useRef(null); // pointerId ที่กำลังลาก (กันสองนิ้วพร้อมกัน)
  const sizeRef = useRef({ w: 0, h: 0 }); // ขนาดแผ่นจริงบนจอ (CSS px)
  // ตำแหน่งแผ่นบนจอ — วัดตอนเริ่มลากและตอนหน้ายืด ไม่วัดใหม่ทุกครั้งที่ขยับ
  // (การวัดบังคับให้เบราว์เซอร์คำนวณเลย์เอาต์ใหม่ทั้งหน้า = ต้นเหตุอาการหน่วง)
  const rectRef = useRef(null);

  const [tool, setTool] = useState("black"); // black | red | erase
  const [writing, setWriting] = useState(false); // เริ่มที่โหมดใช้งาน
  // เริ่มที่ "ปากกาเท่านั้น" — ฝ่ามือที่วางบนจอก่อนปลายปากกาจะแตะ ต้องไม่ยึดการลากไว้
  const [penOnly, setPenOnly] = useState(true);
  const [hasInk, setHasInk] = useState(false); // มีรอยอยู่ไหม (ไว้เปิด/ปิดปุ่มย้อนกลับ/ล้าง)

  // เปลี่ยนสถานะเฉพาะตอนข้ามเส้น "มีรอย ↔ ไม่มีรอย" ไม่ใช่ทุกเส้นที่วาด
  // (สั่ง React เรนเดอร์หน้าโจทย์ใหม่ทุกเส้น คืออีกต้นเหตุของอาการหน่วง)
  const syncInk = () => setHasInk(strokesRef.current.length > 0);

  const ctx2d = () => canvasRef.current?.getContext("2d") || null;

  function paintStroke(ctx, s, w) {
    if (!s.p.length) return;
    ctx.strokeStyle = s.c;
    ctx.lineWidth = Math.max(1, s.w * w);
    ctx.beginPath();
    const p = s.p;
    ctx.moveTo(p[0][0] * w, p[0][1] * w);
    // จุดเดียว (แตะแล้วปล่อย) ต้องเห็นเป็นจุด ไม่ใช่หายไป
    if (p.length === 1) ctx.lineTo(p[0][0] * w + 0.01, p[0][1] * w);
    else if (p.length === 2) ctx.lineTo(p[1][0] * w, p[1][1] * w);
    else {
      for (let i = 1; i < p.length - 1; i++) curveThrough(ctx, p[i - 1], p[i], p[i + 1], w);
      ctx.lineTo(p[p.length - 1][0] * w, p[p.length - 1][1] * w);
    }
    ctx.stroke();
  }

  // วาดใหม่ทั้งแผ่น — ใช้ตอนย้อนกลับ / ลบ / หน้ายืด เท่านั้น
  // ต้องวาดเส้นที่กำลังลากอยู่ด้วย ไม่งั้นคำใบ้ไหลออกมาแล้วเส้นที่มือยังจับอยู่จะหายไป
  const redraw = useCallback(() => {
    const ctx = ctx2d();
    const { w, h } = sizeRef.current;
    if (!ctx || !w) return;
    ctx.clearRect(0, 0, w, h); // พื้นหลังโปร่งใส เนื้อหาจริงอยู่ข้างใต้
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokesRef.current) paintStroke(ctx, s, w);
    if (currentRef.current) paintStroke(ctx, currentRef.current, w);
  }, []);

  // แผ่นต้องสูงเท่าหน้าเสมอ — คำใบ้ไหลออกมาแล้วหน้ายืด แผ่นต้องยืดตาม
  // เส้นที่เขียนไว้ไม่ขยับ เพราะพิกัดผูกกับความกว้าง ไม่ใช่ความสูง
  useEffect(() => {
    const target = targetRef?.current;
    const cv = canvasRef.current;
    if (!target || !cv) return;

    const fit = () => {
      const w = target.clientWidth;
      // ซ่อนแผ่นก่อนวัด — ไม่งั้นแผ่นเองจะถูกนับเป็นความสูงของหน้า
      // แล้วยืดตัวเองไม่รู้จบ (แผ่นสูงขึ้น → หน้าสูงขึ้น → แผ่นสูงขึ้นอีก)
      cv.style.display = "none";
      const h = target.scrollHeight;
      cv.style.display = "";
      if (!w || !h) return;
      if (sizeRef.current.w === w && sizeRef.current.h === h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // เกิน 2 ไม่คมขึ้นแต่กินแรงเครื่อง
      sizeRef.current = { w, h };
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // วัดใหม่ทันที ห้ามทิ้งไว้เป็นค่าว่าง — มือที่ยังลากอยู่ต้องหาพิกัดต่อได้
      rectRef.current = cv.getBoundingClientRect();
      redraw();
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(target);
    return () => ro.disconnect();
  }, [targetRef, redraw]);

  // ห้ามหน้าเว็บไฮไลต์ตัวอักษรระหว่างเขียน — ไม่งั้นลากปากกาทีเดียวข้อความถูกเลือกทั้งย่อหน้า
  useEffect(() => {
    document.body.classList.toggle("scratch-writing", writing);
    return () => document.body.classList.remove("scratch-writing");
  }, [writing]);

  function pointFrom(e) {
    const r = rectRef.current;
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width];
  }

  // ต่อเส้นไปยังจุดใหม่ วาดเฉพาะท่อนที่เพิ่ม ไม่วาดใหม่ทั้งแผ่น
  function extend(ctx, cur, pt, w) {
    const last = cur.p[cur.p.length - 1];
    const dx = pt[0] - last[0];
    const dy = pt[1] - last[1];
    if (dx * dx + dy * dy < MIN_STEP2) return;
    cur.p.push(pt);
    ctx.strokeStyle = cur.c;
    ctx.lineWidth = Math.max(1, cur.w * w);
    ctx.beginPath();
    const n = cur.p.length;
    if (n < 3) {
      ctx.moveTo(last[0] * w, last[1] * w);
      ctx.lineTo(pt[0] * w, pt[1] * w);
    } else {
      // ท่อนโค้งต่อกันสนิท เพราะแต่ละท่อนจบที่จุดกึ่งกลางซึ่งเป็นจุดเริ่มของท่อนถัดไปพอดี
      const a = cur.p[n - 3];
      const b = cur.p[n - 2];
      const m0 = mid(a, b);
      ctx.moveTo(m0[0] * w, m0[1] * w);
      curveThrough(ctx, a, b, pt, w);
    }
    ctx.stroke();
  }

  function eraseAt(pt) {
    const before = strokesRef.current.length;
    const r2 = ERASE_R * ERASE_R;
    strokesRef.current = strokesRef.current.filter(
      (s) =>
        !s.p.some(([x, y]) => {
          const dx = x - pt[0];
          const dy = y - pt[1];
          return dx * dx + dy * dy < r2;
        }),
    );
    if (strokesRef.current.length !== before) {
      redraw();
      syncInk();
    }
  }

  function onPointerDown(e) {
    // กันหน้าเว็บตีความว่าลากเลือกข้อความ และกันเมนูเด้งตอนกดค้าง
    e.preventDefault();
    if (penOnly && e.pointerType !== "pen") return;
    if (drawingIdRef.current !== null) return;

    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawingIdRef.current = e.pointerId;
    rectRef.current = canvasRef.current.getBoundingClientRect();
    const pt = pointFrom(e);

    if (tool === "erase") {
      eraseAt(pt);
      return;
    }
    const color = PENS.find((p) => p.key === tool)?.color || PENS[0].color;
    currentRef.current = { c: color, w: LINE_W, p: [pt] };
  }

  function onPointerMove(e) {
    // ปากกาที่ลอยเหนือจอ (ยังไม่แตะ) ส่งตำแหน่งมา 60 ครั้ง/วินาทีตลอดเวลา
    // ต้องทิ้งตั้งแต่บรรทัดแรก อย่าให้ไปแตะงานที่หนักกว่านี้
    if (drawingIdRef.current !== e.pointerId) return;
    e.preventDefault();

    if (tool === "erase") {
      eraseAt(pointFrom(e));
      return;
    }
    const cur = currentRef.current;
    const ctx = ctx2d();
    if (!cur || !ctx) return;
    const { w } = sizeRef.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // ปากกาส่งตำแหน่งถี่กว่าที่จอรีเฟรช เบราว์เซอร์รวบไว้ให้ ต้องดึงมาใช้
    // ไม่งั้นลากเร็ว ๆ แล้วเส้นจะเป็นเหลี่ยม
    const packed = e.nativeEvent?.getCoalescedEvents?.();
    if (packed && packed.length > 1) {
      for (const ev of packed) extend(ctx, cur, pointFrom(ev), w);
    } else {
      extend(ctx, cur, pointFrom(e), w);
    }
  }

  // จบการลาก — takePoint = เอาตำแหน่งของ event นี้เป็นปลายเส้นด้วยไหม
  //
  // ปล่อยนิ้ว/ปากกา (pointerup) → เอา เพราะเป็นปลายเส้นจริง
  //   ปัดเร็ว ๆ สั้น ๆ บางทีไม่มี pointermove เลย ถ้าไม่เอาจุดนี้เส้นจะหายทั้งเส้น
  // ระบบยกเลิกให้ (pointercancel) → ไม่เอา เพราะตำแหน่งที่ส่งมาไม่ใช่ที่มือเขียนจริง
  //   เอามาจะได้เส้นประหลาดพาดหน้าจอ
  function finish(e, takePoint) {
    if (drawingIdRef.current !== e.pointerId) return;
    drawingIdRef.current = null;
    const cur = currentRef.current;
    currentRef.current = null;
    if (!cur) return; // โหมดยางลบ ไม่มีเส้นค้างอยู่

    const ctx = ctx2d();
    const { w } = sizeRef.current;
    if (ctx) {
      if (takePoint) extend(ctx, cur, pointFrom(e), w);
      // แตะแล้วปล่อยที่เดิม = จุดเดียว ต้องเห็นเป็นจุด ไม่ใช่หายไป
      if (cur.p.length === 1) paintStroke(ctx, cur, w);
    }
    strokesRef.current.push(cur);
    syncInk();
  }

  function undo() {
    strokesRef.current.pop();
    redraw();
    syncInk();
  }

  function clearAll() {
    if (!strokesRef.current.length) return;
    strokesRef.current = [];
    redraw();
    syncInk();
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className="scratch-canvas"
        style={{
          // โหมดใช้งาน = แผ่นใส ไม่รับสัมผัส กดปุ่มและพิมพ์ทะลุลงไปได้ตามปกติ
          pointerEvents: writing ? "auto" : "none",
          touchAction: writing ? "none" : "auto",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, true)}
        onPointerCancel={(e) => finish(e, false)}
        // iPad ยึดการควบคุมปากกาคืนไปเงียบ ๆ ได้โดยไม่ส่ง pointerup/pointercancel
        // ไม่ดักตรงนี้ = สถานะค้างว่า "ยังลากอยู่" แล้วเส้นถัดไปจะไม่ถูกรับอีกเลย
        onLostPointerCapture={(e) => finish(e, false)}
      />

      {/* กรอบบอกว่าอยู่โหมดเขียน แยกชิ้นออกจากแผ่น — ถ้าวางเงาไว้บนแผ่นเอง
          เครื่องต้องวาดเงาทับใหม่ทุกเฟรมที่ลากปากกา */}
      {writing && <div className="scratch-frame" />}

      <PenDiagnostics targetRef={targetRef} />

      <div className={`scratch-bar${writing ? " writing" : ""}`}>
        <button
          type="button"
          className={`scratch-mode${writing ? " on" : ""}`}
          onClick={() => setWriting((v) => !v)}
        >
          {writing ? "✏️ กำลังเขียน" : "✋ ใช้งานหน้าจอ"}
        </button>

        {writing && (
          <>
            {PENS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`scratch-tool${tool === p.key ? " on" : ""}`}
                onClick={() => setTool(p.key)}
                aria-label={`ปากกาสี${p.label}`}
              >
                <span className="scratch-dot" style={{ background: p.color }} />
              </button>
            ))}
            <button
              type="button"
              className={`scratch-tool${tool === "erase" ? " on" : ""}`}
              onClick={() => setTool("erase")}
              aria-label="ยางลบ"
            >
              🧽
            </button>
            <button
              type="button"
              className="scratch-tool"
              onClick={undo}
              disabled={!hasInk}
              aria-label="ย้อนกลับ"
            >
              ↩️
            </button>
            <button
              type="button"
              className="scratch-tool"
              onClick={clearAll}
              disabled={!hasInk}
              aria-label="ล้างทั้งหมด"
            >
              🗑️
            </button>
            {/* ให้กดเอง ไม่ให้ระบบเดา — เดาผิดทีเดียวคือเขียนไม่ได้เลยแล้วไม่รู้จะแก้ยังไง */}
            <button
              type="button"
              className={`scratch-tool wide${penOnly ? " on" : ""}`}
              onClick={() => setPenOnly((v) => !v)}
            >
              {penOnly ? "✏️ ปากกาเท่านั้น" : "👆 นิ้วก็เขียนได้"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
