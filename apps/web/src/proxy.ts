import type { NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/proxy.ts";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Pages only: skip Next.js internals, static assets, and image files.
    "/((?!_next/static|_next/image|assets/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
