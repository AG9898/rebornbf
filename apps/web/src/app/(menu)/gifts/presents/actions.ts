"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PRESENTS_PATH } from "../../../../lib/gifts/gift-screen.ts";
import { claimLoginReward } from "../../../../lib/login/claim.ts";

/**
 * Receive (and Receive All) in the Present Box: claims today's login calendar step through
 * `claim_login_reward()` (security definer, idempotent per UTC day; the server grants the gems and
 * ticket). Then the page re-renders from the rows, and the header's gem count from a fresh layout
 * read. Nothing to claim or an error just shows the list again.
 */
export async function receiveLoginGift(): Promise<void> {
  const claim = await claimLoginReward();
  revalidatePath("/", "layout");
  redirect(claim?.claimed ? `${PRESENTS_PATH}?received=1` : PRESENTS_PATH);
}
