import Link from "next/link";
import TeacherClient from "./TeacherClient";

export const dynamic = "force-dynamic";

export default function TeacherPage() {
  return (
    <div className="container">
      <Link href="/" className="back-link">
        ‹ กลับหน้าแรก
      </Link>
      <h1>ห้องผู้สอน 👨‍🏫</h1>
      <p className="subtitle">
        เปิดดูก่อนเข้าคาบ — จะได้รู้ว่านักเรียนคนนี้พลาดอะไรมาบ้างตั้งแต่คาบที่แล้ว
      </p>
      <TeacherClient />
    </div>
  );
}
