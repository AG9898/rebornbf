"use client";

import Image from "next/image";
import { type ReactNode, useState, useTransition } from "react";
import { THUMB_ART_SIZE } from "../../../components/menu/ui-assets.ts";
import {
  draftProblem,
  draftsEqual,
  SQUAD_SIZE,
  type SquadDraft,
  setLeader,
  toggleAlly,
  toggleSquadUnit,
} from "../../../lib/squad/squad-editor.ts";
import { saveSquad } from "./actions.ts";
import squad from "./squad.module.css";

/** The slice of an owned unit the editor draws. */
export type EditorUnit = {
  id: string;
  name: string;
  rarityLabel: string;
  level: number;
  sprite: string | null;
  /** The form's square thumbnail icon; preferred over the sprite when present. */
  thumb: string | null;
};

type PickTarget = "squad" | "ally";

/** Squad positions p0–p4. */
const POSITIONS: readonly number[] = Array.from({ length: SQUAD_SIZE }, (_, i) => i);

/**
 * Squad editor (M3-03B): five squad slots plus the ally slot, filled by tapping owned units.
 * Tapping a squad slot's crown makes that unit the leader. The ally is a duplicate of one of the
 * player's own units (guests arrive with M3-03C).
 */
export function SquadEditor({
  slot,
  units,
  saved,
}: {
  slot: number;
  units: readonly EditorUnit[];
  saved: SquadDraft;
}): ReactNode {
  const [draft, setDraft] = useState<SquadDraft>(saved);
  const [target, setTarget] = useState<PickTarget>("squad");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const problem = draftProblem(draft);
  const dirty = !draftsEqual(draft, saved);

  function update(next: SquadDraft): void {
    setDraft(next);
    setStatus(null);
  }

  function pick(unitId: string): void {
    update(target === "ally" ? toggleAlly(draft, unitId) : toggleSquadUnit(draft, unitId));
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveSquad(slot, draft);
      setStatus(
        result.ok ? { ok: true, text: "Squad saved." } : { ok: false, text: result.message },
      );
    });
  }

  const ally = draft.allyUnitId ? byId.get(draft.allyUnitId) : undefined;

  return (
    <>
      <ol className={squad.lineup}>
        {POSITIONS.map((i) => {
          const unitId = draft.unitIds[i];
          const unit = unitId ? byId.get(unitId) : undefined;
          const isLeader = unit !== undefined && i === draft.leaderIndex;
          return (
            <li key={i} className={squad.lineupSlot}>
              {unit ? (
                <>
                  <button
                    type="button"
                    className={squad.slotCard}
                    onClick={() => update(toggleSquadUnit(draft, unit.id))}
                    aria-label={`Remove ${unit.name} from the squad`}
                  >
                    <UnitFace unit={unit} />
                  </button>
                  <button
                    type="button"
                    className={`${squad.leaderButton} ${isLeader ? squad.leaderActive : ""}`}
                    onClick={() => update(setLeader(draft, i))}
                    aria-pressed={isLeader}
                  >
                    {isLeader ? "Leader" : "Lead"}
                  </button>
                </>
              ) : (
                <span className={`${squad.slotCard} ${squad.slotEmpty}`}>{i + 1}</span>
              )}
            </li>
          );
        })}
        <li className={squad.lineupSlot}>
          {ally ? (
            <button
              type="button"
              className={`${squad.slotCard} ${squad.slotAlly}`}
              onClick={() => update(toggleAlly(draft, ally.id))}
              aria-label={`Remove ${ally.name} from the ally slot`}
            >
              <UnitFace unit={ally} />
            </button>
          ) : (
            <span className={`${squad.slotCard} ${squad.slotEmpty} ${squad.slotAlly}`}>Ally</span>
          )}
          <span className={squad.allyTag}>Ally</span>
        </li>
      </ol>

      <div className={squad.toolbar}>
        <fieldset className={squad.targets}>
          <legend className={squad.srOnly}>Tapping a unit adds it to</legend>
          <button
            type="button"
            className={`${squad.target} ${target === "squad" ? squad.targetActive : ""}`}
            onClick={() => setTarget("squad")}
            aria-pressed={target === "squad"}
          >
            Squad
          </button>
          <button
            type="button"
            className={`${squad.target} ${target === "ally" ? squad.targetActive : ""}`}
            onClick={() => setTarget("ally")}
            aria-pressed={target === "ally"}
          >
            Ally
          </button>
        </fieldset>
        <button
          type="button"
          className={squad.save}
          onClick={save}
          disabled={pending || problem !== null || !dirty}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      <p className={squad.status} role="status">
        {status ? status.text : dirty ? (problem ?? "Unsaved changes.") : ""}
      </p>

      <ul className={squad.grid}>
        {units.map((unit) => {
          const inSquad = draft.unitIds.includes(unit.id);
          const isAlly = draft.allyUnitId === unit.id;
          const chosen = target === "ally" ? isAlly : inSquad;
          return (
            <li key={unit.id}>
              <button
                type="button"
                className={`${squad.pick} ${chosen ? squad.pickChosen : ""}`}
                onClick={() => pick(unit.id)}
                aria-pressed={chosen}
              >
                <UnitFace unit={unit} />
                <span className={squad.pickName}>{unit.name}</span>
                <span className={squad.pickMeta}>
                  Lv {unit.level}
                  {inSquad ? " · In squad" : ""}
                  {isAlly ? " · Ally" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function UnitFace({ unit }: { unit: EditorUnit }): ReactNode {
  return (
    <span className={squad.face}>
      {unit.thumb ? (
        <Image
          src={unit.thumb}
          alt=""
          width={THUMB_ART_SIZE.width}
          height={THUMB_ART_SIZE.height}
          className={squad.thumb}
          unoptimized
        />
      ) : unit.sprite ? (
        <Image
          src={unit.sprite}
          alt=""
          width={128}
          height={128}
          className={squad.sprite}
          unoptimized
        />
      ) : (
        <span className={squad.noArt}>{unit.name.charAt(0)}</span>
      )}
      <span className={squad.rarity}>{unit.rarityLabel}</span>
    </span>
  );
}
