import type { ReactNode } from "react";
import kit from "../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../components/menu/OriginalImage.tsx";
import type { OriginalAsset } from "../../../lib/original/original-assets.ts";
import { FUSION_ASSETS as art } from "../../../lib/units/fusion-screen.ts";
import styles from "./original-fusion.module.css";

/** Same-sized base and caption pairs; the accessible name remains stable while held. */
export function FusionButton({
  label,
  normal,
  pressed,
  wide = false,
  className = "",
  disabled = false,
  onClick,
  active,
}: {
  label: string;
  normal: OriginalAsset;
  pressed: OriginalAsset;
  wide?: boolean;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  active?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`${kit.button} ${styles.artButton} ${wide ? styles.wideButton : styles.squareButton} ${className}`}
    >
      <OriginalImage
        asset={wide ? art.wideNormal : art.squareNormal}
        className={`${kit.normal} ${kit.layer}`}
      />
      <OriginalImage
        asset={wide ? art.widePressed : art.squarePressed}
        className={`${kit.pressed} ${kit.layer}`}
      />
      <OriginalImage asset={normal} className={`${kit.normal} ${kit.layer}`} />
      <OriginalImage asset={pressed} className={`${kit.pressed} ${kit.layer}`} />
    </button>
  );
}

export function FusionGauge({
  progress,
  className = "",
}: {
  progress: number;
  className?: string;
}): ReactNode {
  return (
    <div className={`${styles.gauge} ${className}`} aria-hidden="true">
      <OriginalImage asset={art.gaugeBase} />
      <span
        className={styles.gaugeClip}
        style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
      >
        <OriginalImage asset={art.gauge} />
      </span>
    </div>
  );
}
