"use client";

import { useState } from "react";
import { supabase, isSupabaseReady } from "../../../lib/supabaseClient";

// ร่างจดหมายรายสัปดาห์ — ตัวเลขดึงให้แล้ว ครูเติมประโยคเองแล้วก๊อปไปส่ง LINE
// ตั้งใจไม่ให้ AI เขียนประโยคแทน (มติ 28 ส.ค.) ข้อความฝั่งครูต้องมาจากคนจริง
export default function WeeklyLetter({ studentId }) {
  const [state, setState] = useState("idle"); // idle | loading | ready | error
  const [msg, setMsg] = useState("");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  async function draft() {
    if (!isSupabaseReady) return setState("error"), setMsg("ยังไม่ได้ตั้งค่า Supabase");
    setState("loading");
    setCopied(false);
    const { data: s } = await supabase.auth.getSession();
    const t = s?.session?.access_token;
    if (!t) return setState("error"), setMsg("กรุณาเข้าสู่ระบบด้วยบัญชีผู้สอน");
    const res = await fetch(`/api/teacher/weekly-digest?studentId=${studentId}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const json = await res.json();
    if (!res.ok) return setState("error"), setMsg(json.error || "ร่างจดหมายไม่สำเร็จ");
    setText(json.digest.text);
    setState("ready");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setMsg("ก๊อปไม่สำเร็จ — ลากคลุมข้อความแล้วก๊อปเองนะ");
    }
  }

  return (
    <>
      <h3>✉️ จดหมายรายสัปดาห์</h3>
      {state === "idle" && (
        <button type="button" className="btn" onClick={draft}>
          ร่างจดหมายสัปดาห์นี้
        </button>
      )}
      {state === "loading" && <p className="subtitle">กำลังรวมตัวเลขสัปดาห์นี้…</p>}
      {state === "error" && <p className="subtitle">⚠️ {msg}</p>}
      {state === "ready" && (
        <>
          <p className="subtitle">
            ตัวเลขดึงให้แล้ว — เติมประโยคของตัวเองต่อท้าย แล้วก๊อปไปส่ง LINE
          </p>
          <textarea
            className="letter-box"
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="inline-form">
            <button type="button" className="btn" onClick={copy}>
              {copied ? "ก๊อปแล้ว ✓" : "คัดลอก"}
            </button>
            <button type="button" className="link-btn" onClick={draft}>
              ร่างใหม่
            </button>
          </div>
        </>
      )}
    </>
  );
}
