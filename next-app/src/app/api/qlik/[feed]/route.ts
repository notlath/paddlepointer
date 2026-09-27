import { NextResponse } from "next/server";
import { currentPrincipal, isStaff } from "@/server/authorize";
import { validAnalyticsKey, exchangeQlikToken } from "@/server/qlik-access";
import { readQlikFeed, type FeedName } from "@/server/qlik-feed";

const feeds = new Set(["get-events", "get-matches", "get-leaderboard-results", "get-leaderboard-players"]);

export async function GET(request: Request, { params }: { params: Promise<{ feed: string }> }) {
  const { feed } = await params;
  if (feed === "get-embed-token.php") {
    const principal = await currentPrincipal();
    if (!principal) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
    if (!isStaff(principal.role)) return NextResponse.json({ ok: false, error: "Staff access required" }, { status: 403 });
    const token = await exchangeQlikToken();
    if (!token) return NextResponse.json({ ok: false, error: "Could not get a Qlik token" }, { status: 502 });
    return NextResponse.json({ ok: true, ...token });
  }
  const name = feed.endsWith(".php") ? feed.slice(0, -4) : feed;
  if (!feeds.has(name)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!validAnalyticsKey(request.headers.get("x-analytics-key"))) {
    return NextResponse.json({ ok: false, error: "A valid analytics key is required" }, { status: 401 });
  }
  const eventId = new URL(request.url).searchParams.get("event")?.trim() ?? "";
  const result = await readQlikFeed(name as FeedName, eventId);
  return NextResponse.json(result.body, { status: result.status });
}
