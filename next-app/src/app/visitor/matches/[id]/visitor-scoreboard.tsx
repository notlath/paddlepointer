"use client";

import { useState } from "react";
import type { Game } from "@/server/rally";
import { changeVisitorMatchAction } from "../../actions";

export function VisitorScoreboard({ initial }: { initial: Game }) {
  const [game, setGame] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(action: "rally" | "undo" | "end" | "reset", winner?: "A" | "B") {
    setBusy(true);
    setMessage("Saving…");
    try {
      const result = await changeVisitorMatchAction(game.id, action, winner);
      if ("error" in result) { setMessage(result.error ?? "Could not save Match"); return; }
      setGame(result.game);
      setMessage(action === "end" || result.game.status === "completed" ? "Match saved" : "Rally saved");
    } catch { setMessage("Save failed. Check your connection and try again before scoring another Rally."); }
    finally { setBusy(false); }
  }
  return <div className="visitor-scoreboard"><h1>Visitor Scoreboard</h1>
    <p>{game.status === "completed" ? "Match saved" : "Match in progress"}</p>
    <div className="scores"><section><h2>Team A</h2><strong>{game.teamA.score}</strong><p>{game.teamA.players.join(" / ")}</p></section><section><h2>Team B</h2><strong>{game.teamB.score}</strong><p>{game.teamB.players.join(" / ")}</p></section></div>
    <p>{game.servingTeam === "A" ? game.teamA.players[game.currentServerIndex] : game.teamB.players[game.currentServerIndex]} serving · {game.sideOuts} side-outs</p>
    {game.status === "active" && <><h2>Who won the Rally?</h2><div className="actions"><button disabled={busy} onClick={() => change("rally", "A")}>Team A wins Rally</button><button disabled={busy} onClick={() => change("rally", "B")}>Team B wins Rally</button></div></>}
    <div className="actions"><button disabled={busy || game.events.length === 0} onClick={() => change("undo")}>Undo last Rally</button>{game.status === "active" && <><button disabled={busy} onClick={() => { if (window.confirm("Reset this Match and clear its Rally history?")) void change("reset"); }}>Reset Match</button><button disabled={busy} onClick={() => { if (window.confirm("End this Match and save its current Score?")) void change("end"); }}>End Match</button></>}</div>
    {game.status === "completed" && <p>{game.winner ? `Winner: Team ${game.winner}` : "No winner"}</p>}
    <h2>Rally history</h2>{game.events.length === 0 ? <p>No Rallies yet.</p> : <ol>{[...game.events].reverse().map((event, index) => <li key={String(event.id ?? index)}>{String(event.action)} · {String(event.newScore)}</li>)}</ol>}
    <p role="status" aria-live="polite">{message}</p>
    <style jsx>{`.visitor-scoreboard{max-width:900px;margin:auto;padding:16px;color:#17313b}.scores{display:grid;grid-template-columns:1fr 1fr;gap:16px}.scores section{background:#eef5f4;padding:20px;border-radius:12px}.scores strong{font-size:clamp(64px,10vw,110px)}.actions{display:flex;gap:12px;margin:16px 0;flex-wrap:wrap}button{border:0;border-radius:10px;background:#0d6667;color:#fff;padding:14px 18px;min-height:48px}button:disabled{opacity:.5}@media(max-width:600px){.scores{grid-template-columns:1fr}}`}</style>
  </div>;
}
