"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../../../lib/supabaseClient";
import MathText from "../../MathText";
import ScratchPad from "./ScratchPad";

export default function ProblemClient({ problem }) {
  const [answer, setAnswer] = useState("");
  const [thread, setThread] = useState([]); // {role, text, answer?}
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false); // เริ่มมีตัวอักษรไหลออกมาแล้ว
  const [solved, setSolved] = useState(false);
  const [revealed, setRevealed] = useState(false); // ขอดูเฉลยแล้ว (ทำเองไม่ได้)
  const [nextRec, setNextRec] = useState(null); // โจทย์ที่แนะนำข้อต่อไป

  // ต้องล็อกอินก่อนถึงจะทำโจทย์ได้ (กันคนแปลกหน้ายิง /api/hint ฟรี)
  const [authReady, setAuthReady] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [dailyLimitReached, setDailyLimitReached] = useState(false); // ครบ 60 ครั้ง/วันแล้ว
  const [userId, setUserId] = useState(null);

  // เก็บบทสนทนากับ AI + เวลาที่ใช้ต่อข้อ
  // เปิดโจทย์หนึ่งครั้ง = หนึ่ง sessionKey เพื่อร้อยข้อความให้เป็นเส้นเดียวกัน
  const sessionKeyRef = useRef(null);
  const openedAtRef = useRef(Date.now());
  const savedCountRef = useRef(0); // บันทึกไปแล้วกี่ข้อความ (กันเขียนซ้ำ)
  if (sessionKeyRef.current === null) {
    sessionKeyRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null;
  }
  const secondsOnProblem = () => Math.round((Date.now() - openedAtRef.current) / 1000);

  useEffect(() => {
    if (!isSupabaseReady) {
      setAuthReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data?.session?.access_token ?? null);
      setUserId(data?.session?.user?.id ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAccessToken(session?.access_token ?? null);
      setUserId(session?.user?.id ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // บันทึกบทสนทนา — ดักที่ thread จุดเดียว จึงเก็บครบทุกกรณีโดยไม่ต้องไล่แก้ทีละที่
  useEffect(() => {
    if (!isSupabaseReady || !userId || !sessionKeyRef.current) return;
    if (thread.length <= savedCountRef.current) return;
    const base = savedCountRef.current;
    const pending = thread.slice(base);
    savedCountRef.current = thread.length;
    const rows = pending.map((m, i) => ({
      user_id: userId,
      problem_id: problem.id,
      session_key: sessionKeyRef.current,
      seq: base + i,
      role: m.role,
      text: String(m.text ?? ""),
      seconds_on_problem: secondsOnProblem(),
    }));
    supabase
      .from("hint_messages")
      .insert(rows)
      .then(({ error }) => {
        if (error) console.warn("[transcript] บันทึกบทสนทนาไม่สำเร็จ:", error.message);
      });
  }, [thread, userId, problem.id]);

  // พื้นที่ทด (ลายมือ) — เก็บเป็นเส้น อัปเดตทับแผ่นเดิมของ session นี้
  const sheetRef = useRef(null); // ทั้งหน้า = แผ่นที่เขียนทับได้
  const scratchRef = useRef(null); // { strokes, aspect, layout, rev } ล่าสุด
  const scratchRevRef = useRef(0); // เลขรุ่นของลายมือ เพิ่มขึ้นทุกครั้งที่เปลี่ยน
  const scratchSavedRef = useRef(0); // รุ่นที่บันทึกไปแล้ว (กันบันทึกซ้ำโดยเปล่าประโยชน์)

  const saveScratch = useCallback(async () => {
    if (!isSupabaseReady || !userId || !sessionKeyRef.current) return;
    const cur = scratchRef.current;
    if (!cur || !cur.strokes.length) return;
    if (cur.rev === scratchSavedRef.current) return;
    scratchSavedRef.current = cur.rev;
    const { error } = await supabase.from("scratch_sheets").upsert(
      {
        user_id: userId,
        problem_id: problem.id,
        session_key: sessionKeyRef.current,
        strokes: cur.strokes,
        aspect: cur.aspect,
        layout: cur.layout,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,session_key" },
    );
    if (error) {
      scratchSavedRef.current = 0; // บันทึกไม่ผ่าน ต้องให้ลองใหม่ได้
      console.warn("[scratch] บันทึกพื้นที่ทดไม่สำเร็จ:", error.message);
    }
  }, [userId, problem.id]);

  // ScratchPad เรียกทุกครั้งที่เส้นเปลี่ยน — เก็บใส่ ref แล้วนับ tick ให้ effect ด้านล่างหน่วงบันทึก
  const [scratchTick, setScratchTick] = useState(0);
  const onScratchChange = useCallback((payload) => {
    scratchRevRef.current += 1;
    scratchRef.current = { ...payload, rev: scratchRevRef.current };
    setScratchTick(scratchRevRef.current);
  }, []);

  // หน่วงไว้สองวินาทีหลังหยุดเขียน แล้วค่อยบันทึก (ไม่ยิงฐานข้อมูลทุกเส้น)
  useEffect(() => {
    if (!scratchTick) return;
    const t = setTimeout(saveScratch, 2000);
    return () => clearTimeout(t);
  }, [scratchTick, saveScratch]);

  // ปิดแท็บ/สลับแอปกลางคัน ต้องไม่ทำลายมือหาย
  useEffect(() => {
    const flush = () => saveScratch();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [saveScratch]);

  const isChoice = problem.kind === "choice";
  const hintCount = thread.filter((m) => m.role === "hint").length;

  // หลังทำถูก (หรือขอดูเฉลย) → ขอคำแนะนำข้อต่อไป (ใช้ประวัติของนักเรียน)
  async function fetchNext(currentSolved = true) {
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
        headers: {
          "Content-Type": "application/json",
          // ส่ง token ไปด้วยเพื่อให้เซิร์ฟเวอร์กรองตามเพดานระดับความยากที่ผู้สอนตั้งไว้
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ currentId: problem.id, history, currentSolved }),
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
    saveScratch(); // ส่งคำตอบ = จุดที่ควรเก็บลายมือทันที ไม่ต้องรอหน่วงเวลา
    await supabase.from("attempts").insert({
      user_id: data.user.id,
      problem_id: problem.id,
      topic: problem.topic,
      answer: String(answerValue),
      is_correct: isCorrect,
      hint_count: hintCount,
      seconds_on_problem: secondsOnProblem(),
      session_key: sessionKeyRef.current,
    });
  }

  // ช่องกรอกช่องเดียวรับทั้ง "คำตอบ" และ "คำถาม" — แยกด้วยหน้าตาของสิ่งที่พิมพ์
  // ตัวเลขล้วน (ต่อท้ายด้วยหน่วยสั้น ๆ ได้ เช่น 20, 9.8, 20 m/s) = คำตอบ
  // ปรนัยรับ A-E = คำตอบ · นอกนั้นทั้งหมดถือเป็นคำถาม
  // ทางพลาดปลอดภัย: "ประมาณ 20" จะถูกมองเป็นคำถาม แล้ว AI ก็ยังช่วยตอบอยู่ดี
  // ส่วนคำถามไม่มีทางถูกมองเป็นคำตอบ เพราะคำถามไม่มีทางเป็นตัวเลขล้วน
  function looksLikeAnswer(v) {
    const t = v.trim();
    if (isChoice) return /^[A-Ea-e]$/.test(t);
    return /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?(\s*\S{1,10})?$/.test(t);
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
    if (!value || loading || solved || revealed || dailyLimitReached) return;
    const { priorHints, priorAttempts } = priorFrom(thread);
    setAnswer("");

    // พิมพ์เป็นคำถาม → ไม่นับเป็นการตอบ (ส่ง recordInfo เป็น null)
    // ถ้านับ สถิติ "ตอบผิดกี่ครั้ง" ในรายงานผู้สอนจะเพี้ยนทั้งระบบ
    if (!looksLikeAnswer(value)) {
      setThread((t) => [...t, { role: "question", text: value }]);
      await callHint({ studentQuestion: value, priorAttempts, priorHints }, null);
      return;
    }

    setThread((t) => [...t, { role: "student", text: value, answer: value }]);
    await callHint(
      { studentAnswer: value, priorAttempts, priorHints },
      { answerValue: value, hintCount: priorHints.length },
    );
  }

  // ปรนัย: เลือกข้อ A-E
  async function choose(letter) {
    if (loading || solved || revealed || dailyLimitReached) return;
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
    if (loading || solved || revealed || dailyLimitReached) return;
    const { priorHints, priorAttempts } = priorFrom(thread);
    setThread((t) => [...t, { role: "ask", text: "ขอคำใบ้หน่อย 🙏" }]);
    await callHint({ requestHint: true, priorAttempts, priorHints });
  }

  // ตันจริง ๆ → เปิดเฉลยให้ ดีกว่าปล่อยให้เดามั่วหรือปิดหนีไปเฉย ๆ
  async function revealSolution() {
    if (loading || solved || revealed) return;
    const ok = window.confirm(
      "ดูเฉลยแล้วข้อนี้จะไม่นับว่าทำได้เอง และจะวนกลับมาให้ทบทวนอีกครั้งวันหลังนะ — ดูเลยไหม",
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch("/api/solution", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ problemId: problem.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "auth_required") setAccessToken(null);
        setThread((t) => [
          ...t,
          { role: "blocked", text: data.message || "ขออภัย เปิดเฉลยไม่สำเร็จ ลองใหม่อีกครั้งนะ" },
        ]);
        return;
      }
      const { priorHints } = priorFrom(thread);
      setThread((t) => [
        ...t,
        {
          role: "solution",
          answer: data.answer,
          text: `${data.solution}\n\nไม่เป็นไรนะ ข้อนี้ยากจริง — ลองอ่านวิธีทำแล้วจับหลักให้ได้ เดี๋ยวพี่เอาข้อแนวนี้กลับมาให้ลองใหม่ 💪`,
        },
      ]);
      setRevealed(true);
      recordAttempt("ขอดูเฉลย", false, priorHints.length);
      fetchNext(false); // ยังไม่ผ่านข้อนี้ — ให้วนกลับมาทบทวนวันหลัง
    } catch {
      setThread((t) => [
        ...t,
        { role: "blocked", text: "ขออภัย มีข้อผิดพลาดในการเชื่อมต่อ ลองใหม่อีกครั้งนะ" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container scratch-host" ref={sheetRef}>
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
                    disabled={loading || solved || revealed || dailyLimitReached}
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
                  inputMode="text"
                  placeholder="พิมพ์คำตอบ หรือถามพี่ก็ได้"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={solved || revealed || dailyLimitReached}
                />
                <button
                  type="submit"
                  disabled={loading || solved || revealed || dailyLimitReached}
                >
                  {solved ? "ผ่านแล้ว ✓" : "ส่งคำตอบ"}
                </button>
              </form>
            )}

            {!solved && !revealed && (
              <button
                type="button"
                className="hint-btn"
                onClick={askForHint}
                disabled={loading || dailyLimitReached}
              >
                💡 คิดไม่ออก ขอคำใบ้
              </button>
            )}

            {/* ใบ้ไปหลายรอบแล้วยังไปต่อไม่ได้ → เปิดทางออกให้ ดีกว่าปล่อยให้เดามั่วหรือปิดหนี */}
            {!solved && !revealed && hintCount >= 3 && (
              <button
                type="button"
                className="reveal-btn"
                onClick={revealSolution}
                disabled={loading}
              >
                🔑 ยังไปต่อไม่ได้จริง ๆ ขอดูเฉลย
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
                        : m.role === "solution"
                          ? "เฉลย"
                          : "คำใบ้จากพี่"}
              </div>
              {m.role === "solution" && m.answer && (
                <p className="solution-answer">
                  คำตอบคือ <MathText>{m.answer}</MathText>
                </p>
              )}
              <MathText>{m.text}</MathText>
            </div>
          ))}
        </div>
      )}

      {(solved || revealed) && (
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

      {/* แผ่นเขียนคลุมทั้งหน้า — ต้องอยู่ท้ายสุดเพื่อให้ซ้อนทับทุกอย่าง */}
      {accessToken && <ScratchPad targetRef={sheetRef} onChange={onScratchChange} />}
    </div>
  );
}
