"use client";

import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { SkillRow } from "../../../../components/units/SkillRow.tsx";
import type { SkillDisplay } from "../../../../lib/units/unit-skills.ts";
import styles from "../units.module.css";

/** A press held this long opens the skill panels; releasing closes them, as in the original. */
export const SKILL_HOLD_MS = 300;

type PanelSet = "leader" | "burst";

/**
 * Unit Info's body (legacy/ART_GUIDE_BFR.md → Units, Squad, and Unit detail screens): the hero the server built
 * (splash, stat column, spheres) with the right column of actions and Switch, then the two pinned
 * skill rows, Leader Skill and one burst. Switch cycles the burst row BB → SBB → UBB through the
 * tiers the form has; the tag follows (blue / gold / red).
 *
 * Holding either row shows the original's skill panels over the hero until release: Leader and
 * Extra Skill for the leader row, every burst tier for the burst row. A tap (or keyboard press)
 * pins them open instead; a tap anywhere or Escape closes them.
 */
export function UnitInfoBody({
  hero,
  actions,
  leader,
  extra,
  bursts,
}: {
  hero: ReactNode;
  actions: ReactNode;
  leader: SkillDisplay | null;
  extra: SkillDisplay | null;
  bursts: readonly SkillDisplay[];
}): ReactNode {
  const [tier, setTier] = useState(0);
  const [open, setOpen] = useState<PanelSet | null>(null);
  const burst = bursts[tier % Math.max(bursts.length, 1)] ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const leaderPress = useHoldToShow(
    () => setOpen("leader"),
    () => setOpen(null),
  );
  const burstPress = useHoldToShow(
    () => setOpen("burst"),
    () => setOpen(null),
  );
  const panels = open === "leader" ? [leader, extra] : open === "burst" ? bursts : [];

  return (
    <div className={styles.infoBody}>
      <section className={styles.infoHero}>
        {hero}
        <div className={styles.infoRight}>
          {actions}
          {bursts.length > 1 ? (
            <button
              type="button"
              className={`${styles.infoButton} ${styles.infoSwitch}`}
              onClick={() => setTier((index) => (index + 1) % bursts.length)}
              aria-label={`Switch burst (showing ${burst?.label ?? "none"})`}
            >
              <span className={styles.outline}>Switch</span>
            </button>
          ) : null}
        </div>
        {open ? (
          // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes it (window listener above).
          <div
            className={styles.infoPanels}
            role="dialog"
            aria-label={open === "leader" ? "Leader and Extra Skill" : "Brave Bursts"}
            onClick={() => setOpen(null)}
          >
            {panels.map((skill) => (skill ? <SkillPanel key={skill.key} skill={skill} /> : null))}
          </div>
        ) : null}
      </section>

      <section className={styles.infoSkills} aria-label="Skills">
        <SkillRow skill={leader} label="Leader Skill" press={leaderPress} />
        {burst ? <SkillRow key={burst.key} skill={burst} press={burstPress} /> : null}
      </section>
    </div>
  );
}

/** The gold tab only fits a short label, as the original's "LEADER SKILL". */
const TAB_LABELS: Record<SkillDisplay["key"], string> = {
  leader: "Leader Skill",
  extra: "Extra Skill",
  bb: "Brave Burst",
  sbb: "Super BB",
  ubb: "Ultimate BB",
};

/** One skill as the original's long-press panel: the gold tab label, the name, then the effects. */
function SkillPanel({ skill }: { skill: SkillDisplay }): ReactNode {
  const meta = [
    skill.level !== undefined ? `Lv.${skill.level}` : null,
    skill.cost !== undefined ? `BC ${skill.cost}` : null,
  ].filter(Boolean);
  return (
    <article className={styles.skillPanel} data-key={skill.key} aria-label={skill.label}>
      <p className={styles.skillPanelTab}>{TAB_LABELS[skill.key]}</p>
      <h2 className={styles.outline}>{skill.name}</h2>
      {meta.length ? <p className={styles.skillPanelCost}>{meta.join(" · ")}</p> : null}
      <p className={styles.skillPanelText} title={skill.effects.join(" · ")}>
        {skill.effects.join(" · ")}
      </p>
    </article>
  );
}

/**
 * Press-and-hold handlers for a skill row: a hold of `SKILL_HOLD_MS` shows until the pointer is
 * released, leaves, or is cancelled (a scroll); a shorter press, or Enter/Space, pins it open.
 */
function useHoldToShow(
  show: () => void,
  hide: () => void,
): ButtonHTMLAttributes<HTMLButtonElement> {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clear, [clear]);
  const release = () => {
    clear();
    if (held.current) hide();
  };
  return {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      held.current = false;
      clear();
      timer.current = setTimeout(() => {
        held.current = true;
        show();
      }, SKILL_HOLD_MS);
    },
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
    onContextMenu: (event) => event.preventDefault(),
    onClick: () => {
      // The click that ends a hold already closed the panels; only a tap pins them open.
      if (held.current) {
        held.current = false;
        return;
      }
      clear();
      show();
    },
  };
}
