import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { textBoxStyle } from "../../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../../components/menu/UiImage.tsx";
import { PORTRAIT_ART, UI_ASSETS } from "../../../../../components/menu/ui-assets.ts";
import { itemLoadoutKey } from "../../../../../lib/quests/item-loadout.ts";
import { beginQuestHref, reinforcements } from "../../../../../lib/quests/reinforcement.ts";
import { cardArtPath } from "../../../../../lib/squad/home-showcase.ts";
import {
  draftFromRow,
  parseSquadSlot,
  SQUAD_SLOTS,
  stepSquadSlot,
} from "../../../../../lib/squad/squad-editor.ts";
import { formLeaderSkill, toOwnedUnitView } from "../../../../../lib/units/owned-units.ts";
import { questPreparation } from "../../../../../server/quest-preparation.ts";
import unitStyles from "../../../units/units.module.css";
import styles from "../../start.module.css";
import { beginQuest } from "./actions.ts";
import { ItemLoadout } from "./ItemLoadout.tsx";

export default async function BeginQuestPage({
  params,
  searchParams,
}: {
  params: Promise<{ stage: string }>;
  searchParams: Promise<{
    ally?: string | string[];
    slot?: string | string[];
    error?: string | string[];
  }>;
}): Promise<ReactNode> {
  const { stage } = await params;
  const query = await searchParams;
  const slot = parseSquadSlot(query.slot);
  const preparation = await questPreparation(stage);
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
    <div className={styles.page}>
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
        <Link className={styles.pill} href={`/squad?slot=${slot}`}>
          Manage Squad
        </Link>
        <h2 className={styles.pill}>Squad {slot + 1}</h2>
      </div>
      <div className={unitStyles.skillRow}>
        <span className={unitStyles.skillTag} data-tag="skill-tag-red">
          <UiImage name="skill-tag-red" className={unitStyles.titlePlateArt} />
          <span
            className={`${unitStyles.skillTagText} ${unitStyles.outline}`}
            style={textBoxStyle("skill-tag-red")}
          >
            Leader Skill
          </span>
        </span>
        <span className={unitStyles.skillName}>
          {leader ? (formLeaderSkill(leader.unitId, leader.formId) ?? "None") : "None"}
        </span>
      </div>
      <div className={unitStyles.skillRow}>
        <span className={unitStyles.skillTag} data-tag="skill-tag-blue">
          <UiImage name="skill-tag-blue" className={unitStyles.titlePlateArt} />
          <span
            className={`${unitStyles.skillTagText} ${unitStyles.outline}`}
            style={textBoxStyle("skill-tag-blue")}
          >
            Ally Skill
          </span>
        </span>
        <span className={unitStyles.skillName}>{ally?.leaderSkill ?? "None"}</span>
      </div>
      <div className={styles.cards}>
        {cards.map((unit, i) => {
          const art = unit ? cardArtPath(unit.unitId, unit.formId) : null;
          return (
            <section
              key={i < 5 ? `squad-${i}` : "ally"}
              className={styles.card}
              aria-label={
                unit
                  ? `${unit.name}${i === 5 ? ", ally" : ""}`
                  : i === 5
                    ? "No ally"
                    : "Empty squad slot"
              }
            >
              {art ? (
                <Image
                  src={art.replace("/cards/", "/cards/battle/")}
                  alt=""
                  width={PORTRAIT_ART.width}
                  height={PORTRAIT_ART.height}
                  unoptimized
                  className={styles.portrait}
                  style={{
                    left: `${(PORTRAIT_ART.x / UI_ASSETS["unit-card"].width) * 100}%`,
                    top: `${(PORTRAIT_ART.y / UI_ASSETS["unit-card"].height) * 100}%`,
                    width: `${(PORTRAIT_ART.width / UI_ASSETS["unit-card"].width) * 100}%`,
                    height: `${(PORTRAIT_ART.height / UI_ASSETS["unit-card"].height) * 100}%`,
                  }}
                />
              ) : null}
              <UiImage name={unit ? "unit-card" : "unit-card-empty"} className={styles.cardArt} />
              <span className={styles.cardLabel}>
                {i === 5 ? "ALLY" : i === draft.leaderIndex ? "LEADER" : ""}
              </span>
              <span className={styles.cardName}>{unit?.name ?? "Empty"}</span>
              {unit ? <span className={styles.cardLevel}>Lv. {unit.level}</span> : null}
            </section>
          );
        })}
      </div>
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
