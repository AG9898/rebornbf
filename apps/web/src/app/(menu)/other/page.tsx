import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MenuScreen } from "../../../components/menu/MenuScreen.tsx";

export const metadata: Metadata = { title: "Menu · BFR" };

export default function OtherPage(): ReactNode {
  return <MenuScreen />;
}
