"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { LoadingGlyph } from "../../../components/loading/LoadingGlyph.tsx";
import menu from "../../../components/menu/menu.module.css";
import { textBoxStyle } from "../../../components/menu/text-box.ts";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import { UnitPicker } from "../../../components/units/UnitPicker.tsx";
import { gameAudio } from "../../../game/audio/index.ts";
import { FUSION_MINIMUM_NOTE, fusionPreview } from "../../../lib/units/fusion.ts";
import { type FusionResultView, fusionResultView } from "../../../lib/units/fusion-result.ts";
import {
  baseIneligible,
  chooseBase,
  clearFodder,
  draftCopies,
  draftFodderIds,
  draftFodderRows,
  draftStacks,
  EMPTY_DRAFT,
  FODDER_SPOTS,
  type FusionDraft,
} from "../../../lib/units/fusion-stage.ts";
import {
  type OwnedUnitRow,
  type OwnedUnitView,
  toOwnedUnitView,
} from "../../../lib/units/owned-units.ts";
import {
  type CollectionEntry,
  collectionEntries,
  FUSION_FODDER_LIMIT,
  type UnitStackRow,
} from "../../../lib/units/unit-stacks.ts";
import squad from "../squad/squad.module.css";
import units from "../units/units.module.css";
import { fuseUnits } from "./actions.ts";
import { FodderPicker } from "./FodderPicker.tsx";
import { type FlyingFodder, FusionResult } from "./FusionResult.tsx";
import styles from "./fusion.module.css";

type Mode = "stage" | "base" | "fodder";

/** A finished fusion being shown: the fly-in's sprites and the result screen (M4-06E). */
type Fused = {
  baseName: string;
  baseSprite: string | null;
  fodder: FlyingFodder[];
  result: FusionResultView;
};

/**
 * The Fuse Units stage (M4-01B/C, restyled in M4-06D; ART_GUIDE → UI → Fusion stage): the base's
 * idle sprite on the centre pedestal with its stat plate, five fodder pedestals at the corners and
 * bottom centre, Change Base and Display Status in the title bar, and a Fuse pill that opens the
 * confirm. The empty base opens the multi-select picker (M4-06N); each fodder pedestal is one slot
 * (sprite and ×N, RESOLVED-90) and any of them opens the tap/hold fodder picker (M4-01F) with the
 * current slots. The `fuse` RPC re-checks everything server-side. A successful fusion plays the
 * fly-in animation and the result screen (M4-06E, `FusionResult`); Skip returns to this stage with
 * the refreshed base.
 */
export function FusionEditor({
  rows,
  stacks,
  blocked,
  zel,
  initialTarget,
}: {
  rows: OwnedUnitRow[];
  stacks: UnitStackRow[];
  blocked: string[];
  zel: number;
  initialTarget?: string;
}): ReactNode {
  const router = useRouter();
  const entries = useMemo(() => collectionEntries(rows, stacks), [rows, stacks]);
  const [draft, setDraft] = useState<FusionDraft>(() => ({
    ...EMPTY_DRAFT,
    targetId:
      initialTarget &&
      rows.some((r) => r.id === initialTarget) &&
      !baseIneligible(entries, rows).includes(initialTarget)
        ? initialTarget
        : "",
  }));
  const [mode, setMode] = useState<Mode>("stage");
  const [showStatus, setShowStatus] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [fused, setFused] = useState<Fused | null>(null);

  const target = rows.find((r) => r.id === draft.targetId);
  const targetView = target ? toOwnedUnitView(target) : null;
  const fodderIds = draftFodderIds(draft);
  const fodderRows = draftFodderRows(draft, rows, stacks);
  const preview = target ? fusionPreview(target, fodderRows) : null;
  const pedestals = draft.slots;
  const copies = draftCopies(draft);
  const canFuse = preview !== null && preview.problem === null && copies > 0 && zel >= preview.cost;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  const baseDimmed = useMemo(() => baseIneligible(entries, rows), [entries, rows]);

  function update(next: FusionDraft): void {
    setDraft(next);
    setConfirming(false);
    setMessage(null);
  }

  function fuse(): void {
    // Snapshot the stage before the draft clears: the base row and the fodder sprites per spot.
    const before = target;
    const imps = preview?.imps;
    const flying: FlyingFodder[] = pedestals.flatMap((pedestal, index) => {
      const unit = byId.get(pedestal.id);
      const spot = FODDER_SPOTS[index];
      return unit && spot ? [{ spot, name: unit.name, sprite: unit.sprite }] : [];
    });
    startTransition(async () => {
      try {
        const result = await fuseUnits(draft.targetId, fodderIds, draftStacks(draft));
        setMessage({ ok: result.ok, text: result.message });
        setConfirming(false);
        if (result.ok) {
          if (before && result.response) {
            const view = toOwnedUnitView(before);
            setFused({
              baseName: view.name,
              baseSprite: view.sprite,
              fodder: flying,
              result: fusionResultView(before, result.response, imps),
            });
          }
          setDraft(clearFodder(draft));
          router.refresh();
        }
      } catch {
        setMessage({
          ok: false,
          text: "Could not reach fusion. Reload your collection before trying again.",
        });
        setConfirming(false);
      }
    });
  }

  if (fused) {
    return (
      <FusionResult
        baseName={fused.baseName}
        baseSprite={fused.baseSprite}
        fodder={fused.fodder}
        result={fused.result}
        onSkip={() => setFused(null)}
      />
    );
  }

  if (mode === "base") {
    return (
      <UnitPicker
        title="Select Base"
        units={entries}
        limit={1}
        ineligible={baseDimmed}
        party={blocked}
        initialPicks={draft.targetId ? [{ id: draft.targetId, copies: 1 }] : []}
        backHref="/fusion"
        onBack={() => setMode("stage")}
        ticker="Select the unit to level up."
        onConfirm={(result) => {
          const picked = result.unitIds[0];
          if (picked) update(chooseBase(draft, picked));
          setMode("stage");
        }}
      />
    );
  }

  if (mode === "fodder") {
    return (
      <FodderPicker
        entries={entries}
        rows={rows}
        stacks={stacks}
        blocked={blocked}
        initialDraft={draft}
        onBack={() => setMode("stage")}
        onConfirm={(next) => {
          update(next);
          setMode("stage");
        }}
      />
    );
  }

  const strip = message
    ? message.text
    : !targetView
      ? rows.length === 0
        ? "You have no units to level yet. Play the story to collect units."
        : "Tap the centre pedestal to choose the unit to level."
      : copies === 0
        ? "Tap a fodder pedestal to add fodder. Fodder is consumed permanently."
        : (preview?.problem ??
          (zel < (preview?.cost ?? 0)
            ? "Not enough Zel."
            : "Tap a fodder pedestal to change the fodder."));

  return (
    <div className={squad.page}>
      <header className={units.titleBar}>
        <Link href="/units" className={`${units.pill} ${units.backButton}`}>
          <span className={units.outline}>Back</span>
        </Link>
        <div className={`${units.titlePlate} ${styles.titlePlate}`}>
          <UiImage name="title-plate" className={units.titlePlateArt} />
          <div className={units.titleText} style={textBoxStyle("title-plate")}>
            <h1 className={units.outline}>Fuse Units</h1>
          </div>
        </div>
        <button
          type="button"
          className={`${units.pill} ${squad.barButton} ${styles.barButton}`}
          onClick={() => setMode("base")}
          disabled={pending || entries.length === 0}
        >
          <span className={units.outline}>Change Base</span>
        </button>
        <button
          type="button"
          className={`${units.pill} ${squad.barButton} ${styles.barButton} ${showStatus ? squad.barButtonLit : ""}`}
          onClick={() => setShowStatus((on) => !on)}
          aria-pressed={showStatus}
        >
          <span className={units.outline}>Display Status</span>
        </button>
      </header>

      <div className={squad.body}>
        <section className={styles.stage} aria-label="Fusion stage">
          <BasePedestal
            unit={targetView}
            disabled={pending || entries.length === 0}
            onTap={() => setMode("base")}
          />
          {FODDER_SPOTS.map((spot, index) => {
            const pedestal = pedestals[index];
            const unit = pedestal ? byId.get(pedestal.id) : undefined;
            return (
              <FodderPedestal
                key={spot}
                spot={spot}
                unit={unit}
                copies={pedestal?.copies ?? 0}
                disabled={pending || !targetView}
                onTap={() => setMode("fodder")}
              />
            );
          })}
        </section>

        <p
          className={`${squad.plate} ${squad.strip} ${message && !message.ok ? squad.stripError : ""}`}
          role="status"
        >
          {strip}
        </p>

        <div className={styles.fuseBar}>
          <span className={`${squad.plate} ${styles.zelPlate}`}>
            <UiImage name="icon-zel" className={styles.zelIcon} />
            <span className={units.outline}>{zel.toLocaleString("en-US")}</span>
          </span>
          <span className={`${styles.fodderCount} ${units.outline}`}>
            Slots {pedestals.length}/{FUSION_FODDER_LIMIT} · ×{copies}
          </span>
          <button
            type="button"
            className={`${units.pill} ${units.pillButton} ${styles.fusePill} ${canFuse ? squad.barButtonLit : ""}`}
            disabled={pending || !canFuse || confirming}
            onClick={() => setConfirming(true)}
          >
            <span className={units.outline}>Fuse</span>
          </button>
        </div>

        {confirming && preview ? (
          <section className={`${squad.plate} ${styles.panel}`} aria-label="Confirm fusion">
            <p>
              Consume {copies} selected {copies === 1 ? "unit" : "units"} for{" "}
              {preview.cost.toLocaleString("en-US")} Zel?
            </p>
            <div className={styles.panelButtons}>
              <button
                type="button"
                className={`${units.pill} ${units.pillButton} ${styles.panelPill} ${squad.barButtonLit}`}
                disabled={pending || !canFuse}
                onClick={() => {
                  gameAudio().playSfx("ui-confirm");
                  fuse();
                }}
              >
                <span className={units.outline}>{pending ? <LoadingGlyph /> : "Confirm"}</span>
              </button>
              <button
                type="button"
                className={`${units.pill} ${units.pillButton} ${styles.panelPill}`}
                disabled={pending}
                onClick={() => {
                  gameAudio().playSfx("ui-cancel");
                  setConfirming(false);
                }}
              >
                <span className={units.outline}>Cancel</span>
              </button>
            </div>
          </section>
        ) : null}

        {showStatus ? (
          <section
            className={`${squad.plate} ${styles.panel}`}
            aria-label="Fusion status"
            aria-live="polite"
          >
            {!preview || !target ? (
              <p>Choose a base unit to see the fusion result.</p>
            ) : (
              <>
                <p>EXP gained: at least {preview.gain.toLocaleString("en-US")}</p>
                <p className={styles.note}>{FUSION_MINIMUM_NOTE}</p>
                <p>
                  Level {target.level} → {preview.level} · Total EXP{" "}
                  {preview.exp.toLocaleString("en-US")}
                </p>
                <p>
                  BB {target.bb_level ?? 1} → {preview.bbLevel}
                  {preview.sbbLevel !== null
                    ? ` · SBB ${target.sbb_level ?? 1} → ${preview.sbbLevel}`
                    : ""}
                </p>
                {preview.burstDiscarded > 0 && (
                  <p>
                    {preview.burstDiscarded} burst levels exceed the available caps and will be
                    lost.
                  </p>
                )}
                <p>Cost: {preview.cost.toLocaleString("en-US")} Zel</p>
                {preview.discarded > 0 && (
                  <p>
                    {preview.discarded.toLocaleString("en-US")} EXP exceeds the level cap and will
                    be lost.
                  </p>
                )}
                {zel < preview.cost && <p>Not enough Zel.</p>}
                {preview.problem && <p>{preview.problem}</p>}
              </>
            )}
          </section>
        ) : null}
      </div>

      <p className={menu.ticker}>
        {targetView
          ? "Tap a fodder pedestal to pick fodder."
          : "Tap the centre pedestal to choose a base unit."}
      </p>
    </div>
  );
}

/** A pedestal's sprite (or initial) standing on the stone. */
function PedestalSprite({
  unit,
  className = "",
}: {
  unit: OwnedUnitView | undefined | null;
  className?: string;
}): ReactNode {
  if (!unit) return null;
  return unit.sprite ? (
    <Image
      src={unit.sprite}
      alt=""
      width={128}
      height={128}
      className={`${squad.sprite} ${className}`}
      unoptimized
      draggable={false}
    />
  ) : (
    <span className={`${squad.noSprite} ${units.outline}`}>{unit.name.charAt(0)}</span>
  );
}

/** The centre pedestal: the base's sprite and its two-line stat plate, or an empty stone. */
function BasePedestal({
  unit,
  disabled,
  onTap,
}: {
  unit: OwnedUnitView | null;
  disabled: boolean;
  onTap: () => void;
}): ReactNode {
  const s = unit?.currentStats;
  const value = (n: number | undefined) => (n === undefined ? "–" : String(n));
  return (
    <button
      type="button"
      className={`${squad.pedestal} ${styles.base} ${unit ? "" : squad.pedestalEmpty}`}
      onClick={onTap}
      disabled={disabled}
      aria-label={unit ? `Base: ${unit.name}, Lv ${unit.level}. Change base` : "Choose a base unit"}
    >
      <UiImage name="squad-pedestal" className={squad.pedestalArt} />
      <PedestalSprite unit={unit} />
      {unit ? (
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
      ) : (
        <span className={`${styles.emptyMark} ${units.outline}`} aria-hidden>
          Base
        </span>
      )}
    </button>
  );
}

/** A fodder pedestal (one slot): the fodder's sprite, ×N, and level, or an empty stone with a plus. */
function FodderPedestal({
  spot,
  unit,
  copies,
  disabled,
  onTap,
}: {
  spot: (typeof FODDER_SPOTS)[number];
  unit: CollectionEntry | undefined;
  copies: number;
  disabled: boolean;
  onTap: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className={`${squad.pedestal} ${styles.fodder} ${unit ? "" : squad.pedestalEmpty}`}
      data-spot={spot}
      onClick={onTap}
      disabled={disabled}
      aria-label={unit ? `Fodder: ${unit.name} ×${copies}. Change fodder` : "Add fodder"}
    >
      <UiImage name="squad-pedestal" className={`${squad.pedestalArt} ${styles.fodderStone}`} />
      <PedestalSprite unit={unit} className={styles.fodderSprite} />
      {unit ? (
        <>
          <span className={`${styles.pedestalCount} ${units.outline}`}>×{copies}</span>
          <span className={`${styles.fodderLevel} ${units.outline}`}>Lv.{unit.level}</span>
        </>
      ) : (
        <span className={`${styles.emptyMark} ${units.outline}`} aria-hidden>
          +
        </span>
      )}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <span className={`${squad.stat} ${units.outline}`}>
      <span className={squad.statLabel}>{label}</span> {value}
    </span>
  );
}
