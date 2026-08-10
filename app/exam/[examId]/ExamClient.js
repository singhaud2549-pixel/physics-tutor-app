"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseReady } from "../../../lib/supabaseClient";
import MathText from "../../MathText";

// เวลาสอบ: ประมาณ 3 นาที/ข้อ (ขั้นต่ำ 30 นาที) ปรับตามจำนวนข้อในชุดโดยอัตโนมัติ
// ไม่ต้องเพิ่ม field ใหม่ในไฟล์โจทย์ — ชุด 30 ข้อจะได้ 90 นาที ตรงกับเวลาสอบ A-Level จริง
function examDurationSeconds(count) {
  return Math.max(30, count * 3) * 60;
}

function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ExamClient({ examId, problems }) {
  const [answers, setAnswers] = useState({}); // {problemId: value}
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // {total, max, results}
  const [historyNote, setHistoryNote] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(() => examDurationSeconds(problems.length));
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const startedAtRef = useRef(Date.now());

  const total = problems.length;
  const current = problems[index];
  const isChoice = current.kind === "choice";

  // นับถอยหลัง — หมดเวลาแล้วส่งข้อสอบให้อัตโนมัติ
  useEffect(() => {
    if (result) return;
    if (secondsLeft <= 0) {
      submitExam(true);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, result]);

  function setAnswer(id, value) {
    setAnswers((a) => ({ ...a, [id]: value }));
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
      const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      const res = await fetch("/api/exam-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examSet: examId, answers }),
      }).then((r) => r.json());
      setResult(res); // โชว์คะแนนทันที ไม่ต้องรอ AI วิเคราะห์
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

  return (
    <div className="container">
      <Link href="/exam" className="back-link">
        ‹ ออกจากข้อสอบ
      </Link>

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
