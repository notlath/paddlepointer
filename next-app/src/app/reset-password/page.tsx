"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/reset-password", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: password }),
    });
    setMessage(response.ok ? "Password changed. Sign in again." : "This reset link is invalid or expired.");
  }
  return <main>
    <h1>Reset password</h1>
    <form onSubmit={submit}>
      <label>New password <input type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <button disabled={!token} type="submit">Change password</button>
    </form>
    {message && <p role="status">{message}</p>}
  </main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main><h1>Reset password</h1></main>}><ResetPasswordForm /></Suspense>;
}
