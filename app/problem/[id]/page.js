import { notFound } from "next/navigation";
import { getPublic } from "../../../lib/problems";
import ProblemClient from "./ProblemClient";

export const dynamic = "force-dynamic";

export default async function ProblemPage({ params }) {
  const { id } = await params; // Next 15: params เป็น Promise
  const problem = getPublic(id);
  if (!problem) notFound();
  return <ProblemClient problem={problem} />;
}
