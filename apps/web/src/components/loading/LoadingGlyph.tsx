import type { ReactNode } from "react";
import { UiImage } from "../menu/UiImage.tsx";
import styles from "./loading-glyph.module.css";

export type LoadingGlyphVariant = "inline" | "screen";

/**
 * The one loading indicator for every wait in the game (RESOLVED-95; ART_GUIDE → Trials flow):
 * the locked white `loading-glyph` with "Connecting" and three pulsing trail dots in code.
 *
 * - `inline` sits in a button or panel in place of its label, at the surrounding font size.
 * - `screen` covers the nearest positioned ancestor (the menu column inside the menu frame) over a
 *   darkened crop of the Proving Lab's summoning circle: the original's Connecting screen.
 *
 * The glyph bobs and the dots pulse; both hold still under OS reduced motion (CSS) or when the
 * caller passes the player's saved `reducedMotion` setting.
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
      <UiImage name="loading-glyph" className={styles.art} />
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
