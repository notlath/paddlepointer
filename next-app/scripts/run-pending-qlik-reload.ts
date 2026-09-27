import { firePendingQlikReload } from "../src/server/qlik-reload";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
console.log(await firePendingQlikReload() ? "Qlik reload triggered" : "No reload triggered; pending changes, if any, will be retried");
process.exit(0);
