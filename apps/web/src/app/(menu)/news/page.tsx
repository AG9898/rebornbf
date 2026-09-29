import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ComingSoon } from "../../../components/menu/ComingSoon.tsx";

export const metadata: Metadata = { title: "Info · BFR" };

export default function Page(): ReactNode {
  return <ComingSoon title="Info" note="News and notes about BFR will appear here." />;
}
