# SUBMISSION.md — Accessible Life Insurance AI Companion

> **How to use this template.** This is the primary scored artifact of the virtual phase. It is a
> **design and architecture blueprint**, not a code dump. Fill in every section below directly in
> your repository root. Be specific and justify your decisions; "we used X" scores far lower than
> "we chose X over Y because Z, given the gateway constraints." Where the brief is genuinely open,
> state your assumption and move on. Delete these quote blocks before you submit.
>
> Keep prose tight. Diagrams, tables, and bullet points are welcome. Target a document a judge can
> read and fully understand in roughly 15 minutes.

---

## 0. Team and Repository

| Field | Value |
|---|---|
| Team name | Nullius In Verba |
| Team members (and who speaks to what in the video) | Vutomi Khosa (the problem and Lumina intro), Thabani Hlatshwayo (architecture and the key trade-off), Dalton Motene (access control and the deceased flag),Katlego Mtimane (grounded AI and empathetic claims),  Modise Mogane (trade-offs and the plan for finals) |
| Repository link (GitHub / GitLab) | https://github.com/MnR-Hackathon-Group-C/nullius-in-verba |
| Walkthrough video link (mandatory, 3–5 min) | |
| Architecture diagram location (file / link) | [architecture-diagram.html](architecture-diagram.html), repo root, viewable without cloning at https://host-html.com/p/kpzzj1: the four trust zones, both model calls per turn, and the two credential paths that never meet. The same architecture as mermaid in [docs/architecture.md](docs/architecture.md) and in plain language in [docs/how-it-works.md](docs/how-it-works.md) |
| Wireframes location (Figma / images) | [lumina-wireframe.html](lumina-wireframe.html), repo root, viewable without cloning at https://host-html.com/p/quv3tz: portal login, policy view with the companion, a routine address update, the What-If adjust screen, and the death-claim assistant in its high-stress state |

---

## 1. One-Paragraph Summary

We are designing an AI companion that lives inside Momentum's member portal and serves
two very different people: a policyholder managing their life cover, and a bereaved
beneficiary starting a claim. It answers policy
questions grounded in the actual guide, simulates premium What-Ifs, captures simple
updates conversationally, and walks claims with patience, with every action gated by
the role in a signed token. The design idea we are most proud of: the model advises,
the code decides. The backend consults the model at most twice per message, once to
name the intent and once to phrase a result, and neither call carries any authority;
every permission check, calculation and refusal is deterministic code. That is what
makes a small model safe to put in front of grieving people, and every outcome
auditable.

---

## 2. Technical Stack

| Layer | Choice | Why (tie to constraints) |
|---|---|---|
| Host (parent) application | Next.js (mock insurer portal) | The brief's reference shape: a portal that already knows the user. Kept deliberately thin; it exists to issue identity and embed the companion, not to be a product itself |
| Embedded companion frontend (React/Next.js) | Next.js + TypeScript, own origin, loaded in iframes by a small loader | Chosen over a script-embed widget, which would run the chat inside the host page where any script can read the token. The iframe's cost is a rigid frame; the loader performs open, minimize and expand on the widget's request, and the token never leaves the companion origin |
| Companion backend (Python / Node.js) | Node.js (Express + TypeScript) | Avoids the gateway's documented Python SDK structured-output bug; regardless of SDK, all model JSON is prompt-enforced and schema-validated server-side (zod) with a bounded re-prompt, so no SDK feature is load-bearing. One language across the stack. The cost: Python's stronger PDF tooling; because ingestion is a standalone script, that option stays open without touching the backend |
| Datastore (profiles, policy data, sessions) | PostgreSQL | Chosen over SQLite's zero-setup: real transactions (a chat turn and its audit entry commit together), an audit log that survives restarts, and true concurrent writes, where SQLite permits one writer at a time, a real limit once every chat turn writes a session update and an audit entry. The cost is a judge-side dependency, absorbed by the compose file, documented native setup, and a committed seed |
| Vector store (pgvector / SQLite / in-memory / other) | Postgres + pgvector (same instance) | Chosen over in-memory (vanishes on restart, boot would need the gateway) and SQLite (no native vector search). With Postgres already in the stack, pgvector costs nothing extra to adopt early, and gives native cosine search beside the app data, SQL filtering in the same query, and a built-in scale path (HNSW) for the full guide at finals; no migration story needed |
| Orchestration framework (Spring AI / OpenAI SDK / LangChain / custom) | Custom: hand-rolled two-step classify-then-act over the OpenAI-compatible chat API | Chosen over LangChain, whose agent abstractions assume the tool-calling this gateway lacks. The cost: two model calls per turn and every line ours to maintain; acceptable because Haiku is fast and cheap, and the role check between the calls stays deterministic |

---

## 3. AI Gateway Integration

- **Base URL / environment targeted:** `https://riskservicesdev.momentum.co.za/ai/api`
  (the development gateway; it is OpenAI-compatible, so clients point at its `/v1`
  endpoints).
- **Chat model:** `anthropic.claude-3-haiku-20240307-v1:0`
- **Embedding model:** `amazon.titan-embed-text-v2:0`
- **Auth to the gateway (machine-to-machine):** an OAuth2 client-credentials flow: the
  backend exchanges its client ID and secret for a bearer token and attaches it to
  every gateway call, refreshing before expiry. The secret lives only in the backend's
  environment (`.env`, never committed; placeholders in `.env.example`) and is a
  different credential from the user's identity JWT: one says which application is
  calling, the other says which person is asking. They never travel the same path.
- **Where gateway calls are made from:** exactly two places, both server-side. The
  companion backend's orchestrator makes the chat calls and embeds the user's question
  at query time; the standalone ingest script embeds the policy documents once,
  offline. The frontend never calls the gateway: a credential in the browser can be
  lifted by anyone who opens dev tools, and a direct line to the model would bypass the
  role checks that only the backend enforces.

### 3.1 Designing around the small chat model

The architecture assumes the model is small and plans around it, rather than hoping a
big prompt makes it clever:

- **One small job per call.** Haiku is never asked to reason, decide and write in one
  breath. Call 1 does one thing: name the intent from a fixed list. Call 2 does one
  thing: phrase a result our code already produced. Small models are reliable at small
  jobs.
- **Nuance comes from the source text, not the model.** Answers are composed from
  retrieved parent sections of the policy guide (section 4), so the precision of "31
  days, per the Cooling-off section" is the document's, and the model only has to relay
  it.
- **The model never tracks state.** The pinned workflow-state card (section 3.2) tells
  it each turn exactly where a claim stands, so a mid-claim question costs nothing; a
  small model asked to remember ten turns of progress would drop things.
- **Output is validated, not trusted.** Structured replies are schema-checked in code,
  with the bounded retry path described in section 3.2; a reply that still fails after
  those retries becomes the safe fallback response, never a guess passed to the user.
- **Empathy is not delegated where it matters most.** Refusals, condolences and
  escalations use fixed, human-written templates; the model phrases routine content
  inside a tone guide. The moments that would hurt most if the model got them wrong are
  the moments it does not improvise. The templates also keep system details out of
  replies: a refusal explains the decision, never the machinery behind it.
- **Honesty is enforced before the model speaks.** If retrieval finds nothing above the
  similarity threshold, the backend returns the brief's approved fallback response and
  the model is never called.

### 3.2 Designing around the stateless gateway

- **Conversation memory strategy:** a Postgres `sessions` row per conversation holding
  two things: a rolling window of recent turns, and a pinned workflow-state card (which
  journey is active, fields collected, fields missing). Each turn is appended and the
  window trimmed from the front; anything durable is folded into the card before its
  turn falls off. So a long claim never overflows the small model's context, but the
  facts that matter survive trimming. Every prompt to the gateway carries the card, the
  window and the retrieved sections, and nothing else. Sessions are keyed to the
  profile with a role snapshot, and the backend only loads the session belonging to the
  verified token's `sub`, so one user's history can never leak into another's prompt.
- **Tool-calling / orchestration strategy:** hand-rolled two-step, no framework. Call 1
  classifies the message and extracts fields as strict JSON ("what-if, sum_assured
  400000, waiting 6"). The backend checks the role matrix (section 5.2), then runs the
  action itself in plain code: the What-If formula, address validation, checklist
  assembly, the review-queue write. Call 2 turns that computed result into a reply.
  Actions are triggered by our code inspecting call 1's output, never by the model
  invoking anything, which is also why a prompt-injected "ignore your instructions"
  can change the wording of a reply but not what the system does.
- **Structured-output fallback:** we depend on prompt-enforced JSON checked
  server-side (zod schema), with one bounded re-prompt on a malformed reply, then one
  attempt asking for answers in XML-style tags, which small models produce more
  reliably than nested JSON. If that final attempt also fails validation, the safe
  fallback response goes out; the model never gets an unbounded number of tries. The
  gateway's documented Python SDK structured-output bug cannot bite us twice over: the
  backend is Node, and no SDK structured-output feature is load-bearing in the first
  place.

---

## 4. Grounded Policy Q&A (RAG)

- **Ingestion pipeline:** a standalone script, run once, offline. It splits the guide
  along its own headings into parent sections (kept whole), sub-splits each into small
  child pieces of a few hundred tokens, embeds the children through the gateway
  (`titan-embed-text-v2`), and stores child embeddings and parent text side by side in
  pgvector. The backend never depends on this at startup; a fixed-size splitter is the
  fallback for long or unstructured sections.

- **Vector store choice and justification:** pgvector over SQLite and in-memory arrays.
  In-memory vectors vanish on restart and tie boot to gateway availability; SQLite
  persists but has no vector search, leaving the similarity maths in our code. pgvector
  searches natively, lives in the same database as profiles, sessions and the audit log,
  and is already the honest answer at finals scale. Full reasoning in
  [docs/architecture-decisions.md](docs/architecture-decisions.md).

- **Retrieval and grounding:** the question is embedded via the gateway, matched by
  cosine similarity against the child pieces (top 3 to 5), and each match is swapped for
  its full parent section before prompting, so the small model sees whole clauses with
  their rules and exclusions. The prompt is those parent sections plus the trimmed
  session history plus the question.

- **Contextual honesty:** enforced in code, not hoped for in prompts. If no child scores
  above the similarity threshold, the backend declines with the brief's approved
  fallback response, word for word: "I can't confirm that from the provided documents.
  I can explain what is available or refer this for human review." The model is never
  called. When it does answer, it cites the section heading it used, as in "per the
  Cooling-off section, 31 days".

---

## 5. Authentication, Identity, and the Embedding Model

### 5.1 Mocked end-user identity

- **Token format and claims:** the host portal signs a mock OIDC JWT using RS256. It
  carries `sub` (user ID), `role`, `policy_id`, `deceased_flag`, the issuer and
  audience the backend insists on (`iss: https://mock-host.local`,
  `aud: companion-backend`), and a 15-minute expiry. The companion backend fetches the host's
  public key from `/.well-known/jwks.json` (a mock JWKS endpoint) and checks the
  signature, issuer, audience and expiry on every request. This split matters: the
  backend can check any token, but only the host can create one. That is why we chose
  RS256 over HS256: with a shared secret, anything that can check a token can also
  forge one.

- **How roles are derived:** always from the token's claims, never from the UI. The role
  claim and the deceased flag work together, giving three cases. A `policyholder` gets
  full servicing access. A `beneficiary` whose linked policyholder has died
  (`deceased_flag: true`) gets the restricted role: Q&A and claims only. A `beneficiary`
  whose policyholder is alive gets no access to the policy at all; being named on a
  policy grants nothing until the flag is set. There is no fourth case: on a
  policyholder's own token the flag is always false, because a policyholder whose death
  has been verified can no longer log in. Each party owns one step: Momentum sets
  the flag after verifying the death, the host signs it into the token at login, and the
  backend enforces it.

- **Server-side enforcement:** the backend consults the model at most twice per message,
  and neither call carries any authority. The first call only names the intent ("this is
  a What-If request"); the backend then checks the role-capability matrix in code; only
  if the role allows it does the backend run the action and make the second call, which
  only phrases a result our code already produced. A refused request never reaches an
  action or a second call: the backend replies with a fixed, empathetic template and
  writes an audit entry.

### 5.2 Role-to-capability matrix

| Capability | Policyholder | Beneficiary |
|---|---|---|
| Grounded Policy Q&A | Yes | Yes |
| Quotes & Alterations (What-If) | Yes | No: refused by the server, audited |
| Self-Service Updates (e.g. address) | Yes | No: refused by the server, audited |
| Claims Support | Yes | Yes |
| Beneficiary change | Yes, with human review | No |
| Banking change | Yes, with human review | No |

The Beneficiary column applies once the deceased flag is set. A beneficiary whose linked
policyholder is alive has no access at all: every row is No until the flag is set.

### 5.3 Host-to-companion embedding

- **Embedding mechanism:** an iframe on its own origin. The browser itself keeps the
  host page and the companion separated, so neither can read the other's data. We
  rejected running the chat UI as a script widget inside the host page, where any other
  script could read the token, and a single SPA because it removes the boundary this
  challenge is testing. The only host-side code is a small loader that injects and
  repositions the iframes; it renders no UI and never touches the token.

- **Identity handoff:** the companion tells its parent window it is ready
  (`COMPANION_READY`); the host replies with the JWT via `postMessage`, aimed at the
  companion's exact origin; the companion only accepts messages from origins on its
  allowlist. The ready-first handshake avoids timing problems on slow loads. The backend
  then re-checks the token on every request; the handoff is never trusted on its own.

- **Widget lifecycle (pill, panel, full-screen):** the loader injects two iframes from
  the companion origin: a launcher pill and the chat panel, hidden until opened. An
  iframe cannot resize itself, so the loader performs every open, minimize and expand in
  response to lifecycle messages (`COMPANION_MINIMIZE`, `COMPANION_EXPAND`) on the same
  origin-pinned channel as the token. Lifecycle messages carry no data and grant no
  authority; a forged one could only open or close a panel, and conversation state lives
  in the backend, so nothing is lost mid-claim.

- **Trust boundaries:** two credentials that never meet. The user's JWT travels
  host → companion → backend and stops there. The gateway's OAuth2 client-credentials
  live only in backend configuration and travel only backend → gateway. The browser
  never sees them. Both edges are drawn and labelled on the architecture diagram
  (section 9).

- **Security notes:** pinned target origins and allowlists on both sides of the iframe;
  a short 15-minute token life, with a fresh token requested quietly over the same
  channel when it expires (the backend keeps conversation state, so an expiring token
  never loses a claim in progress). Renewal is not unlimited: it only works while the
  companion sits inside a live, authenticated portal page, so the portal session is the
  real outer bound, and every renewal re-reads the user's profile, so a role or
  deceased-flag change is never more than 15 minutes stale. No secrets in the browser;
  re-validation and re-authorization on every request; and every validation and
  authorization outcome, including expired or invalid tokens, written to the audit log
  with the audit fields the brief requires.

---

## 6. Quotes & Alterations (What-If)

- **Field(s) simulated:** sum assured and waiting period, together, because the
  interesting question is always the trade between them.

- **Formula used** (from the brief's What-If rules, computed in backend code, never by
  the model):

  `new = max(200, current × (requested / current_sum) × factor)`

  with the waiting-period factor: 0 months = 1, 3 = 0.95, 6 = 0.9, 12 = 0.82,
  24 = 0.72.

  Worked example: cover of R500 000 at R300 per month, asking "what if I drop to
  R400 000 with a 6-month waiting period": max(200, 300 × 0.8 × 0.9) = **R216 per
  month**. The floor is real: the same policy dropped to R200 000 works out to R108
  raw, so it is quoted as the R200 minimum, and the assistant says that is why.

  Per the same rules the result is saved to the session, always labeled an estimate, and
  human review is offered when the user wants to act on it.

- **How the trade-off is explained to the user:** call 1 extracts the requested
  numbers, code computes both sides, and call 2 receives the old premium, the new
  premium and what the factor means, with instructions to state the exchange in plain
  language: "about R216 instead of R300, because you would wait 6 months before cover
  starts; a shorter wait costs more." The wireframe's Adjust screen shows the same pair
  side by side. The "estimate, not a final quote" line is appended by code after the
  model's reply, so it cannot be phrased away (the brief's honesty rules forbid
  presenting estimates as final).

---

## 7. Simple Self-Service Update

- **Field chosen:** residential address, the brief's low-risk update flow, which lets
  the same section show the high-risk contrast honestly.

- **Conversational capture and validation:** no form. Call 1 extracts whatever address
  parts the user volunteered, in any order ("I've moved to 12 Protea Rd in Rondebosch");
  the workflow-state card tracks which required fields are still missing, and the
  assistant asks only for those. Validation is code, not model judgement: all required
  fields present, postal code exactly 4 digits. The full address is read back for
  confirmation before anything is written, a province change is additionally logged as
  an event, and the change plus its audit entry commit in one transaction.

- **High-risk flagging:** the brief's processing rules mark banking changes (account
  number 7 to 11 digits, branch code 6 digits, account name must match) and beneficiary
  changes (allocations must total 100%) as high-risk, so they are never auto-committed:
  the backend validates the format, saves a pending change, routes it to the
  human-review queue, and tells the user plainly that a person will confirm it. The
  other escalation triggers work the same way: a claim over R1M offers human review, an
  unauthorized action is blocked outright, a data conflict stops the flow, and repeated
  errors switch the assistant from retrying to actively helping. Every one of
  these outcomes is written to the audit log with the fields the brief requires: user,
  policy, role, action, auth result, validation result, hand-off flag, reason, session
  ID.

---

## 8. Empathetic Claims Support

- **Non-linear flow design:** the claim is a server-side state machine, not a script.
  Because the intent classifier runs on every message, a grieving user can interrupt
  the claim to ask "what does the policy actually cover?", answer an earlier question
  they skipped, or simply stop for the day. Progress lives in the pinned workflow-state
  card in the backend, not in the transcript, so the claim resumes exactly where it
  stood: tomorrow, or after the token has renewed, without re-asking anything. The
  wireframe's "Where things stand, in your own time" panel is this card made visible.

- **Dynamic document checklist:** assembled in code from the brief's claims checklist
  rules. Every claim
  needs the claim form, ID documents, policy number and banking details; the claim type
  then adds its own: death adds the death certificate and relationship proof, funeral
  the death certificate, income protection medical plus income proof, disability a
  specialist report, critical illness the diagnosis and tests. When the deceased flag
  is set, the death certificate is shown pre-ticked as already on file, because the
  flag means Momentum has verified it (section 11); the one document a bereaved person
  dreads producing is the one we never ask for. File collection is simulated: the user
  says they have a document (or taps its checklist entry) and the backend marks it
  received in the workflow-state card; no real upload or storage in this round.

- **SLA timelines:** the brief's published timelines: death and funeral claims 3 days, income
  protection 5, disability and critical illness 10. Shown at the two moments they
  matter: when the checklist completes ("everything is in; death claims are processed
  within 3 working days") and whenever the user asks how long or what now. Never
  claimed as done while anything is pending, per the brief's honesty rules.

- **Tone and empathy:** the moments that can wound are never improvised: the opening
  of a death claim, every refusal, and every escalation use fixed, human-written text.
  Around them the model phrases routine steps inside a tone guide: short sentences, no
  cheer, no exclamation marks, one question at a time. The brief's user-side
  escalation triggers (repeated confusion, distress, legal threats) hand off to a
  person, and the offer of human help is standing, not a last resort.

---

## 9. Architecture Diagram

Primary diagram: **[architecture-diagram.html](architecture-diagram.html)** at the repo
root; open it in any browser, no build step, or view the hosted copy without cloning at
**https://host-html.com/p/kpzzj1**. It shows everything the brief asks a judge to
find: the four trust zones as labelled boundaries (host portal, embedded companion,
companion backend, external AI Gateway), the identity JWT handed host to companion to
backend and stopping there, the gateway's OAuth2 machine credentials confined to the
backend on their own path, the offline ingestion and embedding pipeline into pgvector,
and session memory (the rolling window and the pinned workflow-state card) in Postgres.
It also walks the eight steps of one message's request lifecycle, including both model
calls and the role gate between them.

The same architecture is kept in two more forms for different readers:
[docs/architecture.md](docs/architecture.md) (mermaid, renders directly on GitHub, with
sequence diagrams of an allowed and a refused request) and
[docs/how-it-works.md](docs/how-it-works.md) (the plain-language walkthrough).

---

## 10. Scoping Decisions and Trade-offs

- **In scope for the build:** the identity chain already runs as real code. The host
  signs RS256 tokens and publishes its public key at a JWKS endpoint; the backend
  fetches that key and checks the signature, issuer, audience and expiry on every
  request; tampering with a token produces a signature failure. The database schema is
  committed and seeded: profiles, sessions with the workflow-state card, the audit
  log, and the documents table with its parent-child columns and vector index. Every
  module that is not built yet exists as a labelled stub route, so the finals work is
  filling in bodies rather than rearranging the structure.

- **Deliberately simplified / mocked:** login is two buttons, one per persona, that
  sign real JWTs instead of going through an identity provider. The backend still
  verifies exactly what a real OIDC provider would give it, so swapping in Momentum's
  SSO later changes the host, not the backend. The shell embeds a single direct iframe
  where the full design uses the loader with its pill and panel; the trust boundary
  being demonstrated is the same. The shell's backend is plain JavaScript to keep the
  skeleton readable; the full design's backend is TypeScript, as section 2 states.
  Gateway calls are stubs behind a single client module until credentials are issued.

- **Out of scope (and why that is the right call):** orchestration frameworks, because
  at two model calls per turn our own code is smaller than a framework's
  configuration, and the role gate between the calls has to be our code anyway. Redis,
  because it would be overkill at this stage: Postgres already holds sessions
  transactionally next to the audit log, this chat's traffic gives a cache nothing to
  speed up, and it would add a second store to run on a judge's machine. Row-level
  security, because the guide is product-level and contains nothing personal; the
  design records where it switches on once per-customer documents arrive. Real SSO,
  payments and policy admin systems are mocked at their interfaces, which is what a
  design round asks for.

- **Biggest risk and your mitigation:** a small model misreading intent or inventing
  policy detail in front of a grieving person. We deal with this in the structure, not
  by hoping. Intents come from a fixed list and default to refusal. The role check
  between the two calls is deterministic code. Answers are built only from retrieved
  guide sections, and when nothing scores well enough the approved fallback response
  goes out instead of a guess. Structured output is schema-checked with one bounded
  retry, and the emotionally critical lines are human-written templates. The second
  risk is gateway credentials arriving late: everything that needs them sits behind
  one client module, ingestion runs offline, and the demo would fall back to canned
  gateway responses rather than a broken flow.

- **First at the finals:** wire the gateway client and the two-call orchestrator, then
  ingest the full guide, then run the claims flow end to end. Each piece demos through
  the previous one, and grounded Q&A plus one working gated action proves the security
  story early.

---

## 11. Assumptions and Open Questions

**Assumptions**

- A listed beneficiary has no companion access until the deceased flag is set. The flag
  unlocks the restricted role; it never upgrades anyone.
- A policyholder whose death has been verified can no longer log in, so "policyholder
  with the flag set" cannot occur.
- A set deceased flag means the insurer has already validated the death certificate, so
  the claims checklist marks it as on file and never asks the bereaved beneficiary to
  supply it again.
- Token issuance and renewal are logged by the identity provider (the host portal,
  mocked here), as a production IdP would; the companion's audit log records validation
  and authorization outcomes, which is the enforcement record.
- The provided policy guide is product-level and contains nothing personal, so retrieval
  filtering is a relevance tool today. The day per-customer documents join the store,
  the same metadata filter plus row-level security becomes access control.
- Stored conversation history is personal data; retention and access would follow
  Momentum's data policies.

**Open questions**

- The gateway's OAuth2 token endpoint URL (a placeholder in `.env.example` until
  credentials are issued).
- Whether the full policy guide at the finals keeps the heading structure our
  section-based chunker assumes (the fixed-size fallback covers it if not).

---

## 12. Environment Shell Run Instructions

Prerequisites: Node.js 20+, Docker (or a local Postgres 15+ with pgvector; see the
shell's README for that path).

```bash
git clone https://github.com/MnR-Hackathon-Group-C/nullius-in-verba.git
cd nullius-in-verba/momentum-companion-shell
npm run quickstart
```

`quickstart` chains four steps, each safe to re-run and available individually:
`npm run setup` (mock RS256 keypair, git-ignored), `docker compose up -d db`
(Postgres + pgvector, seeds itself on first boot), `npm run install:all`, and
`npm run dev` (backend :4000, companion :3001, host :3000). Without Docker it
skips the database and carries on; the hello-world flow does not touch it yet.

Open **http://localhost:3000**, log in as Policyholder or Beneficiary, and watch the
companion iframe receive the token and report the backend's verification, including the
role and deceased-flag claims. `npm run dev` starts the three services together and
works on Windows, macOS and Linux; they can also be run separately
(`npm run dev:backend`, `dev:companion`, `dev:host`). Alternatively the whole project
comes up with Docker alone, no local Node needed: `docker compose --profile full up`
generates the keys, seeds the database and starts all three services (slower first
start).

Environment variables: every variable in the codebase is listed in
`momentum-companion-shell/.env.example` with placeholder values. The gateway OAuth2
client-credentials are placeholders until issued, are read only by the companion
backend, and are never committed or referenced in frontend code.
