// The loader.
//
// This is the only host-side code that knows the companion exists. It injects
// two iframes from the companion's origin, relays the identity token to them,
// and performs the resizing the companion cannot do for itself.
//
// Deliberately free of React and of any Momentum portal detail: in production
// this ships as a script tag that Momentum drops onto a page it already
// renders. Keeping it framework-free keeps that story honest.
//
// Why two iframes rather than one:
//
//   The launcher pill and the chat panel are different sizes, and an iframe
//   cannot resize itself. If the pill lived inside the panel's iframe, the
//   host would have to keep a panel-sized hole in the page at all times just
//   to show a small button. Two frames means the collapsed state occupies
//   only the space a pill needs.
//
// Why an iframe at all, rather than mounting the chat into the page:
//
//   A script widget runs in the host's document, where any other script on
//   that page can read the identity token out of its memory. The browser's
//   own origin boundary is a stronger guarantee than any discipline we could
//   promise. The cost is this file: every resize has to be a message.
//
// What the loader is NOT:
//
//   It makes no decisions. It does not read the token, inspect claims, or
//   know what a role is. It is a pipe and a pair of style rules. Every
//   authorization question is answered by the backend after verifying the
//   token signature.

import {
  COMPANION_TO_HOST,
  HOST_TO_COMPANION,
  type CompanionSurface,
  type PageContext,
} from "@shared/contract";

export interface CompanionEmbedOptions {
  /** Exact origin of the companion app. Never a wildcard. */
  companionOrigin: string;
  /**
   * Called when the companion needs a token: once at handshake, and again
   * whenever it reports its current one is close to expiry. The host mints
   * server-side; the loader only carries the result across.
   */
  mintToken: () => Promise<string | null>;
  /** Notified on surface changes so the page can adapt (e.g. dim content). */
  onSurfaceChange?: (surface: CompanionSurface) => void;
  /** Where to attach. Defaults to document.body. */
  container?: HTMLElement;
}

const PANEL_PATH = "/";
const LAUNCHER_PATH = "/launcher";

const Z = {
  pill: "2147483000",
  panel: "2147483001",
} as const;

export class CompanionEmbed {
  private readonly opts: CompanionEmbedOptions;
  private readonly origin: string;

  private pill: HTMLIFrameElement | null = null;
  private panel: HTMLIFrameElement | null = null;
  private surface: CompanionSurface = "pill";

  /** Set once the panel has announced itself, so we never post into a blank frame. */
  private panelReady = false;
  /** Held so a token that arrives before the panel is ready is not lost. */
  private pendingToken: string | null = null;
  /** Guards against overlapping mint requests when several triggers coincide. */
  private minting: Promise<void> | null = null;

  private onMessage = (event: MessageEvent) => this.handleMessage(event);

  constructor(options: CompanionEmbedOptions) {
    this.opts = options;
    this.origin = options.companionOrigin.replace(/\/$/, "");
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  mount(): void {
    if (this.pill || this.panel) return;
    const parent = this.opts.container ?? document.body;

    this.pill = this.createFrame(LAUNCHER_PATH, "Open Lumina");
    this.panel = this.createFrame(PANEL_PATH, "Lumina AI Companion");

    parent.appendChild(this.pill);
    parent.appendChild(this.panel);

    this.applySurface("pill");
    window.addEventListener("message", this.onMessage);
  }

  destroy(): void {
    window.removeEventListener("message", this.onMessage);
    this.pill?.remove();
    this.panel?.remove();
    this.pill = null;
    this.panel = null;
    this.panelReady = false;
    this.pendingToken = null;
  }

  private createFrame(path: string, title: string): HTMLIFrameElement {
    const frame = document.createElement("iframe");
    frame.src = `${this.origin}${path}`;
    frame.title = title;
    // No allow-top-navigation: even a fully compromised companion cannot
    // navigate the portal away from under the user. allow-same-origin keeps
    // the companion on its OWN origin (it does not grant access to ours),
    // which it needs in order to call its own backend.
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
    frame.style.position = "fixed";
    frame.style.border = "0";
    frame.style.background = "transparent";
    frame.style.colorScheme = "normal";
    // Pill iframe should present as a fully rounded pill.
    if (path === LAUNCHER_PATH) {
      frame.style.borderRadius = "9999px";
      // Clip the iframe contents to the rounded shape so the inner document
      // does not visually overflow the pill frame on hover or focus.
      frame.style.overflow = "hidden";
    }
    frame.style.transition =
      "width 180ms ease, height 180ms ease, inset 180ms ease, opacity 140ms ease";
    return frame;
  }

  // -------------------------------------------------------------------------
  // Surface: the resizing the companion cannot do for itself
  // -------------------------------------------------------------------------

  setSurface(surface: CompanionSurface): void {
    if (this.surface === surface) return;
    this.applySurface(surface);
    this.opts.onSurfaceChange?.(surface);
  }

  getSurface(): CompanionSurface {
    return this.surface;
  }

  private applySurface(surface: CompanionSurface): void {
    this.surface = surface;
    const pill = this.pill;
    const panel = this.panel;
    if (!pill || !panel) return;

    const show = (f: HTMLIFrameElement, visible: boolean) => {
      f.style.opacity = visible ? "1" : "0";
      f.style.pointerEvents = visible ? "auto" : "none";
      // Keep both frames in the document at all times. Removing the panel or
      // flipping it to display:none would tear down its document and lose an
      // in-flight reply; a claim in progress must survive being minimized.
      f.style.visibility = visible ? "visible" : "hidden";
    };

    if (surface === "pill") {
      Object.assign(pill.style, {
        inset: "auto 20px 20px auto",
        width: "212px",
        height: "58px",
        zIndex: Z.pill,
      });
      show(pill, true);
      Object.assign(panel.style, {
        inset: "auto 20px 20px auto",
        width: "408px",
        height: "620px",
        zIndex: Z.panel,
      });
      show(panel, false);
      return;
    }

    show(pill, false);
    show(panel, true);

    // Both panel and fullscreen anchor at the bottom-right corner. Keeping
    // `top` and `left` as `auto` in BOTH states matters: CSS cannot
    // interpolate between `auto` and a length, so mixing anchors here would
    // make the frame snap to the top-left of the viewport at the start of
    // the transition and only its size would animate. By pinning right and
    // bottom with concrete lengths and giving fullscreen a calc'd width and
    // height (instead of `auto`), every property that changes is an
    // animatable length and the panel grows in place from the corner.
    if (surface === "panel") {
      Object.assign(panel.style, {
        top: "auto",
        left: "auto",
        right: "20px",
        bottom: "20px",
        width: "408px",
        height: "min(620px, calc(100vh - 40px))",
        zIndex: Z.panel,
      });
    } else {
      Object.assign(panel.style, {
        top: "auto",
        left: "auto",
        right: "24px",
        bottom: "24px",
        width: "calc(100vw - 48px)",
        height: "calc(100vh - 48px)",
        zIndex: Z.panel,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Outbound: host -> companion
  // -------------------------------------------------------------------------

  /**
   * Hand the identity token to the panel.
   *
   * Always addressed to the companion's exact origin. Using "*" here would
   * broadcast the token to whatever document happens to occupy that frame,
   * which is the entire failure mode this architecture exists to avoid.
   */
  sendToken(token: string): void {
    if (!this.panelReady) {
      this.pendingToken = token;
      return;
    }
    this.post({ type: HOST_TO_COMPANION.IDENTITY_TOKEN, token });
  }

  /**
   * Tell the companion what the user is looking at, e.g. the What-If
   * Explorer's current slider values.
   *
   * A hint for conversation only. The backend re-derives every figure it
   * acts on from the user's own verified policy data, so a forged context
   * can at worst make the assistant discuss numbers that are not on screen.
   */
  sendPageContext(context: PageContext): void {
    if (!this.panelReady) return;
    this.post({ type: HOST_TO_COMPANION.PAGE_CONTEXT, context });
  }

  /** Portal session ended: tell the companion to clear and collapse. */
  endSession(): void {
    this.pendingToken = null;
    if (this.panelReady) this.post({ type: HOST_TO_COMPANION.SESSION_ENDED });
    this.applySurface("pill");
  }

  private post(message: unknown): void {
    this.panel?.contentWindow?.postMessage(message, this.origin);
  }

  // -------------------------------------------------------------------------
  // Inbound: companion -> host
  // -------------------------------------------------------------------------

  private handleMessage(event: MessageEvent): void {
    // Origin check first, before touching the payload at all.
    if (event.origin !== this.origin) return;

    // Both frames share an origin, so origin alone cannot tell them apart.
    // Compare the source window against the frames we created: that is the
    // only reliable way to know which of our own children is talking, and it
    // stops an unrelated same-origin popup from driving the panel.
    const fromPanel = event.source === this.panel?.contentWindow;
    const fromPill = event.source === this.pill?.contentWindow;
    if (!fromPanel && !fromPill) return;

    const type = (event.data as { type?: unknown } | null)?.type;

    switch (type) {
      case COMPANION_TO_HOST.READY: {
        // The companion announces itself once mounted, and again on every
        // reload. Ready-first removes the race where the host posts a token
        // into a frame that has not yet attached its listener.
        if (fromPanel) {
          this.panelReady = true;
          if (this.pendingToken) {
            const token = this.pendingToken;
            this.pendingToken = null;
            this.post({ type: HOST_TO_COMPANION.IDENTITY_TOKEN, token });
          } else {
            // Panel reloaded mid-session (dev hot reload, or a crash) and has
            // no identity. Re-mint rather than leaving it stranded.
            void this.requestToken();
          }
        }
        break;
      }

      // Lifecycle. These carry no data and grant no authority: the worst a
      // forged one could do is open or close a panel. Conversation state
      // lives in the backend, so nothing is lost either way.
      case COMPANION_TO_HOST.EXPAND:
        this.setSurface("fullscreen");
        break;
      case COMPANION_TO_HOST.RESTORE:
        this.setSurface("panel");
        break;
      case COMPANION_TO_HOST.MINIMIZE:
        this.setSurface("pill");
        break;

      case COMPANION_TO_HOST.TOKEN_EXPIRING:
        // Renewal only works while this loader is running inside a live,
        // authenticated portal page, so the portal session is the real outer
        // bound on access. Each renewal re-reads the profile, so a role
        // change or a newly set deceased flag is never more than one token
        // life stale.
        void this.requestToken();
        break;

      default:
        break;
    }

    // The pill exists only to ask to be opened.
    if (fromPill && type === COMPANION_TO_HOST.RESTORE) {
      this.setSurface("panel");
    }
  }

  /** Mint and deliver a token, collapsing concurrent requests into one. */
  private requestToken(): Promise<void> {
    if (this.minting) return this.minting;
    this.minting = (async () => {
      try {
        const token = await this.opts.mintToken();
        if (token) this.sendToken(token);
      } finally {
        this.minting = null;
      }
    })();
    return this.minting;
  }
}
