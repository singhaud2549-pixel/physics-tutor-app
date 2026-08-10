import { getFull } from "../../../lib/problems";
import { matchMisconception } from "../../../lib/misconception";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const { items = [] } = await request.json();
  const out = items.map(({ problemId, answer }) => ({
    problemId,
    answer,
    misconception: matchMisconception(getFull(problemId), answer),
  }));
  return Response.json(out);
}
