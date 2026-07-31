"use client";

// The persistent floating pill to launch Lumina from anywhere on the portal.
// Fixed at bottom-right with a smooth hover animation and pulse breathing effect.

import { useEffect, useState } from "react";

export function LuminaLauncher({ onClick }: { onClick: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 lg:bottom-8 lg:right-8 z-40 flex items-center gap-2 sm:gap-3 bg-white border-1.5 border-brand-teal rounded-full px-3 sm:px-4 py-2 sm:py-2.5 shadow-[0_6px_20px_rgba(0,109,119,0.18)] hover:shadow-[0_10px_26px_rgba(0,109,119,0.26)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-100 ease-out"
      title="Open Lumina chat"
    >
      {/* Animated breathing orb */}
      <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-400 to-brand-teal shadow-[0_0_0_3px_rgba(78,205,196,0.14)] animate-pulse" />

      {/* Text stack */}
      <div className="flex flex-col leading-tight">
        <div className="text-[13px] sm:text-[13.5px] font-bold text-brand-tealDark">
          Lumina
        </div>
        <div className="text-[10.5px] sm:text-[11px] text-brand-inkFaint">
          Tap to chat
        </div>
      </div>
    </button>
  );
}
