import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPublic } from "../../lib/problems";
import { categoryOf } from "../../lib/categories";
import ProblemList from "./ProblemList";

export const dynamic = "force-dynamic";

export default async function TopicPage({ searchParams }) {
  const sp = await searchParams; // Next 15: searchParams เป็น Promise
  const name = sp?.name || "";
  const items = getAllPublic().filter((p) => p.topic === name);
  if (!name || items.length === 0) notFound();

  return (
    <div className="container">
      <Link href="/" className="back-link">
        ‹ กลับไปเลือกบท
      </Link>

      <div className="card">
        <p className="cat-crumb">{categoryOf(name)}</p>
        <span className="tag">{name}</span>
        <ProblemList items={items} />
      </div>
    </div>
  );
}
