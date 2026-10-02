"use client";

import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { HOLD_START_MS, holdRepeatDelay } from "../../lib/units/hold-repeat.ts";

/**
 * A tap-or-hold button (RESOLVED-90 item 2, M4-01F). A press released before `HOLD_START_MS` runs
 * `onStep` once on release; a longer press runs it repeatedly, speeding up (`holdRepeatDelay`),
 * until release, the pointer leaving or being cancelled (a touch scroll), or `onStep` returning
 * false (nothing more to add or remove). Keyboard activation (Enter/Space, a click with no pointer
 * detail) runs it once. The context menu and long-press selection are suppressed (see the CSS).
 * `inert` keeps the button focusable but makes every press a no-op (an `aria-disabled` tile).
 */
export function HoldButton({
  onStep,
  inert = false,
  className,
  label,
  pressed,
  element,
  children,
}: {
  /** One add or remove; returns whether it changed something and a hold may continue. */
  onStep: () => boolean;
  inert?: boolean;
  className?: string;
  label: string;
  pressed?: boolean;
  /** A unit icon's element (`data-element`, for the icon frame styles). */
  element?: string;
  children: ReactNode;
}): ReactNode {
  const step = useRef(onStep);
  step.current = onStep;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const down = useRef(false);
  const holding = useRef(false);
  const repeats = useRef(0);

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const repeat = useCallback(() => {
    if (!step.current()) {
      stop();
      return;
    }
    timer.current = setTimeout(repeat, holdRepeatDelay(repeats.current));
    repeats.current += 1;
  }, [stop]);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>): void {
    if (inert || event.button !== 0) return;
    stop();
    down.current = true;
    holding.current = false;
    repeats.current = 0;
    timer.current = setTimeout(() => {
      holding.current = true;
      repeat();
    }, HOLD_START_MS);
  }

  function onPointerUp(): void {
    if (!down.current) return;
    down.current = false;
    stop();
    if (!holding.current) step.current();
  }

  function cancel(): void {
    down.current = false;
    stop();
  }

  function onClick(event: MouseEvent<HTMLButtonElement>): void {
    // Pointer presses act in onPointerUp; a click with no detail is the keyboard.
    if (!inert && event.detail === 0) step.current();
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={inert || undefined}
      data-element={element}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={onClick}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}
