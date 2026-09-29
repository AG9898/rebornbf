import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ModeCarousel } from "./ModeCarousel.tsx";
import styles from "./menu.module.css";
import { UTILITY_TABS } from "./sections.ts";
import { UiImage } from "./UiImage.tsx";
import { CARD_ART_SIZE } from "./ui-assets.ts";

type ShowcaseUnit = {
  id: string;
  name: string;
  orb: "fire" | "water" | "thunder" | "earth" | "light" | "dark";
};

/** Placeholder squad until the player's own squad is read in M3-03B; the first card leads. */
const SHOWCASE: readonly ShowcaseUnit[] = [
  { id: "brand", name: "Brand", orb: "fire" },
  { id: "maren", name: "Maren", orb: "water" },
  { id: "rook", name: "Rook", orb: "thunder" },
  { id: "garrick", name: "Garrick", orb: "earth" },
  { id: "solen", name: "Solen", orb: "light" },
];

/** Star form whose card each showcase slot shows until the squad carries its own units' forms. */
const SHOWCASE_FORM = "6star";

/** Left positions (logical px) of the four utility tabs, two each side of the flourish. */
const TAB_LEFT = [19, 140, 385, 506];

export function HomeScreen(): ReactNode {
  return (
    <>
      <section className={styles.showcase} aria-label="Squad">
        {SHOWCASE.map((unit, i) => (
          <Link key={unit.id} href="/squad" className={styles.card} aria-label={unit.name}>
            <Image
              src={`/assets/ui/cards/${unit.id}-${SHOWCASE_FORM}.webp`}
              width={CARD_ART_SIZE.width}
              height={CARD_ART_SIZE.height}
              alt=""
              className={styles.cardArt}
              priority
              unoptimized
              draggable={false}
            />
            <UiImage name="card-frame" className={styles.cardFrame} />
            {i === 0 ? (
              <UiImage name="card-leader" className={styles.cardLeader} alt="Leader" />
            ) : null}
            <UiImage name={`orb-${unit.orb}`} className={styles.cardOrb} />
          </Link>
        ))}
      </section>

      <nav className={styles.utility} aria-label="Shortcuts">
        {UTILITY_TABS.map((tab, i) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={styles.tab}
            style={{ left: `calc(var(--u) * ${TAB_LEFT[i]})` }}
            aria-label={tab.label}
            title={tab.label}
          >
            <UiImage name={`util-${tab.icon}`} />
          </Link>
        ))}
        <UiImage name="util-flourish" className={styles.flourish} />
      </nav>

      <ModeCarousel />

      <p className={styles.ticker}>Swipe the banners and tap Quest for the story map.</p>
    </>
  );
}
