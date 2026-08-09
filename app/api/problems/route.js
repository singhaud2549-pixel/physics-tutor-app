import { getAllPublicWithExams } from "../../../lib/problems";

export const dynamic = "force-dynamic";

// รายการโจทย์ (ข้อมูลสาธารณะ) — ไว้ให้หน้า "จุดผิดของฉัน" แปลง id → โจทย์
// รวมโจทย์ในชุดข้อสอบด้วย เพราะข้อสอบที่ตอบผิดก็ต้องโชว์ในหน้านี้ได้เหมือนกัน
export async function GET() {
  return Response.json(getAllPublicWithExams());
}
