"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// เขียนทับได้ทั้งหน้า แบบทำข้อสอบใน GoodNotes
//
// แผ่นเขียนคลุมทั้งการ์ดโจทย์ — ตัวโจทย์ รูป ช่องคำตอบ คำใบ้ เขียนทับได้หมด
// มีสองโหมดเหมือน GoodNotes: ✏️ เขียน (จอรับปากกาอย่างเดียว) · ✋ ใช้งาน (กดปุ่ม/พิมพ์ได้ตามปกติ)
//
// เก็บเป็น "เส้น" (ลำดับจุด) ไม่ใช่ภาพ เพราะ:
//   - เล็กกว่าภาพราว 20 เท่า (ดูเหตุผลเต็มใน migrations/007_scratch_sheets.sql)
//   - ครูเปิดดูที่ขนาดไหนก็คม เพราะวาดใหม่ทุกครั้ง
//
// พิกัดทุกจุดเป็น "สัดส่วนของความกว้าง" (0..1) ไม่ใช่พิกเซล
// การ์ดกว้าง 640px คงที่ทั้งฝั่งน้องและฝั่งครู รอยเขียนจึงซ้อนทับเนื้อหาตรงกัน

const PENS = [
  { key: "black", color: "#1f2933", label: "ดำ" },
  { key: "red", color: "#d32f2f", label: "แดง" },
];

const LINE_W = 0.0035; // ความหนาเส้น เทียบกับความกว้างแผ่น
const ERASE_R = 0.025; // รัศมียางลบ เทียบกับความกว้างแผ่น
const MIN_STEP = 0.003; // จุดที่ใกล้กว่านี้ไม่ต้องเก็บ (ลดขนาดข้อมูลโดยตาไม่เห็นความต่าง)

// ปัดทศนิยมให้สั้นลง — 4 ตำแหน่งละเอียดเกินตาคนอยู่แล้ว แต่ลดขนาด JSON ได้มาก
const r4 = (n) => Math.round(n * 10000) / 10000;

export default function ScratchPad({ targetRef, onChange }) {
  const canvasRef = useRef(null);

  const strokesRef = useRef([]); // เส้นที่วาดเสร็จแล้ว
  const currentRef = useRef(null); // เส้นที่กำลังลากอยู่
  const drawingIdRef = useRef(null); // pointerId ที่กำลังลาก (กันสองนิ้วพร้อมกัน)
  const penSeenRef = useRef(false); // เคยเจอ Apple Pencil แล้วหรือยัง
  const sizeRef = useRef({ w: 0, h: 0 }); // ขนาดแผ่นจริงบนจอ (CSS px)

  const [tool, setTool] = useState("black"); // black | red | erase
  const [writing, setWriting] = useState(false); // อยู่ในโหมดเขียนไหม (เริ่มที่โหมดใช้งาน)
  const [count, setCount] = useState(0); // จำนวนเส้น (ไว้เปิด/ปิดปุ่มย้อนกลับ)
  const [aspect, setAspect] = useState(1); // สูง ÷ กว้าง ของแผ่น ณ ตอนนี้

  // วาดใหม่ทั้งแผ่น — ใช้ตอนย้อนกลับ / ลบ / หน้ายืดออก เท่านั้น
  // ระหว่างลากเส้นจะวาดต่อทีละท่อน ไม่เรียกฟังก์ชันนี้ (ไม่งั้นจะหน่วง)
  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const { w, h } = sizeRef.current;
    if (!w) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, w, h); // พื้นหลังโปร่งใส — เนื้อหาจริงอยู่ใต้แผ่น
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokesRef.current) strokePath(ctx, s, w);
  }, []);

  function strokePath(ctx, s, w) {
    if (!s.p.length) return;
    ctx.strokeStyle = s.c;
    ctx.lineWidth = Math.max(1, s.w * w);
    ctx.beginPath();
    ctx.moveTo(s.p[0][0] * w, s.p[0][1] * w);
    for (let i = 1; i < s.p.length; i++) ctx.lineTo(s.p[i][0] * w, s.p[i][1] * w);
    // จุดเดียว (แตะแล้วปล่อย) ต้องเห็นเป็นจุด ไม่ใช่หายไป
    if (s.p.length === 1) ctx.lineTo(s.p[0][0] * w + 0.01, s.p[0][1] * w);
    ctx.stroke();
  }

  // แผ่นต้องเท่ากับการ์ดโจทย์เสมอ — คำใบ้ไหลออกมาแล้วการ์ดยืด แผ่นต้องยืดตาม
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
      cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      setAspect(r4(h / w));
      redraw();
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(target);
    return () => ro.disconnect();
  }, [targetRef, redraw]);

  function pointOf(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    // หารด้วย "ความกว้าง" ทั้งคู่ เพื่อให้สัดส่วนแนวตั้ง-แนวนอนไม่เพี้ยนเวลาวาดกลับ
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.width];
  }

  function eraseAt(pt) {
    const before = strokesRef.current.length;
    strokesRef.current = strokesRef.current.filter(
      (s) => !s.p.some(([x, y]) => Math.hypot(x - pt[0], y - pt[1]) < ERASE_R),
    );
    if (strokesRef.current.length !== before) {
      redraw();
      setCount(strokesRef.current.length);
    }
  }

  function onPointerDown(e) {
    if (e.pointerType === "pen") penSeenRef.current = true;
    // กันฝ่ามือ: พอรู้ว่ามีปากกาแล้ว การแตะด้วยนิ้วจะไม่วาดอีก
    if (penSeenRef.current && e.pointerType === "touch") return;
    if (drawingIdRef.current !== null) return;

    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawingIdRef.current = e.pointerId;
    const pt = pointOf(e);

    if (tool === "erase") {
      eraseAt(pt);
      return;
    }
    const color = PENS.find((p) => p.key === tool)?.color || PENS[0].color;
    currentRef.current = { c: color, w: LINE_W, p: [[r4(pt[0]), r4(pt[1])]] };
  }

  function onPointerMove(e) {
    if (drawingIdRef.current !== e.pointerId) return;
    const pt = pointOf(e);

    if (tool === "erase") {
      eraseAt(pt);
      return;
    }
    const cur = currentRef.current;
    if (!cur) return;
    const last = cur.p[cur.p.length - 1];
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < MIN_STEP) return;

    cur.p.push([r4(pt[0]), r4(pt[1])]);

    // วาดเฉพาะท่อนใหม่ ไม่ต้องวาดทั้งแผ่น
    const ctx = canvasRef.current.getContext("2d");
    const { w } = sizeRef.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = cur.c;
    ctx.lineWidth = Math.max(1, cur.w * w);
    ctx.beginPath();
    ctx.moveTo(last[0] * w, last[1] * w);
    ctx.lineTo(pt[0] * w, pt[1] * w);
    ctx.stroke();
  }

  function onPointerUp(e) {
    if (drawingIdRef.current !== e.pointerId) return;
    const cur = currentRef.current;
    currentRef.current = null;
    drawingIdRef.current = null;
    if (cur && cur.p.length) {
      strokesRef.current.push(cur);
      redraw(); // วาดซ้ำให้จุดเดียวโผล่ และให้เส้นเรียบเสมอกัน
    }
    setCount(strokesRef.current.length);
  }

  function undo() {
    strokesRef.current.pop();
    redraw();
    setCount(strokesRef.current.length);
  }

  function clearAll() {
    if (!strokesRef.current.length) return;
    strokesRef.current = [];
    redraw();
    setCount(0);
  }

  // ตำแหน่งรูปโจทย์บนแผ่น — ถ้าไม่เก็บไว้ ครูจะเห็นลูกศรลอย ๆ โดยไม่รู้ว่าน้องชี้ตรงไหนของรูป
  function measureLayout() {
    const host = targetRef?.current;
    const cv = canvasRef.current;
    const img = host?.querySelector(".problem-image");
    if (!host || !cv || !img) return null;
    const base = cv.getBoundingClientRect();
    const box = img.getBoundingClientRect();
    if (!base.width) return null;
    return {
      imageBox: [
        r4((box.left - base.left) / base.width),
        r4((box.top - base.top) / base.width),
        r4(box.width / base.width),
        r4(box.height / base.width),
      ],
    };
  }

  // แจ้งผู้เรียกทุกครั้งที่จำนวนเส้นเปลี่ยน (เขียนเสร็จ / ย้อนกลับ / ลบ)
  // ผู้เรียกเป็นคนหน่วงเวลาก่อนบันทึกเอง จึงไม่ยิงฐานข้อมูลทุกเส้น
  useEffect(() => {
    onChange?.({ strokes: strokesRef.current, aspect, layout: measureLayout() });
    // ตั้งใจผูกกับ count/aspect เท่านั้น — strokesRef เป็น ref จึงไม่กระตุ้น effect เอง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, aspect]);

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
              disabled={!count}
              aria-label="ย้อนกลับ"
            >
              ↩️
            </button>
            <button
              type="button"
              className="scratch-tool"
              onClick={clearAll}
              disabled={!count}
              aria-label="ล้างทั้งหมด"
            >
              🗑️
            </button>
          </>
        )}
      </div>
    </>
  );
}
