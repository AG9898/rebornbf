import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { dungeonCategory } from "../../../../../lib/quests/dungeons.ts";
import { dungeonProgress } from "../../../../../server/quest-progress.ts";
import { DungeonBanners } from "../../DungeonBanners.tsx";

export default async function DungeonCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<ReactNode> {
  const { category } = await params;
  if (!dungeonCategory(category)) notFound();
  return <DungeonBanners categoryId={category} {...(await dungeonProgress())} />;
}
