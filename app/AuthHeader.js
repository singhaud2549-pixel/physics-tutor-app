"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../lib/supabaseClient";

export default function AuthHeader() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [needsTeacher, setNeedsTeacher] = useState(false);

  useEffect(() => {
    if (!isSupabaseReady) {
      setReady(true);
      return;
    }
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data?.user ?? null);
      setReady(true);
      // ลิงก์ "ห้องผู้สอน" โผล่เฉพาะบัญชีที่เป็นผู้สอน (RLS ยอมให้อ่านแถวของตัวเองอยู่แล้ว)
      if (data?.user) {
        // ตั้งต้นว่ายังไม่ผูกครูไว้ก่อน — ถ้าอ่าน profiles ไม่สำเร็จ ลิงก์จะยังอยู่
        // (ลิงก์เกินมาแค่รก แต่ลิงก์หายไปแปลว่านักเรียนเริ่มใช้ไม่ได้เลย)
        setNeedsTeacher(true);
        try {
          const { data: prof, error } = await supabase
            .from("profiles")
            .select("role, teacher_id")
            .eq("user_id", data.user.id)
            .maybeSingle();
          if (error) {
            console.warn("[AuthHeader] อ่าน profiles ไม่สำเร็จ:", error.message);
          } else if (prof) {
            setIsTeacher(prof.role === "teacher");
            setNeedsTeacher(prof.role !== "teacher" && !prof.teacher_id);
          }
        } catch (e) {
          console.warn("[AuthHeader] อ่าน profiles ผิดพลาด:", e?.message || e);
        }
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setIsTeacher(false);
        setNeedsTeacher(false);
      }
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  if (!ready) return null;

  return (
    <div className="auth-header">
      {user ? (
        <>
          {isTeacher && (
            <Link href="/teacher" className="auth-header-link">
              👨‍🏫 ห้องผู้สอน
            </Link>
          )}
          {needsTeacher && (
            <Link href="/join" className="auth-header-link highlight">
              🔑 ใส่รหัสผู้สอน
            </Link>
          )}
          <span className="auth-header-user">{user.email}</span>
          <button
            type="button"
            className="link-btn"
            onClick={() => supabase.auth.signOut()}
          >
            ออกจากระบบ
          </button>
        </>
      ) : (
        <Link href="/login" className="auth-header-link">
          เข้าสู่ระบบ
        </Link>
      )}
    </div>
  );
}
