import Link from "next/link";
import type { ReactNode } from "react";
import { titleTapDestination } from "../lib/onboarding/routing.ts";
import { getOnboardingState } from "../lib/onboarding/state.ts";
import { menuFont } from "../styles/fonts.ts";
import styles from "./title.module.css";

/**
 * The title screen (RESOLVED-68, ART_GUIDE → Title screen), shown on every visit outside the menu
 * frame: the locked key art (M6-09A), the app-rendered gold wordmark in the top band, and the
 * bottom band with the "Tap to start" ribbon and the footer. The tap goes to sign-in, the next
 * unfinished onboarding step, or home; the footer's About link sits above the tap target.
 */
export default async function TitlePage(): Promise<ReactNode> {
  const destination = titleTapDestination(await getOnboardingState());
  return (
    <div className={`${menuFont.variable} ${styles.backdrop}`}>
      <div className={styles.screen}>
        <div className={styles.keyArt} aria-hidden="true" />
        <h1 className={styles.title}>
          <span className={styles.titleLead}>Brave Frontier</span>
          <span className={styles.titleAccent}>Reborn</span>
        </h1>
        <div className={styles.band}>
          <p className={styles.ribbon}>
            <span className={styles.prompt}>Tap to start</span>
          </p>
          <footer className={styles.footer}>
            <Link href="/product" className={styles.about}>
              About
            </Link>
            <span>A tribute to Brave Frontier; not affiliated.</span>
          </footer>
        </div>
        <Link
          href={destination}
          prefetch={false}
          className={styles.tap}
          aria-label="Tap to start"
        />
      </div>
    </div>
  );
}
