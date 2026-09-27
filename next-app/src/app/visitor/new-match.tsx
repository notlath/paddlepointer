"use client";

import { useState } from "react";
import { createVisitorMatchAction } from "./actions";

export function NewVisitorMatch() {
  const [names, setNames] = useState(["", "", "", ""]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    setMessage("Creating Match…");
    try {
      const result = await createVisitorMatchAction(names);
      if ("error" in result) { setMessage(result.error ?? "Could not create Match"); return; }
      window.location.assign(`/visitor/matches/${result.id}`);
    } catch { setMessage("Could not create Match. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <section><h2>New Visitor Match</h2><p>Enter two names for each Team. These names stay with your private Match and do not create Player records.</p>
    {names.map((name, index) => <label key={index}>Team {index < 2 ? "A" : "B"} Player {index % 2 + 1} <input value={name} maxLength={120} onChange={(event) => setNames(names.map((value, at) => at === index ? event.target.value : value))} /></label>)}
    <button type="button" disabled={busy} onClick={create}>Start Match</button><p role="status">{message}</p>
  </section>;
}
