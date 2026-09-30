"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import styles from "../../units.module.css";
import { splitStack } from "./actions.ts";

/**
 * Splits one copy out of a stack through the `splitStack` Server Action (M4-05C), then opens the
 * new ordinary unit's detail page, where it can be enhanced, evolved, or fielded.
 */
export function SplitButton({ stackId }: { stackId: string }): ReactNode {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await splitStack(stackId);
        if (result.ok) router.push(`/units/${result.unitId}`);
        else setError(result.message);
      } catch {
        setError("Could not reach the server. Try again.");
      }
    });
  }

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={`${styles.actionButton} ${styles.enhanceButton}`}
        onClick={run}
        disabled={pending}
      >
        <span className={styles.outline}>{pending ? "Splitting…" : "Split"}</span>
      </button>
      {error ? (
        <p className={styles.splitError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
