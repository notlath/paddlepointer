"use client";

import { useState, type FormEvent } from "react";
import type { readEventOperations } from "@/server/match-operations";
import { eventMatchAction } from "./actions";

type State = NonNullable<Awaited<ReturnType<typeof readEventOperations>>>;

export function MatchOperations({ initial, canManage }: { initial: State; canManage: boolean }) {
  const [state, setState] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(operation: string, slotId: string | undefined, success: string, result?: { scoreA: number; scoreB: number; winner: string; retiredTeam: string | null }) {
    setBusy(true);
    setMessage("Saving…");
    try {
      const response = await eventMatchAction(state.id, operation, slotId, result);
      if ("error" in response) { setMessage(response.error); return; }
      setState(response);
      setMessage(success);
    } catch {
      setMessage("Could not update Match");
    } finally {
      setBusy(false);
    }
  }

  function confirmAndSubmit(description: string, operation: string, slotId: string | undefined, success: string) {
    if (!window.confirm(description)) return;
    void submit(operation, slotId, success);
  }

  function correct(event: FormEvent<HTMLFormElement>, slotId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = { scoreA: Number(form.get("scoreA")), scoreB: Number(form.get("scoreB")), winner: String(form.get("winner")), retiredTeam: String(form.get("retiredTeam")) || null };
    if (!window.confirm(`Correct this saved Match to ${result.scoreA}-${result.scoreB}, Team ${result.winner} winning? The correction will be recorded in Match history.`)) return;
    void submit("correct", slotId, "Result corrected", result);
  }

  return <section>
    <h2>Tournament Matches</h2>
    <p role="status" aria-live="polite">{message}</p>
    {state.slots.length === 0 && <p>No Tournament Matches scheduled.</p>}
    {state.slots.map((slot) => <article key={slot.id} data-testid={`match-${slot.id}`}>
      <h3>Round {slot.round} · Court {slot.court}</h3>
      <p>{slot.status === "completed" ? `Match saved · ${slot.scoreA}-${slot.scoreB} · ${slot.winner ? `Team ${slot.winner} won` : "No winner"}` : slot.status === "in_progress" ? `Match in progress · ${slot.scoreA}-${slot.scoreB}` : "Scheduled"}</p>
      {canManage && slot.status === "completed" && <form key={`${slot.id}:${slot.scoreA}:${slot.scoreB}:${slot.winner}:${slot.retiredTeam}`} onSubmit={(event) => correct(event, slot.id)}>
        <label>Team A Score <input name="scoreA" type="number" min="0" max="999" defaultValue={slot.scoreA ?? 0} required /></label>
        <label>Team B Score <input name="scoreB" type="number" min="0" max="999" defaultValue={slot.scoreB ?? 0} required /></label>
        <label>Winner <select name="winner" defaultValue={slot.winner ?? "A"}><option value="A">Team A</option><option value="B">Team B</option></select></label>
        <label>Retired Team <select name="retiredTeam" defaultValue={slot.retiredTeam ?? ""}><option value="">None</option><option value="A">Team A</option><option value="B">Team B</option></select></label>
        <button disabled={busy}>Correct result</button>
      </form>}
      {canManage && state.isCurrent && <div>
        {slot.status !== "scheduled" && <button disabled={busy} onClick={() => confirmAndSubmit("Reset this Match result? Its Score and Rally history will be removed, and this Tournament Match can be played again.", "reset-result", slot.id, "Result reset")}>Reset result</button>}
        <button disabled={busy} onClick={() => confirmAndSubmit("Remove this Tournament Match? Its saved Score, Rally history, and Schedule assignment will be removed.", "remove", slot.id, "Tournament Match removed")}>Remove Tournament Match</button>
      </div>}
    </article>)}
    {canManage && state.isCurrent && <div>
      <h3>Event operations</h3>
      <button disabled={busy || !state.slots.some((slot) => slot.status !== "scheduled")} onClick={() => confirmAndSubmit("Clear every Match result in this Event? Saved Scores and Rally history will be removed; the Schedule stays.", "clear-results", undefined, "Results cleared")}>Clear Results</button>
      <button disabled={busy} onClick={() => confirmAndSubmit("Reset this Tournament? All scheduled and scored Matches, Rally history, and its roster will be removed. The Event remains.", "reset-tournament", undefined, "Tournament reset")}>Reset Tournament</button>
    </div>}
  </section>;
}
