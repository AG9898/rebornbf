"use client";

import type { Element, Stats } from "@bfr/data";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { LoadingGlyph } from "../../../components/loading/LoadingGlyph.tsx";
import kit from "../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../components/menu/OriginalImage.tsx";
import {
  OriginalButton,
  OriginalTicker,
  OriginalTitleBar,
  OriginalWindow,
} from "../../../components/menu/OriginalKit.tsx";
import { SkillText } from "../../../components/units/SkillRow.tsx";
import { UnitPicker } from "../../../components/units/UnitPicker.tsx";
import {
  draftProblem,
  draftsEqual,
  fillSquadSlots,
  pedestalOrder,
  SQUAD_SIZE,
  SQUAD_SLOTS,
  type SquadDraft,
  setLeader,
  stepSquadSlot,
  toggleSquadUnit,
} from "../../../lib/squad/squad-editor.ts";
import { SQUAD_ASSETS } from "../../../lib/squad/squad-screen.ts";
import { leaderSkillDisplay } from "../../../lib/units/unit-skills.ts";
import type { CollectionEntry } from "../../../lib/units/unit-stacks.ts";
import { saveSquad } from "./actions.ts";
import squad from "./original-squad.module.css";

/** The slice of an owned unit the editor draws. */
export type EditorUnit = {
  id: string;
  unitId: string;
  formId: string;
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

/** Where each entry of `pedestalOrder` sits: the leader in the centre, then the four corners. */
const PEDESTAL_SPOTS = ["centre", "tl", "tr", "bl", "br"] as const;

const SLOT_NUMBERS: readonly number[] = Array.from({ length: SQUAD_SLOTS }, (_, i) => i);

/** Original Manage Squad pieces around the existing draft and server-authorized save flow. */
export function SquadEditor({
  slot,
  units: owned,
  pickerUnits,
  saved,
}: {
  slot: number;
  units: readonly EditorUnit[];
  pickerUnits: readonly CollectionEntry[];
  saved: SquadDraft;
}): ReactNode {
  const skillDialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<SquadDraft>(saved);
  const [choosingLeader, setChoosingLeader] = useState(false);
  const [filling, setFilling] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
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

  const strip = status
    ? status.text
    : dirty
      ? (problem ?? "Unsaved changes.")
      : "Tap an empty pedestal to add units to the squad.";

  if (filling) {
    return (
      <UnitPicker
        title="Select Units"
        units={pickerUnits}
        limit={SQUAD_SIZE - draft.unitIds.length}
        ineligible={draft.unitIds}
        party={draft.unitIds}
        backHref={`/squad?slot=${slot}`}
        onBack={() => setFilling(false)}
        ticker="Select units to fill the empty squad slots."
        onConfirm={({ unitIds }) => {
          update(fillSquadSlots(draft, unitIds, new Set(owned.map((unit) => unit.id))));
          setFilling(false);
        }}
      />
    );
  }

  const skill = leaderSkillDisplay(leader);
  return (
    <div className={`${kit.page} ${squad.page}`}>
      <OriginalTitleBar title="Manage Squad" backHref="/units">
        <button
          type="button"
          className={`${kit.button} ${squad.leaderControl}`}
          onClick={() => setChoosingLeader((on) => !on)}
          aria-label="Change Leader"
          aria-pressed={choosingLeader}
          disabled={pending || draft.unitIds.length === 0}
        >
          <OriginalImage asset={SQUAD_ASSETS.baseNormal} className={`${kit.normal} ${kit.layer}`} />
          <OriginalImage
            asset={SQUAD_ASSETS.basePressed}
            className={`${kit.pressed} ${kit.layer}`}
          />
          <OriginalImage
            asset={SQUAD_ASSETS.leaderNormal}
            className={`${kit.normal} ${kit.layer}`}
          />
          <OriginalImage
            asset={SQUAD_ASSETS.leaderPressed}
            className={`${kit.pressed} ${kit.layer}`}
          />
        </button>
        <button
          type="button"
          className={`${kit.button} ${squad.detailControl}`}
          onClick={() => setShowDetails((on) => !on)}
          aria-label="View Details"
          aria-pressed={showDetails}
        >
          <OriginalImage asset={SQUAD_ASSETS.baseNormal} className={`${kit.normal} ${kit.layer}`} />
          <OriginalImage
            asset={SQUAD_ASSETS.basePressed}
            className={`${kit.pressed} ${kit.layer}`}
          />
          <OriginalImage
            asset={SQUAD_ASSETS.detailNormal}
            className={`${kit.normal} ${kit.layer}`}
          />
          <OriginalImage
            asset={SQUAD_ASSETS.detailPressed}
            className={`${kit.pressed} ${kit.layer}`}
          />
        </button>
      </OriginalTitleBar>
      <div className={`${kit.body} ${squad.body}`}>
        <section
          className={`${squad.stage} ${choosingLeader ? squad.stageChoosing : ""}`}
          aria-label={`Squad ${slot + 1}`}
        >
          <OriginalImage asset={SQUAD_ASSETS.cost} className={squad.cost} />
          <button
            type="button"
            className={`${kit.button} ${squad.save}`}
            onClick={save}
            disabled={pending || problem !== null || !dirty}
            aria-label="Save squad"
          >
            <OriginalImage
              asset="common/button/sub_m_green_btn1.png"
              className={`${kit.normal} ${squad.saveArt}`}
            />
            <OriginalImage
              asset="common/button/sub_m_green_btn2.png"
              className={`${kit.pressed} ${squad.saveArt}`}
            />
            <span className={`${kit.caption} ${kit.text}`}>
              {pending ? <LoadingGlyph /> : "Save"}
            </span>
          </button>
          {pedestalOrder(draft).map((position, i) => {
            const unit = byId.get(draft.unitIds[position] ?? "");
            return (
              <Pedestal
                key={PEDESTAL_SPOTS[i]}
                spot={PEDESTAL_SPOTS[i] ?? "centre"}
                unit={unit}
                isLeader={i === 0 && unit !== undefined}
                showDetails={showDetails}
                action={
                  unit
                    ? choosingLeader
                      ? `Make ${unit.name} the leader`
                      : `Remove ${unit.name} from the squad`
                    : choosingLeader
                      ? undefined
                      : "Add units to the squad"
                }
                onTap={
                  pending
                    ? undefined
                    : unit
                      ? () => tapMember(position, unit)
                      : choosingLeader
                        ? undefined
                        : () => setFilling(true)
                }
              />
            );
          })}
          <Link
            href={`/squad?slot=${stepSquadSlot(slot, -1)}`}
            className={`${squad.arrow} ${squad.arrowLeft}`}
            aria-label="Previous squad"
          >
            <OriginalImage asset={SQUAD_ASSETS.arrowLeft} />
          </Link>
          <Link
            href={`/squad?slot=${stepSquadSlot(slot, 1)}`}
            className={`${squad.arrow} ${squad.arrowRight}`}
            aria-label="Next squad"
          >
            <OriginalImage asset={SQUAD_ASSETS.arrowRight} />
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
                <OriginalImage
                  asset={i === slot ? SQUAD_ASSETS.dotOn : SQUAD_ASSETS.dotOff}
                  className={squad.dotArt}
                />
              </Link>
            ))}
          </nav>
          <span className={`${squad.squadTab} ${kit.text}`}>Squad {slot + 1}</span>
        </section>
        <button
          type="button"
          className={squad.skill}
          aria-label="Leader Skill"
          aria-haspopup="dialog"
          onClick={() => skillDialog.current?.showModal()}
        >
          <OriginalImage asset={SQUAD_ASSETS.skill} className={squad.skillArt} />
          <span className={`${squad.skillName} ${kit.text}`}>{skill?.name ?? "None"}</span>
          <div className={squad.skillEffects}>
            <SkillText text={skill?.effects.join(" · ") ?? "No Leader Skill"} />
          </div>
        </button>
      </div>
      <dialog ref={skillDialog} className={squad.skillDialog} aria-label="Leader Skill details">
        <OriginalWindow variant="system">
          <h2 className={kit.text}>{skill?.name ?? "None"}</h2>
          <p>{skill?.effects.join(" · ") ?? "No Leader Skill"}</p>
          <OriginalButton size="sub_m_btn" onClick={() => skillDialog.current?.close()}>
            Close
          </OriginalButton>
        </OriginalWindow>
      </dialog>
      <div className={squad.status} role="status">
        <OriginalTicker>
          {choosingLeader ? "Tap a squad member to make it the leader." : strip}
        </OriginalTicker>
      </div>
    </div>
  );
}

/** Idle sprite over its imported table; the centre stays the leader under BFR's saved rule. */
function Pedestal({
  spot,
  unit,
  isLeader,
  showDetails,
  action,
  onTap,
}: {
  spot: (typeof PEDESTAL_SPOTS)[number];
  unit: EditorUnit | undefined;
  isLeader: boolean;
  showDetails: boolean;
  action: string | undefined;
  onTap: (() => void) | undefined;
}): ReactNode {
  const body = (
    <>
      <OriginalImage asset={SQUAD_ASSETS.pedestal} className={squad.pedestalArt} />
      {unit?.sprite ? (
        <Image
          src={unit.sprite}
          alt=""
          width={128}
          height={128}
          className={squad.sprite}
          unoptimized
          draggable={false}
        />
      ) : unit ? (
        <span className={`${squad.initial} ${kit.text}`}>{unit.name.charAt(0)}</span>
      ) : (
        <span className={`${squad.empty} ${kit.text}`}>+</span>
      )}
      {isLeader ? <span className={`${squad.leaderTag} ${kit.text}`}>LEADER</span> : null}
      {unit && showDetails ? <StatPlate unit={unit} /> : null}
    </>
  );
  return onTap ? (
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
    <div className={squad.pedestal} data-spot={spot}>
      {body}
    </div>
  );
}

function StatPlate({ unit }: { unit: EditorUnit }): ReactNode {
  const stats = unit.stats;
  const value = (n: number | undefined): string => (n === undefined ? "–" : String(n));
  return (
    <span className={squad.statPlate}>
      <OriginalImage asset={SQUAD_ASSETS.frameCenter} className={squad.frameCenter} />
      <OriginalImage asset={SQUAD_ASSETS.frameLeft} className={squad.frameLeft} />
      <OriginalImage asset={SQUAD_ASSETS.frameRight} className={squad.frameRight} />
      {unit.element ? (
        <OriginalImage
          asset={`common/attribute_mark_M/${unit.element}.png`}
          className={squad.orb}
        />
      ) : null}
      <span className={`${squad.statLine} ${kit.text}`}>
        <span>
          <OriginalImage asset={SQUAD_ASSETS.level} className={squad.statLabel} alt="Lv." />{" "}
          {unit.level}
        </span>
        <span>
          <OriginalImage asset={SQUAD_ASSETS.hp} className={squad.statLabel} alt="HP" />{" "}
          {value(stats?.hp)}
        </span>
      </span>
      <span className={`${squad.statLine} ${kit.text}`}>
        <span>ATK {value(stats?.atk)}</span>
        <span>DEF {value(stats?.def)}</span>
        <span>REC {value(stats?.rec)}</span>
      </span>
    </span>
  );
}
