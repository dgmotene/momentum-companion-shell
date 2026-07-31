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
    <button
      type="button"
      onClick={open}
      className="group flex h-full w-full items-center gap-2.5 rounded-full border-[1.5px] border-teal bg-surface pl-3 pr-4 text-left shadow-pill transition hover:border-teal-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
    >
      <span
        aria-hidden="true"
        className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-teal-light to-teal"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-bold leading-tight text-teal-dark">
          Lumina
        </span>
        <span className="block truncate text-[11px] leading-tight text-ink-faint">
          Tap to chat
        </span>
      </span>
    </button>
  );
}
