"use client";

import { useState } from "react";
import type { readScoreboard } from "@/server/scoreboard";
import { changeMatchAction, startMatchAction } from "./actions";

type State = NonNullable<Awaited<ReturnType<typeof readScoreboard>>>;

export function Scoreboard({ initial }: { initial: State }) {
  const [state, setState] = useState(initial);
  const [firstServer, setFirstServer] = useState<"A" | "B">("A");
  const [rightA, setRightA] = useState(0);
  const [rightB, setRightB] = useState(0);
  const [saveState, setSaveState] = useState("");
  const [busy, setBusy] = useState(false);
  const teamA = state.players.filter((person) => person.team === "A");
  const teamB = state.players.filter((person) => person.team === "B");

  async function submit(operation: () => Promise<State | { error: string; status: number }>, success: string) {
    setBusy(true);
    setSaveState("Saving…");
    try {
      const result = await operation();
      if ("error" in result) { setSaveState(`Save failed: ${result.error}`); return; }
      setState(result);
      setSaveState(success);
    } catch {
      setSaveState("Save failed. Try again; your last action was not confirmed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="scoreboard">
    <div className="scoreboard-banner"><div><span>Round {state.slot.round} · Court {state.slot.court}</span><h1>Scoreboard</h1></div><strong>{state.match?.status === "completed" ? "Match saved" : state.match ? "Match in progress" : "Ready to start"}</strong></div>
    {!state.match ? <section className="scoreboard-panel"><h2>Start Match</h2><p>Confirm the first serving Team and each Team&apos;s starting right-court Player.</p>
      <fieldset><legend>First serving Team</legend><label><input type="radio" checked={firstServer === "A"} onChange={() => setFirstServer("A")} /> Team A</label><label><input type="radio" checked={firstServer === "B"} onChange={() => setFirstServer("B")} /> Team B</label></fieldset>
      <label>Team A right-court Player <select value={rightA} onChange={(event) => setRightA(Number(event.target.value))}>{teamA.map((person, index) => <option key={person.id} value={index}>{person.name}</option>)}</select></label>
      <label>Team B right-court Player <select value={rightB} onChange={(event) => setRightB(Number(event.target.value))}>{teamB.map((person, index) => <option key={person.id} value={index}>{person.name}</option>)}</select></label>
      <button disabled={busy} onClick={() => submit(() => startMatchAction(state.slot.id, firstServer, rightA, rightB), "Match started · saved")}>Start Match</button>
    </section> : <div className="scoreboard-layout"><section className="scoreboard-panel">
      <div className="scoreboard-scores">{([teamA, teamB] as const).map((team, index) => <div key={index} className={state.match?.servingTeam === (index ? "B" : "A") ? "serving" : ""}><span>Team {index ? "B" : "A"}{state.match?.servingTeam === (index ? "B" : "A") ? " · Serving" : ""}</span><strong>{index ? state.match?.scoreB : state.match?.scoreA}</strong><small>{team.map((person) => person.name).join(" / ")}</small></div>)}</div>
      <p className="scoreboard-call" aria-label="Score call">{state.match.scoreCall}</p>
      <p>{state.match.serverName} serves from the {state.match.serveSide} court · {state.match.sideOuts} side-outs</p>
      {state.match.status === "active" && <><h2>Who won the Rally?</h2><div className="scoreboard-actions"><button disabled={busy} onClick={() => submit(() => changeMatchAction(state.slot.id, "rally", "A"), "Rally saved")}>Team A wins Rally</button><button disabled={busy} onClick={() => submit(() => changeMatchAction(state.slot.id, "rally", "B"), "Rally saved")}>Team B wins Rally</button></div></>}
      <div className="scoreboard-secondary"><button disabled={busy || !state.match.canUndo} onClick={() => submit(() => changeMatchAction(state.slot.id, "undo"), "Undo saved")}>Undo last action</button>{state.match.status === "active" && <><button disabled={busy} onClick={() => { if (window.confirm("Reset this active Match to 0–0 and clear its Rally history?")) void submit(() => changeMatchAction(state.slot.id, "reset-active"), "Match reset"); }}>Reset active Match</button><button disabled={busy} onClick={() => { if (window.confirm("End this Match and save its current Score?")) void submit(() => changeMatchAction(state.slot.id, "end"), "Match saved"); }}>End Match</button></>}</div>
      {state.match.status === "completed" && <p>Winner: {state.match.winner ? `Team ${state.match.winner}` : "No winner"}</p>}
    </section><aside className="scoreboard-panel"><h2>Rally history</h2>{state.match.events.length === 0 ? <p>No Rallies yet.</p> : <ol>{[...state.match.events].reverse().map((event, index) => <li key={String(event.id ?? index)}>{String(event.action)} · {String(event.newScore)}</li>)}</ol>}</aside></div>}
    <p role="status" aria-live="polite">{saveState}</p>
    <style jsx>{`
      .scoreboard{max-width:1100px;margin:24px auto;padding:0 16px 40px;color:#17313b}.scoreboard-banner{display:flex;align-items:center;justify-content:space-between;background:#123d50;color:white;padding:20px 24px;border-radius:18px;gap:16px}.scoreboard-banner h1{margin:4px 0}.scoreboard-panel{background:white;border:1px solid #dce8e8;border-radius:18px;padding:24px;margin-top:18px}.scoreboard-layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(250px,1fr);gap:18px}.scoreboard-scores{display:grid;grid-template-columns:1fr 1fr;gap:12px}.scoreboard-scores>div{display:flex;flex-direction:column;background:#f1f5f5;border-radius:14px;padding:18px;min-width:0}.scoreboard-scores>div.serving{background:#def3ed;outline:2px solid #217d71}.scoreboard-scores strong{font-size:clamp(64px,9vw,110px);line-height:1}.scoreboard-scores small{overflow-wrap:anywhere}.scoreboard-call{font-size:2rem;font-weight:800;margin:16px 0}.scoreboard-actions{display:flex;gap:12px}.scoreboard button{border:0;border-radius:12px;background:#0d6667;color:white;padding:16px 20px;font-weight:700;cursor:pointer;min-height:54px}.scoreboard button:disabled{opacity:.5;cursor:default}.scoreboard-actions button{flex:1}.scoreboard-secondary{display:flex;gap:10px;margin-top:20px}.scoreboard-secondary button{background:#365460}.scoreboard fieldset{display:flex;gap:16px;border:0;padding:0;margin:16px 0}.scoreboard label{display:block;margin:12px 0}.scoreboard select{display:block;padding:10px;min-width:220px}.scoreboard ol{padding-left:24px;line-height:1.8}@media(max-width:720px){.scoreboard-layout{display:block}.scoreboard-banner{align-items:flex-start}.scoreboard-actions{flex-direction:column}.scoreboard-secondary{flex-wrap:wrap}.scoreboard-panel{padding:16px}}
    `}</style>
  </div>;
}
