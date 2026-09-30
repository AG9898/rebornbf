"use client";

import type { Element, Stats } from "@bfr/data";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";
import menu from "../../../components/menu/menu.module.css";
import { textBoxStyle } from "../../../components/menu/text-box.ts";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import { THUMB_ART_SIZE } from "../../../components/menu/ui-assets.ts";
import {
  draftProblem,
  draftsEqual,
  pedestalOrder,
  SQUAD_SLOTS,
  type SquadDraft,
  setLeader,
  stepSquadSlot,
  toggleAlly,
  toggleGuest,
  toggleSquadUnit,
} from "../../../lib/squad/squad-editor.ts";
import units from "../units/units.module.css";
import { saveSquad } from "./actions.ts";
import squad from "./squad.module.css";

/** The slice of an owned unit (or a guest preview) the editor draws. */
export type EditorUnit = {
  id: string;
  name: string;
  rarityLabel: string;
  level: number;
  maxLevel: number | null;
  element: Element | null;
  /** Stats at the unit's current level; null when the row or content is invalid. */
  stats: Stats | null;
  /** The form's Leader Skill name; null when the form has none. */
  leaderSkill: string | null;
  /** The form's battle-idle sprite, drawn on the pedestal. */
  sprite: string | null;
  /** The form's square thumbnail icon; preferred over the sprite in the unit picker. */
  thumb: string | null;
};

type PickTarget = "squad" | "ally";

/** Where each entry of `pedestalOrder` sits: the leader in the centre, then the four corners. */
const PEDESTAL_SPOTS = ["centre", "tl", "tr", "bl", "br"] as const;

const SLOT_NUMBERS: readonly number[] = Array.from({ length: SQUAD_SLOTS }, (_, i) => i);

/**
 * The squad editor (M3-03B) as the original's Manage Squad (M3-03F, ART_GUIDE → UI → Units,
 * Squad, and Unit detail screens): five pedestals over `bg-olive` with the leader in the centre
 * under the leader ribbon, squad arrows and page dots for the ten squads, the Leader Skill bar,
 * and below them the ally slot and the unit picker. Tapping a squad member removes it; with
 * Leader lit, tapping one makes it the leader. Saving goes through the `save_squad` RPC.
 */
export function SquadEditor({
  slot,
  units: owned,
  guests,
  saved,
}: {
  slot: number;
  units: readonly EditorUnit[];
  guests: readonly EditorUnit[];
  saved: SquadDraft;
}): ReactNode {
  const [draft, setDraft] = useState<SquadDraft>(saved);
  const [target, setTarget] = useState<PickTarget>("squad");
  const [choosingLeader, setChoosingLeader] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(owned.map((unit) => [unit.id, unit]));
  const problem = draftProblem(draft);
  const dirty = !draftsEqual(draft, saved);
  const leader = byId.get(draft.unitIds[draft.leaderIndex] ?? "");

  function update(next: SquadDraft): void {
    setDraft(next);
    setStatus(null);
  }

  function pick(unitId: string): void {
    update(target === "ally" ? toggleAlly(draft, unitId) : toggleSquadUnit(draft, unitId));
  }

  function tapMember(position: number, unit: EditorUnit): void {
    if (choosingLeader) {
      update(setLeader(draft, position));
      setChoosingLeader(false);
    } else {
      update(toggleSquadUnit(draft, unit.id));
    }
  }

  function save(): void {
    setChoosingLeader(false);
    startTransition(async () => {
      const result = await saveSquad(slot, draft);
      setStatus(
        result.ok ? { ok: true, text: "Squad saved." } : { ok: false, text: result.message },
      );
    });
  }

  const ally = draft.guestId
    ? guests.find((unit) => unit.id === draft.guestId)
    : draft.allyUnitId
      ? byId.get(draft.allyUnitId)
      : undefined;

  const strip = status
    ? status.text
    : dirty
      ? (problem ?? "Unsaved changes.")
      : "Tap a unit below to add it to the squad.";

  return (
    <div className={squad.page}>
      <header className={units.titleBar}>
        <Link href="/home" className={`${units.pill} ${units.backButton}`}>
          <span className={units.outline}>Back</span>
        </Link>
        <div className={`${units.titlePlate} ${squad.titlePlate}`}>
          <UiImage name="title-plate" className={units.titlePlateArt} />
          <div className={units.titleText} style={textBoxStyle("title-plate")}>
            <h1 className={units.outline}>Manage Squad</h1>
          </div>
        </div>
        <button
          type="button"
          className={`${units.pill} ${squad.barButton} ${choosingLeader ? squad.barButtonLit : ""}`}
          onClick={() => setChoosingLeader((on) => !on)}
          aria-pressed={choosingLeader}
          disabled={draft.unitIds.length === 0}
        >
          <span className={units.outline}>Leader</span>
        </button>
        <button
          type="button"
          className={`${units.pill} ${squad.barButton} ${dirty && !problem ? squad.barButtonLit : ""}`}
          onClick={save}
          disabled={pending || problem !== null || !dirty}
        >
          <span className={units.outline}>{pending ? "Saving" : "Save"}</span>
        </button>
      </header>

      <div className={squad.body}>
        <section
          className={`${squad.stage} ${choosingLeader ? squad.stageChoosing : ""}`}
          aria-label={`Squad ${slot + 1}`}
        >
          <div className={`${squad.plate} ${squad.namePlate}`}>
            <span className={units.outline}>Squad {slot + 1}</span>
          </div>

          {pedestalOrder(draft).map((position, i) => {
            const unit = byId.get(draft.unitIds[position] ?? "");
            return (
              <Pedestal
                key={PEDESTAL_SPOTS[i]}
                spot={PEDESTAL_SPOTS[i] ?? "centre"}
                unit={unit}
                isLeader={i === 0 && unit !== undefined}
                action={
                  unit
                    ? choosingLeader
                      ? `Make ${unit.name} the leader`
                      : `Remove ${unit.name} from the squad`
                    : undefined
                }
                onTap={unit ? () => tapMember(position, unit) : undefined}
              />
            );
          })}

          <Link
            href={`/squad?slot=${stepSquadSlot(slot, -1)}`}
            className={`${squad.arrow} ${squad.arrowLeft}`}
            aria-label="Previous squad"
          >
            <UiImage name="squad-arrow" className={squad.arrowArt} />
          </Link>
          <Link
            href={`/squad?slot=${stepSquadSlot(slot, 1)}`}
            className={`${squad.arrow} ${squad.arrowRight}`}
            aria-label="Next squad"
          >
            <UiImage name="squad-arrow" className={squad.arrowArt} />
          </Link>

          <nav className={squad.dots} aria-label="Squad slots">
            {SLOT_NUMBERS.map((i) => (
              <Link
                key={i}
                href={`/squad?slot=${i}`}
                className={squad.dot}
                aria-label={`Squad ${i + 1}`}
                aria-current={i === slot ? "page" : undefined}
              >
                <UiImage name={i === slot ? "dot-on" : "dot-off"} className={squad.dotArt} />
              </Link>
            ))}
          </nav>

          <div className={squad.squadTab}>
            <span className={units.outline}>Squad {slot + 1}</span>
          </div>
        </section>

        <div className={`${units.skillRow} ${squad.leaderBar}`}>
          <span className={units.skillTag} data-tag="skill-tag-red">
            <UiImage name="skill-tag-red" className={units.titlePlateArt} />
            <span
              className={`${units.skillTagText} ${units.outline}`}
              style={textBoxStyle("skill-tag-red")}
            >
              Leader Skill
            </span>
          </span>
          <span className={units.skillName}>{leader?.leaderSkill ?? "None"}</span>
        </div>

        <p
          className={`${squad.plate} ${squad.strip} ${status && !status.ok ? squad.stripError : ""}`}
          role="status"
        >
          {strip}
        </p>

        <section className={squad.picker} aria-label="Units">
          <div className={squad.pickerBar}>
            <fieldset className={squad.targets} aria-label="Tapping a unit adds it to">
              <span className={`${squad.targetsLabel} ${units.outline}`} aria-hidden>
                Add to
              </span>
              <button
                type="button"
                className={`${units.pill} ${squad.targetButton} ${target === "squad" ? squad.barButtonLit : ""}`}
                onClick={() => setTarget("squad")}
                aria-pressed={target === "squad"}
              >
                <span className={units.outline}>Squad</span>
              </button>
              <button
                type="button"
                className={`${units.pill} ${squad.targetButton} ${target === "ally" ? squad.barButtonLit : ""}`}
                onClick={() => setTarget("ally")}
                aria-pressed={target === "ally"}
              >
                <span className={units.outline}>Ally</span>
              </button>
            </fieldset>
            <div className={squad.allySlot}>
              <span className={`${squad.allyLabel} ${units.outline}`}>
                {draft.guestId ? "Guest" : "Ally"}
              </span>
              {ally ? (
                <UnitIcon
                  unit={ally}
                  onClick={() =>
                    update(draft.guestId ? toggleGuest(draft, ally.id) : toggleAlly(draft, ally.id))
                  }
                  label={`Remove ${ally.name} from the ally slot`}
                />
              ) : (
                <span className={squad.allyEmpty} />
              )}
            </div>
          </div>

          <h2 className={`${squad.pickerTitle} ${units.outline}`}>Guests</h2>
          <p className={squad.pickerNote}>
            Try a guest in your ally slot. Their form and level scale to your collection when you
            start a battle.
          </p>
          <ul className={units.grid}>
            {guests.map((unit) => {
              const chosen = draft.guestId === unit.id;
              return (
                <li key={unit.id}>
                  <UnitIcon
                    unit={unit}
                    tag={chosen ? "ALLY" : "GUEST"}
                    chosen={chosen}
                    onClick={() => update(toggleGuest(draft, unit.id))}
                    label={`${unit.name}, guest, Lv ${unit.level}`}
                  />
                </li>
              );
            })}
          </ul>

          <h2 className={`${squad.pickerTitle} ${units.outline}`}>Your units</h2>
          {owned.length === 0 ? (
            <p className={squad.pickerNote}>
              You have no units yet. Your starters join you as you clear the story.
            </p>
          ) : (
            <ul className={units.grid}>
              {owned.map((unit) => {
                const inSquad = draft.unitIds.includes(unit.id);
                const isAlly = draft.allyUnitId === unit.id;
                const chosen = target === "ally" ? isAlly : inSquad;
                return (
                  <li key={unit.id}>
                    <UnitIcon
                      unit={unit}
                      tag={inSquad ? "PARTY" : isAlly ? "ALLY" : null}
                      chosen={chosen}
                      onClick={() => pick(unit.id)}
                      label={`${unit.name}, ${unit.rarityLabel}, Lv ${unit.level}${inSquad ? ", in squad" : ""}${isAlly ? ", ally" : ""}`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <p className={menu.ticker}>
        {choosingLeader
          ? "Tap a squad member to make it the leader."
          : "Tap a squad member to remove it."}
      </p>
    </div>
  );
}

/** One pedestal: the idle sprite on the stone, its stat plate, and the element orb. */
function Pedestal({
  spot,
  unit,
  isLeader,
  action,
  onTap,
}: {
  spot: (typeof PEDESTAL_SPOTS)[number];
  unit: EditorUnit | undefined;
  isLeader: boolean;
  action: string | undefined;
  onTap: (() => void) | undefined;
}): ReactNode {
  const body = (
    <>
      <UiImage name="squad-pedestal" className={squad.pedestalArt} />
      {unit ? (
        unit.sprite ? (
          <Image
            src={unit.sprite}
            alt=""
            width={128}
            height={128}
            className={squad.sprite}
            unoptimized
            draggable={false}
          />
        ) : (
          <span className={`${squad.noSprite} ${units.outline}`}>{unit.name.charAt(0)}</span>
        )
      ) : null}
      {isLeader ? (
        <span className={squad.ribbon}>
          <UiImage name="leader-ribbon" className={units.titlePlateArt} />
          <span
            className={`${squad.ribbonText} ${units.outline}`}
            style={textBoxStyle("leader-ribbon")}
          >
            LEADER
          </span>
        </span>
      ) : null}
      {unit ? <StatPlate unit={unit} /> : null}
    </>
  );
  return unit && onTap ? (
    <button
      type="button"
      className={squad.pedestal}
      data-spot={spot}
      onClick={onTap}
      aria-label={action}
    >
      {body}
    </button>
  ) : (
    <div className={`${squad.pedestal} ${squad.pedestalEmpty}`} data-spot={spot}>
      {body}
    </div>
  );
}

/** "Lv. N  HP N" over "ATK N  DEF N  REC N", with the element orb on the top-left corner. */
function StatPlate({ unit }: { unit: EditorUnit }): ReactNode {
  const s = unit.stats;
  const value = (n: number | undefined) => (n === undefined ? "–" : String(n));
  return (
    <span className={`${squad.plate} ${squad.statPlate}`}>
      {unit.element ? <UiImage name={`orb-${unit.element}`} className={squad.orb} /> : null}
      <span className={squad.statLine}>
        <Stat label="Lv." value={String(unit.level)} />
        <Stat label="HP" value={value(s?.hp)} />
      </span>
      <span className={squad.statLine}>
        <Stat label="ATK" value={value(s?.atk)} />
        <Stat label="DEF" value={value(s?.def)} />
        <Stat label="REC" value={value(s?.rec)} />
      </span>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <span className={`${squad.stat} ${units.outline}`}>
      <span className={squad.statLabel}>{label}</span> {value}
    </span>
  );
}

/** A picker icon: the thumb in its element frame, the level across the bottom, a tag on top. */
function UnitIcon({
  unit,
  tag = null,
  chosen = false,
  onClick,
  label,
}: {
  unit: EditorUnit;
  tag?: string | null;
  chosen?: boolean;
  onClick: () => void;
  label: string;
}): ReactNode {
  const level =
    unit.maxLevel !== null && unit.level >= unit.maxLevel ? "Lv.MAX" : `Lv.${unit.level}`;
  return (
    <button
      type="button"
      className={`${units.icon} ${squad.pickIcon} ${chosen ? squad.pickChosen : ""}`}
      data-element={unit.element ?? undefined}
      onClick={onClick}
      aria-pressed={chosen}
      aria-label={label}
    >
      <span className={units.iconArt}>
        {unit.thumb ? (
          <Image
            src={unit.thumb}
            alt=""
            width={THUMB_ART_SIZE.width}
            height={THUMB_ART_SIZE.height}
            className={units.thumb}
            unoptimized
            draggable={false}
          />
        ) : unit.sprite ? (
          <Image
            src={unit.sprite}
            alt=""
            width={128}
            height={128}
            className={units.sprite}
            unoptimized
            draggable={false}
          />
        ) : (
          <span className={units.iconInitial}>{unit.name.charAt(0)}</span>
        )}
      </span>
      {unit.element ? (
        <UiImage name={`unit-frame-${unit.element}`} className={units.iconFrame} />
      ) : null}
      {tag ? <span className={`${units.party} ${units.outline}`}>{tag}</span> : null}
      <span className={`${units.level} ${units.outline}`}>{level}</span>
    </button>
  );
}
