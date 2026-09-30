"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { LoginRewardView } from "../../lib/login/login-reward.ts";
import styles from "./login-reward.module.css";
import { UiImage } from "./UiImage.tsx";
import { useSetWalletGems } from "./WalletGems.tsx";

/**
 * The home login-reward popup (M5-03B, RESOLVED-68): shown once when the page's server render
 * claimed a calendar day. It sets the status bar's gem count to the post-claim balance and
 * closes with its OK button, Escape, or a tap on the dimmed backdrop.
 */
export function LoginRewardPopup({
  view,
  gemsAfter,
}: {
  view: LoginRewardView;
  gemsAfter: number;
}): ReactNode {
  const [open, setOpen] = useState(true);
  const setGems = useSetWalletGems();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => setGems(gemsAfter), [setGems, gemsAfter]);

  useEffect(() => {
    if (!open) return;
    button.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the backdrop tap is a pointer shortcut; OK and Escape close it too
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled on the window
    <div
      className={styles.dock}
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-reward-title"
      >
        <p className={styles.kicker}>Login Bonus</p>
        <h2 id="login-reward-title" className={styles.title}>
          {view.title}
        </h2>
        <ul className={styles.rewards}>
          {view.lines.map((line) => (
            <li key={line.kind} className={styles.reward}>
              {line.kind === "gems" ? (
                <UiImage name="icon-gem" className={styles.icon} />
              ) : (
                <span className={styles.ticket} aria-hidden="true">
                  10
                </span>
              )}
              <span className={styles.label}>{line.label}</span>
            </li>
          ))}
        </ul>
        <button ref={button} type="button" className={styles.button} onClick={() => setOpen(false)}>
          OK
        </button>
      </section>
    </div>
  );
}
