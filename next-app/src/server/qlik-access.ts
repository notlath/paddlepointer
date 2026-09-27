import { timingSafeEqual } from "node:crypto";

export function validAnalyticsKey(provided: string | null) {
  const configured = process.env.ANALYTICS_KEY;
  if (!configured || !provided) return false;
  const actual = Buffer.from(provided.trim());
  const expected = Buffer.from(configured);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function exchangeQlikToken() {
  const tenant = process.env.QLIK_TENANT_URL;
  const clientId = process.env.QLIK_M2M_CLIENT_ID;
  const clientSecret = process.env.QLIK_M2M_CLIENT_SECRET;
  const subject = process.env.QLIK_EVENT_VIEWER_SUBJECT;
  if (!tenant || !clientId || !clientSecret || !subject) return null;
  try {
    const response = await fetch(`${tenant.replace(/\/$/, "")}/oauth/token`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10_000), cache: "no-store",
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "urn:qlik:oauth:user-impersonation", user_lookup: { field: "subject", value: subject }, scope: "user_default" }),
    });
    if (!response.ok) return null;
    const value = await response.json();
    return typeof value.access_token === "string" && value.access_token ? { accessToken: value.access_token, expiresIn: Number(value.expires_in ?? 0) } : null;
  } catch { return null; }
}
