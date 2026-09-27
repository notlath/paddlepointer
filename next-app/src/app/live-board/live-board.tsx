"use client";

import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveBoardData } from "@/server/live-board";

type BoardMatch = NonNullable<LiveBoardData["courts"][number]["current"]>;
type Phase = "current" | "next" | "completed";
const phaseText: Record<Phase, { label: string; empty: string }> = {
  current: { label: "Current", empty: "Court available" },
  next: { label: "Next", empty: "No Match scheduled" },
  completed: { label: "Completed", empty: "No completed Match" },
};

function MatchCard({ phase, match }: { phase: Phase; match: BoardMatch | null }) {
  return <section style={{ border: "1px solid #cbd5e1", borderRadius: 12, padding: "1rem", background: "white", minHeight: 130 }}>
    <h3 style={{ marginTop: 0 }}>{phaseText[phase].label}</h3>
    {match ? <>
      <p>Round {match.round} · Court {match.court}</p>
      <p><strong>{match.teamA.join(" / ") || "Team A"}</strong> <span aria-label="Team A score">{match.scoreA}</span> — <span aria-label="Team B score">{match.scoreB}</span> <strong>{match.teamB.join(" / ") || "Team B"}</strong></p>
      {match.status === "completed" && <p>Team {match.winner ?? "—"} won</p>}
    </> : <p>{phaseText[phase].empty}</p>}
  </section>;
}

export function LiveBoard({ initial, realtimeUrl, realtimeKey }: { initial: LiveBoardData; realtimeUrl: string | null; realtimeKey: string | null }) {
  const [board, setBoard] = useState(initial);
  const [connection, setConnection] = useState<"connected" | "polling">("polling");
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const queued = useRef(false);
  const latest = useRef(board);
  latest.current = board;
  const refresh = useCallback(async () => {
    if (busy.current) { queued.current = true; return; }
    busy.current = true;
    try {
      const response = await fetch("/api/live-board", { cache: "no-store" });
      if (!response.ok) throw new Error("Live Board unavailable");
      setBoard(await response.json() as LiveBoardData);
      setError(false);
    } catch { setError(true); }
    finally {
      busy.current = false;
      if (queued.current) { queued.current = false; void refresh(); }
    }
  }, []);

  useEffect(() => {
    if (!realtimeUrl || !realtimeKey) return;
    const client = createClient(realtimeUrl, realtimeKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let switchConnected = false;
    let eventConnected = !board.eventId;
    const report = () => setConnection(switchConnected && eventConnected ? "connected" : "polling");
    const switchChannel = client.channel("live-board");
    switchChannel.on("broadcast", { event: "current-event-changed" }, () => { void refresh(); });
    switchChannel.subscribe((status) => { switchConnected = status === "SUBSCRIBED"; report(); if (switchConnected) void refresh(); });
    const eventChannel = board.eventId ? client.channel(`event:${board.eventId}`) : null;
    eventChannel?.on("broadcast", { event: "changed" }, ({ payload }) => {
      if (payload?.eventId === latest.current.eventId && Number.isInteger(payload.revision) && payload.revision > latest.current.revision) void refresh();
    });
    eventChannel?.subscribe((status) => { eventConnected = status === "SUBSCRIBED"; report(); if (eventConnected) void refresh(); });
    return () => { void client.removeAllChannels(); };
  }, [realtimeUrl, realtimeKey, board.eventId, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, connection === "connected" ? 10000 : 2000);
    const whenVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", whenVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", whenVisible); };
  }, [connection, refresh]);

  return <>
    <header><h1>Live Board</h1><p>{board.eventName ?? "No Current Event"}</p></header>
    <p role="status">{error ? "Unable to refresh; showing last known scores" : connection === "connected" ? "Live updates connected" : "Refreshing automatically"}</p>
    {board.courts.length === 0 ? <p>No courts are scheduled yet.</p> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "1rem" }}>
      {board.courts.map((court) => <article key={court.number} aria-label={`Court ${court.number}`} style={{ padding: "1rem", borderRadius: 16, background: "#f1f5f9" }}>
        <h2>Court {court.number}</h2>
        <div style={{ display: "grid", gap: ".75rem" }}>
          <MatchCard phase="current" match={court.current} />
          <MatchCard phase="next" match={court.next} />
          <MatchCard phase="completed" match={court.completed} />
        </div>
      </article>)}
    </div>}
  </>;
}
