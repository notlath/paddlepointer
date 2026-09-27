import { NextRequest, NextResponse } from "next/server";
import { writeFrozen } from "./cutover-freeze";

export function middleware(request: NextRequest) {
  if (!writeFrozen(request.method, process.env.PP_WRITE_FREEZE === "1")) return NextResponse.next();
  return NextResponse.json({ ok: false, error: "Writes are temporarily paused for migration" }, {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "120" },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
