import type { Metadata } from "next";
import type { ReactNode } from "react";
import { dungeonProgress } from "../../../server/quest-progress.ts";
import { DungeonBanners } from "./DungeonBanners.tsx";

export const metadata: Metadata = { title: "Dungeons · BFR" };

export default async function DungeonsPage(): Promise<ReactNode> {
  return <DungeonBanners {...(await dungeonProgress())} />;
}
