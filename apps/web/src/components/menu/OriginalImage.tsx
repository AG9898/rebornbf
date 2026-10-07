import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import {
  ORIGINAL_ASSETS,
  type OriginalAsset,
  originalAssetUrl,
} from "../../lib/original/original-assets.ts";
import styles from "./original-menu.module.css";

type OriginalImageProps = {
  asset: OriginalAsset;
  className?: string;
  /** Decorative art stays silent to screen readers. */
  alt?: string;
  priority?: boolean;
  /** Extra inline style, such as a computed position. */
  style?: CSSProperties;
};

/**
 * One imported original piece (RESOLVED-98). Pieces are 1x for the original 640-wide screen, so
 * each is drawn at its own pixel size in logical units (--u) unless `className` overrides it.
 * Its base CSS uses zero specificity so screen size and visibility classes always take precedence.
 */
export function OriginalImage({
  asset,
  className,
  alt = "",
  priority,
  style,
}: OriginalImageProps): ReactNode {
  const { width, height } = ORIGINAL_ASSETS[asset];
  return (
    <Image
      src={originalAssetUrl(asset)}
      width={width}
      height={height}
      alt={alt}
      className={className ? `${styles.piece} ${className}` : styles.piece}
      style={{ "--w": width, ...style } as CSSProperties}
      priority={priority}
      unoptimized
      draggable={false}
    />
  );
}
