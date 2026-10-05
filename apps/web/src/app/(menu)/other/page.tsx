import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../../../components/menu/menu.module.css";
import { TUTORIAL_REPLAY_PATH } from "../../../lib/onboarding/routing.ts";

export const metadata: Metadata = { title: "Other · BFR" };

const LINKS = [
  { href: "/settings", label: "Settings" },
  { href: "/account", label: "Account" },
  { href: "/battle", label: "Demo battle" },
  { href: TUTORIAL_REPLAY_PATH, label: "Replay tutorial" },
];

export default function OtherPage(): ReactNode {
  return (
    <div className={styles.placeholder}>
      <section className={styles.panel}>
        <h1 className={`${styles.panelTitle} ${styles.gold}`}>Other</h1>
        <p className={styles.panelText}>Credits are coming soon.</p>
        {LINKS.map((link) => (
          <div key={link.href}>
            <Link href={link.href} className={styles.panelLink}>
              {link.label}
            </Link>
          </div>
        ))}
        <p className={styles.panelText}>A free, non-commercial fan tribute.</p>
      </section>
    </div>
  );
}
