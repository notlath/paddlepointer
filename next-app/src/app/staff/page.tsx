import { redirect } from "next/navigation";
import { currentPrincipal } from "@/server/authorize";

export default async function StaffPage() {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (principal.role === "visitor") redirect("/account");
  return <main><h1>Staff workspace</h1><p>Signed in as @{principal.username}</p></main>;
}
