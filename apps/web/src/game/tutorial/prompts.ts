import type { TutorialLesson, TutorialStep } from "@bfr/data";
import type { BattleEvent } from "@bfr/engine";

/**
 * The tutorial's step-by-step prompts (M3-06E, GAME_DESIGN §8 → New player flow). One prompt per
 * script step of the tutorial stage, in script order. A prompt shows at the start of a player
 * turn and stays until the player performs its lesson's action; the next prompt then waits for
 * the next player turn (`TurnStarted`), so each lesson gets its own turn, as the script plays it.
 * Pure: the page feeds it the events the battle scene shows.
 */

export interface TutorialPrompt {
  readonly lesson: TutorialLesson;
  readonly title: string;
  readonly body: string;
}

/** Prompt text by lesson; a lesson's second and later steps use the `again` text. */
const TEXT: Readonly<
  Record<
    TutorialLesson,
    {
      readonly first: Omit<TutorialPrompt, "lesson">;
      readonly again?: Omit<TutorialPrompt, "lesson">;
    }
  >
> = {
  tap: {
    first: {
      title: "Attack",
      body: "Tap a unit or its card to attack. Tap an enemy first to choose the target.",
    },
    again: {
      title: "Keep attacking",
      body: "Every hit fills your gauges. Tap your units to attack again.",
    },
  },
  spark: {
    first: {
      title: "Spark",
      body: "Tap two units one right after the other on the same enemy. Hits that land together Spark for extra damage.",
    },
  },
  crystals: {
    first: {
      title: "Crystals",
      body: "Hits drop Brave Crystals, which fill the attacker's BB gauge, and Heart Crystals, which heal. Attack to collect them.",
    },
  },
  burst: {
    first: {
      title: "Brave Burst",
      body: "A unit whose BB gauge is full can burst. Swipe its card up to use its Brave Burst.",
    },
    again: {
      title: "Finish it",
      body: "Swipe up on your charged units and bring the Training Golem down.",
    },
  },
  guard: {
    first: {
      title: "Guard",
      body: "The Golem is winding up a heavy slam. Swipe a unit's card down to guard and take less damage.",
    },
  },
};

/** The prompts for a tutorial script: one per step, in order. */
export function tutorialPrompts(script: readonly Pick<TutorialStep, "lesson">[]): TutorialPrompt[] {
  const seen = new Set<TutorialLesson>();
  return script.map(({ lesson }) => {
    const text = TEXT[lesson];
    const repeat = seen.has(lesson);
    seen.add(lesson);
    return { lesson, ...(repeat && text.again ? text.again : text.first) };
  });
}

/** True when `event` shows the player doing what `lesson` teaches. */
export function performsLesson(lesson: TutorialLesson, event: BattleEvent): boolean {
  switch (lesson) {
    case "tap":
      return event.type === "ActionStarted" && event.action === "attack";
    case "spark":
      return event.type === "Sparked";
    case "crystals":
      return event.type === "CrystalDropped";
    case "burst":
      return event.type === "BurstUsed";
    case "guard":
      return event.type === "Guarded";
  }
}

/**
 * Where the player is in the prompts: `index` is the current prompt (`count` once every prompt is
 * done) and `shown` whether it is on screen. It starts shown, at the first prompt.
 */
export interface PromptProgress {
  readonly index: number;
  readonly shown: boolean;
}

export const INITIAL_PROMPT_PROGRESS: PromptProgress = { index: 0, shown: true };

/** Every prompt has been performed. */
export function promptsDone(progress: PromptProgress, count: number): boolean {
  return progress.index >= count;
}

/**
 * Advances the prompts over `events`, in order: a shown prompt whose action appears is done and
 * hides; the next one shows at the next `TurnStarted`. So a prompt only ever advances on an
 * action taken while it was on screen, and at most one prompt advances per player turn.
 */
export function advancePrompts(
  progress: PromptProgress,
  prompts: readonly Pick<TutorialPrompt, "lesson">[],
  events: readonly BattleEvent[],
): PromptProgress {
  let current = progress;
  for (const event of events) {
    const prompt = prompts[current.index];
    if (!prompt) break;
    if (current.shown && performsLesson(prompt.lesson, event)) {
      current = { index: current.index + 1, shown: false };
    } else if (!current.shown && event.type === "TurnStarted") {
      current = { ...current, shown: true };
    }
  }
  return current;
}
