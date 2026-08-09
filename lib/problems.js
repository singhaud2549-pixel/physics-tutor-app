import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "problems");
const IMAGES_DIR = path.join(process.cwd(), "public", "problems-images");

// path บนดิสก์ของไฟล์รูป (ฝั่งเซิร์ฟเวอร์ใช้อ่านไฟล์ส่งเข้า AI)
export function imageDiskPath(filename) {
  return path.join(IMAGES_DIR, filename);
}

// อ่านไฟล์โจทย์ 1 ไฟล์ (รูปแบบ key: value ต่อบรรทัด เหมือน Bank)
function parseFile(text) {
  const p = { traps: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue; // ข้ามบรรทัดว่าง/คอมเมนต์
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    switch (key) {
      case "id":
        p.id = val;
        break;
      case "หัวข้อ":
        p.topic = val;
        break;
      case "ระดับชั้น":
        p.level = val;
        break;
      case "หัวข้อย่อย": // แนวย่อย (sub-skill) — ใช้จัด adaptive
        p.subskill = val;
        break;
      case "ระดับความยาก": {
        // รับได้ทั้ง "2" และ "Level 2 (...)" → เอาเลขตัวแรก
        const n = parseInt((val.match(/\d+/) || [])[0], 10);
        if (!Number.isNaN(n)) p.difficulty = n;
        break;
      }
      case "โจทย์":
        p.statement = val;
        break;
      case "หน่วย":
        p.unit = val;
        break;
      case "รูป": // ชื่อไฟล์ภาพในโฟลเดอร์ public/problems-images/
        p.image = val;
        break;
      case "รูปจำเป็น": // "ใช่"/"จำเป็น" = ไม่มีรูปแล้วแก้ไม่ได้
        p.imageRequired = /ใช่|จำเป็น|yes|true/i.test(val);
        break;
      case "คำตอบ":
        p.answerRaw = val; // เก็บดิบไว้ (ปรนัยเป็นตัวอักษร A-E, อัตนัยเป็นตัวเลข)
        p.answer = parseFloat(val);
        break;
      case "คลาดเคลื่อน": // ยอมคลาดเคลื่อน (ค่าสัมบูรณ์) — เว้นว่างได้ default 1%
        p.tolerance = parseFloat(val);
        break;
      case "เฉลย":
        p.solution = val;
        break;
      case "trap":
        if (val) p.traps.push(val);
        break;
      case "ชุดข้อสอบ": // รหัสชุดข้อสอบจำลอง (เช่น MOCK-ALEVEL-1) — มีค่านี้ = ไม่ใช่โจทย์ฝึกแยกบท
        p.examSet = val;
        break;
      case "ลำดับ": { // ลำดับข้อในชุดข้อสอบ
        const n = parseInt(val, 10);
        if (!Number.isNaN(n)) p.examOrder = n;
        break;
      }
      case "คะแนน": { // คะแนนต่อข้อในชุดข้อสอบ
        const n = parseInt(val, 10);
        if (!Number.isNaN(n)) p.points = n;
        break;
      }
      default: {
        // ช่อง "ตัวเลือก A", "ตัวเลือก B" ... = โจทย์ปรนัย
        const m = key.match(/^ตัวเลือก\s*([A-Ea-e])$/);
        if (m && val) {
          (p.choices ||= []).push({ key: m[1].toUpperCase(), text: val });
        }
        break;
      }
    }
  }
  // ชนิดโจทย์: มีตัวเลือก = ปรนัย, ไม่มี = อัตนัย (พิมพ์ตัวเลข)
  p.kind = p.choices && p.choices.length ? "choice" : "number";
  return p;
}

// อ่านโจทย์ทุกไฟล์ในโฟลเดอร์ (อ่านสดทุกครั้ง เพิ่มไฟล์ใหม่แล้วรีเฟรชเห็นเลย)
function loadAll() {
  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => f.endsWith(".md"))
    : [];
  const problems = [];
  for (const f of files) {
    try {
      const p = parseFile(fs.readFileSync(path.join(DIR, f), "utf8"));
      const hasAnswer =
        p.kind === "choice"
          ? /^[A-E]$/i.test((p.answerRaw || "").trim())
          : !Number.isNaN(p.answer);
      if (!(p.id && p.statement && hasAnswer)) {
        console.warn(
          `⚠️  ข้ามไฟล์โจทย์ "${f}" — ข้อมูลไม่ครบ (ปรนัยต้องมี id/โจทย์/ตัวเลือก/คำตอบเป็น A-E, อัตนัยต้องมี id/โจทย์/คำตอบเป็นตัวเลข)`,
        );
        continue;
      }
      // ถ้าเป็นรูปจำเป็นแต่ไม่มีไฟล์รูป → ข้าม (กันโชว์โจทย์ที่แก้ไม่ได้)
      if (p.imageRequired && (!p.image || !fs.existsSync(imageDiskPath(p.image)))) {
        console.warn(
          `⚠️  ข้ามไฟล์โจทย์ "${f}" — ระบุว่ารูปจำเป็น แต่ไม่พบไฟล์รูป "${p.image || "(ไม่ได้ใส่)"}"`,
        );
        continue;
      }
      problems.push(p);
    } catch (e) {
      console.warn(`⚠️  อ่านไฟล์โจทย์ "${f}" ไม่ได้:`, e.message);
    }
  }
  // เรียงตาม id ให้ลำดับคงที่
  return problems.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// เฉพาะข้อมูลที่นักเรียนเห็นได้ (ไม่มีเฉลย/คำตอบ/trap)
function publicView(p) {
  return {
    id: p.id,
    topic: p.topic || "อื่น ๆ",
    level: p.level || "",
    statement: p.statement,
    unit: p.unit || "",
    // URL ของรูป (นักเรียนเห็นรูปได้อยู่แล้ว ส่งให้ client ได้)
    image: p.image ? `/problems-images/${p.image}` : null,
    kind: p.kind, // "choice" (ปรนัย) หรือ "number" (พิมพ์ตัวเลข)
    choices: p.kind === "choice" ? p.choices : null, // ตัวเลือกโชว์นักเรียนได้ (ไม่บอกว่าข้อไหนถูก)
    subskill: p.subskill || "", // แนวย่อย
    difficulty: p.difficulty || 2, // ระดับความยาก 1-5 (default 2)
  };
}

export function getAllPublic() {
  // ไม่รวมโจทย์ที่อยู่ในชุดข้อสอบจำลอง (แยกไว้คนละส่วนกับหน้าฝึกแยกบท)
  return loadAll()
    .filter((p) => !p.examSet)
    .map(publicView);
}

// เหมือน getAllPublic แต่รวมโจทย์ในชุดข้อสอบด้วย — ใช้แปลง id → โจทย์
// สำหรับหน้า "จุดผิดของฉัน" ที่ต้องโชว์โจทย์ข้อสอบที่เคยตอบผิดได้ด้วย
export function getAllPublicWithExams() {
  return loadAll().map(publicView);
}

export function getPublic(id) {
  const p = loadAll().find((x) => x.id === id);
  return p ? publicView(p) : null;
}

// ฝั่งเซิร์ฟเวอร์เท่านั้น — มีเฉลย/คำตอบ/trap ห้ามส่งให้ client
export function getFull(id) {
  return loadAll().find((x) => x.id === id) || null;
}

// รายชื่อชุดข้อสอบจำลองทั้งหมดที่มีในคลัง (จัดกลุ่มตาม "ชุดข้อสอบ")
export function getExamSets() {
  const byExam = {};
  for (const p of loadAll()) {
    if (!p.examSet) continue;
    byExam[p.examSet] ||= { examSet: p.examSet, count: 0, totalPoints: 0 };
    byExam[p.examSet].count += 1;
    byExam[p.examSet].totalPoints += p.points || 0;
  }
  return Object.values(byExam).sort((a, b) => a.examSet.localeCompare(b.examSet));
}

// โจทย์ในชุดข้อสอบเดียว เรียงตาม "ลำดับ" — สำหรับหน้าทำข้อสอบ (ไม่มีเฉลย/คำตอบ)
export function getExamProblemsPublic(examSet) {
  return loadAll()
    .filter((p) => p.examSet === examSet)
    .sort((a, b) => (a.examOrder || 0) - (b.examOrder || 0))
    .map((p) => ({ ...publicView(p), points: p.points || 0 }));
}

// เหมือนกันแต่มีเฉลย/คำตอบ — ใช้ตรวจให้คะแนนฝั่งเซิร์ฟเวอร์เท่านั้น
export function getExamProblemsFull(examSet) {
  return loadAll()
    .filter((p) => p.examSet === examSet)
    .sort((a, b) => (a.examOrder || 0) - (b.examOrder || 0));
}
