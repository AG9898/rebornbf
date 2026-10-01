"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import menu from "../../../components/menu/menu.module.css";
import { textBoxStyle } from "../../../components/menu/text-box.ts";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import { UnitPicker } from "../../../components/units/UnitPicker.tsx";
import { FUSION_MINIMUM_NOTE, fusionPreview } from "../../../lib/units/fusion.ts";
import {
  addFodderPicks,
  baseIneligible,
  chooseBase,
  FODDER_SPOTS,
  type FusionDraft,
  fodderIneligible,
  fodderPedestals,
  fodderPickerEntries,
  freePedestals,
  removeFodderPedestal,
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
  stackCopies,
  stackQuantityTotal,
  type UnitStackRow,
} from "../../../lib/units/unit-stacks.ts";
import squad from "../squad/squad.module.css";
import units from "../units/units.module.css";
import { fuseUnits } from "./actions.ts";
import styles from "./fusion.module.css";

type Mode = "stage" | "base" | "fodder";

/**
 * The Fuse Units stage (M4-01B/C, restyled in M4-06D; ART_GUIDE → UI → Fusion stage): the base's
 * idle sprite on the centre pedestal with its stat plate, five fodder pedestals at the corners and
 * bottom centre, Change Base and Display Status in the title bar, and a Fuse pill that opens the
 * confirm. An empty pedestal opens the multi-select picker (M4-06N) for the base or the fodder; a
 * filled fodder pedestal removes that copy. The `fuse` RPC re-checks everything server-side.
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
    targetId:
      initialTarget &&
      rows.some((r) => r.id === initialTarget) &&
      !baseIneligible(entries).includes(initialTarget)
        ? initialTarget
        : "",
    fodderIds: [],
    stacks: {},
  }));
  const [mode, setMode] = useState<Mode>("stage");
  const [showStatus, setShowStatus] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const target = rows.find((r) => r.id === draft.targetId);
  const targetView = target ? toOwnedUnitView(target) : null;
  const fodderRows = [
    ...rows.filter((r) => draft.fodderIds.includes(r.id)),
    ...stackCopies(stacks, draft.stacks),
  ];
  const preview = target ? fusionPreview(target, fodderRows) : null;
  const pedestals = fodderPedestals(draft);
  const copies = draft.fodderIds.length + stackQuantityTotal(draft.stacks);
  const canFuse = preview !== null && preview.problem === null && copies > 0 && zel >= preview.cost;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  const baseDimmed = useMemo(() => baseIneligible(entries), [entries]);
  const fodderEntries = useMemo(() => fodderPickerEntries(entries, draft), [entries, draft]);
  const fodderDimmed = useMemo(
    () => fodderIneligible(fodderEntries, blocked),
    [fodderEntries, blocked],
  );

  function update(next: FusionDraft): void {
    setDraft(next);
    setConfirming(false);
    setMessage(null);
  }

  function fuse(): void {
    startTransition(async () => {
      try {
        const result = await fuseUnits(draft.targetId, [...draft.fodderIds], draft.stacks);
        setMessage({ ok: result.ok, text: result.message });
        setConfirming(false);
        if (result.ok) {
          setDraft({ ...draft, fodderIds: [], stacks: {} });
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
      <UnitPicker
        title="Select Units"
        units={fodderEntries}
        limit={freePedestals(draft)}
        ineligible={fodderDimmed}
        party={blocked}
        backHref="/fusion"
        onBack={() => setMode("stage")}
        ticker="Select units to fuse. Squad and ally units are protected."
        onConfirm={(result) => {
          update(addFodderPicks(draft, result));
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
        ? "Tap an empty pedestal to add fodder. Fodder is consumed permanently."
        : (preview?.problem ??
          (zel < (preview?.cost ?? 0) ? "Not enough Zel." : "Tap a fodder unit to remove it."));

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
                disabled={pending || (!pedestal && !targetView)}
                onTap={() => {
                  if (pedestal) update(removeFodderPedestal(draft, index));
                  else setMode("fodder");
                }}
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
            Fodder {copies}/{FUSION_FODDER_LIMIT}
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
                onClick={fuse}
              >
                <span className={units.outline}>{pending ? "Fusing" : "Confirm"}</span>
              </button>
              <button
                type="button"
                className={`${units.pill} ${units.pillButton} ${styles.panelPill}`}
                disabled={pending}
                onClick={() => setConfirming(false)}
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
          ? "Tap an empty pedestal to add fodder, or a fodder unit to remove it."
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

/** A fodder pedestal: the fodder's sprite and level, or an empty stone with a plus. */
function FodderPedestal({
  spot,
  unit,
  disabled,
  onTap,
}: {
  spot: (typeof FODDER_SPOTS)[number];
  unit: CollectionEntry | undefined;
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
      aria-label={unit ? `Remove ${unit.name} from the fodder` : "Add fodder"}
    >
      <UiImage name="squad-pedestal" className={`${squad.pedestalArt} ${styles.fodderStone}`} />
      <PedestalSprite unit={unit} className={styles.fodderSprite} />
      {unit ? (
        <span className={`${styles.fodderLevel} ${units.outline}`}>Lv.{unit.level}</span>
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
