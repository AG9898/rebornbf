"use server";
import { redirect } from "next/navigation";
import { storyStage } from "../../../../../lib/battle/session-battle.ts";
import { parseItemLoadout } from "../../../../../lib/quests/item-loadout.ts";
import { beginQuestHref } from "../../../../../lib/quests/reinforcement.ts";
import { SQUAD_SLOTS } from "../../../../../lib/squad/squad-editor.ts";
import { startBattleSession } from "../../../../../server/start-battle.ts";

export async function beginQuest(
  stage: string,
  slot: number,
  ally: string | null,
  formData?: FormData,
): Promise<void> {
  if (!storyStage(stage) || !Number.isInteger(slot) || slot < 0 || slot >= SQUAD_SLOTS)
    redirect("/quests");
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
