"use server";
import { redirect } from "next/navigation";
import { sessionStage } from "../../../../../lib/battle/session-battle.ts";
import { parseItemLoadout } from "../../../../../lib/quests/item-loadout.ts";
import { beginQuestHref } from "../../../../../lib/quests/reinforcement.ts";
import {
  isTrialPlan,
  trialPrepHref,
  trialStartChoice,
} from "../../../../../lib/quests/trial-parties.ts";
import { TRIALS_LAB_PATH } from "../../../../../lib/quests/trials.ts";
import { SQUAD_SLOTS } from "../../../../../lib/squad/squad-editor.ts";
import { startBattleSession } from "../../../../../server/start-battle.ts";

export async function beginQuest(
  stage: string,
  slot: number,
  ally: string | null,
  formData?: FormData,
): Promise<void> {
  const content = sessionStage(stage);
  if (!content) redirect("/quests");
  if (!Number.isInteger(slot) || slot < 0 || slot >= SQUAD_SLOTS)
    redirect(content.trial ? TRIALS_LAB_PATH : "/quests");
  const returnPath = beginQuestHref(stage, ally, slot);
  let value: unknown = [];
  try {
    value = JSON.parse(String(formData?.get("items") ?? "[]"));
  } catch {
    redirect(`${returnPath}&error=Invalid+item+loadout`);
  }
  const items = parseItemLoadout(value);
  if (!items) redirect(`${returnPath}&error=Invalid+item+loadout`);
  await startBattleSession(stage, returnPath, slot, ally, items);
}

/**
 * Starts a trial with every party of the plan (M6-01K): the first squad and its ally, then the
 * others as reserves (M6-01J), with one shared item loadout. Refusals return to the prep screen.
 */
export async function beginTrial(stage: string, plan: unknown, formData?: FormData): Promise<void> {
  const content = sessionStage(stage);
  if (!content?.trial) redirect("/quests");
  if (!isTrialPlan(plan)) redirect(TRIALS_LAB_PATH);
  const returnPath = trialPrepHref(stage, plan);
  let value: unknown = [];
  try {
    value = JSON.parse(String(formData?.get("items") ?? "[]"));
  } catch {
    redirect(`${returnPath}&error=Invalid+item+loadout`);
  }
  const items = parseItemLoadout(value);
  if (!items) redirect(`${returnPath}&error=Invalid+item+loadout`);
  const { slot, ally, reserves } = trialStartChoice(plan);
  await startBattleSession(stage, returnPath, slot, ally, items, reserves);
}
