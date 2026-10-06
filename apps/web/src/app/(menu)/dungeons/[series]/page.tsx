import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StageList } from "../../../../components/quests/StageList.tsx";
import { dungeonProgress } from "../../../../server/quest-progress.ts";
import { DungeonNotice } from "../DungeonBanners.tsx";

export default async function DungeonSeriesPage({
  params,
}: {
  params: Promise<{ series: string }>;
}): Promise<ReactNode> {
  const { series: id } = await params;
  const { series, signedIn, failed } = await dungeonProgress();
  const entry = series.find((candidate) => candidate.id === id);
  if (!entry) notFound();
  return (
    <StageList
      title={entry.title}
      stages={
        signedIn && !failed
          ? entry.stages
          : entry.stages.map(({ leftToday: _remaining, ...stage }) => stage)
      }
      playable={signedIn && !failed}
      backHref={
        entry.category.series.length === 1 ? "/dungeons" : `/dungeons/category/${entry.category.id}`
      }
    >
      <DungeonNotice signedIn={signedIn} failed={failed} path={`/dungeons/${id}`} />
    </StageList>
  );
}
