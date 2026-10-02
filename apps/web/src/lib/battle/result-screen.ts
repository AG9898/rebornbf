import { type Element, MaterialItemSchema, type Rarity, type Stage } from "@bfr/data";
import crownShard from "@bfr/data/content/items/crown-shard.json";
import zenithCore from "@bfr/data/content/items/zenith-core.json";
import { itemIcon } from "../../components/menu/item-icon.ts";
import type { UiAsset } from "../../components/menu/ui-assets.ts";
import { BATTLE_ITEMS } from "../quests/item-loadout.ts";
import { CHAPTER_TITLES } from "../quests/quest-map.ts";
import { formArtFile, unitContent } from "../units/owned-units.ts";
import type { Submission } from "./submit-session.ts";

/**
 * The quest completion flow's presentation (M2-07H; ART_GUIDE → Battle result screens,
 * RESOLVED-92). Pure: it only reshapes a verified `submitSession` result and the stage content, so
 * every amount, item, and unit shown comes from the server settlement and nothing is invented.
 */

const ITEM_NAMES: ReadonlyMap<string, string> = new Map(
  [...BATTLE_ITEMS, ...[crownShard, zenithCore].map((json) => MaterialItemSchema.parse(json))].map(
    (item) => [item.id, item.name],
  ),
);

/** One Materials slot: the item's icon (when exported), ×N, and its name. */
export type RewardSlot = {
  readonly itemId: string;
  readonly name: string;
  readonly count: number;
  readonly icon: UiAsset | null;
};

/** One Units Acquired icon; `href` opens the owned unit when the grant made a row for it. */
export type AcquiredUnit = {
  readonly key: string;
  readonly name: string;
  readonly element: Element | null;
  readonly thumb: string | null;
  readonly count: number;
  readonly href: string | null;
};

/** The big reveal for a story starter unlock: the splash on a halo with the unit's quote. */
export type StarterReveal = {
  readonly name: string;
  readonly rarity: number;
  readonly illustration: string | null;
  readonly quote: string | null;
  readonly href: string;
};

export type QuestResultView = {
  /** Small line above the quest name: the story chapter's title or the trial's number. */
  readonly areaName: string;
  readonly stageName: string;
  readonly zel: number;
  /** First-clear gems; 0 hides the Gems row and the bonus panel. */
  readonly gems: number;
  readonly firstClear: boolean;
  readonly materials: readonly RewardSlot[];
  readonly units: readonly AcquiredUnit[];
  readonly starter: StarterReveal | null;
};

/** The reward flow's screens after the clear beat, in order. */
export type ResultStep = "rewards" | "starter" | "bonus";

type ArtForm = { unitId: string; formId?: string };

function unitArt({ unitId, formId }: ArtForm): {
  name: string;
  element: Element | null;
  rarity: Rarity | null;
  quote: string | null;
  art: string | null;
} {
  const unit = unitContent(unitId);
  const form = formId ? unit?.forms.find((f) => f.id === formId) : unit?.forms[0];
  const art = unit && form ? formArtFile(unit.id, form.rarity) : null;
  return {
    name: unit?.name ?? unitId,
    element: unit?.element ?? null,
    rarity: form?.rarity ?? null,
    quote: unit?.quote ?? null,
    art,
  };
}

function thumbPath(unitId: string, art: string | null): string | null {
  return art ? `/assets/ui/cards/thumb/${unitId}-${art}.webp` : null;
}

/** The area line: a story stage's chapter title, or "Trial N". */
export function areaName(stage: Pick<Stage, "story" | "trial">): string {
  if (stage.story) return CHAPTER_TITLES[stage.story.chapter] ?? `Chapter ${stage.story.chapter}`;
  if (stage.trial) return `Trial ${stage.trial.number}`;
  return "Quest";
}

/** Where the flow returns: the stage's own chapter list, or the Trials page for a trial. */
export function questReturn(stage: Pick<Stage, "story" | "trial">): {
  href: string;
  label: string;
} {
  if (stage.trial) return { href: "/trials", label: "Back to Trials" };
  if (stage.story) return { href: `/quests/${stage.story.chapter}`, label: "Back to quests" };
  return { href: "/quests", label: "Back to quests" };
}

/** The reward screen for a verified win; never called for pending, failed, or lost battles. */
export function questResultView(
  stage: Pick<Stage, "name" | "story" | "trial">,
  submission: Extract<Submission, { ok: true }>,
): QuestResultView {
  const { rewards } = submission;
  const materials = (rewards.items ?? []).map(
    (item): RewardSlot => ({
      itemId: item.itemId,
      name: ITEM_NAMES.get(item.itemId) ?? item.itemId,
      count: item.count,
      icon: itemIcon(item.itemId),
    }),
  );

  const units: AcquiredUnit[] = [];
  (rewards.captured ?? []).forEach((capture, index) => {
    const art = unitArt(capture);
    units.push({
      key: `capture-${index}`,
      name: art.name,
      element: art.element,
      thumb: thumbPath(capture.unitId, art.art),
      count: 1,
      href: capture.ownedUnitId ? `/units/${capture.ownedUnitId}` : null,
    });
  });
  for (const grant of rewards.units ?? []) {
    const art = unitArt({ unitId: grant.unitId });
    units.push({
      key: `first-clear-${grant.unitId}`,
      name: grant.name,
      element: art.element,
      thumb: thumbPath(grant.unitId, art.art),
      count: grant.count,
      href: null,
    });
  }

  let starter: StarterReveal | null = null;
  if (rewards.starter) {
    const art = unitArt(rewards.starter);
    const href = `/units/${rewards.starter.ownedUnitId}`;
    units.push({
      key: "starter",
      name: rewards.starter.name,
      element: art.element,
      thumb: thumbPath(rewards.starter.unitId, art.art),
      count: 1,
      href,
    });
    starter = {
      name: rewards.starter.name,
      rarity: rewards.starter.rarity,
      illustration: art.art
        ? `/assets/units/${rewards.starter.unitId}/illustration-${art.art}.png`
        : null,
      quote: art.quote,
      href,
    };
  }

  return {
    areaName: areaName(stage),
    stageName: stage.name,
    zel: rewards.zel,
    gems: rewards.first_clear ? rewards.gems : 0,
    firstClear: rewards.first_clear,
    materials,
    units,
    starter,
  };
}

/** The screens after the clear beat: rewards, then the starter reveal and first-clear bonus if any. */
export function resultSteps(view: QuestResultView): ResultStep[] {
  return [
    "rewards",
    ...(view.starter ? (["starter"] as const) : []),
    ...(view.firstClear && view.gems > 0 ? (["bonus"] as const) : []),
  ];
}

/**
 * What the ending overlay shows for the battle's state. A win shows the clear beat while the
 * server verifies it; only a verified submission reaches the reward screens.
 */
export type EndingStage =
  | { kind: "verifying" }
  | { kind: "error"; message: string }
  | { kind: "rewards"; view: QuestResultView }
  | { kind: "defeat" };

export function endingStage(
  ending: "pending" | "lost" | Submission,
  stage: Pick<Stage, "name" | "story" | "trial">,
): EndingStage {
  if (ending === "lost") return { kind: "defeat" };
  if (ending === "pending") return { kind: "verifying" };
  if (!ending.ok) return { kind: "error", message: ending.error };
  return { kind: "rewards", view: questResultView(stage, ending) };
}
