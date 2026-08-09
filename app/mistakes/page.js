"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../../lib/supabaseClient";
import MathText from "../MathText";

export default function MistakesPage() {
  const [state, setState] = useState("loading"); // loading | noauth | ready | notready
  const [wrong, setWrong] = useState([]);
  const [problems, setProblems] = useState({}); // id -> {statement, topic}

  useEffect(() => {
    if (!isSupabaseReady) {
      setState("notready");
      return;
    }
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setState("noauth");
        return;
      }
      // ดึงโจทย์ (ไว้แปลง id → โจทย์) + การตอบผิดของฉัน
      const [probsRes, attemptsRes] = await Promise.all([
        fetch("/api/problems").then((r) => r.json()),
        supabase
          .from("attempts")
          .select("problem_id, topic, answer, created_at")
          .eq("is_correct", false)
          .order("created_at", { ascending: false }),
      ]);
      const map = {};
      for (const p of probsRes) map[p.id] = p;
      setProblems(map);

      const attempts = attemptsRes.data || [];
      // ดึง "เข้าใจผิดยังไง" ของแต่ละข้อผิด (จับคู่คำตอบ → trap)
      let misc = [];
      if (attempts.length) {
        misc = await fetch("/api/misconception", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: attempts.map((a) => ({
              problemId: a.problem_id,
              answer: a.answer,
            })),
          }),
        }).then((r) => r.json());
      }
      // แนบ misconception เข้าไปในแต่ละแถว (เรียงตรงกัน)
      setWrong(
        attempts.map((a, i) => ({
          ...a,
          misconception: misc[i]?.misconception || null,
        })),
      );
      setState("ready");
    })();
  }, []);

  if (state === "loading") return null;

  if (state === "notready")
    return (
      <div className="container">
        <p className="subtitle">ยังไม่ได้ตั้งค่า Supabase</p>
      </div>
    );

  if (state === "noauth")
    return (
      <div className="container">
        <div className="card">
          <p>กรุณา<Link href="/login" className="auth-header-link"> เข้าสู่ระบบ </Link>ก่อน เพื่อดูจุดผิดของตัวเอง</p>
        </div>
      </div>
    );

  // สรุปจุดอ่อนตามบท (นับจำนวนตอบผิดต่อหัวข้อ)
  const byTopic = {};
  for (const a of wrong) {
    const t = a.topic || "อื่น ๆ";
    byTopic[t] = (byTopic[t] || 0) + 1;
  }
  const weakness = Object.entries(byTopic).sort((a, b) => b[1] - a[1]);

  return (
    <div className="container">
      <Link href="/" className="back-link">
        ‹ กลับหน้าแรก
      </Link>
      <h1>📓 จุดผิดของฉัน</h1>
      <p className="subtitle">รวมข้อที่เคยตอบผิด ไว้กลับมาทบทวน</p>

      {wrong.length === 0 ? (
        <div className="card">
          <p>ยังไม่มีจุดผิดที่บันทึกไว้ — ลองทำโจทย์ดูสิ 💪</p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2 className="cat-name">สรุปจุดที่ควรทบทวน</h2>
            <div className="weakness-list">
              {weakness.map(([topic, count]) => (
                <div key={topic} className="weakness-row">
                  <span>{topic}</span>
                  <span className="weakness-count">ผิด {count} ครั้ง</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="cat-name">จุดที่เข้าใจผิด</h2>
            <div className="problem-list">
              {wrong.map((a, i) => {
                const p = problems[a.problem_id];
                return (
                  <Link
                    key={i}
                    href={`/problem/${a.problem_id}`}
                    className="mistake-item"
                  >
                    <div className="mistake-main">
                      {a.misconception ? (
                        <>
                          ❌ <MathText>{a.misconception}</MathText>
                        </>
                      ) : (
                        <>❌ ตอบผิด (ลองกลับไปทบทวนโจทย์นี้)</>
                      )}
                    </div>
                    <div className="mistake-sub">
                      {p ? <MathText>{p.statement}</MathText> : a.problem_id} · ตอบ
                      &quot;{a.answer}&quot; › กดเพื่อทำใหม่
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
