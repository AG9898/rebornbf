import Link from "next/link";
import type { ReactNode } from "react";
import { textBoxStyle } from "../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import { UnitIconFace } from "../../../../components/units/UnitIconFace.tsx";
import { beginQuestHref, reinforcements } from "../../../../lib/quests/reinforcement.ts";
import {
  editPartySlots,
  parseAllyParty,
  parsePlanSlots,
  parseTrialPlan,
} from "../../../../lib/quests/trial-parties.ts";
import { draftFromRow, SQUAD_SLOTS } from "../../../../lib/squad/squad-editor.ts";
import {
  nextUnitSort,
  parseUnitSort,
  sortOwnedUnits,
  toOwnedUnitView,
  UNIT_SORT_LABELS,
} from "../../../../lib/units/owned-units.ts";
import { questPreparation } from "../../../../server/quest-preparation.ts";
import unitStyles from "../../units/units.module.css";
import styles from "../start.module.css";
import { TrialEditSquad } from "./TrialEditSquad.tsx";
import { TrialReinforcement } from "./TrialReinforcement.tsx";

export default async function ReinforcementPage({
  params,
  searchParams,
}: {
  params: Promise<{ stage: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { stage } = await params;
  const query = await searchParams;
  const sort = parseUnitSort(query.sort);
  const preparation = await questPreparation(stage);
  if (preparation.stage.trial) {
    // Trials (M6-01K): Edit Squad, then Reinforcement once per party (`?party=`).
    const plan = parseTrialPlan(query);
    const party = plan ? parseAllyParty(query, plan) : null;
    if (plan && party !== null) {
      return (
        <TrialReinforcement
          stage={stage}
          stageName={preparation.stage.name}
          plan={plan}
          party={party}
          sort={sort}
          choices={reinforcements(preparation.owned, sort)}
          failed={preparation.failed}
        />
      );
    }
    const views = sortOwnedUnits(preparation.owned.map(toOwnedUnitView));
    const ownedIds = new Set(views.map((view) => view.id));
    return (
      <TrialEditSquad
        stage={stage}
        stageName={preparation.stage.name}
        initialSlots={editPartySlots(parsePlanSlots(query))}
        saved={Array.from({ length: SQUAD_SLOTS }, (_, slot) =>
          draftFromRow(preparation.squads.find((row) => row.slot === slot) ?? null, ownedIds),
        )}
        units={views.map((view) => ({ ...view, stackCount: null }))}
        failed={preparation.failed}
      />
    );
  }
  return (
    <div
      className={`${styles.page} ${preparation.stage.dungeon ? styles.vortex : ""}`}
      data-backdrop={preparation.stage.dungeon ? "vortex" : "olive"}
    >
      <header className={unitStyles.titleBar}>
        <Link
          href={
            preparation.stage.dungeon
              ? `/dungeons/${preparation.stage.dungeon.series}`
              : preparation.stage.story
                ? `/quests/${preparation.stage.story.chapter}`
                : "/quests"
          }
          className={`${unitStyles.pill} ${unitStyles.backButton}`}
        >
          Back
        </Link>
        <div className={`${unitStyles.titlePlate} ${styles.titlePlate}`}>
          <UiImage name="title-plate" className={unitStyles.titlePlateArt} />
          <div className={unitStyles.titleText} style={textBoxStyle("title-plate")}>
            <h1 className={unitStyles.outline}>Reinforcement</h1>
          </div>
        </div>
        <Link
          className={`${unitStyles.pill} ${unitStyles.sortButton}`}
          href={`/start/${stage}?sort=${nextUnitSort(sort)}`}
        >
          Sort
        </Link>
      </header>
      <div className={styles.toolbar}>
        <span>Sort: {UNIT_SORT_LABELS[sort]}</span>
        <Link className={styles.pill} href={beginQuestHref(stage, null)}>
          No Ally
        </Link>
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
