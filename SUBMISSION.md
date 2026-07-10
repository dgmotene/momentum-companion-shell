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
| Team name | |
| Team members (and who speaks to what in the video) | |
| Repository link (GitHub / GitLab) | |
| Walkthrough video link (mandatory, 3–5 min) | |
| Architecture diagram location (file / link) | |
| Wireframes location (Figma / images) | |

---

## 1. One-Paragraph Summary

> What you are building, for whom, and the single design idea you are most proud of. Five sentences max.

_Your answer here._

---

## 2. Technical Stack

> List the concrete choices and a one-line justification for each. Tie choices back to the constraints
> (stateless gateway, small chat model, no managed RAG, bring-your-own vector store).

| Layer | Choice | Why (tie to constraints) |
|---|---|---|
| Host (parent) application | | |
| Embedded companion frontend (React/Next.js) | | |
| Companion backend (Python / Node.js) | | |
| Datastore (profiles, policy data, sessions) | | |
| Vector store (pgvector / SQLite / in-memory / other) | | |
| Orchestration framework (Spring AI / OpenAI SDK / LangChain / custom) | | |

---

## 3. AI Gateway Integration

> Show you understand how you actually talk to Momentum's gateway.

- **Base URL / environment targeted:** _e.g. https://riskservicesdev.momentum.co.za/ai/api_
- **Chat model:** `anthropic.claude-3-haiku-20240307-v1:0`
- **Embedding model:** `amazon.titan-embed-text-v2:0`
- **Auth to the gateway (machine-to-machine):** _describe the OAuth2 client-credentials flow and where the secret lives. Confirm it is backend-only and never reaches the browser._
- **Where gateway calls are made from:** _which backend component, and why never the frontend._

### 3.1 Designing around the small chat model
> `claude-3-haiku` is the only chat model available. How does your architecture compensate so the
> companion still feels nuanced and empathetic? (Prompt strategy, retrieval grounding, workflow state,
> output validation, guardrails, etc.)

_Your answer here._

### 3.2 Designing around the stateless gateway
> The gateway has no memory and no native tool-calling. Describe how your backend supplies both.

- **Conversation memory strategy:** _what you store, where, how you append/trim/summarize history per session, how you scope it per user/role._
- **Tool-calling / orchestration strategy:** _how you trigger backend actions (e.g. the What-If formula, address validation, claims checklist) without native tool-calling. If you rely on structured output, describe your fallback given the known Python SDK structured-output limitation._

---

## 4. Grounded Policy Q&A (RAG)

> There is no managed RAG API; retrieval is your responsibility.

- **Ingestion pipeline:** _how the supplied policy documents are loaded, chunked, and embedded._
- **Vector store choice and justification:** _pgvector vs SQLite vs in-memory arrays, and why for this scale._
- **Retrieval and grounding:** _top-k, similarity metric, how context is assembled into the prompt._
- **Contextual honesty:** _how the assistant stays inside the documents and explicitly declines out-of-scope requests._

---

## 5. Authentication, Identity, and the Embedding Model

### 5.1 Mocked end-user identity

- **Token format and claims:** the host portal signs a mock OIDC JWT using RS256. It
  carries `sub` (user ID), `role`, `policy_id`, `deceased_flag`, `iss: host-portal`,
  `aud: companion-api`, and a 15-minute expiry. The companion backend fetches the host's
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
  rejected a script-embed widget because it runs inside the host page, where any other
  script could read the token, and a single SPA because it removes the boundary this
  challenge is testing.

- **Identity handoff:** the companion tells its parent window it is ready
  (`COMPANION_READY`); the host replies with the JWT via `postMessage`, aimed at the
  companion's exact origin; the companion only accepts messages from origins on its
  allowlist. The ready-first handshake avoids timing problems on slow loads. The backend
  then re-checks the token on every request; the handoff is never trusted on its own.

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
  with the Appendix A9 fields.

---

## 6. Quotes & Alterations (What-If)

- **Field(s) simulated:** _sum assured / waiting periods._
- **Formula used:** _reference the Virtual Phase Brief Appendix; show the formula and a worked example._
- **How the trade-off is explained to the user:** _how the assistant communicates that, e.g., lowering premium extends waiting thresholds._

---

## 7. Simple Self-Service Update

- **Field chosen:** _e.g. address change._
- **Conversational capture and validation:** _how data is gathered formlessly and format-validated._
- **High-risk flagging:** _what counts as high-risk (per the Virtual Phase Brief Appendix) and how it is routed to human review, including what gets logged._

---

## 8. Empathetic Claims Support

- **Non-linear flow design:** _how the guide adapts rather than marching through a fixed form._
- **Dynamic document checklist:** _how required documents are surfaced based on claim type._
- **SLA timelines:** _which timelines are shown and when._
- **Tone and empathy:** _how the experience stays supportive during a post-death, high-stress interaction._

---

## 9. Architecture Diagram

> Embed or link the diagram. It must show the four trust zones (host app, embedded companion,
> companion backend, external AI Gateway), the identity token handed from host to companion, the
> separate gateway machine credentials, the document ingestion/embedding pipeline, and session memory.

_Diagram / link here._

---

## 10. Scoping Decisions and Trade-offs

> The judges weight this heavily. What did you deliberately include, simplify, or leave out, and why?
> What would you build first at the in-person finals?

- **In scope for the build:** _..._
- **Deliberately simplified / mocked:** _..._
- **Out of scope (and why that is the right call):** _..._
- **Biggest risk and your mitigation:** _..._

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

> A judge must be able to clone and run the Hello World setup. Keep this copy-pasteable.

```bash
# Frontend
# Backend
# Environment variables / placeholders (do NOT commit real secrets)
```
