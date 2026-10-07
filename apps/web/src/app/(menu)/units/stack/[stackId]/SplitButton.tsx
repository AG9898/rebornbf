"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { LoadingGlyph } from "../../../../../components/loading/LoadingGlyph.tsx";
import kit from "../../../../../components/menu/kit.module.css";
import { OriginalImage } from "../../../../../components/menu/OriginalImage.tsx";
import info from "../../[id]/unit-info.module.css";
import styles from "../../units.module.css";
import { splitStack } from "./actions.ts";

/**
 * Splits one copy out of a stack through the `splitStack` Server Action (M4-05C), then opens the
 * new ordinary unit's detail page, where it can be enhanced, evolved, or fielded.
 */
export function SplitButton({
  stackId,
  original = false,
}: {
  stackId: string;
  original?: boolean;
}): ReactNode {
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
    <div className={original ? undefined : styles.actions}>
      <button
        type="button"
        className={
          original
            ? `${kit.button} ${info.action}`
            : `${styles.actionButton} ${styles.enhanceButton}`
        }
        onClick={run}
        disabled={pending}
      >
        {original ? (
          <>
            <OriginalImage asset="common/button/sub_m_green_btn1.png" className={kit.normal} />
            <OriginalImage asset="common/button/sub_m_green_btn2.png" className={kit.pressed} />
          </>
        ) : null}
        <span className={original ? `${kit.caption} ${kit.text}` : styles.outline}>
          {pending ? <LoadingGlyph /> : "Split"}
        </span>
      </button>
      {error ? (
        <p className={styles.splitError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
