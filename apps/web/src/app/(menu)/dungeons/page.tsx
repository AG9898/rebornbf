import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ComingSoon } from "../../../components/menu/ComingSoon.tsx";

export const metadata: Metadata = { title: "Dungeons · BFR" };

export default function Page(): ReactNode {
  return (
    <ComingSoon
      title="Dungeons"
      note="Always-open dungeons for materials and battle items are coming soon."
    />
  );
}
