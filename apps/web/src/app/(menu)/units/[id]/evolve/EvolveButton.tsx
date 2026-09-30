"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { evolveUnit } from "./actions.ts";
import evolve from "./evolve.module.css";

/** Runs the evolution through the `evolveUnit` Server Action, then returns to the unit's page. */
export function EvolveButton({
  unitId,
  materialIds,
  label,
  disabled,
}: {
  unitId: string;
  materialIds: string[];
  label: string;
  disabled: boolean;
}): ReactNode {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(): void {
    setError(null);
    startTransition(async () => {
      const result = await evolveUnit(unitId, materialIds);
      if (result.ok) router.push(`/units/${unitId}`);
      else setError(result.message);
    });
  }

  return (
    <div className={evolve.actions}>
      <button type="button" className={evolve.button} onClick={run} disabled={disabled || pending}>
        {pending ? "Evolving…" : label}
      </button>
      {error ? (
        <p className={evolve.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
