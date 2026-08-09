import Link from "next/link";
import { getExamSets } from "../../lib/problems";
import { examDisplayName as displayName } from "../../lib/examDisplay";
import ExamHistory from "./ExamHistory";

export const dynamic = "force-dynamic";

export default function ExamListPage() {
  const exams = getExamSets();

  return (
    <div className="container">
      <Link href="/" className="back-link">
        ‹ กลับหน้าแรก
      </Link>
      <h1>ข้อสอบจำลอง 📝</h1>
      <p className="subtitle">
        จำลองสนามสอบจริง ทำรวดเดียวทั้งชุด แล้วดูคะแนน+เฉลยตอนท้าย (ไม่มีคำใบ้ระหว่างทำนะ)
      </p>

      {exams.length === 0 && (
        <div className="card">
          <p>ยังไม่มีชุดข้อสอบในคลัง</p>
        </div>
      )}

      {exams.map((e) => (
        <Link key={e.examSet} href={`/exam/${e.examSet}`} className="chapter-tile card">
          <span className="chapter-tile-name">{displayName(e.examSet)}</span>
          <span className="chapter-tile-count">
            {e.count} ข้อ · {e.totalPoints} คะแนน
          </span>
        </Link>
      ))}

      <ExamHistory />
    </div>
  );
}
