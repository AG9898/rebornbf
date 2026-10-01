import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { UiImage } from "../../../../../components/menu/UiImage.tsx";
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
      <header className={styles.header}>
        <Link href={`/start/${stage}`}>Back</Link>
        <h1>{preparation.stage.name}</h1>
        <Link href="/home">Home</Link>
      </header>
      <div className={styles.toolbar}>
        <Link href={`/squad?slot=${slot}`}>Manage Squad</Link>
        <h2>Squad {slot + 1}</h2>
      </div>
      <p className={styles.skill}>
        Leader Skill: {leader ? (formLeaderSkill(leader.unitId, leader.formId) ?? "None") : "None"}
      </p>
      <p className={styles.skill}>Ally Skill: {ally?.leaderSkill ?? "None"}</p>
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
                  src={art}
                  alt=""
                  width={180}
                  height={300}
                  unoptimized
                  className={styles.cardArt}
                />
              ) : null}
              <UiImage name="card-frame" className={styles.cardArt} />
              <span className={styles.cardLabel}>
                {i === 5 ? "ALLY" : i === draft.leaderIndex ? "LEADER" : ""}
              </span>
              <span className={styles.cardName}>{unit?.name ?? "Empty"}</span>
            </section>
          );
        })}
      </div>
      <nav className={styles.squads} aria-label="Choose squad">
        <Link
          aria-label="Previous squad"
          href={beginQuestHref(stage, allyId, stepSquadSlot(slot, -1))}
        >
          ◀
        </Link>
        {Array.from({ length: SQUAD_SLOTS }, (_, i) => i).map((i) => (
          <Link
            key={i}
            href={beginQuestHref(stage, allyId, i)}
            aria-label={`Squad ${i + 1}`}
            aria-current={i === slot ? "page" : undefined}
          >
            ●
          </Link>
        ))}
        <Link aria-label="Next squad" href={beginQuestHref(stage, allyId, stepSquadSlot(slot, 1))}>
          ▶
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
