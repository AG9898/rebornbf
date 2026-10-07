"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { OriginalImage } from "./OriginalImage.tsx";
import styles from "./original-menu.module.css";
import { GAME_MODES, START_MODE_INDEX } from "./sections.ts";

/** Scroll the track so slide `index` sits in the middle. */
function centreSlide(track: HTMLDivElement | null, index: number, behavior: ScrollBehavior): void {
  const slide = track?.children[index] as HTMLElement | undefined;
  if (!track || !slide) return;
  track.scrollTo({
    left: slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2,
    behavior,
  });
}

/** The slide whose centre is nearest the track's centre. */
function centredSlide(track: HTMLDivElement): number {
  const centre = track.scrollLeft + track.clientWidth / 2;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  Array.from(track.children).forEach((child, i) => {
    const slide = child as HTMLElement;
    const distance = Math.abs(slide.offsetLeft + slide.clientWidth / 2 - centre);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

/** The original's swipeable mode windows with page dots; modes without a screen are disabled. */
export function ModeCarousel(): ReactNode {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(START_MODE_INDEX);

  useEffect(() => centreSlide(track.current, START_MODE_INDEX, "instant"), []);

  return (
    <section className={styles.carousel} aria-label="Game modes">
      <div
        ref={track}
        className={styles.track}
        onScroll={(e) => setActive(centredSlide(e.currentTarget))}
      >
        {GAME_MODES.map((mode, i) => {
          const art = (
            <OriginalImage
              key={mode.title}
              asset={mode.art}
              className={styles.window}
              alt={mode.title}
              priority={i === START_MODE_INDEX}
            />
          );
          return mode.href ? (
            <Link key={mode.title} href={mode.href} className={styles.slide} prefetch={false}>
              {art}
            </Link>
          ) : (
            <span
              key={mode.title}
              className={styles.slide}
              aria-disabled="true"
              title="Coming soon"
            >
              {art}
            </span>
          );
        })}
      </div>
      <div className={styles.dots}>
        {GAME_MODES.map((mode, i) => (
          <button
            key={mode.title}
            type="button"
            className={styles.dot}
            aria-label={`Show ${mode.title}`}
            aria-current={i === active}
            onClick={() => centreSlide(track.current, i, "smooth")}
          >
            <OriginalImage
              asset={
                i === active ? "home/home_position_mark/on.png" : "home/home_position_mark/off.png"
              }
            />
          </button>
        ))}
      </div>
    </section>
  );
}
