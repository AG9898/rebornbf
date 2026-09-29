"use client";

import { type MouseEvent, type ReactNode, useRef } from "react";

/**
 * The docs sidebar on narrow screens: a "Sections" bar that opens the sidebar in a modal
 * `<dialog>` drawer (focus trap and Escape for free). Following a link or tapping the backdrop
 * closes it.
 */
export function DocsDrawer({ label, children }: { label: string; children: ReactNode }): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);

  function onDialogClick(event: MouseEvent<HTMLDialogElement>): void {
    const target = event.target as HTMLElement;
    if (target === event.currentTarget || target.closest("a")) {
      dialog.current?.close();
    }
  }

  return (
    <div className="sticky top-[68px] z-20 border-b border-[#1c2338] bg-[#090d18] lg:hidden">
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="flex h-12 w-full items-center gap-3 px-4 text-left text-[15px] font-bold text-[#c9c6d8] sm:px-8"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span>Sections</span>
        <span className="truncate font-semibold text-[#8e8ba0]">{label}</span>
      </button>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes a modal dialog natively. */}
      <dialog
        ref={dialog}
        aria-label="Docs sections"
        onClick={onDialogClick}
        className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-[300px] max-w-[85vw] border-r border-[#1c2338] bg-[#090d18] p-0 text-[#e4e1ee] backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-4 px-[18px] py-5">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="self-end rounded-lg border border-[#2c3450] px-3 py-1 text-[14px] font-bold text-[#c9c6d8]"
          >
            Close
          </button>
          {children}
        </div>
      </dialog>
    </div>
  );
}
