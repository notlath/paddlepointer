"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { readOpenPlay } from "@/server/open-play";
import { adjustMatchAction, generateScheduleAction, saveSetupAction } from "./actions";

type Schedule = NonNullable<Awaited<ReturnType<typeof readOpenPlay>>>;
type Player = { id: string; name: string; skillLevel: string | null };

export function OpenPlayWorkspace({ initial, players }: { initial: Schedule; players: Player[] }) {
  const [schedule, setSchedule] = useState(initial);
  const [selected, setSelected] = useState(initial.roster.map((item) => item.id));
  const [unavailable, setUnavailable] = useState(initial.roster.filter((item) => !item.available).map((item) => item.id));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(operation: () => Promise<Schedule | { error: string; status: number }>) {
    setBusy(true);
    try {
      const payload = await operation();
      if ("error" in payload) { setMessage(payload.error); return false; }
      setSchedule(payload);
      setMessage("Schedule saved");
      return true;
    } catch {
      setMessage("Could not update Schedule");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (schedule.rounds.some((round) => round.matches.length) && !window.confirm("Saving setup clears the generated Schedule. Continue?")) return;
    const form = new FormData(event.currentTarget);
    await submit(() => saveSetupAction({
      courts: Number(form.get("courts")), matchesPerPlayer: Number(form.get("matchesPerPlayer")),
      targetScore: Number(form.get("targetScore")), transitionMinutes: Number(form.get("transitionMinutes")),
      playerIds: selected, unavailablePlayerIds: unavailable.filter((id) => selected.includes(id)),
    }));
  }

  async function generate() {
    if (schedule.rounds.some((round) => round.matches.length) && !window.confirm("Replace the current generated Schedule?")) return;
    await submit(generateScheduleAction);
  }

  async function adjust(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit(() => adjustMatchAction(id, {
      round: Number(form.get("round")), court: Number(form.get("court")),
      teamA: [String(form.get("a1")), String(form.get("a2"))], teamB: [String(form.get("b1")), String(form.get("b2"))],
    }));
  }

  return <>
    <form onSubmit={saveSetup}>
      <h2>Tournament setup</h2>
      <label>Courts <input name="courts" type="number" min="1" max="16" defaultValue={schedule.courts} required /></label>
      <label>Matches per Player <input name="matchesPerPlayer" type="number" min="1" max="30" defaultValue={schedule.matchesPerPlayer} required /></label>
      <label>Target score <input name="targetScore" type="number" min="1" max="99" defaultValue={schedule.targetScore} required /></label>
      <label>Transition minutes <input name="transitionMinutes" type="number" min="0" max="20" defaultValue={schedule.transitionMinutes} required /></label>
      <fieldset><legend>Players</legend>{players.map((item) => <div key={item.id}>
        <label><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />{item.name} ({item.skillLevel ?? "Unrated"})</label>
        {selected.includes(item.id) && <label>Unavailable: {item.name} <input type="checkbox" checked={unavailable.includes(item.id)} onChange={(event) => setUnavailable(event.target.checked ? [...unavailable, item.id] : unavailable.filter((id) => id !== item.id))} /></label>}
      </div>)}</fieldset>
      <button disabled={busy}>Save setup</button>
    </form>
    <p role="status">{message}</p>
    <section><h2>Schedule</h2><p><Link href={`/events/${schedule.eventId}`}>Manage Match results</Link></p><button type="button" disabled={busy} onClick={generate}>Generate Schedule</button>
      {schedule.rounds.length === 0 && <p>No Schedule yet</p>}
      {schedule.rounds.map((round) => <section key={round.number}><h3>Round {round.number}</h3>
        {round.matches.map((match) => <form key={`${match.id}:${round.number}:${match.court}:${match.teamA.map((item) => item.playerId)}:${match.teamB.map((item) => item.playerId)}`} onSubmit={(event) => adjust(match.id, event)}>
          <h4>Tournament Match — Court {match.court}</h4>
          <p><Link href={`/scoreboard/${match.id}`}>{match.status === "scheduled" ? "Open Scoreboard" : match.status === "in_progress" ? "Resume Match" : "Review Match"}</Link></p>
          <label>Round <input name="round" type="number" min="1" max="999" defaultValue={round.number} required /></label>
          <label>Court <input name="court" type="number" min="1" max={schedule.courts} defaultValue={match.court} required /></label>
          {(["a1", "a2", "b1", "b2"] as const).map((field, index) => <label key={field}>{index < 2 ? "Team A" : "Team B"} Player {index % 2 + 1}
            <select name={field} defaultValue={(index < 2 ? match.teamA[index] : match.teamB[index - 2]).playerId}>
              {schedule.roster.filter((item) => item.available).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>)}
          <button disabled={busy}>Save Tournament Match</button>
        </form>)}
      </section>)}
    </section>
  </>;
}
