"use client";

import { useEffect, useRef, useState } from "react";

// Temporary, opt-in device trace. No coordinates, page text, account data,
// storage, or network requests. Nothing is collected without ?penDebug=1.
export default function PenDiagnostics({ targetRef }) {
  const [enabled, setEnabled] = useState(false);
  const [output, setOutput] = useState("");
  const eventsRef = useRef([]);
  const stopRef = useRef(() => {});

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("penDebug") !== "1") return;
    const target = targetRef.current;
    if (!target) return;
    setEnabled(true);
    const types = [
      "pointerdown", "pointermove", "pointerup", "pointercancel",
      "gotpointercapture", "lostpointercapture", "pointerout",
      "touchstart", "touchmove", "touchend", "touchcancel", "dblclick",
    ];
    const record = (e) => {
      if (e.target?.tagName !== "CANVAS") return;
      const events = eventsRef.current;
      // Stop at the cap instead of losing the beginning of a stroke sequence.
      if (events.length >= 6000) return;
      events.push({
        type: e.type,
        ms: Math.round(e.timeStamp * 10) / 10,
        pointer: e.pointerId,
        device: e.pointerType,
        buttons: e.buttons,
        pressure: e.pressure,
        primary: e.isPrimary,
        cancelable: e.cancelable,
        touches: e.changedTouches ? Array.from(e.changedTouches, (t) => ({
          id: t.identifier, type: t.touchType, force: t.force,
        })) : undefined,
      });
    };
    const options = { capture: true, passive: true };
    types.forEach((type) => target.addEventListener(type, record, options));
    const stop = () => types.forEach((type) => target.removeEventListener(type, record, options));
    stopRef.current = stop;
    return stop;
  }, [targetRef]);

  function finish() {
    stopRef.current();
    const counts = {};
    for (const e of eventsRef.current) counts[e.type] = (counts[e.type] || 0) + 1;
    setOutput(JSON.stringify({
      version: "pen-trace-1",
      browser: navigator.userAgent,
      counts,
      events: eventsRef.current,
    }, null, 2));
  }

  if (!enabled) return null;
  return (
    <aside style={{ position: "fixed", top: 8, right: 8, zIndex: 60, background: "white",
      border: "1px solid #999", borderRadius: 8, padding: 10, maxWidth: "85vw" }}>
      {!output ? (
        <>
          <div>ตรวจปากกา: เขียนเร็วให้เกิดอาการ แล้วกดปุ่มนี้</div>
          <button type="button" onClick={finish}>หยุดและแสดงผลตรวจ</button>
        </>
      ) : (
        <>
          <div>คัดลอกผลนี้ส่งกลับในแชท (ไม่มีโจทย์หรือบทสนทนา)</div>
          <textarea aria-label="ผลตรวจปากกา" readOnly value={output}
            onFocus={(e) => e.target.select()}
            style={{ display: "block", width: "min(480px, 75vw)", height: 150,
              userSelect: "text", WebkitUserSelect: "text" }} />
        </>
      )}
    </aside>
  );
}
