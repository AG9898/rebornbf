"use client";

import Image from "next/image";
import { type ReactNode, useState, useTransition } from "react";
import { UiImage } from "../../../components/menu/UiImage.tsx";
import { CARD_ART_SIZE } from "../../../components/menu/ui-assets.ts";
import { OnboardingPanel } from "../../../components/onboarding/OnboardingScreen.tsx";
import styles from "../../../components/onboarding/onboarding.module.css";
import type { StarterOption, StarterUnitId } from "../../../lib/onboarding/starters.ts";
import { pickStarter } from "./actions.ts";

/**
 * The six starters as showcase cards (ART_GUIDE → Onboarding screens → Starter step). Selecting a
 * card opens a confirm panel (an `OnboardingPanel`) over the grid; Confirm calls `pickStarter`, which lands on home, and
 * Back returns to the grid.
 */
export function StarterPicker({ options }: { options: readonly StarterOption[] }): ReactNode {
  const [selected, setSelected] = useState<StarterUnitId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const choice = options.find((option) => option.unitId === selected);

  const confirm = (unitId: StarterUnitId) => {
    setError(null);
    startTransition(async () => {
      // On success the action redirects to home and never returns.
      const problem = await pickStarter(unitId);
      if (problem) setError(problem);
    });
  };

  return (
    <>
      <div className={styles.starterHead}>
        <h1 className={styles.panelTitle}>Choose your hero</h1>
        <p className={styles.starterIntro}>
          Pick one hero to begin your journey. The others join you as you clear the story.
        </p>
      </div>
      <ul className={styles.starterGrid} aria-label="Starter heroes">
        {options.map((option) => (
          <li key={option.unitId}>
            <button
              type="button"
              className={styles.starterCard}
              onClick={() => {
                setError(null);
                setSelected(option.unitId);
              }}
              aria-haspopup="dialog"
              aria-label={`${option.name}, ${option.formName}`}
            >
              <span className={styles.starterCardArt}>
                <Image
                  src={option.cardArt}
                  width={CARD_ART_SIZE.width}
                  height={CARD_ART_SIZE.height}
                  alt=""
                  className={styles.starterCardImage}
                  priority
                  unoptimized
                  draggable={false}
                />
                <UiImage name="card-frame" className={styles.starterCardFrame} />
                <UiImage name={`orb-${option.element}`} className={styles.starterCardOrb} />
              </span>
              <span className={styles.starterCardName}>{option.name}</span>
            </button>
          </li>
        ))}
      </ul>

      {choice ? (
        <div className={styles.confirmDock}>
          <div role="dialog" aria-modal="true" aria-labelledby="onboarding-starter-confirm-title">
            <OnboardingPanel
              title={`Begin with ${choice.name}?`}
              titleId="onboarding-starter-confirm-title"
            >
              <div className={styles.confirmBody}>
                <span className={styles.confirmCard}>
                  <Image
                    src={choice.cardArt}
                    width={CARD_ART_SIZE.width}
                    height={CARD_ART_SIZE.height}
                    alt=""
                    className={styles.starterCardImage}
                    unoptimized
                    draggable={false}
                  />
                  <UiImage name="card-frame" className={styles.starterCardFrame} />
                  <UiImage name={`orb-${choice.element}`} className={styles.starterCardOrb} />
                </span>
                <p className={styles.starterIntro}>
                  {choice.formName}, 3★. {choice.name} joins your squad as its leader. This choice
                  cannot be changed.
                </p>
              </div>
              <p className={styles.error} role="alert">
                {error}
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => setSelected(null)}
                  disabled={pending}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => confirm(choice.unitId)}
                  disabled={pending}
                >
                  {pending ? "Saving…" : "Confirm"}
                </button>
              </div>
            </OnboardingPanel>
          </div>
        </div>
      ) : null}
    </>
  );
}
