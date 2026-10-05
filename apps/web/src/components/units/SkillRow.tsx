"use client";

import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { SkillDisplay } from "../../lib/units/unit-skills.ts";
import { textBoxStyle } from "../menu/text-box.ts";
import { UiImage } from "../menu/UiImage.tsx";
import styles from "./skill-row.module.css";

/** Repeat only overflowing text, measured again when fonts, content or the game column change. */
export function SkillText({ text }: { text: string }): ReactNode {
  const viewport = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useEffect(() => {
    let active = true;
    function measure(): void {
      if (!active || !viewport.current || !content.current) return;
      const width = content.current.getBoundingClientRect().width;
      setDistance(width > viewport.current.clientWidth + 1 ? width + 32 : 0);
    }
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    void document.fonts.ready.then(measure);
    measure();
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);
  return (
    <span ref={viewport} className={styles.viewport} data-scrolling={distance > 0 || undefined}>
      <span
        className={styles.track}
        style={
          {
            "--distance": `${distance}px`,
            "--duration": `${Math.max(8, distance / 28)}s`,
          } as CSSProperties
        }
      >
        <span ref={content}>{text}</span>
        {distance > 0 ? (
          <span className={styles.repeat} aria-hidden>
            {text}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * Original-style skill heading + effect strip; the locked BFR tags and panel remain text-free.
 * The `inline` variant is Begin Quest's plain "Leader Skill ▸ Name" line over unframed effect text;
 * `align="end"` mirrors it ("Name ◂ Ally Skill") for the row under the party.
 */
export function SkillRow({
  skill,
  label = skill?.label ?? "Leader Skill",
  className = "",
  variant = "tagged",
  align = "start",
}: {
  skill: SkillDisplay | null;
  label?: string;
  className?: string;
  variant?: "tagged" | "inline";
  align?: "start" | "end";
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const tag =
    label === "Ally Skill"
      ? "skill-tag-blue"
      : skill?.key === "extra"
        ? "skill-tag-violet"
        : skill?.key === "leader" || label === "Leader Skill"
          ? "skill-tag-red"
          : "skill-tag-blue";
  const tagLabel =
    label === "Super Brave Burst"
      ? "Super BB"
      : label === "Ultimate Brave Burst"
        ? "Ultimate BB"
        : label;
  const name = skill?.name ?? "None";
  const effects = skill?.effects.join(" · ") ?? "No Leader Skill";
  return (
    <div
      className={`${styles.row} ${className}`}
      data-variant={variant}
      data-align={align === "end" ? "end" : undefined}
    >
      <button
        type="button"
        className={styles.trigger}
        disabled={!skill}
        aria-label={`${label}: ${name}. Show full effects`}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <span className={styles.heading}>
          {variant === "inline" ? (
            <span className={styles.inlineLabel}>
              {align === "end" ? `◂ ${label}` : `${label} ▸`}
            </span>
          ) : (
            <span className={styles.tag} data-tag={tag}>
              <UiImage name={tag} className={styles.tagArt} />
              <span className={styles.tagText} style={textBoxStyle(tag)}>
                {tagLabel}
              </span>
            </span>
          )}
          <span className={styles.name}>
            <SkillText text={name} />
          </span>
          {skill?.level !== undefined ? (
            <span className={styles.level}>Lv.{skill.level}</span>
          ) : null}
        </span>
        <span className={styles.effects}>
          <span
            className={styles.effectText}
            style={variant === "inline" ? undefined : textBoxStyle("stat-plate")}
          >
            <SkillText text={effects} />
          </span>
        </span>
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`${id}-title`}
        onKeyDown={(event) => {
          if (event.key === "Escape") dialog.current?.close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.dialogBody}>
          <p className={styles.kind}>
            {label}
            {skill?.level !== undefined ? ` · Lv.${skill.level}` : ""}
          </p>
          <h2 id={`${id}-title`}>{name}</h2>
          {skill?.cost !== undefined ? <p>Gauge cost: {skill.cost} BC</p> : null}
          <ul>
            {skill?.effects.map((effect, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Read-only kit order; identical attack lines must remain separate.
              <li key={`${index}-${effect}`}>{effect}</li>
            ))}
          </ul>
          <button type="button" className={styles.close} onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}
