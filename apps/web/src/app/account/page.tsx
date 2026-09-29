import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SIGN_IN_PATH } from "../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";

/** The signed-in player's account page (protected by `src/proxy.ts`). */
export default async function AccountPage(): Promise<ReactNode> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=/account`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle<{ display_name: string | null }>();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <h1 className="text-2xl font-black tracking-[0.18em] text-amber-100">Account</h1>
      <p className="mt-6 text-sm text-stone-300">Signed in as</p>
      <p className="mt-1 text-lg font-semibold text-amber-50">
        {profile?.display_name ?? "New player"}
      </p>
      <form action="/sign-out" method="post" className="mt-8">
        <button
          type="submit"
          className="rounded-xl border border-amber-500/30 bg-[#181723] px-4 py-3 text-sm font-semibold text-amber-50 hover:bg-[#221f30]"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
