"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

type GemsState = { gems: number | null; setGems: (gems: number) => void };

const GemsContext = createContext<GemsState>({ gems: null, setGems: () => {} });

/**
 * Holds the status bar's gem count. It starts from the wallet read by the menu layout; a page
 * that changes the balance (the home login-reward claim, M5-03B) sets the new total, since the
 * layout's read may run before the page's claim. A fresh layout read replaces it.
 */
export function WalletGemsProvider({
  initialGems,
  children,
}: {
  initialGems: number | null;
  children: ReactNode;
}): ReactNode {
  const [gems, setGems] = useState(initialGems);
  // A new layout read replaces the count; adjusting during render (not in an effect) keeps a
  // child's mount-time setGems from being overwritten by this provider's own mount.
  const [seen, setSeen] = useState(initialGems);
  if (seen !== initialGems) {
    setSeen(initialGems);
    setGems(initialGems);
  }
  return <GemsContext.Provider value={{ gems, setGems }}>{children}</GemsContext.Provider>;
}

/** The status bar's gem number (0 when signed out or unread). */
export function GemCount(): ReactNode {
  return <>{useContext(GemsContext).gems ?? 0}</>;
}

/** Sets the status bar's gem count to a server-returned balance. */
export function useSetWalletGems(): (gems: number) => void {
  return useContext(GemsContext).setGems;
}
