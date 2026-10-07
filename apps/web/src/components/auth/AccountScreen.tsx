import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatCount } from "../../lib/account/account-view.ts";
import type { OAuthProvider } from "../../lib/supabase/routes.ts";
import type { OwnedUnitView } from "../../lib/units/owned-units.ts";
import { menuFont } from "../../styles/fonts.ts";
import { UiImage } from "../menu/UiImage.tsx";
import { OnboardingPanel, OnboardingScreen } from "../onboarding/OnboardingScreen.tsx";
import onboardingStyles from "../onboarding/onboarding.module.css";
import authStyles from "./auth.module.css";
import { PROVIDER_NAMES, ProviderIcon } from "./ProviderIcon.tsx";

export type AccountScreenProps = {
  displayName: string | null;
  /** "Oct 6, 2026", or null when the join date is unknown. */
  since: string | null;
  provider: OAuthProvider | null;
  /** The first saved squad's leader; the crest stands in when null. */
  leader: Pick<OwnedUnitView, "name" | "element" | "thumb"> | null;
  gems: number;
  zel: number;
  /** Null when the unit counts could not be read. */
  units: number | null;
};

/**
 * The account screen (legacy/ART_GUIDE_BFR.md → Sign-in and Account screens) on the onboarding backdrop: a
 * summoner card with the leader in its element frame (the crest when there is none), the display
 * name, join date, and sign-in provider; gems, Zel, and units on value plates; Home, Settings, and
 * Sign out pills.
 */
export function AccountScreen({
  displayName,
  since,
  provider,
  leader,
  gems,
  zel,
  units,
}: AccountScreenProps): ReactNode {
  const stats = [
    { key: "gems", label: "Gems", icon: "icon-gem", value: gems },
    { key: "zel", label: "Zel", icon: "icon-zel", value: zel },
    { key: "units", label: "Units", icon: "nav-unit", value: units },
  ] as const;

  return (
    <div className={menuFont.variable}>
      <OnboardingScreen>
        <UiImage name="top-crest" className={authStyles.crest} />
        <div className={authStyles.stack}>
          <OnboardingPanel title="Account" titleId="account-title">
            <UiImage name="util-flourish" className={authStyles.flourish} />

            <div className={authStyles.summoner}>
              <div className={authStyles.portrait}>
                <div className={authStyles.portraitFrame}>
                  {leader?.thumb && leader.element ? (
                    <>
                      <Image
                        src={leader.thumb}
                        width={256}
                        height={256}
                        alt={`${leader.name}, your leader`}
                        className={authStyles.portraitArt}
                        unoptimized
                        draggable={false}
                      />
                      <UiImage
                        name={`unit-frame-${leader.element}`}
                        className={authStyles.portraitRing}
                      />
                    </>
                  ) : (
                    <UiImage name="top-crest" className={authStyles.portraitCrest} />
                  )}
                </div>
                {leader ? <span className={authStyles.leaderTag}>Leader</span> : null}
              </div>

              <div className={authStyles.who}>
                <h2 className={authStyles.name}>{displayName ?? "New player"}</h2>
                {since ? <p className={authStyles.since}>Since {since}</p> : null}
                {provider ? (
                  <span className={authStyles.chip}>
                    <span className={authStyles.chipBadge}>
                      <ProviderIcon provider={provider} className={authStyles.providerIcon} />
                    </span>
                    <span className={authStyles.chipText}>{PROVIDER_NAMES[provider]} account</span>
                  </span>
                ) : null}
              </div>
            </div>

            <ul className={authStyles.stats}>
              {stats.map((stat) => (
                <li key={stat.key} className={authStyles.stat}>
                  <span className={authStyles.statLabel}>{stat.label}</span>
                  <span className={authStyles.statValue}>
                    {stat.value === null ? "—" : formatCount(stat.value)}
                  </span>
                  <UiImage name={stat.icon} className={authStyles.statIcon} />
                </li>
              ))}
            </ul>

            <div className={authStyles.accountActions}>
              <div>
                <Link href="/home" className={`${onboardingStyles.button} ${authStyles.pillLink}`}>
                  Home
                </Link>
                <Link
                  href="/settings"
                  className={`${onboardingStyles.buttonSecondary} ${authStyles.pillLink}`}
                >
                  Settings
                </Link>
              </div>
              <form action="/sign-out" method="post">
                <button
                  type="submit"
                  className={`${onboardingStyles.buttonSecondary} ${authStyles.signOut}`}
                >
                  Sign out
                </button>
              </form>
            </div>
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
