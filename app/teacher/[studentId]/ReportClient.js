"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseReady } from "../../../lib/supabaseClient";
import MathText from "../../MathText";
import WeeklyLetter from "./WeeklyLetter";

const HEAT = (n) => (n >= 5 ? "🔴" : n >= 3 ? "🟠" : n >= 2 ? "🟡" : "🟢");

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
        {it.createdAt ? new Date(it.createdAt).toLocaleDateString("th-TH") : "—"} · {it.problemId} · {it.topic}
        {it.examSet ? ` · ${it.examSet}` : ""}
        {time ? ` · ใช้เวลา ${time}` : ""}
        {it.hintCount ? ` · คำใบ้ ${it.hintCount} ครั้ง` : ""}
      </span>
      <div>
        {it.orphan ? (
          <span className="subtitle">ถามโดยยังไม่ส่งคำตอบ · ใช้เวลา {time || "—"}</span>
        ) : (
          <>
            ตอบ <code>{it.answer}</code>
          </>
        )}
        {it.misconception ? (
          <>
            {" "}
            → <MathText>{it.misconception}</MathText>
          </>
        ) : (
          <span className="subtitle"> → ยังไม่รู้ว่าคิดยังไงถึงได้เลขนี้</span>
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

function Questions({ list }) {
  const [open, setOpen] = useState(false);
  if (!list || !list.length) return null;
  const shown = open ? list : list.slice(0, 5);
  return (
    <>
      <h3>คำถามที่เด็กพิมพ์ถาม ({list.length})</h3>
      <ul className="tag-items">
        {shown.map((q, i) => (
          <li key={`${q.sessionKey}-${i}`}>
            <span className="subtitle">
              {q.createdAt ? new Date(q.createdAt).toLocaleDateString("th-TH") : ""} ·{" "}
              {q.problemId || ""} {q.topic ? `· ${q.topic}` : ""}
              {typeof q.secondsOnProblem === "number" ? ` · นาทีที่ ${mmss(q.secondsOnProblem)}` : ""}
            </span>
            <div>
              ถาม: <MathText>{q.text}</MathText>
            </div>
            {q.reply && (
              <div className="subtitle">
                AI ตอบ: <MathText>{q.reply}</MathText>
              </div>
            )}
          </li>
        ))}
      </ul>
      {list.length > 5 && (
        <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)}>
          {open ? "ย่อ" : `ดูทั้งหมด ${list.length} คำถาม`}
        </button>
      )}
    </>
  );
}

function Section({ title, hint, data, open, setOpen }) {
  const hasAny =
    (data.totals.attempts || 0) > 0 ||
    (data.totals.orphanSessions || 0) > 0 ||
    (data.recentQuestions || []).length > 0;
  if (!hasAny) return <p className="subtitle">— ไม่มีข้อมูลในช่วงนี้ —</p>;

  return (
    <>
      <p className="subtitle">
        {hint} · ทำไป <strong>{data.totals.attempts}</strong> ครั้ง · ผิด{" "}
        <strong>{data.totals.wrong}</strong> · ขอคำใบ้ {data.totals.hints} ครั้ง
        {data.totals.questions ? ` · น้องพิมพ์ถาม ${data.totals.questions} ครั้ง` : ""}
        {data.totals.orphanSessions
          ? ` · ถามโดยยังไม่ส่ง ${data.totals.orphanSessions} session`
          : ""}
        {data.totals.medianSeconds
          ? ` · เวลาต่อข้อโดยทั่วไป ${mmss(data.totals.medianSeconds)}`
          : ""}
      </p>

      <Questions list={data.recentQuestions} />

      {data.byTag.length > 0 && (
        <>
          <h3>จุดผิดที่ซ้ำบ่อยที่สุด</h3>
          {data.byTag.map((g) => (
            <div key={g.key} className="tag-row">
              <button
                type="button"
                className="tag-head"
                onClick={() => setOpen(open === g.key ? null : g.key)}
              >
                <span>
                  {HEAT(g.count)} <strong>{g.matched ? g.tag : g.key}</strong>
                  {!g.matched && (
                    <span className="subtitle"> (ตอบผิดนอกกรอบ trap — รอ AI ช่วยเดา)</span>
                  )}
                </span>
                <span className="tag-count">{g.count} ครั้ง</span>
              </button>

              {g.trapRefs.length > 0 && (
                <div className="subtitle trap-refs">
                  ตรงกับดัชนี:{" "}
                  {g.trapRefs.map((t) => `${t.ref}${t.count > 1 ? ` ×${t.count}` : ""}`).join(" · ")}
                </div>
              )}

              {open === g.key && (
                <ul className="tag-items">
                  {g.items.map((it, i) => (
                    <Item key={i} it={it} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}

      {data.byTopic.length > 0 && (
        <>
          <h3>บทที่ผิดบ่อยที่สุด</h3>
          <table className="topic-table">
            <tbody>
              {data.byTopic.map((t) => (
                <tr key={t.key}>
                  <td>{t.topic}</td>
                  <td className="num">
                    ผิด {t.count} จาก {t.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

const TRAP_STATUS = {
  slain: "✅ ปราบแล้ว",
  chasing: "🎯 กำลังไล่",
  bitten: "🔴 ยังโดนกิน",
  unbitten: "🟢 ยังไม่เคยพลาด",
  unseen: "⚪ ยังไม่เจอ",
};

function TrapBook({ book }) {
  const [open, setOpen] = useState(false);
  if (!book) return null;
  const s = book.summary;
  const active = book.tags.filter((t) => t.status === "bitten" || t.status === "chasing");
  return (
    <>
      <h3>สมุดกับดัก</h3>
      <p className="subtitle">
        ✅ {s.slain} · 🎯 {s.chasing} · 🔴 {s.bitten} · เจอมา {s.total - s.unseen} ตระกูล
      </p>
      {active.length > 0 ? (
        <>
          <ul className="tag-items">
            {(open ? active : active.slice(0, 5)).map((t) => (
              <li key={t.tag}>
                <strong>{t.tag}</strong>{" "}
                <span className="subtitle">
                  {TRAP_STATUS[t.status]} · ตก {t.hits} · ผ่านเปลือกใหม่ {t.passes}
                </span>
                {t.example && (
                  <div className="subtitle">
                    <MathText>{t.example}</MathText>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {active.length > 5 && (
            <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)}>
              {open ? "ย่อ" : `ดูทั้งหมด ${active.length} ตระกูลที่ยังไม่ปราบ`}
            </button>
          )}
        </>
      ) : (
        <p className="subtitle">ไม่มีตระกูลค้าง — ปราบหมดแล้วหรือยังไม่เคยตกกับดักเลย</p>
      )}
    </>
  );
}

export default function ReportClient({ studentId }) {
  const [state, setState] = useState("loading");
  const [msg, setMsg] = useState("");
  const [data, setData] = useState(null);
  const [openRecent, setOpenRecent] = useState(null);
  const [openAll, setOpenAll] = useState(null);
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

  const { student, report, trapBook, trapBookRecent } = data;

  return (
    <>
      <h1>{student.display_name || "นักเรียน"}</h1>
      <p className="subtitle">
        {student.grade || "—"} ·{" "}
        {student.max_difficulty ? `ไม่เกินระดับ ${student.max_difficulty}` : "ไม่จำกัดระดับ"}
      </p>

      <div className="card">
        <h2>🆕 ตั้งแต่คาบที่แล้ว</h2>
        <Section
          title="ตั้งแต่คาบที่แล้ว"
          hint={
            report.since
              ? `ตั้งแต่ ${new Date(report.since).toLocaleDateString("th-TH")}`
              : "ยังไม่เคยเปิดรายงาน — แสดงทั้งหมด"
          }
          data={report.recent}
          open={openRecent}
          setOpen={setOpenRecent}
        />
        <TrapBook book={trapBookRecent} />
        <button
          type="button"
          className="btn"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await load(true);
            setSaving(false);
          }}
        >
          {saving ? "กำลังบันทึก…" : "✓ อ่านแล้ว — เริ่มนับใหม่จากตอนนี้"}
        </button>
      </div>

      <div className="card">
        <h2>📚 สะสมทั้งหมด</h2>
        <Section
          title="สะสมทั้งหมด"
          hint="ตั้งแต่เริ่มใช้"
          data={report.all}
          open={openAll}
          setOpen={setOpenAll}
        />
        <TrapBook book={trapBook} />
      </div>

      <div className="card">
        <WeeklyLetter studentId={studentId} />
      </div>
    </>
  );
}
