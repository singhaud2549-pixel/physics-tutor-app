"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// เขียนทับได้ทั้งหน้า แบบทำข้อสอบใน GoodNotes
//
// แผ่นเขียนคลุมทั้งหน้าโจทย์ — ตัวโจทย์ รูป ช่องคำตอบ คำใบ้ เขียนทับได้หมด
// มีสองโหมดเหมือน GoodNotes: ✏️ เขียน (จอรับปากกาอย่างเดียว) · ✋ ใช้งาน (กดปุ่ม/พิมพ์ได้ตามปกติ)
//
// รอยเขียนอยู่ในเครื่องนักเรียนเท่านั้น ไม่ได้ส่งไปเก็บที่ไหน — ปิดหน้าแล้วหาย
// (เป็นกระดาษทดจริง ๆ ไม่ใช่ข้อมูลที่ต้องเก็บ)

const PENS = [
  { key: "black", color: "#1f2933", label: "ดำ" },
  { key: "red", color: "#d32f2f", label: "แดง" },
];

const LINE_W = 0.0035; // ความหนาเส้น เทียบกับความกว้างแผ่น
const ERASE_R = 0.025; // รัศมียางลบ เทียบกับความกว้างแผ่น
const MIN_STEP2 = 0.003 * 0.003; // ระยะขั้นต่ำระหว่างจุด (ยกกำลังสอง เลี่ยงการถอดราก)

export default function ScratchPad({ targetRef }) {
  const canvasRef = useRef(null);

  const strokesRef = useRef([]); // เส้นที่วาดเสร็จแล้ว
  const currentRef = useRef(null); // เส้นที่กำลังลากอยู่
  const drawingIdRef = useRef(null); // pointerId ที่กำลังลาก (กันสองนิ้วพร้อมกัน)
  const sizeRef = useRef({ w: 0, h: 0 }); // ขนาดแผ่นจริงบนจอ (CSS px)
  // ตำแหน่งแผ่นบนจอ — จำไว้ตอนเริ่มลาก ไม่ต้องวัดใหม่ทุกครั้งที่ขยับ
  // (การวัดทุกครั้งบังคับให้เบราว์เซอร์คำนวณเลย์เอาต์ใหม่ = ต้นเหตุอาการหน่วง)
  const rectRef = useRef(null);

  const [tool, setTool] = useState("black"); // black | red | erase
  const [writing, setWriting] = useState(false); // อยู่ในโหมดเขียนไหม (เริ่มที่โหมดใช้งาน)
  const [penOnly, setPenOnly] = useState(false); // รับเฉพาะปากกา ไม่รับนิ้ว
  const [hasInk, setHasInk] = useState(false); // มีรอยอยู่ไหม (ไว้เปิด/ปิดปุ่มย้อนกลับ)

  // เปลี่ยนสถานะเฉพาะตอนข้ามเส้น "มีรอย ↔ ไม่มีรอย" — ไม่ใช่ทุกเส้นที่วาด
  // (สั่งเรนเดอร์ใหม่ทุกเส้นที่วาด คือต้นเหตุอาการหน่วงอีกข้อ)
  const syncInk = () => setHasInk(strokesRef.current.length > 0);

  // วาดใหม่ทั้งแผ่น — ใช้ตอนย้อนกลับ / ลบ / หน้ายืดออก เท่านั้น
  // ระหว่างลากเส้นจะวาดต่อทีละท่อน ไม่เรียกฟังก์ชันนี้
  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const { w, h } = sizeRef.current;
    if (!w) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, w, h); // พื้นหลังโปร่งใส — เนื้อหาจริงอยู่ใต้แผ่น
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokesRef.current) {
      ctx.strokeStyle = s.c;
      ctx.lineWidth = Math.max(1, s.w * w);
      ctx.beginPath();
      ctx.moveTo(s.p[0][0] * w, s.p[0][1] * w);
      for (let i = 1; i < s.p.length; i++) ctx.lineTo(s.p[i][0] * w, s.p[i][1] * w);
      if (s.p.length === 1) ctx.lineTo(s.p[0][0] * w + 0.01, s.p[0][1] * w);
      ctx.stroke();
    }
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
      rectRef.current = null; // ขนาดเปลี่ยน ตำแหน่งที่จำไว้ใช้ไม่ได้แล้ว
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
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
    const rect = rectRef.current;
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.width];
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

  // ต่อเส้นไปยังจุดใหม่ วาดเฉพาะท่อนที่เพิ่ม ไม่วาดทั้งแผ่น
  function extend(ctx, cur, pt, w) {
    const last = cur.p[cur.p.length - 1];
    const dx = pt[0] - last[0];
    const dy = pt[1] - last[1];
    if (dx * dx + dy * dy < MIN_STEP2) return;
    cur.p.push(pt);
    ctx.beginPath();
    ctx.moveTo(last[0] * w, last[1] * w);
    ctx.lineTo(pt[0] * w, pt[1] * w);
    ctx.stroke();
  }

  function onPointerDown(e) {
    // กันหน้าเว็บตีความว่ากำลังลากเลือกข้อความ และกันเมนูเด้งตอนกดค้าง
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
    if (drawingIdRef.current !== e.pointerId) return;
    e.preventDefault();

    if (tool === "erase") {
      eraseAt(pointFrom(e));
      return;
    }
    const cur = currentRef.current;
    if (!cur) return;

    const ctx = canvasRef.current.getContext("2d");
    const { w } = sizeRef.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = cur.c;
    ctx.lineWidth = Math.max(1, cur.w * w);

    // ปากกาส่งตำแหน่งถี่กว่าที่จอรีเฟรช — เบราว์เซอร์รวบไว้ให้ ต้องดึงมาใช้
    // ไม่งั้นลากเร็ว ๆ แล้วเส้นจะเป็นเหลี่ยม ๆ เหมือนกระตุก
    const packed = e.nativeEvent.getCoalescedEvents?.();
    if (packed && packed.length > 1) {
      for (const ev of packed) extend(ctx, cur, pointFrom(ev), w);
    } else {
      extend(ctx, cur, pointFrom(e), w);
    }
  }

  function onPointerUp(e) {
    if (drawingIdRef.current !== e.pointerId) return;
    const cur = currentRef.current;
    currentRef.current = null;
    drawingIdRef.current = null;
    if (!cur) return;

    // แตะแล้วปล่อยโดยไม่ลาก = จุดเดียว ต้องเห็นเป็นจุด ไม่ใช่หายไป
    if (cur.p.length === 1) {
      const ctx = canvasRef.current.getContext("2d");
      const { w } = sizeRef.current;
      ctx.beginPath();
      ctx.moveTo(cur.p[0][0] * w, cur.p[0][1] * w);
      ctx.lineTo(cur.p[0][0] * w + 0.01, cur.p[0][1] * w);
      ctx.stroke();
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
        className={`scratch-canvas${writing ? " on" : ""}`}
        style={{
          // โหมดใช้งาน = แผ่นใส ไม่รับสัมผัส กดปุ่มและพิมพ์ทะลุลงไปได้ตามปกติ
          pointerEvents: writing ? "auto" : "none",
          touchAction: writing ? "none" : "auto",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

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
