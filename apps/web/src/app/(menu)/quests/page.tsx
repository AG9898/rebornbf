import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { RegionMap } from "../../../components/quests/RegionMap.tsx";
import { regionAreaPlates } from "../../../lib/quests/region-areas.ts";
import { REGION_MAPS } from "../../../lib/quests/region-maps.ts";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { questProgress } from "../../../server/quest-progress.ts";
import quests from "./quests.module.css";

export const metadata: Metadata = { title: "Quest · BFR" };

/** The story as the Brightmere Vale region map (M3-04M, RESOLVED-93); each open area is a chapter. */
export default async function QuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}): Promise<ReactNode> {
  const { error } = await searchParams;
  const { chapters, signedIn, failed } = await questProgress();
  const [region] = REGION_MAPS;
  if (!region) throw new Error("Missing the story region map");
  const notices = [
    !signedIn ? (
      <p key="sign-in" className={quests.notice}>
        <Link href={`${SIGN_IN_PATH}?next=/quests`}>Sign in</Link> to track your progress.
      </p>
    ) : failed ? (
      <p key="failed" className={quests.notice} role="alert">
        Your progress could not be loaded. Try again shortly.
      </p>
    ) : null,
    typeof error === "string" ? (
      <p key="error" className={quests.notice} role="alert">
        {error.slice(0, 200)}
      </p>
    ) : null,
  ].filter(Boolean);
  return (
    <RegionMap map={region} plates={regionAreaPlates(region, chapters)} backHref="/home">
      {notices.length > 0 ? notices : null}
    </RegionMap>
  );
}
