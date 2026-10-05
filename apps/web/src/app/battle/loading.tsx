import type { ReactNode } from "react";
import { LoadingGlyph } from "../../components/loading/LoadingGlyph.tsx";

/** The battle route's load (session read, settings) and the start_battle handoff (M6-01H). */
export default function BattleLoading(): ReactNode {
  return (
    <div className="fixed inset-0">
      <LoadingGlyph variant="screen" />
    </div>
  );
}
