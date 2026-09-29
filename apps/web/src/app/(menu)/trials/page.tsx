import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ComingSoon } from "../../../components/menu/ComingSoon.tsx";

export const metadata: Metadata = { title: "Trials · BFR" };

export default function Page(): ReactNode {
  return (
    <ComingSoon title="Trials" note="Trial bosses open after each story chapter. Coming soon." />
  );
}
