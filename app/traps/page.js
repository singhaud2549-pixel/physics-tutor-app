import Link from "next/link";
import TrapsClient from "./TrapsClient";

export const dynamic = "force-dynamic";

export default function TrapsPage() {
  return (
    <div className="container">
      <Link href="/" className="back-link">
        ‹ กลับหน้าแรก
      </Link>
      <h1>🪤 สมุดกับดัก</h1>
      <p className="subtitle">
        กับดักที่เคยเจอทั้งหมด — ตัวไหนปราบแล้ว ตัวไหนยังตามหลอกอยู่
      </p>
      <TrapsClient />
    </div>
  );
}
