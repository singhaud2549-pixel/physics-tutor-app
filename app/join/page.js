"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseReady } from "../../lib/supabaseClient";

// นักเรียนกรอกรหัสครูครั้งเดียวตอนเริ่มใช้ — ผูกบัญชีเข้ากับผู้สอน
export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!isSupabaseReady) return setMsg("ยังไม่ได้ตั้งค่า Supabase");
    setBusy(true);
    setMsg("");
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        router.push("/login?next=/join");
        return;
      }
      const { data, error } = await supabase.rpc("join_teacher", { code });
      if (error) throw error;
      if (data === true) {
        setMsg("✅ ผูกกับผู้สอนเรียบร้อยแล้ว");
        setTimeout(() => router.push("/"), 1200);
      } else {
        setMsg("ไม่พบรหัสนี้ — ลองเช็คตัวสะกดกับผู้สอนอีกครั้ง");
      }
    } catch (err) {
      setMsg("ผิดพลาด: " + (err?.message || "ลองใหม่อีกครั้ง"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <Link href="/" className="back-link">
        ‹ กลับหน้าแรก
      </Link>
      <div className="card">
        <h1>ใส่รหัสผู้สอน</h1>
        <p className="subtitle">ทำครั้งเดียวตอนเริ่มใช้ — ขอรหัสจากผู้สอนได้เลย</p>
        <form onSubmit={submit} className="auth-form">
          <input
            className="text-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="เช่น SINGHA"
            autoCapitalize="characters"
          />
          <button type="submit" className="btn" disabled={busy || !code.trim()}>
            {busy ? "กำลังผูก…" : "ยืนยัน"}
          </button>
        </form>
        {msg && <p className="subtitle">{msg}</p>}
      </div>
    </div>
  );
}
