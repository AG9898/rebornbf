import { redirect } from "next/navigation";
import { TRIALS_LAB_PATH } from "../../../lib/quests/trials.ts";

/** The trial list moved into the Conclave's Proving Lab (M6-01G, RESOLVED-95). */
export default async function TrialsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}): Promise<never> {
  const { error } = await searchParams;
  redirect(
    typeof error === "string"
      ? `${TRIALS_LAB_PATH}?error=${encodeURIComponent(error.slice(0, 200))}`
      : TRIALS_LAB_PATH,
  );
}
