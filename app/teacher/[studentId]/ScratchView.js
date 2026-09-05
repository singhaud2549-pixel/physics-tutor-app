"use client";

import { useEffect, useRef } from "react";

// วาดลายมือของนักเรียนกลับมาให้ผู้สอนดู
//
// ข้อมูลที่เก็บไว้เป็น "เส้น" ไม่ใช่ภาพ จึงวาดใหม่ที่ความกว้างเท่าไรก็คม
// พิกัดทุกจุดเป็นสัดส่วนของความกว้าง — คูณด้วยความกว้างจริงตรง ๆ ได้เลย

export default function ScratchView({ sheet, image = null }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const cv = canvasRef.current;
    if (!wrap || !cv || !sheet) return;

    const strokes = sheet.strokes || [];
    const aspect = sheet.aspect || 1;
    const box = sheet.layout?.imageBox || null;

    let img = null;
    let cancelled = false;

    const paint = () => {
      if (cancelled) return;
      const w = wrap.clientWidth;
      if (!w) return;
      const h = Math.round(w * aspect);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);

      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);

      // รูปโจทย์วางตรงตำแหน่งเดิมที่น้องเห็น (เก็บไว้ตอนบันทึก) — ลูกศรที่ชี้จึงชี้ถูกที่
      if (img && box) ctx.drawImage(img, box[0] * w, box[1] * w, box[2] * w, box[3] * w);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const s of strokes) {
        if (!s.p?.length) continue;
        ctx.strokeStyle = s.c;
        ctx.lineWidth = Math.max(1, (s.w || 0.0035) * w);
        ctx.beginPath();
        ctx.moveTo(s.p[0][0] * w, s.p[0][1] * w);
        for (let i = 1; i < s.p.length; i++) ctx.lineTo(s.p[i][0] * w, s.p[i][1] * w);
        if (s.p.length === 1) ctx.lineTo(s.p[0][0] * w + 0.01, s.p[0][1] * w);
        ctx.stroke();
      }
    };

    if (image && box) {
      const el = new Image();
      el.onload = () => {
        img = el;
        paint();
      };
      el.src = image;
    }

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [sheet, image]);

  if (!sheet?.strokes?.length) return null;

  return (
    <div ref={wrapRef} className="scratch-view">
      <canvas ref={canvasRef} />
    </div>
  );
}
