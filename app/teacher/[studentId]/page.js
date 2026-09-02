import Link from "next/link";
import ReportClient from "./ReportClient";

export const dynamic = "force-dynamic";

export default async function StudentReportPage({ params }) {
  const { studentId } = await params;
  return (
    <div className="container">
      <Link href="/teacher" className="back-link">
        ‹ กลับรายชื่อนักเรียน
      </Link>
      <ReportClient studentId={studentId} />
    </div>
  );
}
