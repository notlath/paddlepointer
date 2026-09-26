"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function StartEvent() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name") }) });
      if (!response.ok) {
        setError((await response.json()).error ?? "Could not start Event");
        return;
      }
      formElement.reset();
      router.refresh();
    } catch {
      setError("Could not start Event");
    } finally {
      setBusy(false);
    }
  }
  return <form onSubmit={submit}>
    <h2>Start a new Event</h2>
    <label>Event name <input name="name" required maxLength={100} /></label>
    <button disabled={busy}>Start Event</button>
    {error && <p role="status">{error}</p>}
  </form>;
}
