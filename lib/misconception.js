// จับคู่คำตอบผิดของนักเรียน → trap ที่ตรง → คำอธิบายว่า "เข้าใจผิดยังไง"
// (trap รูปแบบ "ตอบ C — เอา... " หรือ "ตอบ 10 — ลืม...")
export function matchTrap(problem, answer) {
  if (!problem || !problem.traps || !problem.traps.length) return null;
  const raw = String(answer ?? "").trim().toUpperCase();
  if (!raw) return null;

  // โจทย์ปรนัยหลายข้อเขียน trap อ้างอิง "ข้อความของตัวเลือก" (เช่น "ตอบ 25")
  // ไม่ใช่ตัวอักษรที่นักเรียนกด (เช่น "A") — ต้องแปลงตัวอักษร → ข้อความตัวเลือกนั้นด้วย
  // ถึงจะจับคู่ได้ทั้งสองแบบ (ตัวอักษรตรง ๆ และข้อความตัวเลือก)
  const candidates = new Set([raw]);
  if (problem.kind === "choice" && problem.choices) {
    const choice = problem.choices.find((c) => c.key.toUpperCase() === raw);
    if (choice) {
      const text = choice.text.trim().toUpperCase();
      candidates.add(text);
      candidates.add((text.match(/^\S+/) || [text])[0]); // token แรกของข้อความตัวเลือก
    }
  }

  for (let i = 0; i < problem.traps.length; i++) {
    const t = problem.traps[i];
    const m = t.match(/^\s*(?:ตอบ|เลือก(?:ข้อ)?)\s*([^\s—:-]+)/);
    if (m && candidates.has(m[1].toUpperCase())) {
      // เอาข้อความหลัง "—" (คำอธิบายจุดพลาด) ถ้าไม่มีก็คืนทั้งบรรทัด
      const idx = t.indexOf("—");
      return {
        text: (idx >= 0 ? t.slice(idx + 1) : t).trim(),
        tag: (problem.trapTags || [])[i] || null,
        trapRef: (problem.trapRefs || [])[i] || null,
      };
    }
  }
  return null;
}

// คืนเฉพาะข้อความ (ไม่มีป้าย) — ใช้กับหน้าจอที่นักเรียนเห็น
export function matchMisconception(problem, answer) {
  return matchTrap(problem, answer)?.text || null;
}
