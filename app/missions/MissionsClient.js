"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../../lib/supabaseClient";

const BUDGETS = [15, 30, 45, 60];

export default function MissionsClient() {
  const [state, setState] = useState("loading"); // loading | noauth | ready | error
  const [msg, setMsg] = useState("");
  const [budget, setBudget] = useState(30);
  const [data, setData] = useState(null);

  async function load(minutes) {
    if (!isSupabaseReady) return setState("error"), setMsg("ยังไม่ได้ตั้งค่า Supabase");
    const { data: s } = await supabase.auth.getSession();
    const t = s?.session?.access_token;
    if (!t) return setState("noauth");
    setState("loading");
    const res = await fetch(`/api/missions?budget=${minutes}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const json = await res.json();
    if (!res.ok) return setState("error"), setMsg(json.error || "โหลดภารกิจไม่สำเร็จ");
    setData(json);
    setState("ready");
  }

  useEffect(() => {
    load(budget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeBudget(minutes) {
    setBudget(minutes);
    load(minutes);
  }

  if (state === "loading" && !data)
    return <p className="subtitle">กำลังจัดภารกิจวันนี้ให้…</p>;
  if (state === "noauth")
    return (
      <div className="card">
        <p>เข้าสู่ระบบก่อนถึงจะเห็นภารกิจของตัวเองนะ</p>
        <Link href="/login?next=/missions" className="auth-gate-btn">
          เข้าสู่ระบบ →
        </Link>
      </div>
    );
  if (state === "error") return <p className="subtitle">⚠️ {msg}</p>;

  if (data.done)
    return (
      <div className="card">
        <p>🎉 ทำครบทุกข้อในคลังแล้ว เก่งมาก — กลับไปทบทวนสมุดกับดักได้นะ</p>
        <Link href="/traps" className="next-link">
          เปิดสมุดกับดัก →
        </Link>
      </div>
    );

  return (
    <>
      <div className="card">
        <p className="subtitle">วันนี้มีเวลาเท่าไหร่?</p>
        <div className="weak-topics">
          {BUDGETS.map((m) => (
            <button
              key={m}
              type="button"
              className={`weak-topic-btn${budget === m ? " active" : ""}`}
              onClick={() => changeBudget(m)}
            >
              {m} นาที
            </button>
          ))}
        </div>
        <p className="subtitle">
          แผนตอนนี้ {data.totalMinutes} นาที จากงบ {data.budgetMinutes} นาที
        </p>
      </div>

      <p className="subtitle">ลำดับที่ควรทำ — ปิดของค้างก่อนเปิดของใหม่</p>
      {data.missions.map((m, i) => (
        <div key={m.problemId} className="card">
          <span className="tag">
            งานที่ {i + 1} · ~{m.estMinutes} นาที
          </span>
          <p className="problem">
            <strong>{m.title}</strong>
          </p>
          <p className="problem-sub">{m.reason}</p>
          <p className="subtitle">
            {m.problemId} · {m.topic}
          </p>
          <Link href={`/problem/${m.problemId}`} className="next-link">
            {i === 0 ? "เริ่มงานแรก →" : "ทำข้อนี้ →"}
          </Link>
        </div>
      ))}
    </>
  );
}
