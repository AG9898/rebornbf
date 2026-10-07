import type { ReactNode } from "react";
import styles from "./onboarding.module.css";

/**
 * The onboarding backdrop (legacy/ART_GUIDE_BFR.md → Onboarding screens): the portrait 640x1136 screen with the
 * title key art blurred and dimmed and a small gold wordmark at the top, so each step follows on
 * from the title screen. The name, tutorial-prompt, and starter steps all draw inside it; the page
 * must sit under a parent that sets the menu font variable (`app/onboarding/layout.tsx`).
 */
export function OnboardingScreen({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className={styles.backdrop}>
      <div className={styles.screen}>
        <div className={styles.keyArt} aria-hidden="true" />
        <p className={styles.wordmark}>
          <span className={styles.wordmarkLead}>Brave Frontier</span>
          <span className={styles.wordmarkAccent}>Reborn</span>
        </p>
        <div className={styles.stage}>{children}</div>
      </div>
    </div>
  );
}

/**
 * A centred slate panel with gold trim (`item-panel` frame over `bg-slate`) and a gold title in
 * the menu font. Onboarding forms, tutorial prompts, and the starter confirm all use it.
 */
export function OnboardingPanel({
  title,
  titleId,
  children,
}: {
  title: string;
  /** Id for the heading, so a form or dialog can point `aria-labelledby` at it. */
  titleId?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h1 id={titleId} className={styles.panelTitle}>
        {title}
      </h1>
      {children}
    </section>
  );
}
