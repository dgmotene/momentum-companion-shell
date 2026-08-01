"use client";

// The launcher pill.
//
// A whole document for one button, because it lives in its own iframe. That
// buys the collapsed state a footprint the size of a pill instead of a hidden
// panel-sized hole in the host page.
//
// It receives no token and holds no state. Its only job is to ask the host to
// open the panel, and a forged version of that request could do nothing worse
// than open a chat window.

import { useCallback } from "react";
import { COMPANION_TO_HOST } from "@shared/contract";
import { ALLOWED_PARENT_ORIGINS } from "../../lib/origins";

export default function Launcher() {
  const open = useCallback(() => {
    if (window.parent === window) return;
    // Addressed to each allowlisted origin; the browser drops the ones that
    // are not our actual parent. Never "*".
    for (const origin of ALLOWED_PARENT_ORIGINS) {
      window.parent.postMessage({ type: COMPANION_TO_HOST.RESTORE }, origin);
    }
  }, []);

  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-full transition-transform duration-150 ease-out hover:translate-y-0.5 active:translate-y-0">
      <button
        type="button"
        onClick={open}
        className="flex items-center gap-2.5 rounded-full border-[1.5px] border-teal bg-surface py-2 pl-2 pr-3.5 text-left shadow-pill focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        <span
          aria-hidden="true"
          className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-teal-light to-teal shadow-[0_0_0_4px_rgba(78,205,196,0.14)] motion-safe:animate-pulse"
        />
        <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <span className="text-[13.5px] font-bold leading-tight text-teal-dark">
            Lumina
          </span>
          <span className="text-[11.5px] leading-tight text-ink-faint">
            Tap to chat
          </span>
        </span>
      </button>
    </div>
  );
}
