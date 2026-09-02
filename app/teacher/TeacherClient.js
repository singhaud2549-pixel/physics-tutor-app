"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../../lib/supabaseClient";

export default function TeacherClient() {
  const [state, setState] = useState("loading"); // loading | noauth | notteacher | ready | error
  const [msg, setMsg] = useState("");
  const [me, setMe] = useState(null);
  const [students, setStudents] = useState([]);
  const [editing, setEditing] = useState(null); // user_id ที่กำลังแก้
  const [draft, setDraft] = useState({});

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  async function load() {
    if (!isSupabaseReady) return setState("error"), setMsg("ยังไม่ได้ตั้งค่า Supabase");
    const t = await token();
    if (!t) return setState("noauth");
    const res = await fetch("/api/teacher/students", { headers: { Authorization: `Bearer ${t}` } });
    const data = await res.json();
    if (res.status === 403) return setState("notteacher");
    if (!res.ok) return setState("error"), setMsg(data.error || "โหลดข้อมูลไม่สำเร็จ");
    setMe(data.me);
    setStudents(data.students);
    setState("ready");
  }

  useEffect(() => {
    load();
  }, []);

  async function save(studentId) {
    const t = await token();
    const res = await fetch("/api/teacher/students", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ studentId, ...draft }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || "บันทึกไม่สำเร็จ");
    setEditing(null);
    setDraft({});
    setMsg("");
    load();
  }

  async function saveCode(code) {
    const t = await token();
    const res = await fetch("/api/teacher/students", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ inviteCode: code }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || "ตั้งรหัสไม่สำเร็จ");
    setMsg("");
    load();
  }

  if (state === "loading") return <p className="subtitle">กำลังโหลด…</p>;
  if (state === "noauth")
    return (
      <div className="card">
        <p>ต้องเข้าสู่ระบบด้วยบัญชีผู้สอนก่อน</p>
        <Link href="/login?next=/teacher" className="auth-header-link">
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  if (state === "notteacher")
    return (
      <div className="card">
        <p>บัญชีนี้ยังไม่ได้ตั้งเป็น &quot;ผู้สอน&quot;</p>
        <p className="subtitle">
          เปิด Supabase → SQL Editor แล้วรันคำสั่งนี้หนึ่งครั้ง (แทนอีเมลของพี่)
        </p>
        <pre className="code-block">{`insert into profiles (user_id, role, display_name, invite_code)
select id, 'teacher', 'ผู้สอน', 'SINGHA'
from auth.users where email = 'อีเมลของพี่'
on conflict (user_id) do update
  set role = 'teacher', invite_code = excluded.invite_code;`}</pre>
      </div>
    );
  if (state === "error") return <p className="subtitle">⚠️ {msg}</p>;

  return (
    <>
      <div className="card">
        <h2>รหัสครูของพี่</h2>
        <p className="subtitle">
          ให้นักเรียนสมัครบัญชีเอง แล้วเข้าหน้า <code>/join</code> กรอกรหัสนี้ครั้งเดียว
          — ไม่มีรหัส = เข้าระบบของพี่ไม่ได้
        </p>
        <div className="inline-form">
          <input
            className="text-input"
            defaultValue={me?.invite_code || ""}
            placeholder="เช่น SINGHA"
            onBlur={(e) => {
              const v = e.target.value.trim().toUpperCase();
              if (v && v !== (me?.invite_code || "")) saveCode(v);
            }}
          />
          <span className="subtitle">พิมพ์แล้วคลิกนอกช่องเพื่อบันทึก</span>
        </div>
      </div>

      {msg && <p className="subtitle">⚠️ {msg}</p>}

      <h2>นักเรียน ({students.length} คน)</h2>
      {students.length === 0 && (
        <p className="subtitle">ยังไม่มีนักเรียนผูกกับบัญชีนี้ — ให้เขากรอกรหัสครูที่หน้า /join</p>
      )}

      {students.map((s) => (
        <div key={s.user_id} className="card student-row">
          {editing === s.user_id ? (
            <div className="inline-form">
              <input
                className="text-input"
                placeholder="ชื่อเล่น"
                defaultValue={s.display_name || ""}
                onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
              />
              <input
                className="text-input short"
                placeholder="ม.5"
                defaultValue={s.grade || ""}
                onChange={(e) => setDraft((d) => ({ ...d, grade: e.target.value }))}
              />
              <select
                className="text-input short"
                defaultValue={s.max_difficulty ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, maxDifficulty: e.target.value }))}
              >
                <option value="">ไม่จำกัดระดับ</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    ไม่เกินระดับ {n}
                  </option>
                ))}
              </select>
              <button type="button" className="btn" onClick={() => save(s.user_id)}>
                บันทึก
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => (setEditing(null), setDraft({}))}
              >
                ยกเลิก
              </button>
            </div>
          ) : (
            <>
              <div>
                <strong>{s.display_name || "(ยังไม่ได้ตั้งชื่อ)"}</strong>{" "}
                <span className="subtitle">
                  {s.grade || "—"} ·{" "}
                  {s.max_difficulty ? `ไม่เกินระดับ ${s.max_difficulty}` : "ไม่จำกัดระดับ"}
                </span>
                <div className="subtitle">
                  {s.last_reviewed_at
                    ? `เปิดรายงานล่าสุด ${new Date(s.last_reviewed_at).toLocaleDateString("th-TH")}`
                    : "ยังไม่เคยเปิดรายงาน"}
                </div>
              </div>
              <div className="student-actions">
                <Link href={`/teacher/${s.user_id}`} className="btn">
                  ดูรายงาน
                </Link>
                <button type="button" className="link-btn" onClick={() => setEditing(s.user_id)}>
                  แก้ข้อมูล
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </>
  );
}
