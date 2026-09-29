import { type NextRequest, NextResponse } from "next/server";
import { SIGN_IN_PATH, safeNextPath } from "../../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";

/** OAuth return point: swaps the PKCE code for a session cookie, then continues to `next`. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createSupabaseServerClient();
  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL(`${SIGN_IN_PATH}?error=callback`, request.url));
}
