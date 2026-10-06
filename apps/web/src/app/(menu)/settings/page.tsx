import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "../../../components/menu/menu.module.css";
import {
  type AutoSettingsUnit,
  autoSettingsUnits,
  type PlayerSettings,
} from "../../../lib/settings/player-settings.ts";
import type { SquadRow } from "../../../lib/squad/squad-editor.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import {
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  toOwnedUnitView,
} from "../../../lib/units/owned-units.ts";
import { loadPlayerSettings } from "../../../server/player-settings.ts";
import AutoSettingsForm from "./AutoSettingsForm.tsx";
import SettingsForm from "./SettingsForm.tsx";
import settingsStyles from "./settings.module.css";

export const metadata: Metadata = { title: "Settings · BFR" };

/**
 * The saved squads' members and the saved modes still keyed by owned units, for the auto-battle
 * settings (M7-01_3). Null when the read fails, so the form cannot overwrite unread modes.
 */
async function loadAutoUnits(
  settings: PlayerSettings,
): Promise<ReturnType<typeof autoSettingsUnits> | null> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) return null;
  const [unitsResult, squadsResult] = await Promise.all([
    supabase
      .from("owned_units")
      .select(OWNED_UNIT_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<OwnedUnitRow[], { merge: false }>(),
    supabase
      .from("squads")
      .select("slot, unit_ids")
      .eq("user_id", userId)
      .overrideTypes<Pick<SquadRow, "slot" | "unit_ids">[], { merge: false }>(),
  ]);
  if (unitsResult.error || squadsResult.error) return null;
  return autoSettingsUnits(
    squadsResult.data ?? [],
    (unitsResult.data ?? []).map(toOwnedUnitView),
    settings.unitAutoModes,
  );
}

/**
 * The settings screen (M7-01_2): spark assist, default battle speed, reduced motion, and the music
 * and SFX volumes (M7-01_4), plus the
 * auto-battle advanced settings (M7-01_3), read with `get_settings` and saved with `save_settings`.
 * Protected (`/settings`); when a read fails its form is not shown, so saving cannot overwrite
 * values that were never loaded.
 */
export default async function SettingsPage(): Promise<ReactNode> {
  const { settings, failed } = await loadPlayerSettings();
  const auto = failed ? null : await loadAutoUnits(settings);
  const failedText = "Your settings could not be loaded. Try again shortly.";
  return (
    <div className={`${styles.placeholder} ${settingsStyles.stack}`}>
      <section className={styles.panel}>
        <h1 className={`${styles.panelTitle} ${styles.gold}`}>Settings</h1>
        {failed ? (
          <p role="alert" className={styles.panelText}>
            {failedText}
          </p>
        ) : (
          <SettingsForm
            initial={{
              sparkAssist: settings.sparkAssist,
              battleSpeed: settings.battleSpeed,
              reducedMotion: settings.reducedMotion,
              musicVolume: settings.musicVolume,
              sfxVolume: settings.sfxVolume,
            }}
          />
        )}
      </section>
      <section className={styles.panel}>
        <h2 className={`${styles.panelTitle} ${styles.gold}`}>Auto battle</h2>
        {auto === null ? (
          <p role="alert" className={styles.panelText}>
            {failedText}
          </p>
        ) : (
          <AutoSettingsForm
            units={auto.units satisfies AutoSettingsUnit[]}
            initial={{
              unitAutoModes: auto.modes,
              sbbPriority: settings.sbbPriority,
              forcedBbPriority: settings.forcedBbPriority,
              odUbbPriority: settings.odUbbPriority,
            }}
          />
        )}
      </section>
    </div>
  );
}
