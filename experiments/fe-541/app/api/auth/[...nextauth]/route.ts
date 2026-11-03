import type { NextRequest } from "next/server";
import { configured, handlers } from "../../../../auth";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

function unavailable() {
  return Response.json({ error: "Authentication is not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

export const GET = (request: NextRequest) => configured() ? handlers.GET(request) : unavailable();
export const POST = (request: NextRequest) => configured() ? handlers.POST(request) : unavailable();
