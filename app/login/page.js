"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!isSupabaseReady) {
      setMsg("ยังไม่ได้ตั้งค่า Supabase (ใส่ค่าใน .env.local ก่อน)");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("สมัครสำเร็จ! ถ้าระบบให้ยืนยันอีเมล ให้เช็คกล่องอีเมลก่อน แล้วค่อยเข้าสู่ระบบ");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
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
        <h1>{mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}</h1>
        <p className="subtitle">
          {mode === "login"
            ? "เข้าสู่ระบบเพื่อบันทึกความก้าวหน้าและดูจุดผิดของตัวเอง"
            : "สร้างบัญชีใหม่ (ใช้อีเมลอะไรก็ได้)"}
        </p>

        <form onSubmit={submit} className="auth-form">
          <input
            type="email"
            placeholder="อีเมล"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? "กำลังทำงาน…" : mode === "login" ? "เข้าสู่ระบบ" : "สมัคร"}
          </button>
        </form>

        {msg && <p className="auth-msg">{msg}</p>}

        <p className="auth-switch">
          {mode === "login" ? "ยังไม่มีบัญชี? " : "มีบัญชีแล้ว? "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMsg("");
            }}
          >
            {mode === "login" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
          </button>
        </p>
      </div>
    </div>
  );
}
