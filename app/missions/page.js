import Link from "next/link";
import MissionsClient from "./MissionsClient";

export const dynamic = "force-dynamic";

export default function MissionsPage() {
  return (
    <div className="container">
      <Link href="/" className="back-link">
        ‹ กลับหน้าแรก
      </Link>
      <h1>🎯 ภารกิจวันนี้</h1>
      <p className="subtitle">เปิดมาเจอว่าวันนี้ทำอะไรก่อน — ทำครบคือครบ ปิดแอปได้</p>
      <MissionsClient />
    </div>
  );
}
