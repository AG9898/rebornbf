"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { LoadingGlyph } from "../../../../components/loading/LoadingGlyph.tsx";
import { textBoxStyle } from "../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import { UnitIconFace } from "../../../../components/units/UnitIconFace.tsx";
import { UnitPicker } from "../../../../components/units/UnitPicker.tsx";
import {
  addToParty,
  otherPartyUnits,
  partiesProblem,
  planSlots,
  stepPartySlot,
  TRIAL_PARTIES,
  TRIAL_SQUAD_HINT,
  trialAllyHref,
  trialEditHref,
} from "../../../../lib/quests/trial-parties.ts";
import { TRIALS_LAB_PATH } from "../../../../lib/quests/trials.ts";
import {
  draftsEqual,
  EMPTY_DRAFT,
  SQUAD_SIZE,
  type SquadDraft,
  setLeader,
  toggleSquadUnit,
} from "../../../../lib/squad/squad-editor.ts";
import { levelLabel } from "../../../../lib/units/owned-units.ts";
import type { CollectionEntry } from "../../../../lib/units/unit-stacks.ts";
import { saveSquad } from "../../squad/actions.ts";
import unitStyles from "../../units/units.module.css";
import styles from "../start.module.css";

const PARTY_INDEXES: readonly number[] = Array.from({ length: TRIAL_PARTIES }, (_, i) => i);
const POSITIONS: readonly number[] = Array.from({ length: SQUAD_SIZE }, (_, i) => i);

/**
 * A trial's Edit Squad (M6-01K, RESOLVED-95; legacy/ART_GUIDE_BFR.md → Trials flow): three Party rows over
 * `bg-proving-lab`, each bound to a saved squad slot (its Squad button steps to the next free
 * slot) with five unit slots and the leader marked; Pell's hint in the `dialogue-panel`. An empty
 * slot opens the shared unit picker, which dims every unit already in a party; tapping a member
 * removes it, or makes it the leader while that party's Leader is lit. Select Ally saves changed
 * parties through `save_squad` and opens Reinforcement for Party 1.
 */
export function TrialEditSquad({
  stage,
  stageName,
  initialSlots,
  saved,
  units,
  failed,
}: {
  stage: string;
  stageName: string;
  /** The three parties' saved squad slots. */
  initialSlots: readonly number[];
  /** Every saved squad slot's draft (owned units only), indexed by slot. */
  saved: readonly SquadDraft[];
  units: readonly CollectionEntry[];
  failed: boolean;
}): ReactNode {
  const router = useRouter();
  const [slots, setSlots] = useState<number[]>([...initialSlots]);
  const [baseline, setBaseline] = useState<SquadDraft[]>([...saved]);
  const [parties, setParties] = useState<SquadDraft[]>(() =>
    initialSlots.map((slot) => saved[slot] ?? EMPTY_DRAFT),
  );
  const [leaderParty, setLeaderParty] = useState<number | null>(null);
  const [filling, setFilling] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const ownedIds = new Set(units.map((unit) => unit.id));
  const problem = partiesProblem(parties);

  function update(index: number, draft: SquadDraft): void {
    setParties(parties.map((party, i) => (i === index ? draft : party)));
    setError(null);
  }

  function stepSlot(index: number): void {
    const slot = stepPartySlot(slots, index, 1);
    setSlots(slots.map((current, i) => (i === index ? slot : current)));
    update(index, baseline[slot] ?? EMPTY_DRAFT);
    setLeaderParty(null);
  }

  function tapMember(index: number, position: number, unitId: string): void {
    const party = parties[index] ?? EMPTY_DRAFT;
    if (leaderParty === index) {
      update(index, setLeader(party, position));
      setLeaderParty(null);
    } else {
      update(index, toggleSquadUnit(party, unitId));
    }
  }

  function selectAlly(): void {
    setLeaderParty(null);
    startTransition(async () => {
      const next = [...baseline];
      for (const [i, party] of parties.entries()) {
        const slot = slots[i] ?? 0;
        if (party.unitIds.length === 0 || draftsEqual(party, next[slot] ?? EMPTY_DRAFT)) continue;
        const result = await saveSquad(slot, party);
        if (!result.ok) {
          setError(`Party ${i + 1}: ${result.message}`);
          setBaseline(next);
          return;
        }
        next[slot] = party;
      }
      setBaseline(next);
      const chosen = planSlots(slots, parties);
      router.push(trialAllyHref(stage, { slots: chosen, allies: chosen.map(() => null) }, 1));
    });
  }

  if (filling !== null) {
    const party = parties[filling] ?? EMPTY_DRAFT;
    return (
      <UnitPicker
        title="Select Units"
        units={units}
        limit={SQUAD_SIZE - party.unitIds.length}
        ineligible={[...party.unitIds, ...otherPartyUnits(parties, filling)]}
        party={party.unitIds}
        backHref={trialEditHref(stage, slots)}
        onBack={() => setFilling(null)}
        ticker="Units already in a party cannot fight twice."
        onConfirm={({ unitIds }) => {
          setParties(addToParty(parties, filling, unitIds, ownedIds));
          setError(null);
          setFilling(null);
        }}
      />
    );
  }

  return (
    <div className={`${styles.page} ${styles.lab}`} data-backdrop="proving-lab">
      <header className={unitStyles.titleBar}>
        <Link href={TRIALS_LAB_PATH} className={`${unitStyles.pill} ${unitStyles.backButton}`}>
          Back
        </Link>
        <div className={`${unitStyles.titlePlate} ${styles.titlePlate}`}>
          <UiImage name="title-plate" className={unitStyles.titlePlateArt} />
          <div className={unitStyles.titleText} style={textBoxStyle("title-plate")}>
            <h1 className={unitStyles.outline}>Edit Squad</h1>
          </div>
        </div>
      </header>
      <p className={styles.notice}>{stageName} · No continues.</p>
      {PARTY_INDEXES.map((index) => {
        const party = parties[index] ?? EMPTY_DRAFT;
        const slot = slots[index] ?? 0;
        return (
          <section key={index} className={styles.trialParty} aria-label={`Party ${index + 1}`}>
            <UiImage name="party-row" className={styles.trialPartyArt} />
            <h2 className={`${unitStyles.outline} ${styles.trialPartyLabel}`}>Party {index + 1}</h2>
            <button
              type="button"
              className={`${styles.pill} ${styles.trialLeader} ${
                leaderParty === index ? styles.pillLit : ""
              }`}
              onClick={() => setLeaderParty(leaderParty === index ? null : index)}
              aria-pressed={leaderParty === index}
              disabled={pending || party.unitIds.length === 0}
            >
              Leader
            </button>
            <button
              type="button"
              className={styles.trialSquad}
              onClick={() => stepSlot(index)}
              disabled={pending || failed}
              aria-label={`Party ${index + 1} uses Squad ${slot + 1}; switch saved squad`}
            >
              <UiImage name="btn-hub" className={styles.beginArt} />
              <span className={styles.beginText} style={textBoxStyle("btn-hub")}>
                Squad {slot + 1}
              </span>
            </button>
            <ul className={styles.trialRow}>
              {POSITIONS.map((position) => {
                const unitId = party.unitIds[position];
                const unit = unitId ? byId.get(unitId) : undefined;
                const leader = unit !== undefined && position === party.leaderIndex;
                return (
                  <li key={position}>
                    <UiImage name="item-slot" className={styles.trialSlotArt} />
                    {unit && unitId ? (
                      <button
                        type="button"
                        className={`${unitStyles.icon} ${styles.member}`}
                        data-element={unit.element ?? undefined}
                        onClick={() => tapMember(index, position, unitId)}
                        disabled={pending}
                        aria-label={`${unit.name}, ${levelLabel(unit)}${leader ? ", leader" : ""}: ${
                          leaderParty === index ? "make leader" : "remove"
                        }`}
                      >
                        <UnitIconFace unit={unit} inParty={false} />
                        {leader ? (
                          <UiImage name="badge-leader" className={styles.leaderBadge} />
                        ) : null}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${unitStyles.icon} ${styles.member}`}
                        onClick={() => setFilling(index)}
                        disabled={pending || failed}
                        aria-label={`Add units to Party ${index + 1}`}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {failed ? <p role="alert">Your units could not be loaded. Try again shortly.</p> : null}
      <p className={styles.notice} role="status">
        {error ?? problem ?? "Tap a member to remove it, or light Leader and tap one to lead."}
      </p>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.pill}
          onClick={selectAlly}
          disabled={pending || failed || problem !== null}
        >
          {pending ? <LoadingGlyph /> : "Select Ally"}
        </button>
      </div>
      <figure className={styles.hint}>
        <UiImage name="dialogue-panel" className={styles.hintArt} />
        <figcaption className={styles.hintText} style={textBoxStyle("dialogue-panel")}>
          <span className={styles.pellFace} aria-hidden="true" />
          <span className={styles.hintLine}>
            <span className={styles.speaker}>Pell</span>
            <span>{TRIAL_SQUAD_HINT}</span>
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
