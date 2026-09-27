import { redirect } from "next/navigation";
import { currentPrincipal, isStaff } from "@/server/authorize";
import { SignOut } from "./sign-out";

export default async function AccountPage() {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  return <main>
    <h1>Your account</h1>
    <p>{principal.name} ({principal.role})</p>
    <p>{principal.email}</p>
    {isStaff(principal.role) && <p><a href="/staff">Staff workspace</a></p>}
    {principal.role === "player" && <p><a href="/player">My Player Matches</a></p>}
    {principal.role === "visitor" && <p><a href="/visitor">Visitor Matches</a></p>}
    <p>Private account data is available through the server at <code>/api/accounts/{principal.id}</code>.</p>
    <SignOut />
  </main>;
}
