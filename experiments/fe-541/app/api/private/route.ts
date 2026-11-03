import { auth, configured } from "../../../auth";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

export async function GET() {
  const session = configured() ? await auth() : null;
  const headers = { "Cache-Control": "no-store" };
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  return Response.json({ userId: session.user.id, expires: session.expires }, { headers });
}
