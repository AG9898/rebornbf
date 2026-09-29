import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

/** Signs the player out (POST only, so a link or prefetch cannot end a session) and goes home. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  // 303 turns the form POST into a GET of the home page.
  return NextResponse.redirect(new URL("/", request.url), 303);
}
