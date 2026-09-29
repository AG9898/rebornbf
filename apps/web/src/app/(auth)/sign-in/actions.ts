"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_CALLBACK_PATH,
  isOAuthProvider,
  SIGN_IN_PATH,
  safeNextPath,
} from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

/** Starts the Google or Discord OAuth flow and sends the browser to the provider. */
export async function signInWithProvider(formData: FormData): Promise<never> {
  const provider = formData.get("provider");
  const next = safeNextPath(formData.get("next")?.toString());
  const supabase = await createSupabaseServerClient();
  if (!supabase || !isOAuthProvider(provider)) redirect(`${SIGN_IN_PATH}?error=unavailable`);

  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const callback = new URL(AUTH_CALLBACK_PATH, origin);
  callback.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) redirect(`${SIGN_IN_PATH}?error=provider`);
  redirect(data.url);
}
