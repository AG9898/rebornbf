"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { LoadingGlyph } from "./LoadingGlyph.tsx";
import { startsNavigation } from "./nav-pending.ts";

/** Fast route changes finish before the overlay shows, so they never flash it. */
const SHOW_AFTER_MS = 120;
/** A link that lands back on the same path (a redirect) never changes it; give up after this. */
const GIVE_UP_MS = 15_000;

/**
 * The menu's route-load overlay. The menu group has no `loading.tsx`, so Next keeps the current
 * screen up while the next one renders; this shows the full-screen LoadingGlyph over it from a
 * link tap until the path changes. Lives inside the menu column (the overlay's positioned ancestor).
 */
export function NavPending(): ReactNode {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new path ends the pending load.
  useEffect(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    setPending(false);
  }, [pathname]);

  useEffect(() => {
    const clear = () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current = [];
    };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null
        | undefined;
      const click = {
        href: anchor?.href ?? null,
        target: anchor?.getAttribute("target") ?? null,
        download: anchor?.hasAttribute("download") ?? false,
        button: event.button,
        modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
      };
      if (!startsNavigation(click, window.location)) return;
      clear();
      timers.current = [
        setTimeout(() => setPending(true), SHOW_AFTER_MS),
        setTimeout(() => setPending(false), GIVE_UP_MS),
      ];
    };
    // Capture phase: Next's <Link> calls preventDefault to route on the client, so a bubbling
    // listener would see every link tap as cancelled.
    document.addEventListener("click", onClick, true);
    return () => {
      clear();
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return pending ? <LoadingGlyph variant="screen" /> : null;
}
