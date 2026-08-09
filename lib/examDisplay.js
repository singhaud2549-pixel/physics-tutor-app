// ตั้งชื่อสวย ๆ จากรหัสชุดข้อสอบ เช่น MOCK-ALEVEL-1 -> "ข้อสอบจำลอง A-Level ชุดที่ 1"
export function examDisplayName(examSet) {
  const m = examSet.match(/^MOCK-ALEVEL-(\d+)$/);
  if (m) return `ข้อสอบจำลอง A-Level ชุดที่ ${m[1]}`;
  return examSet;
}
