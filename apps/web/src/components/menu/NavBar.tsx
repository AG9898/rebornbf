"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./menu.module.css";
import { activeSection, NAV_SECTIONS } from "./sections.ts";
import { UiImage } from "./UiImage.tsx";

/** The six-slot bottom navigation; the current section's tile is lit. */
export function NavBar(): ReactNode {
  const current = activeSection(usePathname());
  return (
    <nav className={styles.nav} aria-label="Main">
      {NAV_SECTIONS.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className={styles.navTile}
          aria-current={section === current ? "page" : undefined}
        >
          <UiImage name={`nav-${section.icon}`} className={styles.navIcon} />
          <span className={`${styles.navLabel} ${styles.outlined}`}>{section.label}</span>
        </Link>
      ))}
    </nav>
  );
}
