"use client";

import { FormEvent, useState } from "react";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  async function send(event: FormEvent<HTMLFormElement>, path: string) {
    event.preventDefault();
    const response = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, ...(path === "request-password-reset" ? { redirectTo: `${window.location.origin}/reset-password` } : { callbackURL: `${window.location.origin}/sign-in` }) }) });
    setMessage(response.ok ? "Check your email for the next step." : "Unable to send email. Check the address and try again.");
  }
  return <main>
    <h1>Staff and Player account recovery</h1>
    <label>Email <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <form onSubmit={(event) => send(event, "send-verification-email")}><button type="submit">Send verification email</button></form>
    <form onSubmit={(event) => send(event, "request-password-reset")}><button type="submit">Reset password</button></form>
    {message && <p role="status">{message}</p>}
  </main>;
}
