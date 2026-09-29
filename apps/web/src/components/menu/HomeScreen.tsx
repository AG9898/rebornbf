import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { HOME_SQUAD_HREF, type ShowcaseCard } from "../../lib/squad/home-showcase.ts";
import { ModeCarousel } from "./ModeCarousel.tsx";
import styles from "./menu.module.css";
import { UTILITY_TABS } from "./sections.ts";
import { UiImage } from "./UiImage.tsx";
import { CARD_ART_SIZE } from "./ui-assets.ts";

/** Left positions (logical px) of the four utility tabs, two each side of the flourish. */
const TAB_LEFT = [19, 140, 385, 506];

/** Home: squad slot 0 as five cards (leader first, empty frames for empty slots; M3-03D). */
export function HomeScreen({ cards }: { cards: readonly ShowcaseCard[] }): ReactNode {
  return (
    <>
      <section className={styles.showcase} aria-label="Squad">
        {cards.map((card, i) =>
          card.kind === "empty" ? (
            <Link
              // biome-ignore lint/suspicious/noArrayIndexKey: empty frames have no other identity
              key={`empty-${i}`}
              href={HOME_SQUAD_HREF}
              className={`${styles.card} ${styles.cardEmpty}`}
              aria-label="Empty squad slot"
            >
              <UiImage name="card-frame" className={styles.cardFrame} />
            </Link>
          ) : (
            <Link
              key={card.ownedId}
              href={HOME_SQUAD_HREF}
              className={styles.card}
              aria-label={card.name}
            >
              {card.cardArt ? (
                <Image
                  src={card.cardArt}
                  width={CARD_ART_SIZE.width}
                  height={CARD_ART_SIZE.height}
                  alt=""
                  className={styles.cardArt}
                  priority
                  unoptimized
                  draggable={false}
                />
              ) : (
                <span className={styles.cardName}>{card.name}</span>
              )}
              <UiImage name="card-frame" className={styles.cardFrame} />
              {card.leader ? (
                <UiImage name="card-leader" className={styles.cardLeader} alt="Leader" />
              ) : null}
              {card.element ? (
                <UiImage name={`orb-${card.element}`} className={styles.cardOrb} />
              ) : null}
            </Link>
          ),
        )}
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
