"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { OriginalAsset } from "../../lib/original/original-assets.ts";
import { OriginalImage } from "./OriginalImage.tsx";
import styles from "./original-menu.module.css";
import { activeSection, NAV_SECTIONS, type NavSection } from "./sections.ts";

/** Normal and pressed art; Home reads "Summoner's Home" while on the home screen, as the original. */
function buttonArt(section: NavSection, onHome: boolean): readonly [OriginalAsset, OriginalAsset] {
  if (section.button === "home" && onHome) {
    return [
      "footer/footer_btn_summoner_home/normal.png",
      "footer/footer_btn_summoner_home/pressed.png",
    ];
  }
  return [
    `footer/footer_btn/btn_${section.button}_01.png`,
    `footer/footer_btn/btn_${section.button}_02.png`,
  ];
}

/** The original's six-button footer over `button_base`; buttons without a screen are disabled. */
export function NavBar(): ReactNode {
  const pathname = usePathname();
  const current = activeSection(pathname);
  return (
    <nav className={styles.footer} aria-label="Main">
      <OriginalImage asset="footer/footer_base/button_base.png" className={styles.footerBase} />
      {NAV_SECTIONS.map((section, i) => {
        const [normal, pressed] = buttonArt(section, pathname === "/home");
        const face = (
          <>
            <OriginalImage asset={normal} className={styles.normal} alt={section.label} />
            <OriginalImage asset={pressed} className={styles.pressed} />
          </>
        );
        const style = { left: `calc(var(--u) * ${1 + i * 106})` };
        return section.href ? (
          <Link
            key={section.label}
            href={section.href}
            className={styles.footerButton}
            style={style}
            aria-current={section === current ? "page" : undefined}
          >
            {face}
          </Link>
        ) : (
          <span
            key={section.label}
            className={styles.footerButton}
            style={style}
            aria-disabled="true"
            title="Coming soon"
          >
            {face}
          </span>
        );
      })}
    </nav>
  );
}
