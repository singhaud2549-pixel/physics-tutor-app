"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../../../lib/supabaseClient";
import MathText from "../../MathText";
import WeeklyLetter from "./WeeklyLetter";

const mmss = (s) =>
  typeof s !== "number" ? null : s < 60 ? `${s} วิ` : `${Math.floor(s / 60)} นาที ${s % 60} วิ`;

const ROLE_LABEL = {
  student: "น้องตอบ",
  question: "น้องถาม",
  ask: "น้องกดขอคำใบ้",
  hint: "AI ใบ้",
  correct: "ถูกต้อง",
  solution: "เปิดเฉลย",
  blocked: "ระบบขัดข้อง",
};

function Item({ it }) {
  const [showChat, setShowChat] = useState(false);
  const time = mmss(it.secondsOnProblem);
  return (
    <li>
      <span className="subtitle">
        {it.createdAt ? new Date(it.createdAt).toLocaleDateString("th-TH") : "—"} ·{" "}
        <Link href={`/problem/${it.problemId}`}>{it.problemId} →</Link> · {it.topic}
        {it.examSet ? ` · ${it.examSet}` : ""}
        {time ? ` · ใช้เวลา ${time}` : ""}
        {it.hintCount ? ` · คำใบ้ ${it.hintCount} ครั้ง` : ""}
      </span>
      <div>
        {it.orphan ? (
          <span className="subtitle">ถามโดยยังไม่ส่งคำตอบ · ใช้เวลา {time || "—"}</span>
        ) : it.isCorrect ? (
          <>
            ✓ ถูก · ตอบ <code>{it.answer}</code>
          </>
        ) : (
          <>
            ✗ ผิด · ตอบ <code>{it.answer}</code>
            {it.misconception ? (
              <>
                {" "}
                → <MathText>{it.misconception}</MathText>
              </>
            ) : (
              <span className="subtitle"> → ยังไม่รู้ว่าคิดยังไงถึงได้เลขนี้</span>
            )}
          </>
        )}
      </div>
      {it.transcript?.length > 0 && (
        <>
          <button type="button" className="link-btn" onClick={() => setShowChat((v) => !v)}>
            {showChat ? "ซ่อนบทสนทนา" : `ดูบทสนทนากับ AI (${it.transcript.length} ข้อความ)`}
          </button>
          {showChat && (
            <div className="transcript">
              {it.transcript.map((m) => (
                <div key={m.seq} className={`transcript-line role-${m.role}`}>
                  <span className="subtitle">
                    {ROLE_LABEL[m.role] || m.role}
                    {typeof m.seconds_on_problem === "number"
                      ? ` · นาทีที่ ${mmss(m.seconds_on_problem)}`
                      : ""}
                  </span>
                  <div>
                    <MathText>{m.text}</MathText>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </li>
  );
}

export default function ReportClient({ studentId }) {
  const [state, setState] = useState("loading");
  const [msg, setMsg] = useState("");
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load(markReviewed = false) {
    if (!isSupabaseReady) return setState("error"), setMsg("ยังไม่ได้ตั้งค่า Supabase");
    const { data: s } = await supabase.auth.getSession();
    const t = s?.session?.access_token;
    if (!t) return setState("noauth");
    const res = await fetch("/api/teacher/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ studentId, markReviewed }),
    });
    const json = await res.json();
    if (!res.ok) return setState("error"), setMsg(json.error || "โหลดรายงานไม่สำเร็จ");
    setData(json);
    setState("ready");
  }

  useEffect(() => {
    load();
  }, [studentId]);

  if (state === "loading") return <p className="subtitle">กำลังโหลดรายงาน…</p>;
  if (state === "noauth") return <p className="subtitle">กรุณาเข้าสู่ระบบด้วยบัญชีผู้สอน</p>;
  if (state === "error") return <p className="subtitle">⚠️ {msg}</p>;

  const { student, report, recentItems = [] } = data;

  return (
    <>
      <h1>{student.display_name || "นักเรียน"}</h1>
      <p className="subtitle">
        {student.grade || "—"} ·{" "}
        {student.max_difficulty ? `ไม่เกินระดับ ${student.max_difficulty}` : "ไม่จำกัดระดับ"}
      </p>

      <div className="card">
        <h2>🆕 รายการล่าสุด ({recentItems.length})</h2>
        <p className="subtitle">
          {report?.since
            ? `ตั้งแต่ ${new Date(report.since).toLocaleDateString("th-TH")}`
            : "ยังไม่เคยเปิดรายงาน — แสดงทั้งหมด"}
        </p>
        {recentItems.length > 0 ? (
          <ul className="tag-items">
            {recentItems.map((it, i) => (
              <Item
                key={`${it.sessionKey || "-"}-${it.problemId}-${it.createdAt || ""}-${i}`}
                it={it}
              />
            ))}
          </ul>
        ) : (
          <p className="subtitle">อ่านครบแล้ว ✓ — เด็กทำข้อใหม่จะโผล่ที่นี่</p>
        )}
        <button
          type="button"
          className="btn"
          disabled={saving || recentItems.length === 0}
          onClick={async () => {
            setSaving(true);
            await load(true);
            setSaving(false);
          }}
        >
          {saving ? "กำลังบันทึก…" : "✓ อ่านแล้ว — ซ่อนรายการพวกนี้"}
        </button>
      </div>

      <div className="card">
        <WeeklyLetter studentId={studentId} />
      </div>
    </>
  );
}
