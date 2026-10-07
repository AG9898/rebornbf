import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { type OriginalAsset, originalAssetUrl } from "../../lib/original/original-assets.ts";
import styles from "./kit.module.css";
import { FRAMES, type Frame, LABEL_SIZE, type OriginalButtonSize } from "./kit-data.ts";
import { OriginalImage } from "./OriginalImage.tsx";

/*
 * The original's shared sub-screen chrome (M8-01, RESOLVED-98; ART_GUIDE → Original Asset Import
 * → Screen kit). Positions are the original 640x1136 screen less the 164 px header, measured on
 * the Rewards and Presents screens (art/original/layouts/kit-rewards.json).
 */

/**
 * The title bar under the header: the gold `header_title_base` plate with the blue Back button
 * and the screen's title in code, plus an optional right-hand action (an `OriginalButton`). A
 * `subtitle` (e.g. the Units list's "Sort Element") moves the title up and sits under it;
 * `children` are extras the caller positions in bar coordinates (screen y less 164).
 */
export function OriginalTitleBar({
  title,
  subtitle,
  backHref = "/home",
  action,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  action?: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return (
    <header className={styles.titleBar}>
      <OriginalImage asset="header/header_title_base.png" className={styles.titlePlate} />
      <Link href={backHref} className={styles.back} aria-label="Back">
        <OriginalImage asset="header/header_title_btn1.png" className={styles.normal} />
        <OriginalImage asset="header/header_title_btn2.png" className={styles.pressed} />
      </Link>
      <h1 className={`${styles.title} ${styles.text}${subtitle ? ` ${styles.titleWithSub}` : ""}`}>
        {title}
      </h1>
      {subtitle ? <p className={`${styles.subtitle} ${styles.text}`}>{subtitle}</p> : null}
      {action ? <div className={styles.titleAction}>{action}</div> : null}
      {children}
    </header>
  );
}

/** The one-line help ticker above the footer, on `footer_base/ticker_base`. */
export function OriginalTicker({ children }: { children: ReactNode }): ReactNode {
  return (
    <p className={styles.ticker}>
      <OriginalImage asset="footer/footer_base/ticker_base.png" className={styles.tickerBase} />
      <span className={styles.tickerText}>{children}</span>
    </p>
  );
}

/**
 * A standard original button with its caption in code: a link, a button, or disabled ("Coming
 * soon") when it has neither. Pressed art shows while held.
 */
export function OriginalButton({
  size,
  href,
  onClick,
  children,
  className,
  style,
}: {
  size: OriginalButtonSize;
  href?: string | null;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}): ReactNode {
  const face = (
    <>
      <OriginalImage asset={`common/button/${size}1.png`} className={styles.normal} />
      <OriginalImage asset={`common/button/${size}2.png`} className={styles.pressed} />
      <span
        className={`${styles.caption} ${styles.text}`}
        style={{ fontSize: `calc(var(--u) * ${LABEL_SIZE[size]})` }}
      >
        {children}
      </span>
    </>
  );
  const cls = className ? `${styles.button} ${className}` : styles.button;
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {face}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} style={style} onClick={onClick}>
        {face}
      </button>
    );
  }
  return (
    <span className={cls} style={style} aria-disabled="true" title="Coming soon">
      {face}
    </span>
  );
}

/**
 * A button whose caption is baked into the original's label art (Menu, Unit hub): the base and
 * label pieces stack in one box the size of the base and each swaps to its pressed piece while
 * held. `base` and `art` are asset paths without the `1.png` / `2.png` state suffix. Without
 * `href` it renders disabled ("Coming soon"). Size and place it with `className`.
 */
export function OriginalLabelButton({
  base,
  art,
  label,
  href,
  className,
}: {
  base: string;
  art: string;
  label: string;
  href: string | null;
  className?: string;
}): ReactNode {
  const piece = (stem: string, state: 1 | 2): OriginalAsset =>
    `${stem}${state}.png` as OriginalAsset;
  const face = (
    <>
      <OriginalImage asset={piece(base, 1)} className={`${styles.normal} ${styles.layer}`} />
      <OriginalImage asset={piece(base, 2)} className={`${styles.pressed} ${styles.layer}`} />
      <OriginalImage asset={piece(art, 1)} className={`${styles.normal} ${styles.layer}`} />
      <OriginalImage asset={piece(art, 2)} className={`${styles.pressed} ${styles.layer}`} />
    </>
  );
  const cls = `${styles.button} ${styles.labelButton} ${className ?? ""}`;
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={label}>
        {face}
      </Link>
    );
  }
  return (
    <span className={cls} role="img" aria-label={label} aria-disabled="true" title="Coming soon">
      {face}
    </span>
  );
}

/**
 * A window drawn from a nine-slice frame at any size: the base fills the box, the edges stretch
 * between the corners. Size and place it with `className`; children sit inside the corners.
 */
export function OriginalWindow({
  variant = "wide",
  className,
  children,
}: {
  variant?: "wide" | "system";
  className?: string;
  children?: ReactNode;
}): ReactNode {
  const { corner, parts } = FRAMES[variant];
  const url = (part: keyof Frame["parts"]): string => `url("${originalAssetUrl(parts[part])}")`;
  const vars = {
    "--corner": corner,
    "--base": url("base"),
    "--lt": url("lt"),
    "--rt": url("rt"),
    "--lb": url("lb"),
    "--rb": url("rb"),
    "--top": url("top"),
    "--bottom": url("bottom"),
    "--left": url("left"),
    "--right": url("right"),
  } as CSSProperties;
  return (
    <div className={className ? `${styles.window} ${className}` : styles.window} style={vars}>
      <span className={styles.frame} aria-hidden="true" />
      <div className={styles.windowBody}>{children}</div>
    </div>
  );
}
