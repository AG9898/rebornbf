import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ComingSoon } from "../../../components/menu/ComingSoon.tsx";

export const metadata: Metadata = { title: "Items · BFR" };

export default function Page(): ReactNode {
  return (
    <ComingSoon
      title="Items"
      note="Materials, battle items, and spheres from dungeon drops are coming soon."
    />
  );
}
