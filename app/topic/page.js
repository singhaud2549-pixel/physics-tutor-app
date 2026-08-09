import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPublic } from "../../lib/problems";
import { categoryOf } from "../../lib/categories";
import MathText from "../MathText";

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
        <div className="problem-list">
          {items.map((p) => (
            <Link
              key={p.id}
              href={`/problem/${p.id}`}
              className="problem-link"
            >
              <span className="problem-link-text">
                <MathText>{p.statement}</MathText>
              </span>
              <span className="problem-link-arrow">›</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
