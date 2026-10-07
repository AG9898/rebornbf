import type { ReactNode } from "react";
import styles from "./loading-glyph.module.css";

export type LoadingGlyphVariant = "inline" | "screen";

/**
 * The one loading indicator for every wait in the game (RESOLVED-95; legacy/ART_GUIDE_BFR.md → Trials flow):
 * the locked `loading-run` strip (six frames of the white knight running in place) with
 * "Connecting" and three pulsing trail dots in code.
 *
 * - `inline` sits in a button or panel in place of its label, at the surrounding font size.
 * - `screen` covers the nearest positioned ancestor (the menu column inside the menu frame) with an
 *   even translucent black layer: the screen underneath stays in place, dimmed, as in the
 *   original's Connecting overlay. It also blocks taps on that screen while it shows.
 *
 * The knight runs and the dots pulse; both hold still (frame one) under OS reduced motion (CSS) or
 * when the caller passes the player's saved `reducedMotion` setting.
 */
export function LoadingGlyph({
  variant = "inline",
  reducedMotion = false,
  className,
}: {
  variant?: LoadingGlyphVariant;
  reducedMotion?: boolean;
  className?: string;
}): ReactNode {
  const body = (
    <span
      className={`${styles.glyph} ${variant === "screen" ? styles.screenGlyph : styles.inline} ${
        variant === "inline" && className ? className : ""
      }`}
      data-still={reducedMotion ? "true" : undefined}
      role={variant === "inline" ? "status" : undefined}
    >
      <span className={styles.runner} aria-hidden="true" />
      <span className={styles.label}>
        Connecting
        <span className={styles.dots} aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </span>
    </span>
  );
  if (variant === "inline") return body;
  return (
    <div
      className={`${styles.screen} ${className ?? ""}`}
      data-still={reducedMotion ? "true" : undefined}
      role="status"
    >
      {body}
    </div>
  );
}
