"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../../lib/supabaseClient";
import MathText from "../MathText";

// รายการโจทย์ในบท — ทำเป็นฝั่งเบราว์เซอร์เพราะต้องรู้ว่า "คนที่ล็อกอินอยู่" ทำข้อไหนไปแล้ว
export default function ProblemList({ items }) {
  const [solved, setSolved] = useState(null); // Set ของ id ที่ทำถูกแล้ว
  const [tried, setTried] = useState(null); // Set ของ id ที่เคยลองแต่ยังไม่ถูก

  useEffect(() => {
    if (!isSupabaseReady) return;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data, error } = await supabase.from("attempts").select("problem_id, is_correct");
      if (error) {
        console.warn("[ProblemList] อ่านประวัติไม่สำเร็จ:", error.message);
        return;
      }
      const ok = new Set();
      const no = new Set();
      for (const a of data || []) (a.is_correct ? ok : no).add(a.problem_id);
      for (const id of ok) no.delete(id); // ทำถูกแล้วถือว่าผ่าน ไม่นับว่ายังค้าง
      setSolved(ok);
      setTried(no);
    })();
  }, []);

  const doneCount = solved ? items.filter((p) => solved.has(p.id)).length : 0;

  return (
    <>
      {solved && (
        <p className="subtitle">
          ทำถูกแล้ว <strong>{doneCount}</strong> จาก {items.length} ข้อ
          {tried?.size ? ` · ยังค้างอยู่ ${items.filter((p) => tried.has(p.id)).length} ข้อ` : ""}
        </p>
      )}
      <div className="problem-list">
        {items.map((p) => {
          const isSolved = solved?.has(p.id);
          const isTried = !isSolved && tried?.has(p.id);
          return (
            <Link
              key={p.id}
              href={`/problem/${p.id}`}
              className={`problem-link${isSolved ? " solved" : ""}${isTried ? " tried" : ""}`}
            >
              <span className="problem-link-text">
                <MathText>{p.statement}</MathText>
              </span>
              <span className="problem-link-arrow">{isSolved ? "✓" : isTried ? "↻" : "›"}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
