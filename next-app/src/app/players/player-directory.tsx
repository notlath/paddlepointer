"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Player = { id: string; name: string; skillLevel: string | null; hasAccount: boolean };

export function PlayerDirectory({ initialPlayers }: { initialPlayers: Player[] }) {
  const [players, setPlayers] = useState(initialPlayers);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/players");
    if (response.ok) setPlayers((await response.json()).players);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    const response = await fetch("/api/players", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (!response.ok) { setMessage((await response.json()).error); return; }
    form.reset();
    setMessage("Player added");
    await refresh();
  }

  async function rename(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    const response = await fetch(`/api/players/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    setMessage(response.ok ? "Player renamed" : (await response.json()).error);
    if (response.ok) await refresh();
  }

  async function changeSkill(id: string, skillLevel: string) {
    const response = await fetch(`/api/players/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ skillLevel }) });
    setMessage(response.ok ? "Skill level updated" : (await response.json()).error);
    if (response.ok) await refresh();
  }

  async function merge(absorbed: Player, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const survivorId = String(new FormData(event.currentTarget).get("survivorId") ?? "");
    const survivor = players.find((item) => item.id === survivorId);
    if (!survivor) { setMessage("Choose a surviving Player"); return; }
    if (!window.confirm(`Merge ${absorbed.name} into ${survivor.name}? This cannot be undone.`)) return;
    const response = await fetch(`/api/players/${survivorId}/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ absorbedId: absorbed.id, confirm: "MERGE" }) });
    setMessage(response.ok ? "Players merged" : (await response.json()).error);
    if (response.ok) await refresh();
  }

  const visible = players.filter((item) => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <>
    <form onSubmit={create}><label>New Player name <input name="name" required maxLength={120} /></label><button>Add Player</button></form>
    <label>Find Players <input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <p role="status">{message}</p>
    {visible.length === 0 && <p>No Players found</p>}
    <ul>{visible.map((item) => <li key={item.id}>
      <Link href={`/players/${item.id}`}>{item.name}</Link> {item.hasAccount && <span>(linked account)</span>}
      <label>Skill level for {item.name} <select value={item.skillLevel ?? "unrated"} onChange={(event) => changeSkill(item.id, event.target.value)}>
        <option value="unrated">Unrated</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
      </select></label>
      <form onSubmit={(event) => rename(item.id, event)}><label>Rename {item.name} <input name="name" defaultValue={item.name} required maxLength={120} /></label><button>Save name</button></form>
      <form onSubmit={(event) => merge(item, event)}><label>Merge {item.name} into <select name="survivorId" defaultValue="">
        <option value="">Choose Player</option>{players.filter((candidate) => candidate.id !== item.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select></label><button>Merge Players</button></form>
    </li>)}</ul>
  </>;
}
