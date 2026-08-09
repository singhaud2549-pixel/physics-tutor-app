import Link from "next/link";
import { getAllPublic, getExamSets } from "../lib/problems";
import { TAXONOMY } from "../lib/categories";

// อ่านไฟล์โจทย์สดทุกครั้ง — เพิ่มโจทย์ใหม่แล้วรีเฟรชเห็นเลย
export const dynamic = "force-dynamic";

export default function Home() {
  const problems = getAllPublic();
  const examSets = getExamSets();

  // นับจำนวนโจทย์ต่อบท (หัวข้อ)
  const countByTopic = {};
  for (const p of problems) {
    countByTopic[p.topic] = (countByTopic[p.topic] || 0) + 1;
  }

  // โครง 2 ชั้น: หมวดใหญ่ → บท (แสดงเฉพาะบทที่มีโจทย์แล้ว)
  const sections = [];
  const usedTopics = new Set();
  for (const cat of TAXONOMY) {
    const chapters = cat.topics
      .filter((t) => countByTopic[t])
      .map((t) => ({ topic: t, count: countByTopic[t] }));
    chapters.forEach((c) => usedTopics.add(c.topic));
    if (chapters.length) sections.push({ name: cat.name, chapters });
  }
  const leftover = Object.keys(countByTopic)
    .filter((t) => !usedTopics.has(t))
    .map((t) => ({ topic: t, count: countByTopic[t] }));
  if (leftover.length) sections.push({ name: "อื่น ๆ", chapters: leftover });

  return (
    <div className="container">
      <h1>ฝึกฟิสิกส์ 🧠</h1>
      <p className="subtitle">เลือกบทที่อยากฝึก — ตอบผิดไม่เป็นไร มีพี่ค่อย ๆ ใบ้ให้</p>

      {problems.length === 0 && (
        <div className="card">
          <p>
            ยังไม่มีโจทย์ในคลัง — เพิ่มไฟล์โจทย์ในโฟลเดอร์ <code>problems/</code>{" "}
            ได้เลย (ดู <code>_TEMPLATE.txt</code>)
          </p>
        </div>
      )}

      {examSets.length > 0 && (
        <Link href="/exam" className="card exam-cta">
          <span className="exam-cta-title">🎯 ข้อสอบจำลอง</span>
          <span className="exam-cta-sub">
            จำลองสนามสอบจริง {examSets.length} ชุด — ทำรวดเดียว ดูคะแนนตอนท้าย
          </span>
        </Link>
      )}

      {sections.map((sec) => (
        <div key={sec.name} className="card">
          <h2 className="cat-name">{sec.name}</h2>
          <div className="chapter-grid">
            {sec.chapters.map((c) => (
              <Link
                key={c.topic}
                href={`/topic?name=${encodeURIComponent(c.topic)}`}
                className="chapter-tile"
              >
                <span className="chapter-tile-name">{c.topic}</span>
                <span className="chapter-tile-count">{c.count} ข้อ</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
