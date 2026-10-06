import type { ReactNode } from "react";
import { LoadingGlyph } from "../../components/loading/LoadingGlyph.tsx";

/** The battle route's load (session read, settings) and the start_battle handoff (M6-01H): no screen
 * stays under it on a fresh load, so the overlay sits on black. */
export default function BattleLoading(): ReactNode {
  return (
    <div className="fixed inset-0 bg-black">
      <LoadingGlyph variant="screen" />
    </div>
  );
}
