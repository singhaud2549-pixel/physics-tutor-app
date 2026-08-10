"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseReady } from "../../../lib/supabaseClient";
import MathText from "../../MathText";

// เวลาสอบ: ประมาณ 3 นาที/ข้อ (ขั้นต่ำ 30 นาที) ปรับตามจำนวนข้อในชุดโดยอัตโนมัติ
// ไม่ต้องเพิ่ม field ใหม่ในไฟล์โจทย์ — ชุด 30 ข้อจะได้ 90 นาที ตรงกับเวลาสอบ A-Level จริง
function examDurationSeconds(count) {
  return Math.max(30, count * 3) * 60;
}

// เก็บความคืบหน้าไว้ในเครื่องนักเรียน — รีเฟรช/เผลอปิดแท็บแล้วกลับมาทำต่อได้ ไม่หายทั้งชุด
const STORAGE_PREFIX = "physics-exam-progress:";

function loadProgress(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved.startedAt !== "number") return null;
    return saved;
  } catch {
    return null; // localStorage ถูกปิด (โหมดส่วนตัว) หรือข้อมูลเสีย → เริ่มใหม่ตามปกติ
  }
}

function clearProgress(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ไม่มีอะไรต้องทำ */
  }
}

function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ExamClient({ examId, problems }) {
  const router = useRouter();
  const [answers, setAnswers] = useState({}); // {problemId: value}
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // {total, max, results}
  const [historyNote, setHistoryNote] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  // restored = อ่านความคืบหน้าเก่าจากเครื่องเสร็จแล้ว (ยังไม่เสร็จห้ามเขียนทับของเดิม)
  const [restored, setRestored] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [resumeNote, setResumeNote] = useState(null);

  const storageKey = STORAGE_PREFIX + examId;
  const limitMs = examDurationSeconds(problems.length) * 1000;
  // นับเวลาจาก "เวลานาฬิกาจริง" ไม่ใช่นับถอยหลังทีละวินาที
  // (setTimeout โดนเบราว์เซอร์หน่วง/หยุดตอนสลับแอป ทำให้เวลาเดินช้ากว่าจริง)
  const limitSeconds = examDurationSeconds(problems.length);
  const secondsLeft = startedAt
    ? Math.min(limitSeconds, Math.max(0, Math.ceil((startedAt + limitMs - now) / 1000)))
    : limitSeconds;

  const total = problems.length;
  const current = problems[index];
  const isChoice = current.kind === "choice";
  const answeredCount = Object.keys(answers).length;

  // เปิดหน้ามา → กู้ความคืบหน้าที่ค้างไว้ (ถ้ายังไม่หมดเวลา) ไม่งั้นเริ่มชุดใหม่
  useEffect(() => {
    const saved = loadProgress(storageKey);
    if (saved && Date.now() < saved.startedAt + limitMs) {
      const savedAnswers = saved.answers || {};
      setAnswers(savedAnswers);
      setIndex(Math.min(saved.index || 0, problems.length - 1));
      setStartedAt(saved.startedAt);
      if (Object.keys(savedAnswers).length > 0) {
        setResumeNote("กลับมาทำต่อได้เลย — คำตอบที่ทำไว้ยังอยู่ครบ ✓ (เวลายังเดินต่อจากเดิมนะ)");
      }
    } else {
      // ไม่มีของค้าง หรือของค้างหมดเวลาไปแล้ว → เริ่มจับเวลาใหม่
      clearProgress(storageKey);
      setStartedAt(Date.now());
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // ทุกครั้งที่ตอบ/เปลี่ยนข้อ → เซฟทันที (ไม่ต้องกดอะไร)
  useEffect(() => {
    if (!restored || result || !startedAt) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ answers, index, startedAt }));
    } catch {
      /* เซฟไม่ได้ก็ทำข้อสอบต่อได้ตามปกติ */
    }
  }, [answers, index, startedAt, restored, result, storageKey]);

  // เดินนาฬิกา (อ่านเวลาจริงทุกวินาที)
  useEffect(() => {
    if (!restored || result || !startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [restored, result, startedAt]);

  // หมดเวลา → ส่งข้อสอบให้อัตโนมัติ
  useEffect(() => {
    if (!restored || result || submitting || !startedAt) return;
    if (secondsLeft <= 0) submitExam(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, restored, result, submitting, startedAt]);

  // เตือนก่อนปิด/รีเฟรช — คำตอบไม่หายแล้วก็จริง แต่ "เวลายังเดินอยู่" ต้องให้รู้ตัวก่อน
  useEffect(() => {
    if (result || answeredCount === 0) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [result, answeredCount]);

  function setAnswer(id, value) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }

  function leaveExam(e) {
    e.preventDefault();
    if (
      answeredCount > 0 &&
      !window.confirm(
        `ออกตอนนี้คำตอบ ${answeredCount} ข้อที่ทำไว้จะถูกเก็บไว้ให้ กลับมาทำต่อได้ ` +
          `แต่เวลาสอบยังเดินอยู่นะ — ออกเลยไหม`,
      )
    ) {
      return;
    }
    router.push("/exam");
  }

  // เรียก AI วิเคราะห์แพทเทิร์นข้อที่ตอบผิด (เฉพาะคนที่ล็อกอิน — เหมือนกฎของ /api/hint)
  async function fetchAnalysis(wrongIds) {
    if (!isSupabaseReady || !wrongIds.length) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return null;
    try {
      const res = await fetch("/api/exam-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ examSet: examId, wrongIds }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.analysis || null;
    } catch {
      return null;
    }
  }

  // บันทึกคะแนนรวม (exam_sessions) + คำตอบแต่ละข้อ (attempts) — เฉพาะคนที่ล็อกอิน
  // แต่ละข้อที่บันทึกลง attempts ก็จะไปโผล่ในหน้า "จุดผิดของฉัน" ได้ด้วยเหมือนโจทย์แยกบท
  async function recordExamHistory(res, durationSeconds, analysisText) {
    if (!isSupabaseReady) return;
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setHistoryNote("เข้าสู่ระบบเพื่อบันทึกคะแนนไว้ดูย้อนหลังนะ");
      return;
    }
    try {
      const sessionId = crypto.randomUUID();
      await supabase.from("exam_sessions").insert({
        id: sessionId,
        user_id: user.id,
        exam_set: examId,
        total: res.total,
        max: res.max,
        duration_seconds: durationSeconds,
        analysis: analysisText || null,
      });
      const topicById = Object.fromEntries(problems.map((p) => [p.id, p.topic]));
      const rows = res.results.map((r) => ({
        user_id: user.id,
        problem_id: r.id,
        topic: topicById[r.id] || "",
        answer: r.yourAnswer || "",
        is_correct: r.correct,
        hint_count: 0,
        exam_set: examId,
        exam_session_id: sessionId,
      }));
      await supabase.from("attempts").insert(rows);
      setHistoryNote("บันทึกคะแนนแล้ว ✓ ดูย้อนหลังได้ที่หน้าเลือกชุดข้อสอบ");
    } catch (e) {
      console.warn("บันทึกประวัติการสอบไม่สำเร็จ:", e.message);
      setHistoryNote(null);
    }
  }

  async function submitExam(auto = false) {
    if (submitting || result) return;
    if (!auto) {
      const unanswered = problems.filter((p) => !answers[p.id]).length;
      if (unanswered > 0) {
        const ok = window.confirm(
          `ยังไม่ได้ตอบอีก ${unanswered} ข้อ จะส่งเลยไหม (ข้อที่ไม่ตอบถือว่าผิด)`,
        );
        if (!ok) return;
      }
    }
    setSubmitting(true);
    try {
      const durationSeconds = Math.round((Date.now() - (startedAt || Date.now())) / 1000);
      const res = await fetch("/api/exam-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examSet: examId, answers }),
      }).then((r) => r.json());
      setResult(res); // โชว์คะแนนทันที ไม่ต้องรอ AI วิเคราะห์
      clearProgress(storageKey); // ส่งแล้ว ไม่ต้องเก็บของค้างอีก
      if (auto) setHistoryNote("หมดเวลาสอบแล้ว — ส่งคำตอบให้อัตโนมัติ");

      const wrongIds = (res.results || []).filter((r) => !r.correct).map((r) => r.id);
      setAnalyzing(true);
      const analysisText = await fetchAnalysis(wrongIds);
      setAnalysis(analysisText);
      setAnalyzing(false);

      recordExamHistory(res, durationSeconds, analysisText);
    } catch {
      alert("ตรวจข้อสอบไม่สำเร็จ ลองใหม่อีกครั้งนะ");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const resultById = Object.fromEntries(result.results.map((r) => [r.id, r]));
    const topicById = Object.fromEntries(problems.map((p) => [p.id, p.topic]));
    const weakTopics = [
      ...new Set(
        result.results.filter((r) => !r.correct).map((r) => topicById[r.id]).filter(Boolean),
      ),
    ];
    return (
      <div className="container">
        <Link href="/exam" className="back-link">
          ‹ กลับหน้าเลือกชุดข้อสอบ
        </Link>
        <div className="card score-banner">
          <div className="score-number">
            {result.total} / {result.max}
          </div>
          <div className="score-label">คะแนนที่ได้</div>
          {historyNote && <div className="history-note">{historyNote}</div>}
        </div>

        {(analyzing || analysis) && (
          <div className="card exam-analysis-card">
            <span className="tag">🧠 พี่วิเคราะห์ให้</span>
            {analyzing ? (
              <p className="loading">กำลังดูภาพรวมข้อที่พลาดให้อยู่…</p>
            ) : (
              <p className="exam-analysis-text">{analysis}</p>
            )}
          </div>
        )}

        {weakTopics.length > 0 && (
          <div className="card">
            <span className="tag">📌 บทที่ควรฝึกเพิ่ม</span>
            <div className="weak-topics">
              {weakTopics.map((t) => (
                <Link
                  key={t}
                  href={`/topic?name=${encodeURIComponent(t)}`}
                  className="weak-topic-btn"
                >
                  {t} →
                </Link>
              ))}
            </div>
          </div>
        )}

        {problems.map((p, i) => {
          const r = resultById[p.id];
          return (
            <div key={p.id} className={`card exam-review-card ${r.correct ? "correct" : "wrong"}`}>
              <span className="tag">
                ข้อ {i + 1} · {r.earnedPoints}/{r.points} คะแนน {r.correct ? "✓" : "✗"}
              </span>
              <p className="problem">
                <MathText>{p.statement}</MathText>
              </p>
              {p.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="รูปประกอบโจทย์" className="problem-image" />
              )}
              <p className="problem-sub">
                คำตอบของฉัน: <MathText>{r.yourAnswer || "(ไม่ได้ตอบ)"}</MathText> ·
                {" "}เฉลย: <MathText>{r.correctAnswer}</MathText>
              </p>
              {r.misconception && (
                <p className="misconception-line">
                  ❌ เข้าใจผิดว่า: <MathText>{r.misconception}</MathText>
                </p>
              )}
              {r.similarProblemId && (
                <Link href={`/problem/${r.similarProblemId}`} className="similar-problem-link">
                  🔁 ลองข้อแนวเดียวกันดูว่าเข้าใจจริงไหม →
                </Link>
              )}
              {r.solution && (
                <p className="problem-sub" style={{ marginTop: 8 }}>
                  <MathText>{r.solution}</MathText>
                </p>
              )}
            </div>
          );
        })}

        <Link href="/exam" className="next-link">
          กลับไปเลือกชุดข้อสอบอื่น →
        </Link>
      </div>
    );
  }

  // ยังอ่านความคืบหน้าเก่าไม่เสร็จ — รอก่อน กันหน้ากะพริบและกันเขียนทับคำตอบเดิม
  if (!restored) return <div className="container" />;

  return (
    <div className="container">
      <a href="/exam" className="back-link" onClick={leaveExam}>
        ‹ ออกจากข้อสอบ
      </a>

      {resumeNote && <div className="resume-note">{resumeNote}</div>}

      <div className="exam-nav">
        <span className="exam-nav-label">
          ข้อที่ {index + 1} / {total}
        </span>
        <span className={`exam-timer ${secondsLeft <= 300 ? "warning" : ""}`}>
          ⏱ {formatTime(secondsLeft)}
        </span>
        <div className="exam-nav-btns">
          <button type="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            ‹ ก่อนหน้า
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            ถัดไป ›
          </button>
        </div>
      </div>

      <div className="exam-grid">
        {problems.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`exam-grid-btn ${i === index ? "current" : ""} ${
              answers[p.id] ? "answered" : ""
            }`}
            onClick={() => setIndex(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="card">
        <span className="tag">
          {current.points} คะแนน{current.level ? ` · ${current.level}` : ""}
        </span>
        <p className="problem">
          <MathText>{current.statement}</MathText>
        </p>
        {current.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.image} alt="รูปประกอบโจทย์" className="problem-image" />
        )}
        {current.unit && (
          <p className="problem-sub">
            <MathText>{current.unit}</MathText>
          </p>
        )}

        {isChoice ? (
          <div className="choice-list">
            {current.choices.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`choice-btn ${answers[current.id] === c.key ? "selected" : ""}`}
                onClick={() => setAnswer(current.id, c.key)}
              >
                <span className="choice-key">{c.key}</span>
                <span className="choice-text">
                  <MathText>{c.text}</MathText>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="answer-row">
            <input
              type="text"
              inputMode="decimal"
              placeholder="พิมพ์คำตอบเป็นตัวเลข"
              value={answers[current.id] || ""}
              onChange={(e) => setAnswer(current.id, e.target.value)}
            />
          </div>
        )}
      </div>

      <button
        type="button"
        className="submit-exam-btn"
        onClick={() => submitExam(false)}
        disabled={submitting}
      >
        {submitting ? "กำลังตรวจ…" : "ส่งคำตอบทั้งหมด"}
      </button>
    </div>
  );
}
