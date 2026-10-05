"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { EvolveCinematic, type EvolveCinematicView } from "./EvolveCinematic.tsx";

const PlayCinematic = createContext<((view: EvolveCinematicView) => void) | null>(null);

/** Starts the evolve cinematic from inside an `EvolveHost`. */
export function usePlayEvolveCinematic(): (view: EvolveCinematicView) => void {
  const play = useContext(PlayCinematic);
  if (!play) throw new Error("usePlayEvolveCinematic needs an EvolveHost");
  return play;
}

/**
 * Wraps the whole evolve page and owns the cinematic (M4-06M). The `evolve` Server Action
 * revalidates, so the page re-renders under the new form (often with no further evolution and no
 * Evolve button); holding the cinematic here, above every branch, keeps it playing through that.
 * Its tap or Skip opens the new form's unit page.
 */
export function EvolveHost({
  unitId,
  reducedMotion,
  className,
  children,
}: {
  unitId: string;
  reducedMotion: boolean;
  className?: string;
  children: ReactNode;
}): ReactNode {
  const router = useRouter();
  const [view, setView] = useState<EvolveCinematicView | null>(null);
  const play = useCallback(
    (next: EvolveCinematicView) => {
      router.prefetch(`/units/${unitId}`);
      setView(next);
    },
    [router, unitId],
  );
  return (
    <PlayCinematic.Provider value={play}>
      <div className={className}>
        {children}
        {view ? (
          <EvolveCinematic
            view={view}
            reducedMotion={reducedMotion}
            onDone={() => router.push(`/units/${unitId}`)}
          />
        ) : null}
      </div>
    </PlayCinematic.Provider>
  );
}
