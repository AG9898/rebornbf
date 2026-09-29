import Image from "next/image";
import type { ReactNode } from "react";
import { UI_ASSETS, type UiAsset } from "./ui-assets.ts";

type UiImageProps = {
  name: UiAsset;
  className?: string;
  /** Decorative art stays silent to screen readers. */
  alt?: string;
  priority?: boolean;
};

/** One exported UI piece. Exports are already sized at 2x, so Next's optimizer is skipped. */
export function UiImage({ name, className, alt = "", priority }: UiImageProps): ReactNode {
  const { width, height } = UI_ASSETS[name];
  return (
    <Image
      src={`/assets/ui/${name}.webp`}
      width={width}
      height={height}
      alt={alt}
      className={className}
      priority={priority}
      unoptimized
      draggable={false}
    />
  );
}
