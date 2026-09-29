"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import styles from "./menu.module.css";
import { GAME_MODES, START_MODE_INDEX } from "./sections.ts";
import { UiImage } from "./UiImage.tsx";

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

/** Swipeable mode banners (Trials, Quest, Dungeons) with page dots; opens on Quest. */
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
        {GAME_MODES.map((mode, i) => (
          <Link
            key={mode.href}
            href={mode.href}
            className={styles.slide}
            data-active={i === active}
            prefetch={false}
          >
            <UiImage
              name={`mode-${mode.emblem}`}
              className={styles.emblem}
              priority={i === START_MODE_INDEX}
            />
            <span className={`${styles.modeTitle} ${styles.gold}`}>{mode.title}</span>
          </Link>
        ))}
      </div>
      <div className={styles.dots}>
        {GAME_MODES.map((mode, i) => (
          <button
            key={mode.href}
            type="button"
            className={styles.dot}
            aria-label={`Show ${mode.title}`}
            aria-current={i === active}
            onClick={() => centreSlide(track.current, i, "smooth")}
          />
        ))}
      </div>
    </section>
  );
}
