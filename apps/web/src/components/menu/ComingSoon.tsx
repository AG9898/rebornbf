import type { ReactNode } from "react";
import kit from "./kit.module.css";
import {
  OriginalButton,
  OriginalTicker,
  OriginalTitleBar,
  OriginalWindow,
} from "./OriginalKit.tsx";

/**
 * Filler page for a menu section that is not built yet, on the original's screen kit (M8-01):
 * title bar with Back, a framed note, a Back to Home button, and the ticker.
 */
export function ComingSoon({ title, note }: { title: string; note: string }): ReactNode {
  return (
    <div className={kit.page}>
      <OriginalTitleBar title={title} />
      <div className={kit.body}>
        <OriginalWindow className={kit.placeholderWindow}>
          <p className={`${kit.placeholderText} ${kit.text}`}>{note}</p>
          <OriginalButton size="sub_m_btn" href="/home" className={kit.placeholderButton}>
            Home
          </OriginalButton>
        </OriginalWindow>
      </div>
      <OriginalTicker>Coming soon.</OriginalTicker>
    </div>
  );
}
