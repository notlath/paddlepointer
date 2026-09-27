import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPrincipal, isStaff } from "@/server/authorize";
import { AnalyticsView } from "./view";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (!isStaff(principal.role)) redirect("/account");
  const tenant = process.env.QLIK_TENANT_URL ?? "https://mtcmarketing.sg.qlikcloud.com";
  return <main><p><Link href="/staff">Staff workspace</Link></p><AnalyticsView config={{ host: new URL(tenant).host, clientId: process.env.QLIK_EMBED_CLIENT_ID ?? "01a0ae9258265bb658e4d2b4021fac4c", appId: process.env.QLIK_APP_ID ?? "17ca2f54-46de-426c-9895-48f6c51513a3" }} /></main>;
}
