# How It Works

The readable companion to [architecture.md](architecture.md): the same design, the same
proper names, simpler pictures. Every technical term is explained where it first appears.

## The four trust zones

The system is four zones with different levels of trust. Each boundary between them is
where security is enforced, and a different credential crosses each one.

```
  ┌──────────────────────────────────────────────────────────┐
  │  TRUST ZONE 1 — HOST PORTAL (browser)                    │
  │  The insurer's portal where you log in (mock OIDC).      │
  │  It issues your identity as a signed JWT: a small pass   │
  │  stating user ID, role, policy ID, deceased flag,        │
  │  issuer, audience and expiry.                            │
  └──────────────────────┬───────────────────────────────────┘
                         │  postMessage handoff: the JWT is passed to
                         │  the iframe, pinned to its exact origin
                         ▼
  ┌──────────────────────────────────────────────────────────┐
  │  TRUST ZONE 2 — EMBEDDED COMPANION (iframe)              │
  │  The chat UI, on its own origin. Holds only the JWT.     │
  │  No secrets, no role logic, no login of its own.         │
  └──────────────────────┬───────────────────────────────────┘
                         │  HTTPS, with the JWT attached to every
                         │  message (a Bearer token)
                         ▼
  ┌──────────────────────────────────────────────────────────┐
  │  TRUST ZONE 3 — COMPANION BACKEND                        │
  │  Our server. On every request it:                        │
  │  1. verifies the JWT (signature, issuer, audience,       │
  │     expiry) against the portal's published public key    │
  │  2. checks the role-capability matrix                    │
  │  3. does the work: retrieval, calculations, claims,      │
  │     memory, audit log                                    │
  └──────────────────────┬───────────────────────────────────┘
                         │  OAuth2 client-credentials: machine
                         │  credentials that identify OUR APP, not you.
                         │  They live only on the backend and never
                         │  enter the browser.
                         ▼
  ┌──────────────────────────────────────────────────────────┐
  │  TRUST ZONE 4 — MOMENTUM AI GATEWAY (external)           │
  │  Stateless AI service: chat (claude-3-haiku) and         │
  │  embeddings (titan-embed-text-v2). Remembers nothing.    │
  └──────────────────────────────────────────────────────────┘
```

Two credentials, never the same one: the **user JWT** proves who the human is and stops
at our backend; the **gateway machine credentials** prove who our application is and only
travel from backend to gateway.

Two details about the JWT worth knowing. The backend verifies it against a public key the
portal publishes (a JWKS endpoint), so the backend can check any pass but could never
forge one; only the portal can create identity. And the JWT deliberately expires after a
few minutes: the chat quietly requests a fresh one over the same postMessage channel, and
because the backend keeps your place server-side, an expired token never loses your
progress mid-claim.

## Authorization: who may do what

```
           [ Message arrives + Bearer JWT ]
                          │
                          ▼
           ┌─────────────────────────────┐
           │      Token validation       │ ◄──  done by the companion backend on
           │  (signature, issuer,        │      every message; it reads the claims:
           │   audience, expiry)         │      user ID, role, policy ID, deceased_flag
           └──────────────┬──────────────┘
                          │  the backend branches on role + deceased_flag together
        ┌─────────────────┼─────────────────────────┐
        ▼                 ▼                         ▼
  role = POLICYHOLDER  role = BENEFICIARY     role = BENEFICIARY
  deceased_flag=FALSE  deceased_flag = TRUE   deceased_flag = FALSE
 ┌───────────────────┐ ┌────────────────────┐ ┌────────────────────┐
 │ • Policy Q&A      │ │ • Policy Q&A       │ │ No access to this  │
 │ • Premium What-If │ │ • Claims           │ │ policy yet: every  │
 │ • Detail updates  │ │                    │ │ request is refused │
 │ • Claims          │ │ Anything else is   │ │ and audited        │
 └───────────────────┘ │ REFUSED + audited  │ └────────────────────┘
   (a deceased          └────────────────────┘   (being named on a
    policyholder                                  policy grants
    cannot log in, so                             nothing while the
    this flag is always                           policyholder is
    FALSE here)                                   alive)
```

**What the deceased flag actually is.** It is a field on the *policyholder's* profile,
not the beneficiary's. Momentum sets it when the policyholder's death has been verified.
When a beneficiary signs in, the portal copies that fact into their token as the claim
`deceased_flag`, so for a beneficiary it answers one question: has the policyholder on
this policy passed away? It is the single fact that unlocks the restricted Beneficiary
role. It never upgrades anyone: a beneficiary with the flag set gets Q&A and claims only,
and without it they get nothing on this policy. On a policyholder's own token the flag is
always false, because a deceased policyholder cannot log in.

**Who does what in this chain:**

| Actor | Responsibility |
|---|---|
| Momentum (the insurer) | Verifies the death and sets `deceased_flag` on the policyholder's profile. The only party who can assert it. |
| Host portal | Authenticates the user at login, reads the profile, and signs the role and the flag into the JWT. The only party who can issue identity. |
| Companion backend | Verifies the JWT and applies the role + flag rules on every single request; refuses what the role does not allow and writes the audit entry. The only party that enforces. |
| Chat UI | Displays what the backend allows. Decides nothing. |
| AI model | Phrases replies. It is never part of any access decision. |

Nothing is merely hidden in the UI. A request outside your role is refused by the server
itself, every time, and the audit log records the full picture of every action: user,
policy, role, the action, the authorization result, the validation result, the hand-off
flag, the reason, and the session ID.

## Preparing the knowledge: the ingestion pipeline

Before the assistant can answer anything, the policy guide is processed once, offline, by
a standalone script. The backend never depends on this at startup.

```
        [ Myriad Policy Guide (PDF) ]
                       │
                       │  OUR INGEST SCRIPT splits it along the
                       │  guide's own headings: one full section
                       │  per PARENT, the whole clause kept intact
                       ▼
        [ Parents: "Cooling-off", "Cessions", ... ]
                       │
                       │  each parent is split again into small,
                       │  targeted CHILD pieces (a few hundred
                       │  tokens), each remembering its parent
                       ▼
        [ Children, linked to their parents ]
                       │
                       │  MOMENTUM'S GATEWAY turns each CHILD into
                       │  an embedding, a numerical fingerprint of
                       │  its meaning (titan-embed-text-v2); small
                       │  pieces make searching precise
                       ▼
        [ Vector store: Postgres + pgvector ]
           OUR DATABASE stores the child embeddings
           and the full parent text side by side,
           alongside profiles, sessions and audit
```

The split matters because of the small model: we search the small pieces (precise
matching, no noise) but we never show them to the model alone. The model always receives
the full parent section, so it sees the surrounding rules and exclusions, not an orphaned
fragment.

## Answering a question honestly (RAG)

RAG, retrieval-augmented generation, means: find the relevant document pieces first, then
let the model answer only from those pieces.

```
        [ "How long is the cooling-off period?" ]
                          │
                          ▼
           ┌─────────────────────────────┐
           │  Search the vector store    │ ◄── THE BACKEND embeds the question
           │  (cosine similarity against │     (via the gateway), searches the
           │   the small CHILD pieces,   │     CHILD pieces, and judges the
           │   top 3 to 5)               │     match scores itself
           └──────────────┬──────────────┘
                          │
             ┌────────────┴──────────────┐
             ▼                           ▼
      good match found            nothing close enough
   (score above threshold)      (score below threshold)
             │                           │
             ▼                           ▼
   THE BACKEND swaps each       THE BACKEND declines:
   matched child for its full   "I can't confirm that from
   PARENT section, and           the provided documents"
   THE MODEL phrases the         + a human is offered.
   answer from those parents,    The model is never even
   citing the source ("per       called; the honesty rule
   Cooling-off, 31 days")        lives in our code
```

## Remembering the conversation: session memory

The gateway is stateless, so the backend owns memory. Each request to the model carries:

```
  ┌───────────────────────────────────────────┐
  │  the last 6 to 10 messages                │   a rolling window
  │  + a pinned workflow-state card:          │   THE BACKEND keeps this
  │    which journey, which fields collected, │   card up to date and
  │    what the role allows                   │   includes it in every
  └───────────────────────────────────────────┘   call to the model
   THE BACKEND stores it in Postgres, scoped per
   user AND role, so sessions never bleed across;
   the model and the UI hold no memory of their own
```

The prompt stays a constant size while the facts that matter never fall out of view.

## Premium What-If (quotes and alterations)

```
        [ "What if I lower my cover to R1 000 000?" ]
                       │
                       ▼
        THE BACKEND asks THE MODEL to name the
        intent: "whatif" (a model call that
        performs nothing)
                       │
                       ▼
        THE BACKEND checks the role:
          Beneficiary? ──► REFUSED and audited, replied
                       │   with a fixed template; no action
                       ▼   runs, no second model call
        ┌─────────────────────────────┐
        │  Backend-only formula       │  new = max(200, current ×
        │  (THE BACKEND's maths,      │  (requested / current sum) × factor)
        │   never the model's)        │
        └──────────────┬──────────────┘
                       ▼
        ┌─────────────────────────────┐
        │  Reply: labelled ESTIMATE,  │  THE MODEL phrases it; the numbers
        │  never a final quote        │  come from the backend. Trade-off
        └──────────────┬──────────────┘  explained: what you save, what
                       │                 you give up
                       ▼
          THE BACKEND saves the result
          + offers a human consultant
```

## Self-service updates (address change)

```
        [ "I've moved, here's my new address" ]
                       │
                       ▼
        THE BACKEND asks THE MODEL to name the
        intent: "update" (a model call that
        performs nothing)
                       │
                       ▼
        THE BACKEND checks the role:
          Beneficiary? ──► REFUSED and audited, replied
                       │   with a fixed template
                       ▼
        ┌─────────────────────────────┐
        │  Conversational capture     │  THE MODEL asks for what is missing,
        │  (workflow-state card       │  warmly; THE BACKEND's state card
        │   tracks what is missing)   │  tracks the fields, in any order,
        └──────────────┬──────────────┘  nothing asked twice
                       ▼
        ┌─────────────────────────────┐
        │  Validation in code         │  THE BACKEND checks: required fields
        │                             │  present, postal code exactly 4 digits
        └──────────────┬──────────────┘
                       ▼
        normal change: THE BACKEND saves + audits it
        banking / beneficiary change: never completed
        in-chat, routed to A HUMAN via the review queue
```

## Filing a claim

```
              [ "I need to claim" ]
                       │
                       ▼
        THE BACKEND asks THE MODEL to name the
        intent: "claim" (a model call that
        performs nothing); the role gate passes,
        both roles may claim
                       │
                       ▼
        ┌─────────────────────────────┐
        │     What kind of claim?     │  THE MODEL asks gently; THE BACKEND
        └──────────────┬──────────────┘  classifies: death / funeral / income /
                       ▼                 disability / critical illness
        ┌─────────────────────────────┐
        │  Checklist for that type,   │  THE BACKEND's state machine derives
        │  tracked by a server-side   │  it, e.g. funeral: death certificate
        │  state machine              │  + ID. A set deceased flag means the
        └──────────────┬──────────────┘  certificate is already on file and
                       │                 pre-ticked, never requested from the
                       │                 bereaved; the rest can arrive in any
                       │                 order, nothing asked twice
                       ▼
        ┌─────────────────────────────┐
        │  Documents ticked off as    │  THE BACKEND tracks arrivals; upload
        │  they arrive                │  is simulated in this phase, the
        └──────────────┬──────────────┘  tracking is real
                       ▼
        ┌─────────────────────────────┐
        │   Honest timeline stated    │  THE BACKEND looks up the SLA:
        │       (claim SLAs)          │  death/funeral 3 days, income 5,
        └──────────────┬──────────────┘  disability/critical illness 10;
                       │                 THE MODEL delivers it with care
                       ▼
         very large claim, signs of distress,
                  legal threats
                       │
                       ▼
        [ handed to A HUMAN, always ]
        (review queue; THE BACKEND writes
         every step to the audit log)
```

## Two stories

**Sipho files a claim.** Sipho's mother passed away recently. He logs into the portal and
the assistant already knows he is her beneficiary, so it only offers what he is allowed to
do: ask questions and claim. It gently tells him which documents a funeral claim needs,
and the death certificate is already ticked off: his mother's death was verified when the
deceased flag was set, so he is never asked for it. He can send the rest in any order,
nothing is asked twice, and he is told honestly that assessment takes up to 3 working days
once everything is in. If the conversation shows distress, a human is offered immediately.

**Thandi checks a What-If.** Thandi wonders what happens to her premium if she lowers her
cover. The assistant runs the numbers using Momentum's own formula (a backend calculation,
not the AI guessing) and explains the trade-off in plain terms. The answer is clearly
labelled an estimate, never a final quote; the result is saved so a consultant can pick it
up, and she is offered that consultant on the spot.

## The four promises the design makes

1. **The assistant only sees you after the portal has confirmed who you are.** It never
   handles passwords and never decides identity itself.
2. **It can only do what your role allows.** The role-capability matrix is enforced by the
   backend on every single request, not by the AI and not by the app hiding buttons.
3. **It answers only from the real policy documents.** If the documents do not cover a
   question, it says so and offers a human, instead of guessing.
4. **Anything sensitive goes to a person, from anywhere.** Banking or beneficiary
   changes, very large claims, signs of distress, repeated confusion or legal trouble
   are handed to a human, and this hand-off can happen at any point in any conversation,
   not only during claims. Every action is written to the audit log.

## Why it feels capable despite a small AI model

The AI model we are given (Claude 3 Haiku) is small and fast, not deep. The design
compensates: the backend does the remembering (session memory), the calculating (premiums
and timelines), and the rule-keeping (the role matrix and validators). The model's job is
narrow on purpose: understand what you asked, and phrase the answer warmly. Structure
carries the substance; the AI carries the tone.
