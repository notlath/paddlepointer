import { eq } from "drizzle-orm";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { db } from "./auth";
import { qlikReloadPending } from "./schema";

export function reloadWasSent(status: number, timedOut: boolean, requestSent: boolean) {
  return status >= 200 && status < 300 || (timedOut && requestSent);
}

export async function postQlikReload(url: string, token: string) {
  return new Promise<boolean>((resolve) => {
    let address: URL;
    try { address = new URL(url); } catch { resolve(false); return; }
    if (address.protocol !== "https:" && address.protocol !== "http:") { resolve(false); return; }
    let requestSent = false;
    let timedOut = false;
    const send = address.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(address, { method: "POST", headers: { "content-type": "application/json", "x-execution-token": token }, timeout: 1500 }, (response) => {
      response.resume();
      resolve(reloadWasSent(response.statusCode ?? 0, false, requestSent));
    });
    request.on("finish", () => { requestSent = true; });
    request.on("timeout", () => { timedOut = true; request.destroy(); });
    request.on("error", () => resolve(reloadWasSent(0, timedOut, requestSent)));
    request.end("{}");
  });
}

export async function firePendingQlikReload() {
  const url = process.env.QLIK_RELOAD_TRIGGER_URL;
  const token = process.env.QLIK_RELOAD_TRIGGER_TOKEN;
  if (!url || !token) return false;
  return db.transaction(async (tx) => {
    const [pending] = await tx.select({ marker: qlikReloadPending.marker }).from(qlikReloadPending)
      .where(eq(qlikReloadPending.singleton, 1)).for("update");
    if (!pending) return false;
    const sent = await postQlikReload(url, token);
    if (sent) await tx.delete(qlikReloadPending).where(eq(qlikReloadPending.singleton, 1));
    return sent;
  });
}
