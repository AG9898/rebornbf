import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { textBoxStyle } from "../../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../../components/menu/UiImage.tsx";
import { SkillRow } from "../../../../../components/units/SkillRow.tsx";
import { UnitIconFace } from "../../../../../components/units/UnitIconFace.tsx";
import { itemLoadoutKey } from "../../../../../lib/quests/item-loadout.ts";
import { beginQuestHref, reinforcements } from "../../../../../lib/quests/reinforcement.ts";
import { parsePrepSquad, parseTrialPlan } from "../../../../../lib/quests/trial-parties.ts";
import {
  draftFromRow,
  parseSquadSlot,
  SQUAD_SLOTS,
  stepSquadSlot,
} from "../../../../../lib/squad/squad-editor.ts";
import { levelLabel, toOwnedUnitView } from "../../../../../lib/units/owned-units.ts";
import { leaderSkillDisplay } from "../../../../../lib/units/unit-skills.ts";
import { questPreparation } from "../../../../../server/quest-preparation.ts";
import unitStyles from "../../../units/units.module.css";
import styles from "../../start.module.css";
import { beginQuest } from "./actions.ts";
import { ItemLoadout } from "./ItemLoadout.tsx";
import { TrialPrep } from "./TrialPrep.tsx";

export default async function BeginQuestPage({
  params,
  searchParams,
}: {
  params: Promise<{ stage: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { stage } = await params;
  const query = await searchParams;
  const slot = parseSquadSlot(query.slot);
  const preparation = await questPreparation(stage);
  if (preparation.stage.trial) {
    // Trials (M6-01K): the plan from Edit Squad and Reinforcement, one squad shown at a time.
    const plan = parseTrialPlan(query);
    if (!plan) notFound();
    const choices = reinforcements(preparation.owned);
    const allies = plan.allies.map((id) =>
      id === null ? null : (choices.find((unit) => unit.id === id) ?? undefined),
    );
    if (!preparation.failed && allies.includes(undefined)) notFound();
    return (
      <TrialPrep
        stage={stage}
        stageName={preparation.stage.name}
        plan={plan}
        squad={parsePrepSquad(query, plan)}
        units={preparation.owned.map(toOwnedUnitView)}
        squads={preparation.squads}
        allies={allies.map((ally) => ally ?? null)}
        items={preparation.items}
        userId={preparation.userId}
        failed={preparation.failed}
        error={typeof query.error === "string" ? query.error : null}
      />
    );
  }
  const allyId = typeof query.ally === "string" ? query.ally : null;
  const ally =
    allyId === null ? null : reinforcements(preparation.owned).find((unit) => unit.id === allyId);
  if (!preparation.failed && (Array.isArray(query.ally) || (allyId !== null && !ally))) notFound();
  const units = preparation.owned.map(toOwnedUnitView);
  const draft = draftFromRow(
    preparation.squads.find((row) => row.slot === slot) ?? null,
    new Set(units.map((unit) => unit.id)),
  );
  const leader = units.find((unit) => unit.id === draft.unitIds[draft.leaderIndex]);
  const cards = [
    ...Array.from(
      { length: 5 },
      (_, i) => units.find((unit) => unit.id === draft.unitIds[i]) ?? null,
    ),
    ally ?? null,
  ];
  return (
    <div
      className={`${styles.page} ${styles.fill} ${preparation.stage.dungeon ? styles.vortex : ""}`}
      data-backdrop={preparation.stage.dungeon ? "vortex" : "olive"}
    >
      <header className={unitStyles.titleBar}>
        <Link href={`/start/${stage}`} className={`${unitStyles.pill} ${unitStyles.backButton}`}>
          Back
        </Link>
        <div className={`${unitStyles.titlePlate} ${styles.titlePlate}`}>
          <UiImage name="title-plate" className={unitStyles.titlePlateArt} />
          <div className={unitStyles.titleText} style={textBoxStyle("title-plate")}>
            <h1 className={unitStyles.outline}>{preparation.stage.name}</h1>
          </div>
        </div>
        <Link href="/home" className={`${unitStyles.pill} ${unitStyles.sortButton}`}>
          Home
        </Link>
      </header>
      <div className={styles.toolbar}>
        <Link className={styles.tab} href={`/squad?slot=${slot}`}>
          <UiImage name="section-tab" className={styles.tabArt} />
          <span className={unitStyles.outline}>Manage Squad</span>
        </Link>
        <h2 className={`${styles.tab} ${styles.squadTab}`}>
          <UiImage name="section-tab" className={styles.tabArt} />
          <span className={unitStyles.outline}>Squad {slot + 1}</span>
        </h2>
      </div>
      <section className={styles.party} aria-label="Party">
        <SkillRow skill={leaderSkillDisplay(leader)} variant="inline" />
        <ul className={styles.partyRow}>
          {cards.map((unit, i) => (
            <li
              key={i < 5 ? `squad-${i}` : "ally"}
              className={`${unitStyles.icon} ${styles.member}`}
              data-element={unit?.element ?? undefined}
              aria-label={
                unit
                  ? `${unit.name}, ${levelLabel(unit)}${i === 5 ? ", ally" : i === draft.leaderIndex ? ", leader" : ""}`
                  : i === 5
                    ? "No ally"
                    : "Empty squad slot"
              }
            >
              {unit ? (
                <UnitIconFace unit={{ ...unit, stackCount: null }} inParty={false} />
              ) : (
                <span className={styles.emptyMember} />
              )}
              {i === 5 ? (
                <span className={`${unitStyles.outline} ${styles.allyTag}`}>ALLY</span>
              ) : i === draft.leaderIndex && unit ? (
                <UiImage name="badge-leader" className={styles.leaderBadge} />
              ) : null}
            </li>
          ))}
        </ul>
        <SkillRow
          skill={leaderSkillDisplay(ally)}
          label="Ally Skill"
          variant="inline"
          align="end"
        />
      </section>
      <nav className={styles.squads} aria-label="Choose squad">
        <Link
          aria-label="Previous squad"
          className={styles.arrow}
          href={beginQuestHref(stage, allyId, stepSquadSlot(slot, -1))}
        >
          <UiImage name="squad-arrow" />
        </Link>
        {Array.from({ length: SQUAD_SLOTS }, (_, i) => i).map((i) => (
          <Link
            key={i}
            href={beginQuestHref(stage, allyId, i)}
            aria-label={`Squad ${i + 1}`}
            aria-current={i === slot ? "page" : undefined}
            className={styles.dot}
          >
            <UiImage name={i === slot ? "dot-on" : "dot-off"} />
          </Link>
        ))}
        <Link
          className={`${styles.arrow} ${styles.next}`}
          aria-label="Next squad"
          href={beginQuestHref(stage, allyId, stepSquadSlot(slot, 1))}
        >
          <UiImage name="squad-arrow" />
        </Link>
      </nav>
      {preparation.failed ? (
        <p role="alert">Your squad could not be loaded. Try again shortly.</p>
      ) : null}
      {typeof query.error === "string" ? <p role="alert">{query.error.slice(0, 200)}</p> : null}
      {!preparation.failed && draft.unitIds.length === 0 ? (
        <p>Save a squad in Manage Squad first.</p>
      ) : null}
      <ItemLoadout
        key={itemLoadoutKey(preparation.userId, slot)}
        storageKey={itemLoadoutKey(preparation.userId, slot)}
        stock={preparation.items}
        disabled={preparation.failed || draft.unitIds.length === 0}
        action={beginQuest.bind(null, stage, slot, allyId)}
      />
    </div>
  );
}
