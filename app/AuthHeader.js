"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../lib/supabaseClient";

export default function AuthHeader() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseReady) {
      setReady(true);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  if (!ready) return null;

  return (
    <div className="auth-header">
      {user ? (
        <>
          <Link href="/mistakes" className="auth-header-link">
            📓 จุดผิดของฉัน
          </Link>
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
