import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { textBoxStyle } from "../../../../components/menu/text-box.ts";
import { UiImage } from "../../../../components/menu/UiImage.tsx";
import {
  PELL_LINES,
  pellLine,
  TRIALS_LAB_PATH,
  type TrialView,
} from "../../../../lib/quests/trials.ts";
import { SIGN_IN_PATH } from "../../../../lib/supabase/routes.ts";
import { trialProgress } from "../../../../server/quest-progress.ts";
import quests from "../../quests/quests.module.css";
import styles from "../conclave.module.css";

export const metadata: Metadata = { title: "Proving Lab · BFR" };

/** The plate's second line: BFR trials cost no energy, so it carries the rule or the unlock hint. */
function subtitle(trial: TrialView): string {
  return trial.state === "locked"
    ? `Clear story stage ${trial.gateNumber}, ${trial.gateName}, to open.`
    : `${trial.waves} ${trial.waves === 1 ? "wave" : "waves"} · Free entry · No continues`;
}

/**
 * The Proving Lab (M6-01G, RESOLVED-95): host Pell at the left over the circle, the trials on
 * trial plates at the right (NEW/CLEAR ribbons, locked ones dimmed with their chapter-clear hint),
 * and Pell's line for the player's progress in the dialogue panel. An open or cleared trial opens
 * its three-squad Edit Squad at `/start/[trial]` (M6-01K); `start_battle` re-checks the gate.
 * Signed-out visitors and failed progress reads get no playable links.
 */
export default async function ProvingLabPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}): Promise<ReactNode> {
  const { error: startError } = await searchParams;
  const { trials, signedIn, failed } = await trialProgress();
  const playable = signedIn && !failed;
  const lineKey = pellLine(trials, playable);
  return (
    <div className={styles.lab} data-backdrop="proving-lab">
      <Link href="/conclave" className={styles.pill}>
        Back
      </Link>
      <div className={styles.pell}>
        <UiImage name="host-pell" alt="Pell" priority />
      </div>
      <div className={styles.side}>
        <h1 className={styles.srOnly}>Proving Lab</h1>
        <ol className={styles.trials}>
          {trials.map((trial) => {
            const ribbon =
              trial.state === "cleared"
                ? "ribbon-clear"
                : trial.state === "open"
                  ? "ribbon-new"
                  : null;
            const content = (
              <>
                <UiImage name="trial-plate" className={styles.art} />
                <span className={styles.plateText} style={textBoxStyle("trial-plate")}>
                  <strong className={styles.trialName}>{trial.name}</strong>
                  <span className={styles.trialSub}>{subtitle(trial)}</span>
                </span>
                {ribbon ? (
                  <span className={styles.ribbon}>
                    <UiImage name={ribbon} className={styles.art} />
                    <span className={styles.boxText} style={textBoxStyle(ribbon)}>
                      {ribbon === "ribbon-clear" ? "CLEAR" : "NEW"}
                    </span>
                  </span>
                ) : (
                  <span className={styles.srOnly}>Locked</span>
                )}
              </>
            );
            return (
              <li key={trial.id} data-state={trial.state} className={styles.trial}>
                {playable && trial.state !== "locked" ? (
                  <Link className={styles.plate} href={`/start/${encodeURIComponent(trial.id)}`}>
                    {content}
                  </Link>
                ) : (
                  <div className={styles.plate} aria-disabled="true">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {!signedIn || failed || typeof startError === "string" ? (
          <div className={styles.notices}>
            {!signedIn ? (
              <p className={quests.notice}>
                <Link href={`${SIGN_IN_PATH}?next=${TRIALS_LAB_PATH}`}>Sign in</Link> to take on the
                trials.
              </p>
            ) : failed ? (
              <p className={quests.notice} role="alert">
                Your progress could not be loaded. Try again shortly.
              </p>
            ) : null}
            {typeof startError === "string" ? (
              <p className={quests.notice} role="alert">
                {startError.slice(0, 200)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <figure className={styles.dialogue}>
        <UiImage name="dialogue-panel" className={styles.art} />
        <figcaption className={styles.dialogueText} style={textBoxStyle("dialogue-panel")}>
          <span className={styles.speaker}>Pell</span>
          <span data-line={lineKey}>{PELL_LINES[lineKey]}</span>
        </figcaption>
      </figure>
    </div>
  );
}
