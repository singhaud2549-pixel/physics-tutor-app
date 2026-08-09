import { notFound } from "next/navigation";
import { getExamProblemsPublic } from "../../../lib/problems";
import ExamClient from "./ExamClient";

export const dynamic = "force-dynamic";

export default async function ExamPage({ params }) {
  const { examId } = await params; // Next 15: params เป็น Promise
  const problems = getExamProblemsPublic(examId);
  if (!problems.length) notFound();
  return <ExamClient examId={examId} problems={problems} />;
}
