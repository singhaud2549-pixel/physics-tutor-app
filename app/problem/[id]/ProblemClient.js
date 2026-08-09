"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../../../lib/supabaseClient";
import MathText from "../../MathText";

export default function ProblemClient({ problem }) {
  const [answer, setAnswer] = useState("");
  const [thread, setThread] = useState([]); // {role, text, answer?}
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false); // เริ่มมีตัวอักษรไหลออกมาแล้ว
  const [solved, setSolved] = useState(false);
  const [nextRec, setNextRec] = useState(null); // โจทย์ที่แนะนำข้อต่อไป

  // ต้องล็อกอินก่อนถึงจะทำโจทย์ได้ (กันคนแปลกหน้ายิง /api/hint ฟรี)
  const [authReady, setAuthReady] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [dailyLimitReached, setDailyLimitReached] = useState(false); // ครบ 60 ครั้ง/วันแล้ว

  useEffect(() => {
    if (!isSupabaseReady) {
      setAuthReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data?.session?.access_token ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const isChoice = problem.kind === "choice";

  // หลังทำถูก → ขอคำแนะนำข้อต่อไป (ใช้ประวัติของนักเรียน)
  async function fetchNext() {
    let history = [];
    if (isSupabaseReady) {
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        const { data } = await supabase
          .from("attempts")
          .select("problem_id, is_correct, created_at")
          .order("created_at", { ascending: true });
        history = data || [];
      }
    }
    try {
      const rec = await fetch("/api/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentId: problem.id, history }),
      }).then((r) => r.json());
      setNextRec(rec);
    } catch {
      setNextRec(null);
    }
  }

  // บันทึกการทำโจทย์ลงฐานข้อมูล (เฉพาะคนที่ล็อกอิน)
  async function recordAttempt(answerValue, isCorrect, hintCount) {
    if (!isSupabaseReady) return;
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return; // ยังไม่ล็อกอิน = ไม่บันทึก
    await supabase.from("attempts").insert({
      user_id: data.user.id,
      problem_id: problem.id,
      topic: problem.topic,
      answer: String(answerValue),
      is_correct: isCorrect,
      hint_count: hintCount,
    });
  }

  function priorFrom(list) {
    return {
      priorHints: list.filter((m) => m.role === "hint").map((m) => m.text),
      priorAttempts: list
        .filter((m) => m.role === "student")
        .map((m) => m.answer ?? m.text),
    };
  }

  async function callHint(body, recordInfo) {
    setLoading(true);
    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ ...body, problemId: problem.id }),
      });

      // ถูกบล็อก (ไม่ได้ล็อกอิน / เกินโควตา / ระบบเต็ม) → เซิร์ฟเวอร์ตอบ JSON พร้อม status ไม่ใช่ 2xx
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "auth_required") {
          // token หมดอายุกลางคัน → เด้งกลับไปหน้า guest-gate
          setAccessToken(null);
        } else if (data.error === "rate_limited") {
          setDailyLimitReached(true);
          setThread((t) => [...t, { role: "blocked", text: data.message }]);
        } else {
          setThread((t) => [
            ...t,
            { role: "blocked", text: data.message || "ขออภัย ระบบมีปัญหาชั่วคราว ลองใหม่อีกครั้งนะ" },
          ]);
        }
        return;
      }

      // ตอบถูก / มีข้อผิดพลาด → เซิร์ฟเวอร์ส่ง JSON กลับมาทีเดียว (ไม่เรียก AI)
      const isJson = (res.headers.get("content-type") || "").includes("json");
      if (isJson) {
        const data = await res.json();
        if (data.correct) {
          setThread((t) => [...t, { role: "correct", text: data.message }]);
          setSolved(true);
          fetchNext();
        } else {
          setThread((t) => [...t, { role: "hint", text: data.hint }]);
        }
        if (recordInfo) {
          recordAttempt(recordInfo.answerValue, !!data.correct, recordInfo.hintCount);
        }
        return;
      }

      // ตอบผิด / ขอคำใบ้ → คำใบ้ไหลมาทีละชิ้น ต่อเข้ากล่องเดิมเรื่อย ๆ
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let opened = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (!opened) {
          opened = true;
          setStreaming(true); // ตัวอักษรแรกมาแล้ว → เอาข้อความ "กำลังคิด" ออก
          setThread((t) => [...t, { role: "hint", text: acc }]);
        } else {
          setThread((t) => {
            const copy = [...t];
            copy[copy.length - 1] = { role: "hint", text: acc };
            return copy;
          });
        }
      }
      if (!opened) {
        setThread((t) => [
          ...t,
          { role: "hint", text: "ขออภัย พี่คิดคำใบ้ไม่ออก ลองกดใหม่อีกทีนะ" },
        ]);
      }
      if (recordInfo) {
        recordAttempt(recordInfo.answerValue, false, recordInfo.hintCount);
      }
    } catch (err) {
      setThread((t) => [
        ...t,
        { role: "hint", text: "ขออภัย มีข้อผิดพลาดในการเชื่อมต่อ ลองใหม่อีกครั้งนะ" },
      ]);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }

  // อัตนัย: ส่งตัวเลขที่พิมพ์
  async function submit(e) {
    e.preventDefault();
    const value = answer.trim();
    if (!value || loading || solved || dailyLimitReached) return;
    const { priorHints, priorAttempts } = priorFrom(thread);
    setThread((t) => [...t, { role: "student", text: value, answer: value }]);
    setAnswer("");
    await callHint(
      { studentAnswer: value, priorAttempts, priorHints },
      { answerValue: value, hintCount: priorHints.length },
    );
  }

  // ปรนัย: เลือกข้อ A-E
  async function choose(letter) {
    if (loading || solved || dailyLimitReached) return;
    const { priorHints, priorAttempts } = priorFrom(thread);
    setThread((t) => [
      ...t,
      { role: "student", text: `เลือกข้อ ${letter}`, answer: letter },
    ]);
    await callHint(
      { studentAnswer: letter, priorAttempts, priorHints },
      { answerValue: letter, hintCount: priorHints.length },
    );
  }

  async function askForHint() {
    if (loading || solved || dailyLimitReached) return;
    const { priorHints, priorAttempts } = priorFrom(thread);
    setThread((t) => [...t, { role: "ask", text: "ขอคำใบ้หน่อย 🙏" }]);
    await callHint({ requestHint: true, priorAttempts, priorHints });
  }

  return (
    <div className="container">
      <Link href="/" className="back-link">
        ‹ กลับไปเลือกโจทย์
      </Link>

      <div className="card">
        <span className="tag">
          {problem.level ? `${problem.level} · ` : ""}
          {problem.topic}
        </span>
        <p className="problem">
          <MathText>{problem.statement}</MathText>
        </p>
        {problem.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={problem.image}
            alt="รูปประกอบโจทย์"
            className="problem-image"
          />
        )}
        {problem.unit && (
          <p className="problem-sub">
            <MathText>{problem.unit}</MathText>
          </p>
        )}

        {!authReady ? null : !accessToken ? (
          <div className="auth-gate">
            <p>ต้องเข้าสู่ระบบก่อนเริ่มทำโจทย์นี้นะ (กันคนแปลกหน้ามาใช้ AI ฟรี)</p>
            <Link
              href={`/login?next=${encodeURIComponent(`/problem/${problem.id}`)}`}
              className="auth-gate-btn"
            >
              เข้าสู่ระบบ →
            </Link>
          </div>
        ) : (
          <>
            {isChoice ? (
              <div className="choice-list">
                {problem.choices.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className="choice-btn"
                    onClick={() => choose(c.key)}
                    disabled={loading || solved || dailyLimitReached}
                  >
                    <span className="choice-key">{c.key}</span>
                    <span className="choice-text">
                      <MathText>{c.text}</MathText>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <form className="answer-row" onSubmit={submit}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="พิมพ์คำตอบเป็นตัวเลข"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={solved || dailyLimitReached}
                />
                <button type="submit" disabled={loading || solved || dailyLimitReached}>
                  {solved ? "ผ่านแล้ว ✓" : "ส่งคำตอบ"}
                </button>
              </form>
            )}

            {!solved && (
              <button
                type="button"
                className="hint-btn"
                onClick={askForHint}
                disabled={loading || dailyLimitReached}
              >
                💡 คิดไม่ออก ขอคำใบ้
              </button>
            )}

            {loading && !streaming && <p className="loading">พี่กำลังคิดคำใบ้…</p>}
          </>
        )}
      </div>

      {thread.length > 0 && (
        <div className="thread">
          {thread.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              <div className="label">
                {m.role === "student"
                  ? "คำตอบของฉัน"
                  : m.role === "correct"
                    ? "ถูกต้อง"
                    : m.role === "ask"
                      ? "ฉัน"
                      : m.role === "blocked"
                        ? "แจ้งเตือน"
                        : "คำใบ้จากพี่"}
              </div>
              <MathText>{m.text}</MathText>
            </div>
          ))}
        </div>
      )}

      {solved && (
        <div className="reco-card">
          {!nextRec ? (
            <p className="loading">กำลังเลือกข้อต่อไปให้…</p>
          ) : nextRec.done ? (
            <>
              <p className="reco-reason">{nextRec.reason}</p>
              <Link href="/" className="next-link">
                กลับไปเลือกบทอื่น →
              </Link>
            </>
          ) : nextRec.nextId ? (
            <>
              <p className="reco-reason">👉 {nextRec.reason}</p>
              <Link href={`/problem/${nextRec.nextId}`} className="reco-btn">
                ทำข้อต่อไป →
              </Link>
              <Link href="/" className="next-link-sub">
                หรือกลับไปเลือกเอง
              </Link>
            </>
          ) : (
            <Link href="/" className="next-link">
              ไปทำข้ออื่นต่อ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
