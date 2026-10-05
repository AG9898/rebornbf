"use client";

import { AUTO_UNIT_MODES, type AutoUnitMode } from "@bfr/engine";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { LoadingGlyph } from "../../../components/loading/LoadingGlyph.tsx";
import menu from "../../../components/menu/menu.module.css";
import type { AutoSettingsDraft, AutoSettingsUnit } from "../../../lib/settings/player-settings.ts";
import { saveAutoSettings } from "./actions.ts";
import styles from "./settings.module.css";

/** The original's labels for the per-unit modes. */
const MODE_LABELS: Record<AutoUnitMode, string> = {
  auto: "Auto",
  bb: "BB",
  sbb: "SBB",
  ubb: "UBB",
  guard: "Guard",
  attack: "Attack",
};

const TOGGLES = [
  {
    key: "sbbPriority",
    label: "SBB priority",
    hint: "Auto units hold their gauge for the SBB instead of firing the BB.",
  },
  {
    key: "forcedBbPriority",
    label: "Forced BB priority",
    hint: "BB, SBB, and UBB units use only their chosen burst.",
  },
  {
    key: "odUbbPriority",
    label: "OD & UBB priority",
    hint: "The first Auto unit able to enters Overdrive with a full OD gauge and uses its UBB.",
  },
] as const;

function modeOf(draft: AutoSettingsDraft, id: string): AutoUnitMode {
  return draft.unitAutoModes[id] ?? "auto";
}

function same(a: AutoSettingsDraft, b: AutoSettingsDraft, ids: readonly string[]): boolean {
  return (
    a.sbbPriority === b.sbbPriority &&
    a.forcedBbPriority === b.forcedBbPriority &&
    a.odUbbPriority === b.odUbbPriority &&
    ids.every((id) => modeOf(a, id) === modeOf(b, id))
  );
}

/**
 * Edits the Auto Battle Advance Settings (M7-01_3): a mode per saved squad member and the three
 * priority toggles, saved together. Applies from the next battle, which freezes them.
 */
export default function AutoSettingsForm({
  units,
  initial,
}: {
  units: readonly AutoSettingsUnit[];
  initial: AutoSettingsDraft;
}): ReactNode {
  const [draft, setDraft] = useState<AutoSettingsDraft>(initial);
  const [saved, setSaved] = useState<AutoSettingsDraft>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const dirty = !same(
    draft,
    saved,
    units.map((unit) => unit.id),
  );

  function update(change: Partial<AutoSettingsDraft>): void {
    setDraft((current) => ({ ...current, ...change }));
    setMessage(undefined);
  }

  function setMode(id: string, mode: AutoUnitMode): void {
    update({ unitAutoModes: { ...draft.unitAutoModes, [id]: mode } });
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveAutoSettings(draft);
      if (result.ok) {
        setSaved(draft);
        setMessage({ ok: true, text: "Saved. Changes apply from your next battle." });
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h3 className={styles.subheading}>Unit modes</h3>
      {units.length === 0 ? (
        <p className={menu.panelText}>Save a squad to set its units' auto modes.</p>
      ) : (
        units.map((unit) => (
          <label key={unit.id} className={styles.row}>
            <span className={styles.unitName}>
              {unit.name}
              <span className={styles.hint}>
                {unit.rarityLabel} · Lv {unit.level} · Squad {unit.squads.join(", ")}
              </span>
            </span>
            <select
              className={styles.select}
              value={modeOf(draft, unit.id)}
              onChange={(event) => setMode(unit.id, event.target.value as AutoUnitMode)}
            >
              {AUTO_UNIT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
        ))
      )}

      <h3 className={styles.subheading}>Priorities</h3>
      {TOGGLES.map((toggle) => (
        <label key={toggle.key} className={styles.row}>
          <span className={styles.label}>
            {toggle.label}
            <span className={styles.hint}>{toggle.hint}</span>
          </span>
          <input
            type="checkbox"
            className={styles.toggle}
            checked={draft[toggle.key]}
            onChange={(event) => update({ [toggle.key]: event.target.checked })}
          />
        </label>
      ))}

      <button type="submit" className={menu.panelLink} disabled={pending || !dirty}>
        {pending ? <LoadingGlyph /> : "Save auto battle"}
      </button>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={menu.panelText}>
          {message.text}
        </p>
      )}
    </form>
  );
}
