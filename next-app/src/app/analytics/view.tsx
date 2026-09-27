"use client";

import { useEffect, useRef, useState } from "react";

const subjects = [
  { id: "overview", title: "Overview", description: "Executive KPIs, active Players, completed Matches, and win rates." },
  { id: "match-analysis", title: "Match Analysis", description: "Match pace, duration, scoring runs, and Rally statistics." },
  { id: "leaderboard", title: "Leaderboard", description: "Player standings, win rates, and point differences." },
  { id: "player-performance", title: "Player Performance", description: "Individual records, trends, partners, and opponents." },
  { id: "partnership-analysis", title: "Partnership Analysis", description: "Doubles Partnership performance." },
  { id: "court-analytics", title: "Event / Court Analytics", description: "Court use and Event participation." },
] as const;

declare global {
  interface Window {
    getPaddlePointQlikToken?: () => Promise<string>;
    getPaddlePointCurrentEvent?: () => Promise<{ id: string; name: string } | null>;
    PaddlePointQlikMashup?: { attach: (node: Document) => void; close: () => void };
    PaddlePointQlikConfig: { host: string; clientId: string; appId: string };
  }
}

export function AnalyticsView({ config }: { config: { host: string; clientId: string; appId: string } }) {
  const [subject, setSubject] = useState<(typeof subjects)[number]["id"]>("overview");
  const [error, setError] = useState("");
  const mashupHost = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.PaddlePointQlikConfig = config;
    window.getPaddlePointQlikToken = async () => {
      const response = await fetch("/api/qlik/get-embed-token.php", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not get a Qlik token");
      return payload.accessToken;
    };
    window.getPaddlePointCurrentEvent = async () => {
      const response = await fetch("/api/events", { cache: "no-store" });
      if (!response.ok) return null;
      const payload = await response.json();
      const current = payload.events.find((item: { id: string }) => item.id === payload.currentEventId);
      return current ? { id: current.id, name: current.name } : null;
    };
    if (!document.querySelector('script[data-qlik-mashup-script]')) {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "/qlik-mashup.js";
      script.dataset.qlikMashupScript = "true";
      script.onerror = () => setError("Could not load Qlik Analytics. Try refreshing this page.");
      document.body.appendChild(script);
    }
    return () => window.PaddlePointQlikMashup?.close();
  }, [config]);
  useEffect(() => {
    const host = mashupHost.current;
    if (!host) return;
    const placeholder = document.createElement("div");
    placeholder.dataset.qlikMashup = subject;
    host.replaceChildren(placeholder);
    window.PaddlePointQlikMashup?.attach(document);
  }, [subject]);
  const active = subjects.find((item) => item.id === subject)!;
  return <section><link rel="stylesheet" href="/qlik-mashup.css" />
    <h1>Analytics</h1><p>{active.description}</p>
    <nav aria-label="Analytics subjects">{subjects.map((item) => <button key={item.id} type="button" aria-current={item.id === subject ? "page" : undefined} onClick={() => setSubject(item.id)}>{item.title}</button>)}</nav>
    {error && <p role="alert">{error}</p>}
    <div ref={mashupHost} />
    <p>Qlik uses its read-only analytics copy. New Matches appear after the next reload.</p>
  </section>;
}
