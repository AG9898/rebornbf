import type { Rarity } from "@bfr/data";
import type { ReactNode } from "react";
import { OriginalImage } from "../../../../components/menu/OriginalImage.tsx";
import { rarityMarkPieces } from "../../../../lib/units/unit-info-screen.ts";
import styles from "./rarity-mark.module.css";

/**
 * Original rarity (Unit Info title, Equip Sphere subtitle): one `star_rare` per star (1–7), or the
 * rainbow Omni mark. One accessible label ("7★", "Omni") stands for the decorative pieces.
 * `className` sizes it per screen through `--rarity-star` and `--rarity-omni` (heights in --u).
 */
export function RarityMark({
  rarity,
  label,
  className,
}: {
  rarity: Rarity;
  label: string;
  className?: string;
}): ReactNode {
  const omni = rarity === "omni";
  return (
    <span
      className={className ? `${styles.mark} ${className}` : styles.mark}
      role="img"
      aria-label={label}
    >
      {rarityMarkPieces(rarity).map((asset, index) => (
        <OriginalImage
          // biome-ignore lint/suspicious/noArrayIndexKey: identical pieces, fixed order.
          key={index}
          asset={asset}
          className={omni ? styles.omni : styles.star}
        />
      ))}
    </span>
  );
}
