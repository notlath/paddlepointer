import Link from "next/link";
import { readLiveBoard } from "@/server/live-board";
import { LiveBoard } from "./live-board";

export const dynamic = "force-dynamic";

export default async function LiveBoardPage() {
  return <main style={{ maxWidth: 1440, margin: "auto", padding: "clamp(1rem, 3vw, 2rem)", fontFamily: "system-ui, sans-serif" }}>
    <nav><Link href="/">PaddlePointer</Link></nav>
    <LiveBoard initial={await readLiveBoard()} realtimeUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? null} realtimeKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null} />
  </main>;
}
