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

> This section carries significant marks. Keep the two auth layers clearly separate.

### 5.1 Mocked end-user identity
- **Token format and claims:** _e.g. mock JWT with subject, role, policy id, issuer, audience, expiry._
- **How roles are derived:** _policyholder vs beneficiary, and how the deceased-state flag promotes a linked beneficiary to the restricted role._
- **Server-side enforcement:** _how every protected action is authorized on the backend, not the UI._

### 5.2 Role-to-capability matrix
> Fill in what each role may do. Beneficiary must be restricted to Policy Q&A and Claims only.

| Capability | Policyholder | Beneficiary |
|---|---|---|
| Grounded Policy Q&A | | |
| Quotes & Alterations (What-If) | | |
| Self-Service Updates (e.g. address) | | |
| Claims Support | | |

### 5.3 Host-to-companion embedding
- **Embedding mechanism:** _iframe / web component / script embed, and why._
- **Identity handoff:** _how the host passes a short-lived scoped token to the companion (e.g. postMessage with origin allowlist, or signed handoff token), and how the companion backend validates signature, issuer, audience, and expiry._
- **Trust boundaries:** _confirm the user identity token and the gateway machine credentials are separate and never cross boundaries. Reference your architecture diagram._
- **Security notes:** _origin checks, token TTL, no secrets in the browser, re-validation on every request._

> If you chose an alternative to the recommended host-and-widget model (e.g. a single SPA with route/API
> guards), justify it here and explain how you preserve the same trust boundaries.

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

> Document any assumptions you made and anything you would confirm with Momentum given more time.

_Your answer here._

---

## 12. Environment Shell Run Instructions

> A judge must be able to clone and run the Hello World setup. Keep this copy-pasteable.

```bash
# Frontend
# Backend
# Environment variables / placeholders (do NOT commit real secrets)
```
