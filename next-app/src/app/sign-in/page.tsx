"use client";

import { FormEvent, useState } from "react";

async function authPost(path: string, body: Record<string, string>) {
  const response = await fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message ?? "Sign-in failed. Check your credentials and email verification.");
  }
  return response.json();
}

export default function SignInPage() {
  const [mode, setMode] = useState<"staff" | "visitor">("staff");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "staff") {
        await authPost("/sign-in/username", { username: username.replace(/^@/, ""), password });
        window.location.assign("/account");
      } else if (!sent) {
        await authPost("/email-otp/send-verification-otp", { email, type: "sign-in" });
        setSent(true);
        setMessage("A sign-in code was sent. It expires in 5 minutes.");
      } else {
        await authPost("/sign-in/email-otp", { email, otp });
        window.location.assign("/account");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Sign in</h1>
      <nav aria-label="Account type">
        <button type="button" onClick={() => { setMode("staff"); setMessage(""); }}>Staff</button>
        <button type="button" onClick={() => { setMode("visitor"); setMessage(""); }}>Visitor</button>
      </nav>
      <form onSubmit={submit}>
        {mode === "staff" ? (
          <>
            <label>Username <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
            <label>Password <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          </>
        ) : (
          <>
            <label>Email <input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setSent(false); }} required /></label>
            {sent && <label>Code <input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} required /></label>}
          </>
        )}
        <button disabled={busy} type="submit">{mode === "staff" ? "Sign in" : sent ? "Verify code" : "Send code"}</button>
      </form>
      {mode === "staff" && <p><a href="/recover">Forgot password or need to verify your email?</a></p>}
      {sent && <button type="button" onClick={() => { setSent(false); setOtp(""); }}>Request a new code</button>}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
