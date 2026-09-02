"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseReady } from "../../../lib/supabaseClient";
import MathText from "../../MathText";

const HEAT = (n) => (n >= 5 ? "🔴" : n >= 3 ? "🟠" : n >= 2 ? "🟡" : "🟢");

function Section({ title, hint, data, open, setOpen }) {
  if (!data.totals.attempts) return <p className="subtitle">— ไม่มีข้อมูลในช่วงนี้ —</p>;

  return (
    <>
      <p className="subtitle">
        {hint} · ทำไป <strong>{data.totals.attempts}</strong> ครั้ง · ผิด{" "}
        <strong>{data.totals.wrong}</strong> · ขอคำใบ้ {data.totals.hints} ครั้ง
      </p>

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
                    <li key={i}>
                      <span className="subtitle">
                        {new Date(it.createdAt).toLocaleDateString("th-TH")} · {it.problemId} ·{" "}
                        {it.topic}
                        {it.examSet ? ` · ${it.examSet}` : ""}
                      </span>
                      <div>
                        ตอบ <code>{it.answer}</code>
                        {it.misconception ? (
                          <>
                            {" "}
                            → <MathText>{it.misconception}</MathText>
                          </>
                        ) : (
                          <span className="subtitle"> → ยังไม่รู้ว่าคิดยังไงถึงได้เลขนี้</span>
                        )}
                      </div>
                    </li>
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

  const { student, report } = data;

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
      </div>
    </>
  );
}
