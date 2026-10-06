"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { LoadingGlyph } from "../../../components/loading/LoadingGlyph.tsx";
import menu from "../../../components/menu/menu.module.css";
import { gameAudio } from "../../../game/audio/index.ts";
import { audioLevels, type BattleSettingsDraft } from "../../../lib/settings/player-settings.ts";
import { saveBattleSettings } from "./actions.ts";
import styles from "./settings.module.css";

const VOLUMES = [
  { key: "musicVolume", label: "Music volume", hint: "Menu and battle themes." },
  { key: "sfxVolume", label: "SFX volume", hint: "Hits, sparks, bursts, and menu sounds." },
] as const;

/**
 * Edits the battle settings and the music and SFX volumes, and saves them together. Volume
 * changes play live through the shared audio player (M7-01_4); leaving with unsaved volumes puts
 * the saved levels back. The other settings apply from the next battle.
 */
export default function SettingsForm({ initial }: { initial: BattleSettingsDraft }): ReactNode {
  const [draft, setDraft] = useState<BattleSettingsDraft>(initial);
  const [saved, setSaved] = useState<BattleSettingsDraft>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const dirty =
    draft.sparkAssist !== saved.sparkAssist ||
    draft.battleSpeed !== saved.battleSpeed ||
    draft.reducedMotion !== saved.reducedMotion ||
    draft.musicVolume !== saved.musicVolume ||
    draft.sfxVolume !== saved.sfxVolume;

  // Unsaved volume previews end with the screen: the player hears the saved levels again.
  useEffect(() => () => gameAudio().setVolume(audioLevels(savedRef.current)), []);

  function update(change: Partial<BattleSettingsDraft>): void {
    const next = { ...draft, ...change };
    setDraft(next);
    setMessage(undefined);
    if ("musicVolume" in change || "sfxVolume" in change) {
      gameAudio().setVolume(audioLevels(next));
    }
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveBattleSettings(draft);
      if (result.ok) {
        setSaved(draft);
        setMessage({ ok: true, text: "Saved. Battle changes apply from your next battle." });
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

      {VOLUMES.map(({ key, label, hint }) => (
        <label key={key} className={`${styles.row} ${styles.volumeRow}`}>
          <span className={styles.label}>
            {label}
            <span className={styles.hint}>{hint}</span>
          </span>
          <span className={styles.volume}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              className={styles.slider}
              value={draft[key]}
              onChange={(event) => update({ [key]: Number(event.target.value) })}
              onPointerUp={() => {
                if (key === "sfxVolume") gameAudio().playSfx("ui-confirm");
              }}
            />
            <output className={styles.volumeValue}>{draft[key]}</output>
          </span>
        </label>
      ))}

      <button type="submit" className={menu.panelLink} disabled={pending || !dirty}>
        {pending ? <LoadingGlyph /> : "Save"}
      </button>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={menu.panelText}>
          {message.text}
        </p>
      )}
    </form>
  );
}
