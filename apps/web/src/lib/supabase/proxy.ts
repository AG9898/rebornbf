import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublicEnv } from "./env.ts";
import { isProtectedPath, signInRedirectPath } from "./routes.ts";

/**
 * Runs in `src/proxy.ts` on every page request: refreshes the Supabase session cookies and
 * redirects signed-out visitors away from protected paths. Without Supabase settings nobody can
 * be signed in, so protected paths always redirect.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const env = getSupabasePublicEnv();
  let signedIn = false;

  if (env) {
    const supabase = createServerClient(env.url, env.publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    });
    // Do not run code between client creation and this call: it refreshes an expired session.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims.sub);
  }

  const { pathname, search } = request.nextUrl;
  if (!signedIn && isProtectedPath(pathname)) {
    const redirect = NextResponse.redirect(
      new URL(signInRedirectPath(pathname, search), request.url),
    );
    // Keep any cookie changes (e.g. a cleared stale session) on the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}
