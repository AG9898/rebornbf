import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSupabasePublicEnv } from "../../../lib/supabase/env.ts";
import { type OAuthProvider, safeNextPath } from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { signInWithProvider } from "./actions.ts";

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: "Continue with Google",
  discord: "Continue with Discord",
};

const ERROR_MESSAGES: Record<string, string> = {
  unavailable: "Sign-in is not available on this deployment yet.",
  provider: "Could not reach the sign-in provider. Please try again.",
  callback: "Sign-in did not complete. Please try again.",
};

type SignInPageProps = {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps): Promise<ReactNode> {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const available = getSupabasePublicEnv() !== null;

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims.sub) redirect(next);
  }

  const message = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.callback)
    : available
      ? null
      : ERROR_MESSAGES.unavailable;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-2xl font-black tracking-[0.18em] text-amber-100">BFR</h1>
      <p className="mt-2 text-sm text-stone-300">Sign in to keep your units and progress.</p>

      {message ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {message}
        </p>
      ) : null}

      <form action={signInWithProvider} className="mt-8 flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        {(Object.keys(PROVIDER_LABELS) as OAuthProvider[]).map((provider) => (
          <button
            key={provider}
            type="submit"
            name="provider"
            value={provider}
            disabled={!available}
            className="rounded-xl border border-amber-500/30 bg-[#181723] px-4 py-3 text-sm font-semibold text-amber-50 hover:bg-[#221f30] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {PROVIDER_LABELS[provider]}
          </button>
        ))}
      </form>
    </main>
  );
}
