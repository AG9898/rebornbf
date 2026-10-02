"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import menu from "../../../components/menu/menu.module.css";
import type { BattleSettingsDraft } from "../../../lib/settings/player-settings.ts";
import { saveBattleSettings } from "./actions.ts";
import styles from "./settings.module.css";

/** Edits the battle settings and saves them together; changes apply from the next battle. */
export default function SettingsForm({ initial }: { initial: BattleSettingsDraft }): ReactNode {
  const [draft, setDraft] = useState<BattleSettingsDraft>(initial);
  const [saved, setSaved] = useState<BattleSettingsDraft>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const dirty =
    draft.sparkAssist !== saved.sparkAssist ||
    draft.battleSpeed !== saved.battleSpeed ||
    draft.reducedMotion !== saved.reducedMotion;

  function update(change: Partial<BattleSettingsDraft>): void {
    setDraft((current) => ({ ...current, ...change }));
    setMessage(undefined);
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveBattleSettings(draft);
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
      <label className={styles.row}>
        <span className={styles.label}>
          Spark assist
          <span className={styles.hint}>Widens the spark timing window to make sparks easier.</span>
        </span>
        <input
          type="checkbox"
          className={styles.toggle}
          checked={draft.sparkAssist}
          onChange={(event) => update({ sparkAssist: event.target.checked })}
        />
      </label>

      <fieldset className={styles.row}>
        <legend className={styles.label}>
          Default battle speed
          <span className={styles.hint}>The Speed button in battle still switches it.</span>
        </legend>
        <span className={styles.choices}>
          {([1, 2] as const).map((speed) => (
            <label key={speed} className={styles.choice}>
              <input
                type="radio"
                name="battle-speed"
                value={speed}
                checked={draft.battleSpeed === speed}
                onChange={() => update({ battleSpeed: speed })}
              />
              x{speed}
            </label>
          ))}
        </span>
      </fieldset>

      <label className={styles.row}>
        <span className={styles.label}>
          Reduced motion
          <span className={styles.hint}>
            Removes lunges, slides, and drifting numbers in battle.
          </span>
        </span>
        <input
          type="checkbox"
          className={styles.toggle}
          checked={draft.reducedMotion}
          onChange={(event) => update({ reducedMotion: event.target.checked })}
        />
      </label>

      <button type="submit" className={menu.panelLink} disabled={pending || !dirty}>
        {pending ? "Saving…" : "Save"}
      </button>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={menu.panelText}>
          {message.text}
        </p>
      )}
    </form>
  );
}
