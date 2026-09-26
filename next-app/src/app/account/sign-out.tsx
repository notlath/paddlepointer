"use client";

export function SignOut() {
  return <button type="button" onClick={async () => {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    window.location.assign("/sign-in");
  }}>Sign out</button>;
}
