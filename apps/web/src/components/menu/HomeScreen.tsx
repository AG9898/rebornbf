"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { HOME_SQUAD_HREF, type ShowcaseCard } from "../../lib/squad/home-showcase.ts";
import { ModeCarousel } from "./ModeCarousel.tsx";
import { OriginalImage } from "./OriginalImage.tsx";
import styles from "./original-menu.module.css";
import { SHORTCUTS, SIDE_BUTTONS_LEFT, SIDE_BUTTONS_RIGHT, type SideButton } from "./sections.ts";
import { CARD_ART_SIZE } from "./ui-assets.ts";

/** Slot pitch of `character_frame.png` (five windows 111 px wide, 128 px apart). */
const SLOT_PITCH = 128;

/**
 * Home on the original's layout (RESOLVED-98): squad slot 0 in the unit frame (leader marked,
 * empty windows for empty slots; M3-03D), the two side-button groups, the mode carousel, and the
 * "Select a Menu." ticker. Positions are the original's 640x1136 screen less the 164 px header.
 */
export function HomeScreen({ cards }: { cards: readonly ShowcaseCard[] }): ReactNode {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  return (
    <div className={styles.home}>
      <section className={styles.squad} aria-label="Squad">
        {cards.map((card, i) => {
          const left = { left: `calc(var(--u) * ${8 + i * SLOT_PITCH})` };
          if (card.kind === "empty") {
            return (
              <Link
                // biome-ignore lint/suspicious/noArrayIndexKey: empty slots have no other identity
                key={`empty-${i}`}
                href={HOME_SQUAD_HREF}
                className={styles.slot}
                style={left}
                aria-label="Empty squad slot"
              />
            );
          }
          return (
            <Link
              key={card.ownedId}
              href={HOME_SQUAD_HREF}
              className={styles.slot}
              style={left}
              aria-label={card.name}
            >
              {card.cardArt ? (
                <Image
                  src={card.cardArt}
                  width={CARD_ART_SIZE.width}
                  height={CARD_ART_SIZE.height}
                  alt=""
                  className={styles.slotArt}
                  priority
                  unoptimized
                  draggable={false}
                />
              ) : (
                <span className={`${styles.slotName} ${styles.text}`}>{card.name}</span>
              )}
              {card.leader ? <span className={styles.leader}>LEADER</span> : null}
            </Link>
          );
        })}
        <OriginalImage asset="home/character_frame.png" className={styles.squadFrame} priority />
        {cards.map((card, i) =>
          card.kind !== "empty" && card.element ? (
            <OriginalImage
              key={card.ownedId}
              asset={`common/attribute_mark_M/${card.element}.png`}
              className={styles.orb}
              style={{ left: `calc(var(--u) * ${85 + i * SLOT_PITCH})` }}
              alt={card.element}
            />
          ) : null,
        )}
      </section>

      <nav className={styles.sideLeft} aria-label="Menu shortcuts">
        {SIDE_BUTTONS_LEFT.map((button) => (
          <SideButtonLink
            key={button.label}
            button={button}
            onClick={
              button.art === "shortcut" ? () => setShortcutsOpen((open) => !open) : undefined
            }
            expanded={button.art === "shortcut" ? shortcutsOpen : undefined}
          />
        ))}
      </nav>
      <nav className={styles.sideRight} aria-label="Player shortcuts">
        {SIDE_BUTTONS_RIGHT.map((button) => (
          <SideButtonLink key={button.label} button={button} />
        ))}
      </nav>

      {shortcutsOpen ? (
        <nav className={styles.shortcuts} aria-label="Shortcuts">
          {SHORTCUTS.map((shortcut) => {
            const face = (
              <>
                <OriginalImage
                  asset={shortcut.art[0]}
                  className={styles.normal}
                  alt={shortcut.label}
                />
                <OriginalImage asset={shortcut.art[1]} className={styles.pressed} />
              </>
            );
            return shortcut.href ? (
              <Link
                key={shortcut.label}
                href={shortcut.href}
                className={styles.shortcut}
                aria-label={shortcut.label}
              >
                {face}
              </Link>
            ) : (
              <span
                key={shortcut.label}
                className={styles.shortcut}
                aria-disabled="true"
                title="Coming soon"
              >
                {face}
              </span>
            );
          })}
        </nav>
      ) : null}

      <ModeCarousel />

      <p className={styles.ticker}>
        <OriginalImage asset="footer/footer_base/ticker_base.png" className={styles.tickerBase} />
        <span className={styles.tickerText}>Select a Menu.</span>
      </p>
    </div>
  );
}

/** A side button: a link, a toggle (Shortcuts), or disabled when it has neither. */
function SideButtonLink({
  button,
  onClick,
  expanded,
}: {
  button: SideButton;
  onClick?: () => void;
  expanded?: boolean;
}): ReactNode {
  const face = (
    <>
      <OriginalImage
        asset={`home/home_new_btn_${button.art}1.png`}
        className={styles.normal}
        alt={button.label}
      />
      <OriginalImage asset={`home/home_new_btn_${button.art}2.png`} className={styles.pressed} />
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={styles.sideButton}
        onClick={onClick}
        aria-label={button.label}
        aria-expanded={expanded}
      >
        {face}
      </button>
    );
  }
  return button.href ? (
    <Link href={button.href} className={styles.sideButton} aria-label={button.label}>
      {face}
    </Link>
  ) : (
    <span className={styles.sideButton} aria-disabled="true" title="Coming soon">
      {face}
    </span>
  );
}
