import { Resend } from "resend";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function sendMail(to: string, subject: string, text: string) {
  const outbox = process.env.AUTH_TEST_OUTBOX_DIR;
  if (outbox && process.env.NODE_ENV !== "production") {
    await mkdir(outbox, { recursive: true });
    await writeFile(join(outbox, `${randomUUID()}.json`), JSON.stringify({ to, subject, text }), { mode: 0o600 });
    return;
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!key || !from) throw new Error("Email delivery is not configured");
  const { error } = await new Resend(key).emails.send({ from, to, subject, text });
  if (error) throw new Error(`Email delivery failed: ${error.name}`);
}
