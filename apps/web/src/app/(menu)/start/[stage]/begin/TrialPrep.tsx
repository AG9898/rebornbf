import Link from "next/link";
import type { ReactNode } from "react";
import { textBoxStyle } from "../../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../../components/menu/UiImage.tsx";
import { SkillRow } from "../../../../../components/units/SkillRow.tsx";
import { UnitIconFace } from "../../../../../components/units/UnitIconFace.tsx";
import { type ItemStock, itemLoadoutKey } from "../../../../../lib/quests/item-loadout.ts";
import type { Reinforcement } from "../../../../../lib/quests/reinforcement.ts";
import {
  type TrialPlan,
  trialAllyHref,
  trialEditHref,
  trialPrepHref,
} from "../../../../../lib/quests/trial-parties.ts";
import { draftFromRow, type SquadRow } from "../../../../../lib/squad/squad-editor.ts";
import { levelLabel, type OwnedUnitView } from "../../../../../lib/units/owned-units.ts";
import { leaderSkillDisplay } from "../../../../../lib/units/unit-skills.ts";
import unitStyles from "../../../units/units.module.css";
import styles from "../../start.module.css";
import { beginTrial } from "./actions.ts";
import { ItemLoadout } from "./ItemLoadout.tsx";

/**
 * A trial's prep screen (M6-01K, RESOLVED-95): Begin Quest's party panel for one squad at a time
 * (arrows and dots step through Squad 1–3 of the plan), one shared item loadout, and Challenge,
 * which starts the battle with every party through `beginTrial`. Back returns to the last party's
 * Reinforcement; Edit Squads returns to Edit Squad.
 */
export function TrialPrep({
  stage,
  stageName,
  plan,
  squad,
  units,
  squads,
  allies,
  items,
  userId,
  failed,
  error,
}: {
  stage: string;
  stageName: string;
  plan: TrialPlan;
  /** The squad shown, 0-based. */
  squad: number;
  units: readonly OwnedUnitView[];
  squads: readonly SquadRow[];
  /** Each party's ally (null for none), in plan order. */
  allies: readonly (Reinforcement | null)[];
  items: readonly ItemStock[];
  userId: string;
  failed: boolean;
  error: string | null;
}): ReactNode {
  const ownedIds = new Set(units.map((unit) => unit.id));
  const drafts = plan.slots.map((slot) =>
    draftFromRow(squads.find((row) => row.slot === slot) ?? null, ownedIds),
  );
  const draft = drafts[squad] ?? { unitIds: [], leaderIndex: 0 };
  const ally = allies[squad] ?? null;
  const leader = units.find((unit) => unit.id === draft.unitIds[draft.leaderIndex]);
  const cards = [
    ...Array.from(
      { length: 5 },
      (_, i) => units.find((unit) => unit.id === draft.unitIds[i]) ?? null,
    ),
    ally,
  ];
  const count = plan.slots.length;
  const emptySquad = drafts.some((entry) => entry.unitIds.length === 0);
  return (
    <div className={`${styles.page} ${styles.fill} ${styles.vortex}`} data-backdrop="vortex">
      <header className={unitStyles.titleBar}>
        <Link
          href={trialAllyHref(stage, plan, count)}
          className={`${unitStyles.pill} ${unitStyles.backButton}`}
        >
          Back
        </Link>
        <div className={`${unitStyles.titlePlate} ${styles.titlePlate}`}>
          <UiImage name="title-plate" className={unitStyles.titlePlateArt} />
          <div className={unitStyles.titleText} style={textBoxStyle("title-plate")}>
            <h1 className={unitStyles.outline}>{stageName}</h1>
          </div>
        </div>
        <Link href="/home" className={`${unitStyles.pill} ${unitStyles.sortButton}`}>
          Home
        </Link>
      </header>
      <p className={styles.notice}>Trials cannot be continued after defeat.</p>
      <div className={styles.toolbar}>
        <Link className={styles.tab} href={trialEditHref(stage, plan.slots)}>
          <UiImage name="section-tab" className={styles.tabArt} />
          <span className={unitStyles.outline}>Edit Squads</span>
        </Link>
        <h2 className={`${styles.tab} ${styles.squadTab}`}>
          <UiImage name="section-tab" className={styles.tabArt} />
          <span className={unitStyles.outline}>Squad {squad + 1}</span>
        </h2>
      </div>
      <section className={styles.party} aria-label={`Squad ${squad + 1}`}>
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
          href={trialPrepHref(stage, plan, (squad + count - 1) % count)}
        >
          <UiImage name="squad-arrow" />
        </Link>
        {plan.slots.map((slot, i) => (
          <Link
            key={slot}
            href={trialPrepHref(stage, plan, i)}
            aria-label={`Squad ${i + 1}`}
            aria-current={i === squad ? "page" : undefined}
            className={styles.dot}
          >
            <UiImage name={i === squad ? "dot-on" : "dot-off"} />
          </Link>
        ))}
        <Link
          className={`${styles.arrow} ${styles.next}`}
          aria-label="Next squad"
          href={trialPrepHref(stage, plan, (squad + 1) % count)}
        >
          <UiImage name="squad-arrow" />
        </Link>
      </nav>
      {failed ? <p role="alert">Your squads could not be loaded. Try again shortly.</p> : null}
      {error !== null ? <p role="alert">{error.slice(0, 200)}</p> : null}
      {!failed && emptySquad ? <p>Every squad needs a unit. Return to Edit Squads.</p> : null}
      <ItemLoadout
        key={itemLoadoutKey(userId, plan.slots[0] ?? 0)}
        storageKey={itemLoadoutKey(userId, plan.slots[0] ?? 0)}
        stock={items}
        disabled={failed || emptySquad}
        action={beginTrial.bind(null, stage, { slots: [...plan.slots], allies: [...plan.allies] })}
        submitLabel="Challenge"
      />
    </div>
  );
}
