"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { textBoxStyle } from "../../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../../components/menu/UiImage.tsx";
import type { EvolveBlocker } from "../../../../../lib/units/evolution.ts";
import units from "../../units.module.css";
import { evolveUnit } from "./actions.ts";
import evolve from "./evolve.module.css";

/**
 * The evolve screen's bottom bar (M4-06L): the blue `btn-hub` Evolve button, the Zel Cost plate,
 * and a red status strip naming what is short (or the RPC's refusal). The button runs the
 * evolution through the `evolveUnit` Server Action, then returns to the unit's page.
 */
export function EvolveButton({
  unitId,
  materialIds,
  materialStacks,
  label,
  zel,
  blockers,
}: {
  unitId: string;
  materialIds: string[];
  /** Stacked copies to spend, `{ "<stack id>": copies }` (M4-05C). */
  materialStacks: Record<string, number>;
  label: string;
  zel: number;
  /** Why the evolution cannot run; empty when it can. */
  blockers: readonly EvolveBlocker[];
}): ReactNode {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const disabled = blockers.length > 0 || pending;

  function run(): void {
    setError(null);
    startTransition(async () => {
      const result = await evolveUnit(unitId, materialIds, materialStacks);
      if (result.ok) router.push(`/units/${unitId}`);
      else setError(result.message);
    });
  }

  const strip = error ?? (blockers.length > 0 ? blockers.join(" · ") : null);
  return (
    <div className={evolve.bottom}>
      {strip ? (
        <p className={`${evolve.strip} ${units.outline}`} role={error ? "alert" : "status"}>
          {strip}
        </p>
      ) : null}
      <div className={evolve.bar}>
        <button type="button" className={evolve.button} onClick={run} disabled={disabled}>
          <UiImage name="btn-hub" className={evolve.buttonArt} />
          <span className={`${evolve.buttonText} ${units.outline}`} style={textBoxStyle("btn-hub")}>
            {pending ? "Evolving…" : label}
          </span>
        </button>
        <div className={evolve.zelPlate}>
          <span className={`${evolve.zelLabel} ${units.outline}`}>Zel Cost</span>
          <span className={evolve.zelValue}>
            <UiImage name="icon-zel" alt="Zel" className={evolve.zelIcon} />
            <span className={units.outline}>{zel.toLocaleString("en-US")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
