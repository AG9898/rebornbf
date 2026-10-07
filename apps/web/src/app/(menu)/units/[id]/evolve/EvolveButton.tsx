"use client";

import { type ReactNode, useState, useTransition } from "react";
import { LoadingGlyph } from "../../../../../components/loading/LoadingGlyph.tsx";
import kit from "../../../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../../../components/menu/OriginalImage.tsx";
import type { EvolveBlocker } from "../../../../../lib/units/evolution.ts";
import { EVOLVE_ASSETS } from "../../../../../lib/units/evolve-screen.ts";
import { evolveUnit } from "./actions.ts";
import type { EvolveCinematicView } from "./EvolveCinematic.tsx";
import { usePlayEvolveCinematic } from "./EvolveHost.tsx";
import evolve from "./evolve.module.css";

/** Original Evolve action strip; server authority and cinematic snapshot stay unchanged. */
export function EvolveButton({
  unitId,
  materialIds,
  materialStacks,
  label,
  zel,
  blockers,
  cinematic,
}: {
  unitId: string;
  materialIds: string[];
  /** Stacked copies to spend, `{ "<stack id>": copies }` (M4-05C). */
  materialStacks: Record<string, number>;
  label: string;
  zel: number;
  /** Why the evolution cannot run; empty when it can. */
  blockers: readonly EvolveBlocker[];
  /** What the cinematic shows once the evolution succeeds. */
  cinematic: EvolveCinematicView;
}): ReactNode {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const playCinematic = usePlayEvolveCinematic();
  const disabled = blockers.length > 0 || pending;

  function run(): void {
    setError(null);
    startTransition(async () => {
      const result = await evolveUnit(unitId, materialIds, materialStacks);
      if (result.ok) playCinematic(cinematic);
      else setError(result.message);
    });
  }

  const strip = error ?? (blockers.length > 0 ? blockers.join(" · ") : null);
  return (
    <div className={evolve.bottom}>
      {strip ? (
        <p className={`${evolve.strip} ${kit.text}`} role={error ? "alert" : "status"}>
          {strip}
        </p>
      ) : null}
      <div className={evolve.bar}>
        <OriginalImage asset={EVOLVE_ASSETS.plate} className={evolve.barArt} />
        <button
          type="button"
          className={`${kit.button} ${evolve.button}`}
          aria-label={label}
          onClick={run}
          disabled={disabled}
        >
          <OriginalImage asset={EVOLVE_ASSETS.normal} className={`${kit.normal} ${kit.layer}`} />
          <OriginalImage asset={EVOLVE_ASSETS.pressed} className={`${kit.pressed} ${kit.layer}`} />
          <OriginalImage
            asset={EVOLVE_ASSETS.labelNormal}
            className={`${kit.normal} ${kit.layer}`}
          />
          <OriginalImage
            asset={EVOLVE_ASSETS.labelPressed}
            className={`${kit.pressed} ${kit.layer}`}
          />
        </button>
        <div className={`${evolve.zelPlate} ${kit.text}`}>
          <span className={evolve.zelLabel}>Zel Cost</span>
          <span className={evolve.zelValue}>{zel.toLocaleString("en-US")}</span>
        </div>
      </div>
      {pending ? <LoadingGlyph variant="screen" /> : null}
    </div>
  );
}
