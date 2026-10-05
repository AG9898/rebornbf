import type { ReactNode } from "react";
import { LoadingGlyph } from "../../components/loading/LoadingGlyph.tsx";

/** Every menu route load: the full-screen loading glyph over the menu column (M6-01H). */
export default function MenuLoading(): ReactNode {
  return <LoadingGlyph variant="screen" />;
}
