"use client";

import Image from "next/image";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import { gameAudio } from "../../../game/audio/index.ts";
import { RARITY_WORDS, type SummonTreatment } from "../../../lib/summon/constants.ts";
import type { SummonPullView } from "../../../lib/summon/summon.ts";
import styles from "./summon.module.css";

/**
 * Timed phases of one pull after the gate is tapped (ms). `gate` and `reveal` wait for a tap.
 * legacy/ART_GUIDE_BFR.md → Summon sequence.
 */
type Phase = "gate" | "open" | "burst" | "flash" | "reveal";
const TIMED: Partial<Record<Phase, { next: Phase; ms: number }>> = {
  open: { next: "burst", ms: 650 },
  burst: { next: "flash", ms: 900 },
  flash: { next: "reveal", ms: 260 },
};

const GATE: Record<SummonTreatment, "gate-gold" | "gate-rainbow"> = {
  gold: "gate-gold",
  red: "gate-gold",
  rainbow: "gate-rainbow",
};
const BURST: Record<SummonTreatment, "fx-burst-red" | "fx-burst-rainbow"> = {
  gold: "fx-burst-red",
  red: "fx-burst-red",
  rainbow: "fx-burst-rainbow",
};
const HALO: Record<SummonTreatment, "fx-halo-gold" | "fx-halo-red" | "fx-halo-rainbow"> = {
  gold: "fx-halo-gold",
  red: "fx-halo-red",
  rainbow: "fx-halo-rainbow",
};

/**
 * Plays every pull in order, one gate each in its own unit's rarity treatment, over the whole menu
 * column. Skip jumps the current gate to its reveal; Skip all jumps to the results grid.
 */
export function SummonSequence({
  pulls,
  onDone,
}: {
  pulls: SummonPullView[];
  onDone: () => void;
}): ReactNode {
  const [current, setCurrent] = useState(0);
  const [phase, setPhase] = useState<Phase>("gate");
  const [results, setResults] = useState(false);
  const pull = pulls[current];

  useEffect(() => {
    if (phase === "reveal" && !results) gameAudio().playSfx("summon-reveal");
  }, [phase, results]);

  useEffect(() => {
    const timed = TIMED[phase];
    if (results || !timed) return;
    const id = window.setTimeout(() => setPhase(timed.next), timed.ms);
    return () => window.clearTimeout(id);
  }, [phase, results]);

  function next(): void {
    if (current + 1 < pulls.length) {
      setCurrent(current + 1);
      setPhase("gate");
    } else {
      setResults(true);
    }
  }

  if (results || !pull) {
    return (
      <div className={styles.stage} role="dialog" aria-modal="true" aria-label="Summon results">
        <div className={styles.results}>
          <h2 className={styles.panelTitle}>Summoned {pulls.length === 1 ? "unit" : "units"}</h2>
          <ul className={styles.resultGrid}>
            {pulls.map((p) => (
              <li key={p.index} className={styles[`result_${p.treatment}`]}>
                <ResultIcon pull={p} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`${styles.pill} ${styles.closeButton}`}
            onClick={() => {
              gameAudio().playSfx("ui-confirm");
              onDone();
            }}
          >
            <span className={styles.outline}>OK</span>
          </button>
        </div>
      </div>
    );
  }

  const gateShown = phase === "gate" || phase === "open";
  return (
    <div
      className={`${styles.stage} ${styles[`phase_${phase}`]}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Summon ${current + 1} of ${pulls.length}`}
    >
      {gateShown ? (
        <button
          type="button"
          key={`gate-${current}`}
          className={styles.gate}
          onClick={() => phase === "gate" && setPhase("open")}
          aria-label="Open the gate"
        >
          <span className={styles.touch} aria-hidden="true">
            <UiImage name="touch-tag" className={styles.fill} />
            <span className={styles.touchWord}>TOUCH</span>
          </span>
          <UiImage name={GATE[pull.treatment]} className={styles.gateArt} />
          <UiImage name={GATE[pull.treatment]} className={styles.gateReflection} />
          {phase === "open" ? <UiImage name="gate-glow" className={styles.gateGlow} /> : null}
        </button>
      ) : null}

      {phase === "burst" ? <UiImage name={BURST[pull.treatment]} className={styles.burst} /> : null}
      {phase === "flash" ? <div className={styles.flash} /> : null}

      {phase === "reveal" ? (
        <button type="button" key={`reveal-${current}`} className={styles.reveal} onClick={next}>
          <RarityWord treatment={pull.treatment} />
          <span className={styles.haloWrap}>
            <UiImage name={HALO[pull.treatment]} className={styles.halo} />
            {pull.sprite ? (
              <Image
                src={pull.sprite}
                alt=""
                width={128}
                height={128}
                className={styles.sprite}
                unoptimized
                draggable={false}
              />
            ) : null}
          </span>
          <span className={`${styles.revealName} ${styles.outline}`}>
            {pull.name}
            {pull.featured ? <span className={styles.featuredTag}> Featured</span> : null}
          </span>
          <span className={`${styles.revealForm} ${styles.outline}`}>
            {pull.rarityLabel} {pull.formName ?? ""}
          </span>
          <span className={styles.tapHint}>Tap to continue</span>
        </button>
      ) : null}

      <div className={styles.skipBar}>
        <span className={`${styles.counter} ${styles.outline}`}>
          {current + 1} / {pulls.length}
        </span>
        {phase !== "reveal" ? (
          <button
            type="button"
            className={`${styles.pill} ${styles.skipButton}`}
            onClick={() => setPhase("reveal")}
          >
            <span className={styles.outline}>Skip</span>
          </button>
        ) : null}
        {pulls.length > 1 ? (
          <button
            type="button"
            className={`${styles.pill} ${styles.skipButton}`}
            onClick={() => setResults(true)}
          >
            <span className={styles.outline}>Skip all</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The rarity word dropping in letter by letter, filled with its treatment's gradient. */
function RarityWord({ treatment }: { treatment: SummonTreatment }): ReactNode {
  const word = RARITY_WORDS[treatment];
  return (
    <span className={`${styles.word} ${styles[`word_${treatment}`]}`} role="img" aria-label={word}>
      {[...word].map((ch, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: letters repeat; position is the identity.
          key={i}
          className={styles.letter}
          style={{ "--i": i } as CSSProperties}
          aria-hidden="true"
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

function ResultIcon({ pull }: { pull: SummonPullView }): ReactNode {
  const body = (
    <>
      {pull.thumb ? (
        <Image
          src={pull.thumb}
          alt=""
          width={256}
          height={256}
          className={styles.resultThumb}
          unoptimized
          draggable={false}
        />
      ) : (
        <span className={styles.resultThumb} />
      )}
      <span className={`${styles.resultName} ${styles.outline}`}>{pull.name}</span>
      <span className={`${styles.resultRarity} ${styles.outline}`}>{pull.rarityLabel}</span>
    </>
  );
  return pull.href ? (
    <Link href={pull.href} className={styles.resultLink}>
      {body}
    </Link>
  ) : (
    <span className={styles.resultLink}>{body}</span>
  );
}
