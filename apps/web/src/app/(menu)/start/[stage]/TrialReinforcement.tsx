import Link from "next/link";
import type { ReactNode } from "react";
import { textBoxStyle } from "../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import { UnitIconFace } from "../../../../components/units/UnitIconFace.tsx";
import type { Reinforcement } from "../../../../lib/quests/reinforcement.ts";
import {
  afterAllyHref,
  beforeAllyHref,
  otherPartyAllies,
  type TrialPlan,
  trialAllyHref,
  withAlly,
} from "../../../../lib/quests/trial-parties.ts";
import {
  nextUnitSort,
  UNIT_SORT_LABELS,
  type UnitSortKey,
} from "../../../../lib/units/owned-units.ts";
import unitStyles from "../../units/units.module.css";
import styles from "../start.module.css";

/**
 * A trial's Reinforcement (M6-01K, RESOLVED-95): the story list, choosing the ally for one party
 * at a time. Rows already chosen for a party are tagged "Party N", and another party's ally is
 * locked (no ally serves two parties, even a second copy's row); a choice (or No Ally) moves on
 * to the next party, and after the last one to the prep screen. Back steps to the previous party,
 * then to Edit Squad.
 */
export function TrialReinforcement({
  stage,
  stageName,
  plan,
  party,
  sort,
  choices,
  failed,
}: {
  stage: string;
  stageName: string;
  plan: TrialPlan;
  /** The party choosing now, 1-based. */
  party: number;
  sort: UnitSortKey;
  choices: readonly Reinforcement[];
  failed: boolean;
}): ReactNode {
  const sortHref = `${trialAllyHref(stage, plan, party)}&sort=${nextUnitSort(sort)}`;
  const locked = otherPartyAllies(plan, party);
  return (
    <div className={`${styles.page} ${styles.vortex}`} data-backdrop="vortex">
      <header className={unitStyles.titleBar}>
        <Link
          href={beforeAllyHref(stage, plan, party)}
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
        <Link className={`${unitStyles.pill} ${unitStyles.sortButton}`} href={sortHref}>
          Sort
        </Link>
      </header>
      <p className={styles.notice}>
        {stageName} · No continues. Choose an ally for Party {party} of {plan.slots.length}.
      </p>
      <div className={styles.toolbar}>
        <span>Sort: {UNIT_SORT_LABELS[sort]}</span>
        <Link
          className={styles.pill}
          href={afterAllyHref(stage, withAlly(plan, party, null), party)}
        >
          No Ally
        </Link>
      </div>
      {failed ? (
        <p role="alert">Your units could not be loaded. Try again shortly.</p>
      ) : (
        <ul className={styles.list}>
          {choices.map((unit) => {
            const lockedBy = locked.get(unit.id);
            const tag = lockedBy ?? (plan.allies[party - 1] === unit.id ? party : null);
            const body = (
              <>
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
                {tag !== null ? <span className={styles.partyTag}>Party {tag}</span> : null}
                <span>Lv. {unit.level}</span>
              </>
            );
            return (
              <li key={unit.id}>
                {lockedBy !== undefined ? (
                  <span className={`${styles.row} ${styles.rowLocked}`} aria-disabled="true">
                    {body}
                  </span>
                ) : (
                  <Link
                    className={styles.row}
                    href={afterAllyHref(stage, withAlly(plan, party, unit.id), party)}
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
