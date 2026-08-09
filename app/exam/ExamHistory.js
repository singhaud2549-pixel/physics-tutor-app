"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseReady } from "../../lib/supabaseClient";
import { examDisplayName } from "../../lib/examDisplay";

export default function ExamHistory() {
  const [state, setState] = useState("loading"); // loading | notready | noauth | ready
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!isSupabaseReady) {
      setState("notready");
      return;
    }
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        setState("noauth");
        return;
      }
      const { data } = await supabase
        .from("exam_sessions")
        .select("exam_set, total, max, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      setRows(data || []);
      setState("ready");
    })();
  }, []);

  if (state === "loading" || state === "notready") return null;

  if (state === "noauth") {
    return (
      <div className="card">
        <p className="subtitle" style={{ marginBottom: 0 }}>
          เข้าสู่ระบบเพื่อบันทึก/ดูประวัติคะแนนสอบของตัวเอง
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card">
        <p className="subtitle" style={{ marginBottom: 0 }}>
          ยังไม่เคยทำข้อสอบชุดไหนเลย — คะแนนจะบันทึกอัตโนมัติหลังส่งข้อสอบ
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="cat-name">ประวัติคะแนนของฉัน</h2>
      <div className="weakness-list">
        {rows.map((r, i) => (
          <div key={i} className="examhist-row">
            <div>
              <div className="examhist-name">{examDisplayName(r.exam_set)}</div>
              <div className="examhist-date">
                {new Date(r.created_at).toLocaleString("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </div>
            </div>
            <span className="examhist-score">
              {r.total}/{r.max}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
