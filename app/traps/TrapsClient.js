"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../../lib/supabaseClient";
import MathText from "../MathText";

const STATUS_LABEL = {
  slain: "✅ ปราบแล้ว",
  chasing: "🎯 กำลังไล่",
  bitten: "🔴 ยังโดนกิน",
  unbitten: "🟢 เจอแล้ว ยังไม่เคยพลาด",
  unseen: "⚪ ยังไม่เคยเจอ",
};

export default function TrapsClient() {
  const [state, setState] = useState("loading"); // loading | noauth | ready | error
  const [msg, setMsg] = useState("");
  const [book, setBook] = useState(null);

  useEffect(() => {
    if (!isSupabaseReady) return setState("error"), setMsg("ยังไม่ได้ตั้งค่า Supabase");
    supabase.auth.getSession().then(async ({ data }) => {
      const t = data?.session?.access_token;
      if (!t) return setState("noauth");
      const res = await fetch("/api/trap-book", { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok) return setState("error"), setMsg(json.error || "โหลดสมุดกับดักไม่สำเร็จ");
      setBook(json.book);
      setState("ready");
    });
  }, []);

  if (state === "loading") return <p className="subtitle">กำลังเปิดสมุดกับดัก…</p>;
  if (state === "noauth")
    return (
      <div className="card">
        <p>เข้าสู่ระบบก่อนถึงจะเห็นกับดักของตัวเองนะ</p>
        <Link href="/login?next=/traps" className="auth-gate-btn">
          เข้าสู่ระบบ →
        </Link>
      </div>
    );
  if (state === "error") return <p className="subtitle">⚠️ {msg}</p>;

  const s = book.summary;
  return (
    <>
      <div className="card">
        <p className="subtitle">
          ✅ ปราบแล้ว <strong>{s.slain}</strong> · 🎯 กำลังไล่ <strong>{s.chasing}</strong> · 🔴
          ยังโดนกิน <strong>{s.bitten}</strong> · เจอมาทั้งหมด{" "}
          <strong>{s.total - s.unseen}</strong> ตระกูล
        </p>
        <p className="subtitle">
          “ปราบแล้ว” = เคยตกกับดักนี้ แล้วผ่านได้ในโจทย์ข้ออื่นตั้งแต่ 2 ครั้งขึ้นไป —
          ไม่ใช่แค่จำข้อได้
        </p>
      </div>

      {book.tags
        .filter((t) => t.status !== "unseen")
        .map((t) => (
          <div key={t.tag} className="card">
            <span className="tag">{STATUS_LABEL[t.status]}</span>
            <p className="problem">
              <strong>{t.tag}</strong>
            </p>
            {t.example && (
              <p className="problem-sub">
                <MathText>{t.example}</MathText>
              </p>
            )}
            <p className="subtitle">
              ตกมา {t.hits} ครั้ง · ผ่านเปลือกใหม่ {t.passes} ครั้ง
              {t.lastSeen ? ` · ล่าสุด ${new Date(t.lastSeen).toLocaleDateString("th-TH")}` : ""}
            </p>
            {t.practiceProblemId && t.status !== "slain" && (
              <Link href={`/problem/${t.practiceProblemId}`} className="next-link">
                ไปซ่อมตระกูลนี้ →
              </Link>
            )}
          </div>
        ))}

      {s.unseen > 0 && (
        <p className="subtitle">กับดักอีก {s.unseen} ตระกูลยังไม่เคยเจอ — ทำโจทย์ไปเรื่อยๆ เดี๋ยวเจอเอง</p>
      )}
    </>
  );
}
