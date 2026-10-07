import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import authStyles from "../../../components/auth/auth.module.css";
import { PROVIDER_NAMES, ProviderIcon } from "../../../components/auth/ProviderIcon.tsx";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import { CARD_ART_SIZE } from "../../../components/menu/ui-assets.ts";
import {
  OnboardingPanel,
  OnboardingScreen,
} from "../../../components/onboarding/OnboardingScreen.tsx";
import { signInHeroes } from "../../../lib/account/account-view.ts";
import { getSupabasePublicEnv } from "../../../lib/supabase/env.ts";
import { OAUTH_PROVIDERS, safeNextPath } from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { menuFont } from "../../../styles/fonts.ts";
import { signInWithProvider } from "./actions.ts";

export const metadata: Metadata = { title: "Sign in · BFR" };

const ERROR_MESSAGES: Record<string, string> = {
  unavailable: "Sign-in is not available on this deployment yet.",
  provider: "Could not reach the sign-in provider. Please try again.",
  callback: "Sign-in did not complete. Please try again.",
};

type SignInPageProps = {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
};

/**
 * The sign-in screen (legacy/ART_GUIDE_BFR.md → Sign-in and Account screens): the onboarding backdrop and
 * wordmark, the six starters' Omni cards in a raised row, and a gold-trimmed panel with the Google
 * and Discord buttons on `btn-pill` plates.
 */
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
    <div className={menuFont.variable}>
      <OnboardingScreen>
        <ul className={authStyles.heroes} aria-hidden="true">
          {signInHeroes().map((hero) => (
            <li key={hero.unitId} className={authStyles.hero}>
              <Image
                src={hero.cardArt}
                width={CARD_ART_SIZE.width}
                height={CARD_ART_SIZE.height}
                alt=""
                className={authStyles.heroArt}
                priority
                unoptimized
                draggable={false}
              />
              <UiImage name="card-frame" className={authStyles.heroFrame} />
              <UiImage name={`orb-${hero.element}`} className={authStyles.heroOrb} />
            </li>
          ))}
        </ul>

        <div className={authStyles.stack}>
          <OnboardingPanel title="Sign In" titleId="sign-in-title">
            <UiImage name="util-flourish" className={authStyles.flourish} />
            <p className={authStyles.intro}>
              Six heroes await. Sign in to keep your units, squads, and story progress.
            </p>

            {message ? (
              <p role="alert" className={authStyles.alert}>
                {message}
              </p>
            ) : null}

            <form action={signInWithProvider} className={authStyles.providers}>
              <input type="hidden" name="next" value={next} />
              {OAUTH_PROVIDERS.map((provider) => (
                <button
                  key={provider}
                  type="submit"
                  name="provider"
                  value={provider}
                  disabled={!available}
                  className={authStyles.provider}
                >
                  <span className={authStyles.providerBadge}>
                    <ProviderIcon provider={provider} className={authStyles.providerIcon} />
                  </span>
                  <span className={authStyles.providerLabel}>
                    Continue with {PROVIDER_NAMES[provider]}
                  </span>
                </button>
              ))}
            </form>
          </OnboardingPanel>
        </div>

        <footer className={authStyles.footer}>
          <nav className={authStyles.footerLinks}>
            <Link href="/">Title</Link>
            <Link href="/product">About</Link>
          </nav>
          <span>A tribute to Brave Frontier; not affiliated.</span>
        </footer>
      </OnboardingScreen>
    </div>
  );
}
