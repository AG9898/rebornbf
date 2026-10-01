import Link from "next/link";
import type { ReactNode } from "react";
import { UnitIconFace } from "../../../../components/units/UnitIconFace.tsx";
import { beginQuestHref, reinforcements } from "../../../../lib/quests/reinforcement.ts";
import {
  nextUnitSort,
  parseUnitSort,
  UNIT_SORT_LABELS,
} from "../../../../lib/units/owned-units.ts";
import { questPreparation } from "../../../../server/quest-preparation.ts";
import unitStyles from "../../units/units.module.css";
import styles from "../start.module.css";

export default async function ReinforcementPage({
  params,
  searchParams,
}: {
  params: Promise<{ stage: string }>;
  searchParams: Promise<{ sort?: string | string[] }>;
}): Promise<ReactNode> {
  const { stage } = await params;
  const sort = parseUnitSort((await searchParams).sort);
  const preparation = await questPreparation(stage);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/quests">Back</Link>
        <h1>Reinforcement</h1>
        <Link href={`/start/${stage}?sort=${nextUnitSort(sort)}`}>Sort</Link>
      </header>
      <div className={styles.toolbar}>
        <span>Sort: {UNIT_SORT_LABELS[sort]}</span>
        <Link href={beginQuestHref(stage, null)}>No Ally</Link>
      </div>
      {preparation.failed ? (
        <p role="alert">Your units could not be loaded. Try again shortly.</p>
      ) : (
        <ul className={styles.list}>
          {reinforcements(preparation.owned, sort).map((unit) => (
            <li key={unit.id}>
              <Link className={styles.row} href={beginQuestHref(stage, unit.id)}>
                <span className={`${unitStyles.icon} ${styles.thumb}`}>
                  <UnitIconFace unit={{ ...unit, stackCount: null }} inParty={false} />
                </span>
                <span className={styles.rowBody}>
                  <strong>
                    {unit.name}
                    {unit.yours ? " · Yours" : ""}
                  </strong>
                  <span>{unit.leaderSkill ?? "No Leader Skill"}</span>
                </span>
                <span>Lv. {unit.level}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
