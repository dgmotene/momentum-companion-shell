# Finals TODO

## SUBMISSIONS CLOSE 13:00 TODAY, SATURDAY 1 AUGUST 2026

From the event schedule in `Hackathon 2026 Participant Info.pdf`: "Submissions close,
lunch served" at 1:00 PM, then "Presentations" 1:30 to 6:00 PM, prizegiving 6:15 PM.
The afternoon is presentation only, not build time. Whatever is in the repo at 13:00 is
what gets judged. This tracker was written at 04:42, leaving about 8 hours 20 minutes.

Two schedule facts that matter: tech support ran out at 22:00 Friday and resumes 06:00
Saturday, and the venue is Wi-Fi only with no wired ethernet, which matters for a demo
that depends on the Momentum gateway.

**No document anywhere names a submission mechanism.** No portal, no form, no email
address, in the finals brief, the participant pack or the virtual brief. Confirm it in
the finals WhatsApp group early. No presentation time limit is documented either; the
3 to 5 minute limit was a virtual-phase video rule and no longer applies.

Working tracker for the Momentum x Monkey & River Hackathon 2026 finals.

Branch: `feat/chat-integration` at `09b3ebf`. Compiled 2026-08-01 from a review of
the repo against the supplied resources: `docs/Finals - Brief.pdf`,
`docs/Scope Change.pdf`, `docs/Momentum Life AI Gateway - Hackathon Guide 2 (1).pdf`,
`docs/tests 1.ipynb`, `docs/myriad-technical-guide.pdf`, plus the parent-directory
resources (`Hackathon 2026 Participant Info.pdf`, the virtual-phase brief,
`AI Gateway API.pdf`, the wireframes).

## How to use this file

- Nothing is checked off by anyone but Thabani. Finish an item, leave it unchecked,
  and note `(awaiting review)` beside it.
- `[verified]` means the claim was confirmed directly against the code, git, or the
  running database during the review.
- `[reported]` means a review agent found it and it has not been independently
  confirmed. Check before acting.
- Judging weights, for prioritising: Technical Execution 20, User Value and
  Experience 15, Team Thinking and Decision Making 15, Problem Understanding 10,
  Creativity 10, Practicality 10, Presentation 10, Overall Impact 10.

## Context that shapes every decision below

Grounding is real. The live Postgres holds 607 chunks, all 607 embedded, across 52
parts and 138 sections of the full 454-page Myriad guide, and the audit log shows 36
allowed `CHAT_QUERY` rows. `[verified]`

The problem is that this exists only in a Docker volume on one machine. The
ingestion code and the schema that created it live on the unmerged `dalton-rag`
branch. A judge cloning the submission branch gets an error on every policy
question. Most of P0 exists to close that gap.

---

## P0 Blockers: the demo does not survive a clean clone

- [ ] **P0-1 Merge `dalton-rag` so the RAG producer ships with its consumer.**
  `chat.js:104-105` retrieves `FROM rag_chunks JOIN rag_documents`. Neither table is
  created by `db/seed.sql`, which creates an unrelated `documents` table holding 0
  rows. `git ls-files rag/` is empty on this branch. `[verified]`
  The tables come only from `rag/src/myriad_rag/sql/001_schema.sql` on `dalton-rag`.
  `git merge-tree` reports the merge as clean: 18 files, additive, under `rag/` only,
  touching zero shared files. `[reported, re-check before merging]`
  Do this merge first and alone.

- [ ] **P0-2 Make the corpus reproducible from a clean clone.**
  Either mount the RAG schema as a second DB init file (`db/002_rag.sql`, numbered so
  it runs after `seed.sql`) plus a documented ingest step, or commit a small
  pre-embedded corpus so a cold clone answers something grounded.
  Note: re-running DB init needs `docker compose down -v`, which wipes the current
  607-chunk corpus and the audit rows. Do it early, then re-run the demo path once to
  repopulate. Never in the last hour.

- [ ] **P0-3 Delete the two stub routes that call the project unfinished.**
  `server.mjs:98` returns `{stub: true}` for `/api/gateway-ping` describing an OAuth2
  flow the current gateway does not use. `server.mjs:466` returns
  `"RAG retrieval not implemented (design round)."` Both are false and both are live
  HTTP responses a judge can curl. `[verified]`

- [ ] **P0-4 Fix `.env.example:22`, which ships the dead gateway URL.**
  It is `https://riskservicesdev.momentum.co.za/ai/api`, the superseded virtual-phase
  endpoint. The code default in `chat.js:13-14` is correct
  (`https://riskbifrostent.momentum.co.za/openai`), so anyone following the README and
  copying `.env.example` to `.env` breaks the gateway. `[verified]`
  Also drop the dead `GATEWAY_OAUTH_CLIENT_ID` and `GATEWAY_OAUTH_CLIENT_SECRET` from
  `.env.example` and `docker-compose.yml`, and add the two variables `chat.js` reads
  but neither file documents: `EMBEDDING_MODEL_URL` and `RAG_MIN_SIMILARITY`.

- [ ] **P0-5 Rewrite both READMEs so they stop disowning the work.**
  Root `README.md:7-9` says this is a design and architecture round whose code is an
  Environment Shell. The shell README says `"No AI features are implemented yet"` and
  `"External AI Gateway: Not called yet in this phase"`. `package.json` description
  repeats it. The shell README also tells judges to click a
  `"Log in as Policyholder"` button that no longer exists, and never mentions
  `UNIVERSAL_API_KEY`, without which chat throws. `[verified for root README, reported for the rest]`
  The brief requires setup instructions plus **assumptions** plus **known
  limitations**. All three are currently absent. Stating the real gaps scores better
  than silence: the brief rewards thoughtful decisions over adherence.

- [ ] **P0-6 Fix session continuity. Multi-turn conversation is broken.**
  `page.tsx:207` assigns `setSessionId(response.session_id)` unconditionally, while six
  backend responses hardcode `session_id: ""` (`server.mjs` lines 105, 121, 166, 210,
  252, 449: greeting, what-if, claim, refusal, escalation, error). Any of those turns
  resets the client session and the next turn starts a fresh conversation. Only the
  address and confirm paths return a real id, which is why only that journey holds
  context. `[verified]`

---

## P1 High value: closes brief requirements, cheap per line

- [ ] **P1-1 Open up the four dead personas.**
  `capabilities.mjs:5-34` has exactly two branches, `policyholder` and
  `beneficiary && deceasedFlag`. Everything else falls to a deny-all object, so
  Financial Adviser, Life Insured, Claims Assessor and Service Agent log in, get
  greeted by name, then get refused for every substantive question. Greetings pass
  only because they short-circuit ahead of the capability check. `[verified]`
  The live audit log already shows `policyQA | denied | 4`. `[verified]`
  Appendix A defines all six personas with named needs and example questions, so this
  is a direct miss. The design work is done everywhere else: roles, seeds, logins,
  scope, UI capability lists all cover six.
  Minimum viable: give `life_insured` policy QA and claims support; give the three
  staff roles policy QA scoped through `acting_for`.

- [ ] **P1-2 Render citations in the UI.**
  The backend builds them at `server.mjs:441-444` from part, section and printed page.
  Every `citations` reference on the companion side is inside `mock-journeys.ts`;
  `Message.tsx` and `page.tsx` never read the field. `[verified]`
  So every citation a judge sees today comes from the scripted path, on the journey
  the brief cares most about. Roughly 15 lines: add `citations` to `ChatTurn`, thread
  it through `page.tsx:211-224`, render with the existing `citation` block styling.

- [ ] **P1-3 Either enforce `acting_for` or delete the claim that it is enforced.**
  The companion sends `acting_for` on every staff request. `grep acting_for
  companion-backend/` returns nothing, and the auth middleware drops the token's
  `scope` claim entirely. `[verified]`
  `ClientPicker.tsx` states on screen to the user that "the backend re-checks
  `acting_for` against `scope` on every single request". `[reported]`
  A user-visible security claim that is false is worse than an absent feature. Fix the
  code or fix the copy, but not neither.
  Proper fix: carry `scope` onto `req.identity`, resolve `acting_for` into an effective
  policy id with a `scopeAllows` gate, resolve the adviser's book from the already
  seeded `adviser_clients` table, and audit actor plus subject.

- [ ] **P1-4 Stop the gateway retry multiplication. This is budget risk.**
  The OpenAI client at `chat.js:20-26` sets no `maxRetries` and no `timeout`, so SDK
  defaults apply: 2 internal retries and a 10-minute timeout. `callWithRetry` wraps
  that with 3 more retries and retries **every** error unconditionally, with no status
  check and no jitter, so a 400 or a bad key retries as hard as a 429. `[verified]`
  Worst case is 12 requests per model call, and a grounded turn makes two model calls.
  Budget is USD 50 for the whole team for the whole hackathon.
  Fix: `maxRetries: 0`, `timeout: 30000`, retry only on 408, 409, 425, 429, 500, 502,
  503, 504 plus network and timeout errors, add full jitter, honour `Retry-After`.
  The Python side on `dalton-rag` already does this correctly; port that logic.

- [ ] **P1-5 Do not spend a model call before authorising the caller.**
  `server.mjs:379` calls `understandMessage` immediately after `requireAuth`, but the
  capability check is not until line 409. A refused user has already been billed for a
  gateway call. `[reported]`
  Also add a hard cap on `message` length and a per-identity rate limit; there is none.

- [ ] **P1-6 Add an output-side compliance validator.**
  The compliance block is present on the only call that produces user-facing prose, so
  no model writes to the user unguarded. That part is sound. `[reported]`
  Two real gaps. First, nothing scans a completion before it ships for unqualified
  outcome language ("will be approved", "you will be paid on", a bare date, an
  unqualified rand amount). Second, the RAG path returns the answer as a single `text`
  block, so a rand figure the model quotes from the guide arrives as unclassified
  prose with no `ValueClass`. The what-if path does this correctly with
  `classification: "illustrative"`.
  Your own `contract.ts` argues the right principle: words can be phrased away by a
  model, a required prop cannot. Apply it to the RAG path.
  This turns "we wrote a prompt" into "we enforce it in code", which is a demonstrable
  answer to the Scope Change document.

- [ ] **P1-7 Run the five compliance test questions already written.**
  `docs/compliance-prompt.md:51-62` lists them. No test executes them and there are no
  test files anywhere in the repo. `[reported]`
  Run them against the live system and commit the transcripts. Cheap, and it is proof
  rather than assertion. This is currently the largest unverified risk in the build.

- [ ] **P1-8 Fix the fixture divergence that shows wrong numbers on screen.**
  `policies.ts:89` says POL-1002 is `"Active"`; `seed.sql:182` says `claim_pending`.
  The mock hardcodes `R 500 000` and `R 750 000` as literals at `mock-journeys.ts:188`,
  `315`, `321`. `[verified]`
  So switching from Thandi to Sipho and asking the same question can show a wrong cover
  amount and a contradictory policy status, at exactly the moment a judge is watching.

- [ ] **P1-9 Make the What-If Explorer reachable.**
  `dashboard/page.tsx:117` renders it when `view === "what-if"`, but `setView` is only
  ever called with `"clients"` or `"dashboard"`. A polished 227-line component for
  judged journey 3 with no way to open it. `[verified]`
  `PortalChrome` also has a comment describing a navigation rail with role-aware lock
  icons that does not exist in the component. `[reported]`
  Adding that rail is roughly 40 lines and unlocks the journey.

- [ ] **P1-10 Decide the mock's fate, explicitly.**
  `api.ts:88-121` silently falls back to 761 lines of canned replies when the backend
  is unreachable, errors, or returns a non-conforming shape, marked only by a small
  grey "Demo fixtures" strip. `[verified that the file is 761 lines and the fallback exists]`
  The mock currently covers more than the real path (18 intents and 6 roles against 8
  intents and 2 roles), which is why nobody noticed.
  Three options: gate it behind an explicit env flag so a backend failure shows an
  error instead of fiction; harvest it, since it is effectively the specification the
  backend has not met yet; or move it to fixtures for tests.
  Whatever is chosen, keep the per-turn fixture label visible. Presenting a fixture as
  grounded is the one honesty failure that would actually cost marks.

- [ ] **P1-11 Light up the claims progress card.**
  `page.tsx:357-364` renders it only when `workflow.checklist` is non-empty, and no
  producer anywhere ever sets `checklist`. The feature the comments call the emotional
  centrepiece has never rendered once. `claimResponse` already builds those exact
  items, so it is about six lines. `[reported]`

- [ ] **P1-12 Load the two brand webfonts. Two lines, biggest visual gain available.**
  The wireframe pulls Inter and Fraunces from Google Fonts, and `shared/theme.ts`
  declares both, with the code using `font-serif` on the login headline and every
  dashboard `h1`. But there is no `next/font`, no `link` tag and no `@font-face` in
  either app. Every serif heading currently renders in the machine's default serif.
  `[reported]`
  On an unfamiliar demo laptop this is the most visible difference from the approved
  design.

- [ ] **P1-13 The architecture diagram never says "Lumina".**
  `architecture-diagram.html:530` says "Embedded AI Companion (Thuso)" and the string
  "Lumina" appears zero times in the file. Everything else, wireframe, code and slides,
  says Lumina. That file is the architecture of record a judge will read. `[reported]`
  Note the repo copy is the current one despite an older mtime; the copy at the `MnR`
  root is a stale draft that still describes the backend as running inside the Next.js
  app rather than as a separate service.

- [ ] **P1-14 Delete or rename `lumina-wireframe-v2.html` at the `MnR` root.**
  Despite the name it is the **older** draft, carrying a superseded persona cast. The
  canonical wireframe is `nullius-in-verba/lumina-wireframe.html`. A judge who opens the
  file called "v2" sees the wrong design. `[reported]`

### Designed but never built, worth knowing before writing the demo script

All `[reported]`. The block renderer is genuinely complete: of the 14 block kinds the
contract defines, 13 are implemented and the one gap is intentional, so no wireframe
block type is missing. The gaps are screens and affordances:

- [ ] **P1-15** Beneficiary claim-progress tracker on the host page: reference number,
  Submitted / Under Review / Decision / Payout stepper, and the SLA line. The `stepper`
  block exists in `Blocks.tsx` and nothing on the host uses it. Grepping `host/` for
  "Under Review" or "Payout" returns nothing. Relates to P3-10.
- [ ] **P1-16** The claims drag-and-drop upload zone is replaced by a "+" button whose
  tooltip says "simulated in this build" and which sends a canned string. It is the first
  thing a judge clicks in a claims demo.
- [ ] **P1-17** The "returning days later" state exists server-side through session
  persistence but has no visible "everything you shared is saved" treatment, which was
  the emotional point of that screen.
- [ ] **P1-18** `refusal_reason` and `audit_id` are defined in the contract and rendered
  nowhere. Both are cheap and both are the evidence for the security story.
- [ ] **P1-19** The warm claims background exists as a token with a good rationale (a
  bereaved person should not see the same clinical white as someone adjusting a premium)
  but is applied only to one strip instead of the whole claims shell.

---

## Grounding quality: the corpus is right, the citations are not

The corpus itself is verified sound: `rag_documents` id 3, `myriad.pdf`, 454 pages,
607 chunks, `status = ready`, embedded with `bedrock/amazon.titan-embed-text-v2:0` at
dim 1024, chunk size 400 with 60 overlap, spanning 52 parts and PDF pages 1 to 452.
Underwriting has 47 chunks, Claims 21, Exclusions 4, Alterations 6. `[verified]`

The finals corpus is roughly 96 percent new material against the virtual-phase sample
extract, which was only 16 pages. Entirely new and previously unanswerable: all
exclusions, all claims requirements with real form numbers, all 44 benefit chapters,
the 38-page Underwriting chapter, waiting and no-claims periods, commission, and the
clinical claim-event appendices. `[reported]`

- [ ] **G-1 Fix the citation page labels. They are wrong a large fraction of the time.**
  The guide's printed footer **resets to 1 at the start of every product chapter**, so
  "page 3" exists about 52 times. Chunks carry only the label of the page they start on,
  and where the footer read failed the code fell back to `pdf_page - 1`. `[reported]`
  Verified example: the first Death Benefit chunk is stored as `printed_page 33` when
  the chapter's own printed page is 2. Later chunks in that chapter are correct. `[verified]`
  Agent measurement, worth re-checking: only 266 of 454 pages have a chunk starting on
  them, and 398 of 607 chunks exceed 300 tokens so most cross a page boundary. `[reported]`
  Fix: attribute page and section from the position of the cited text inside the chunk
  rather than the chunk start.

- [ ] **G-2 Strip the leaked table-of-contents digits from `part`.**
  7 of 52 part labels end in a stray digit: "Claims 2", "Purpose of underwriting 3",
  "Accidental HIV Benefit 2", "Business Protector (Professional) 2",
  "Complete Family Protector 2", "Complete Functional Protector 2",
  "Specified Claim Event Enhancer 2". `server.mjs:441-444` renders these straight into
  the citation section. `[verified]`
  Also emit `pdf_page` alongside the printed page. It is stored and currently dropped,
  so a judge cannot resolve "p.2" among 52 candidates. `rag/CONNECTING.md` already says
  to render the composite label and deep-link on `pdf_page`; the Node path does neither.

- [ ] **G-3 Attach citations to the three journeys that return `citations: []`.**
  What-If (`server.mjs:129-185`), the update and escalation paths
  (`server.mjs:240-336`), and claims (`server.mjs:187-228`) all return empty citations
  and never touch retrieval, even though the grounding material for all three is
  already ingested. `[verified that they return empty arrays]`
  This is the cheapest large gain against "grounded in the supplied policy
  documentation". Keep the deterministic checklists as the spine and retrieve the
  matching chunk alongside for the citation.
  High-value specifics the guide supports and the code does not use: Momentum **cannot**
  accept a bank-detail change from the policyholder, only the premium payer, which
  directly justifies the existing banking escalation; and a beneficiary change is only
  effective in writing received before the claim event. `[reported]`

- [ ] **G-4 Fix the wrong source comment in `claims-content.mjs:1-2`.**
  It cites "Payment of a claim, printed p.2 per benefit part". The document lists
  actually come from "Requirements for admitting a claim", printed p.3 to 7. `[reported]`
  This is the mis-citation bug from G-1 having already propagated into a source comment,
  which is worth noting out loud as a lesson rather than hiding.
  The lists themselves were checked item for item against the guide and are accurate,
  which is creditable. Two omissions in the death list: form CLAIM002E (required only
  when the benefit started less than 3 years before the claim event) and a copy of the
  claimant's identity document.

- [ ] **G-5 Fix the What-If waiting-period story. This is a real domain error.**
  `WhatIfExplorer.tsx:159-162` and `server.mjs:143` describe 0, 3, 6, 12, 24 months as
  "the documented periods". The guide's documented waiting periods for Complete Income
  Protector are 7 days (self-employed only), 14 days, 1, 3, 6, 12 and 24 months.
  "0 months" is documented nowhere. `[reported]`
  Worse, the Death Benefit chapter has **no waiting period at all**; waiting periods
  belong to income protection and disability benefits. Offering a 0 to 24 month waiting
  slider on lump-sum life cover is a domain error a judge holding the guide will spot.
  What actually applies to these seeded policies is a six-month no-claims period for
  natural death on the Funeral Benefit and a two-year suicide exclusion.
  Cheapest fix: drop the words "the documented periods" so nothing is attributed to the
  guide that the guide does not say. The factors themselves stay, since the brief
  publishes them.

- [ ] **G-6 Fix `docs/rag-ingestion-flow.md`.** It states the blanket rule
  "printed page = PDF page - 1", which holds only through printed p.31 and is wrong for
  every product chapter after that. The extractor on `dalton-rag` already handles this
  correctly by reading the footer, so the doc is behind the code. `[reported]`

- [ ] **G-7 Raise the retrieval limit.** `chat.js` retrieves 3 chunks; the Python
  service uses 6. Three is thin for a comparative question spanning two benefit
  chapters. `[reported]`

- [ ] **G-8 Consider adding the high-value claims rules that are ingested but unused:**
  written notice of a claim within six months where the insured life is alive, premiums
  remain payable until the claim is admitted, and the claimant-type document
  requirements for a minor, trust, estate, cessionary or foreign national. POL-1002's
  beneficiary is exactly a case where claimant type determines the documents. `[reported]`
  Also, the Instant Cash line in `claims-content.mjs:24` is correct but omits every
  condition: Death Benefit and Estate Provider only, 10 percent capped at R50 000 per
  insured life, after deduction of debt, and only if death occurs more than two years
  after the starting date.

---

## P2 Reuse refactors: cut the cost of adding a persona or journey

Measured cost today: one persona costs 10 files and 18 separate edit sites; one
journey or intent costs 7 to 9 files and 14 sites; one servicing action duplicates an
existing pattern twice over. `[reported]`

Root cause: `shared/contract.ts` is a genuine shared contract for host and companion
(21 import sites) but the backend never imports it and structurally cannot. It is
plain `.mjs`, and `docker-compose.yml` does not mount `shared/` into the backend
container at all. So the server grew a parallel, incompatible model of roles,
capabilities, claim types, refusal copy, audit writing and Postgres pooling.

- [ ] **P2-1 Finish the half-done address extraction before committing the tree.**
  **(awaiting review: done in `f14c109`. routes.mjs went 249 to 207 lines. Backend
  reboots clean, health 200, address route returns 401 not 500. The REST
  `confirm_token` was deliberately left in place; see Q-3.)**
  `domain/address-update.mjs` is untracked and `server.mjs` imports it, but
  `domain/routes.mjs` was never updated: it still redeclares `ADDRESS_FIELDS` at line
  10, a byte-identical `validateAddress` at 134, and its own copy of the province
  check and transactional insert. `[verified]`
  Committing as-is ships two copies of the address-commit SQL. The two paths also
  disagree on mechanism: REST uses a SHA-256 `confirm_token`, chat uses server-held
  `workflow_state.pending_confirmation`. Keep the workflow-state one; it does not
  trust a client-supplied token.

- [ ] **P2-2 One capability matrix, read by both runtimes.**
  Three incompatible models of the same concept exist: `shared/contract.ts` has 12
  snake_case capabilities across 6 roles, `capabilities.mjs` has 6 camelCase flags
  across 2 roles, `mock-journeys.ts` has an 18-intent map across 6 roles. `[reported]`
  This is the direct cause of P1-1. Move the matrix to data both sides can read (JSON,
  so the `.mjs` backend can import it), and mount `shared/` into the backend container.
  Highest single reduction in per-persona cost. Also the authorisation gate, so do it
  in a session with time to click every persona twice, never as the last change before
  presenting.

- [ ] **P2-3 Collapse the two Postgres pools and the two audit writers.**
  `db.mjs` owns a pool and `chat.js:39-42` creates a second one against the same
  database. `chat.js` also has `logAudit`, a duplicate of `audit.mjs`'s `writeAudit`
  with the same nine columns, uppercase enum values, and no `.catch` guard. `[reported]`
  The casing split is visible in the live audit table right now: `CHAT_QUERY | ALLOWED`
  from one writer, lowercase everywhere else. `[verified]`
  That matters because the audit trail is the cheapest possible demonstration of
  Technical Execution, and it currently looks inconsistent.

- [ ] **P2-4 Extract the compliance block to one module.**
  It exists in three divergent copies that have already drifted in wording:
  `docs/compliance-prompt.md`, `chat.js:307-329`, and `answer.py` on `dalton-rag`.
  `[reported]`
  Worse, the doc instructs contributors to paste it into every new prompt, which is a
  duplication generator aimed at the highest-risk text in the product. Make the module
  the source and change the doc to point at it.

- [ ] **P2-5 Response envelope builders.**
  `server.mjs` hand-assembles 10 response literals, six of which carry the
  `session_id: ""` bug from P0-6. `[verified]`
  One builder module makes that class of bug impossible and stops a new journey needing
  to know the wire shape.

- [ ] **P2-6 One gateway client module.**
  Config validation (reject a base URL that is not the Bifrost host, catching P0-4 for
  good), retry with jitter, timeouts, model-id validation against the guide's list,
  and usage accounting. Nothing currently records `response.usage`, so there is no way
  to know what the demo has spent against the USD 50 cap. `[reported]`
  Do not invent per-token prices. The guide gives the pricing URL and the `eu-west-1`
  region but no numbers; leave them unpopulated rather than guessing.

- [ ] **P2-7 Journey and intent registry on the backend.**
  Replace the `if (intent === ...)` ladder at `server.mjs:394-407` with a lookup table,
  and split the six journey handlers into their own modules. Adding an intent then
  costs 2 files instead of 7 to 9. `[reported]`
  Do this after P2-5, not before.

- [ ] **P2-8 Persona registry.**
  `host/lib/users.ts` and `host/lib/directory.ts` duplicate email, name, role and
  initials for all seven accounts, kept in sync by hand, and one references a file that
  was deleted. `db/seed.sql` is a third copy. `[reported]`
  One registry plus a generated seed block drops a persona to about one entry.
  Keep the password out of anything the browser can reach.

- [ ] **P2-9 Shared premium formula and one money formatter.**
  The what-if formula, the waiting-period factors and the R200 floor are implemented
  twice, in `host/lib/policies.ts` and `domain/whatif.mjs`, and they round differently.
  Rand amounts are formatted three visibly different ways, so the backend and the host
  page can render the same amount differently on one screen. `[reported]`

- [ ] **P2-10 Tailwind preset, and fix the content globs before moving any UI.**
  The two configs are near-identical. More importantly, both glob only `./app`,
  `./components` and `./lib`, so a component moved into `shared/` would render
  completely unstyled. Fix the globs first or every UI extraction fails confusingly.
  `[reported]`

---

## P3 Polish

- [ ] **P3-1** Remove non-QWERTY characters from source: em dash in `Dashboard.tsx:130`,
  U+2212 minus in `WhatIfExplorer.tsx:179`, en dash in `page.tsx:310`, plus assorted
  ellipsis and arrow characters. House rule is plain ASCII everywhere. `[reported]`
- [ ] **P3-2** Rename single-letter callback params flagged across `Blocks.tsx`,
  `Message.tsx`, `chat.js` (`c` for a chunk), `companion-embed.ts` (`f` for a frame).
  House rule is to name the binding for what it points at. `[reported]`
- [ ] **P3-3** Delete the `[cite: 1]` markers left in `chat.js` comments by whatever
  generated that code, and the emoji-printing self-test block at the end of the file.
  `[reported]`
- [ ] **P3-4** Expire or scope `sessions`. `chat.js` selects the newest session per
  profile and never expires it, so a stale `pending_confirmation` can outlive its
  conversation. There is one such row in the live DB. `[reported]`
- [ ] **P3-5** Pin Node 22. The container runs Node 20 and `openai@7.3.0` requires 22,
  logging `EBADENGINE`. It works today; it is an unpinned failure waiting for a fresh
  install. `[reported]`
- [ ] **P3-6** Remove the unused `@aws-sdk/client-bedrock-runtime` dependency. Nothing
  imports it, and it reads as a direct-to-Bedrock path that would bypass the gateway.
  `[reported]`
- [ ] **P3-7** Delete the unused `documents` table and its misleading parent-child
  chunking comments from `db/seed.sql`. It holds 0 rows and nothing reads it. `[verified]`
- [ ] **P3-8** Add a handful of unit tests. There are none. The cheapest valuable ones
  are pure functions: `estimatePremium` including the R200 floor, `validateAddress`,
  `capabilitiesFor` across all six roles plus the deceased-flag gate. `[reported]`
- [ ] **P3-9** Make the human-handoff affordance clickable. It renders as a styled
  `span`, not a button, and it is the one capability every role holds. `[reported]`
- [ ] **P3-10** Add claim progress tracking to the chat path. The `claims` table and the
  `stepper` block both already exist and are unused, and "track claim progress" is a
  named Beneficiary need in Appendix A. `[reported]`

---

## Deliverables required before judging

- [ ] **D-1 Working prototype.** Blocked on P0-1 and P0-2.
- [ ] **D-2 Final source repository.** Consolidate the branches. See the branch plan below.
- [ ] **D-3 Demo presentation covering the core journeys. THIS DOES NOT EXIST YET.**
  A search across the whole `MnR` tree for slides, decks, videos and presentation files
  found only three virtual-phase artefacts: `video-script.html` (duplicated at the repo
  root and in `docs/`, byte-identical), `intro-slide.html`, `thankyou-slide.html`, plus
  `Test.mp4` dated 2026-07-10, which predates the finals kickoff entirely. `[reported]`
  Presentation Quality 10, Overall Impact 10 and Team Thinking 15 add up to 35 percent
  decided in the room, against Technical Execution at 20. This is the largest single
  scoring gap in the project.

  The existing script cannot be reused. It is a wireframe-clicking script and says so:
  "Nothing is typed on camera. Speaker 4 clicks; the response is already drawn." Every
  speaker card drives the static HTML wireframe, never the running app. For a finals
  round whose deliverable is a working prototype, presenting off the wireframe is the
  worst available choice.

  Specific overclaims to strip if any of it is salvaged: `[reported]`
  - It names a **third, extinct persona cast** (Thabo Naidoo, Anika Naidoo) that exists
    neither in the current wireframe nor in the built app. It also calls the bereaved
    beneficiary a wife; the built app casts Sipho as the deceased's son, so the empathy
    line is factually wrong.
  - It promises a visible citation reading "Per the Policy Guide, Cooling-off section,
    p.4". The citation does not render at all (P1-2), and p.4 came from the virtual
    sample extract, not the full finals corpus.
  - It names a premium of R533 from a R1M policy. The seeded policy is not R1M, so that
    number is not reproducible.
  - It demotes the What-If Explorer to "Optional (if time allows)", and that screen
    cannot currently be opened at all (P1-9). It is one of the five required journeys.
  - It says "Every answer Lumina cites the policy section it came from". Not on screen.
  - It reads day-one finals plans aloud as future work. That work is now shipped, so
    reading it reframes delivered work as a plan.
  - The closing slate still says "Repository: `<your repo URL>`".

  What to keep: the access-control narrative stands up and is the strongest segment.
  The claim that the role check happens between the classify and reply model calls, so a
  refused action never generates an answer, is structurally true. `[reported]`

  What to add that the old script never had:
  - The **self-service address update**, which appears in none of the five speaker
    cards, despite being the best-finished journey in the product.
  - A **staff-persona beat**. The four personas added by the finals Appendix A are the
    clearest evidence the team read and responded to the new brief, and they are
    currently unmentioned. Free marks against Team Thinking and Problem Understanding.
  - A **deliberate refusal beat** showing the audit row. Security is where this team's
    design marks were won, and `refusal_reason` and `audit_id` render nowhere today.
  - Journeys in the brief's own order, so a judge can tick them off.

- [ ] **D-3b Rehearse against a cold boot** of `docker compose --profile full up` on
  venue Wi-Fi, and learn to recognise the fixture label live. A backend hiccup mid-demo
  produces fluent, cited, confident answers that are not grounded at all, and which look
  better than the real path. See P1-10.

- [ ] **D-3c Rewrite `intro-slide.html`.** Speaker roles still read "Trade-offs and the
  plan for finals", which is now the past. `thankyou-slide.html` is fine as-is. `[reported]`
- [ ] **D-4 Updated architecture summary (optional per the brief).**
  If touched at all, note that `docs/architecture.md`, `how-it-works.md`,
  `architecture-decisions.md` and `architecture-diagram.html` all describe the old
  gateway: OAuth2 client credentials, the dead `riskservicesdev` URL, unprefixed model
  ids. Two stated design justifications are now obsolete, the "Python SDK
  structured-output bug" and "the tool-calling this gateway lacks", both of which were
  roadmap items in the superseded doc. `[reported]`
- [ ] **D-5 README with setup, assumptions and known limitations.** Same as P0-5.
- [ ] **D-6 Reconcile `SUBMISSION.md`.**
  It still contains the template instruction "Delete these quote blocks before you
  submit", an empty mandatory video link, the stale base URL, and a claim that the
  backend is "Express + TypeScript" with "zod schema validation and a bounded
  re-prompt". The backend is plain `.mjs`, zod is not a dependency, and there is no
  re-prompt. `[reported]`
  Overclaiming is the riskier direction of error. Fix or remove each.
- [ ] **D-7 Add a short "what changed since the design round" section.**
  The brief explicitly rewards adaptation over blind adherence to the original
  architecture. The team did adapt: new gateway endpoint, a real ingestion pipeline,
  real chat wiring. Currently that earns zero credit because nothing says so.

---

## Branch consolidation plan

Five branches are already ancestors of `feat/chat-integration` and hold nothing
unique: `feat/compliance-controls`, `feat/policy-servicing`, `main`,
`origin/host-frontend`, `origin/main`. The persona catalogue, servicing routes, auth
middleware and compliance prompt are already here. `[reported]`

- [ ] **BR-1** Commit the working tree first, as one unit. `server.mjs` already imports
  from the untracked `address-update.mjs`, so the tree is mid-refactor. Do P2-1 as part
  of this. `[verified that the import exists and the file is untracked]`
  **(awaiting review: done in `91e5d77`, with the dedup following in `f14c109`.)**
- [ ] **BR-2** Merge `dalton-rag`. Clean and additive. See P0-1.
- [ ] **BR-3** Cherry-pick three things from `origin/modise`, and do **not** merge it.
  Take `companion-backend/src/rag-client.mjs` (this branch has no client for the RAG
  service), the `RAG_SERVICE_URL` and `RAG_SERVICE_API_KEY` env block, and a gateway
  error-surfacing fix in `gateway.py` that `dalton-rag` lacks. `[reported]`
  Its `/api/chat` is a 26-line regression against the 161 lines here, dropping the
  shared-contract response shape and the beneficiary refusal path, and it would import
  a committed `rag/.venv` and a duplicate 5.5 MB PDF, roughly 941k lines.
- [ ] **BR-4** Merge `feat/multilingual-translation` last, or not at all. Self-contained,
  defaults to a no-op, one trivial `docker-compose.yml` conflict, but nothing imports
  it so it is inert until wired. `[reported]`
- [ ] **BR-5** Drop `origin/ritmo`. It targets a file deliberately deleted in `1b0739e`
  for being the identity-spoofing hole. `[reported]`

---

## Decisions needed from Thabani

- [ ] **Q-1 Which retrieval architecture wins?** Two exist and are mutually redundant:
  retrieval in Node by direct SQL (this branch), or Node delegating over HTTP to the
  Python service (`origin/modise` and `rag/CONNECTING.md`). Their similarity floors also
  disagree: 0.2 in `chat.js`, 0.25 in `rag/config.py`, with a note on `dalton-rag`
  saying correct hits land at 0.28 to 0.35. Pick one deliberately before merging, not
  during. `[reported]`
- [ ] **Q-2 What happens to the mock?** See P1-10. This is a judgement call about demo
  honesty versus coverage, and it changes what P1-1 has to deliver.
- [ ] **Q-3 How far do we take `acting_for`?** Full server-side scope enforcement, or
  remove the claim and demo the three staff personas read-only? See P1-3.
- [ ] **Q-4 Keep or delete the direct Bedrock adapter on `dalton-rag`?**
  `RAG_GATEWAY_KIND=bedrock` selects a boto3 path that bypasses the Momentum gateway
  entirely, which contradicts "all AI interactions must integrate with Momentum's AI
  Gateway" and bypasses the virtual key's budget accounting. `[reported]`
  Recommend pinning it off or deleting it so no judge finds a bypass.
- [x] **Q-5 Demo time limit and submission mechanic.** Answered: neither is documented
  anywhere. See the banner at the top of this file. The one action arising is to confirm
  the submission mechanism in the finals WhatsApp group.

- [ ] **Q-6 How much of the remaining 8 hours goes to code versus the presentation?**
  The presentation deliverable does not exist at all (D-3), and 35 percent of the score
  is decided in the room against 20 percent for Technical Execution. My read is that
  P0-1 through P0-6 plus P1-1, P1-2 and P1-9 are the code work worth doing, and
  everything after that should be the demo script and a rehearsal. Your call.

## Two things NOT to "fix". Both were flagged in review and both are wrong.

**The 3 / 5 / 10 day claims SLAs are legitimate.** A review pass reported them as
fabricated and falsely attributed. That is incorrect. They are published as a table in
the Virtual Team Phase Brief: Death and Funeral 3 days, Income Protection 5 days,
Disability and Critical Illness 10 days. `[verified by extracting the brief text]`
`SUBMISSION.md` describing them as "the brief's published timelines" is accurate. They
are not in the Myriad guide, so do not cite the guide for them, but do not delete them
either. Note the runtime code has independently softened to guide-grounded language
("within one working day" for Instant Cash and funeral, "once assessed and admitted"
otherwise), which is a defensible Scope Change response, not a bug.

## Useful correction: the What-If formula is not invented

Worth knowing before anyone "fixes" it. Appendix A of the **virtual** brief
(`Hackathon 2026 Virtual Team Phase Brief.pdf`, pages 10 to 14) is still the operative
processing-rules reference and is not restated in the finals brief. It specifies the
What-If formula `new = max(200, current x (requested / current_sum) x factor)` with
waiting-period factors 0 months 1.0, 3 months 0.95, 6 months 0.9, 12 months 0.82,
24 months 0.72, the 4-digit postal code rule, the province-change event, the claims
SLAs and the audit fields. `[reported]`

So the formula is grounded in a supplied document, just not in the Myriad guide. It is
correctly implemented. The real defect is only that it exists in two copies that round
differently (P2-9), and that the code comment describing it as ungrounded undersells it.

---

## Do not do these now

Recorded so nobody reaches for them under time pressure.

- Do **not** run P2-2 (capability matrix) shortly before presenting. It rewires the
  authorisation gate across two runtimes and needs a compose change. A mistake shows up
  as the policyholder being refused everything, in front of judges.
- Do **not** split `shared/contract.ts`. 21 import sites across two Next.js builds. The
  payoff is readability and the risk is two apps that will not compile.
- Do **not** unify the two colour naming schemes in `shared/theme.ts`. It touches every
  `className` for no user-visible gain, and the file's own comment already argues this.
- Do **not** decompose `Blocks.tsx` or `companion-embed.ts`. Both are already the right
  shape, and neither is on the path of adding a persona, intent or servicing action.
- Do **not** `git merge origin/modise`. See BR-3.
- Do **not** regenerate the database with less than an hour to go. It needs
  `docker compose down -v`, which drops the 607-chunk corpus and the audit rows.

---

## Domain fact audit: the numbers hold up

All eight core insurance values in the code and docs were checked against the guide.
Citations are given as chapter, printed page (PDF page), because the printed footer
resets per chapter. `[reported, spot-checks verified]`

| Claim | Verdict | Guide citation |
|---|---|---|
| R30 per month policy fee | Confirmed | General information / Fees, p.5 (PDF 6) |
| Minimum contract premium R200, R100 Student Package | Confirmed | Contract premiums, p.5 (PDF 6) |
| Debit orders only | Confirmed, and understated in our code | Payment methods, p.5 (PDF 6) |
| 31-day cooling-off | Confirmed, incomplete | Cooling-off, p.4 (PDF 5) |
| 5 percent annual premium discount | Confirmed, incomplete | Premium frequencies, p.5 (PDF 6) |
| Maximum 25 policyholders | Confirmed | Policyholder, p.6 (PDF 7) |
| Maximum 20 insured lives | Confirmed | Insured life, p.6 (PDF 7) |
| Death claim document list | Confirmed, two omissions (see G-4) | Claims / Death claims, p.3 (PDF 443) |
| Funeral, income, disability, critical illness document lists | Confirmed, item for item | Claims, p.4 to 6 (PDF 444 to 446) |

No guessed or invented domain value was found in the runtime code. That is a good
result and worth saying to judges if the numbers are probed.

Three "confirmed but incomplete" items, each a cheap accuracy upgrade if there is time:
- Cooling-off is 31 days from receipt of the contract **but no longer than 60 days after
  the policy starting date**. The 60-day outer bound is nowhere in our code or docs.
- The 5 percent discount applies to the **annual premium frequency** specifically, and
  annual premiums are not allowed on the income protection and business protector
  benefits.
- The R200 minimum is a **contract** minimum covering all benefit premiums, fees and
  loadings, determined after underwriting. Our code applies it as a floor on a single
  benefit estimate.
