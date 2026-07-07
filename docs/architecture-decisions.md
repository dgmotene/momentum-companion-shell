# Architecture Decisions

This document records the ten design decisions we locked in on 7 July 2026 for the
Accessible Life Insurance AI Companion, and the reasoning behind each one. It is written to
be read on its own, including by someone who is not deep in the technical detail. The
wording is also meant to feed straight into SUBMISSION.md (the stack table in section 2 and
the trade-offs in section 10).

## Background

Everything we build talks to Momentum's AI Gateway. It is a simple, stateless API: you send
it text, it sends text back, and it remembers nothing between calls. The only chat model on
offer is Claude 3 Haiku, which is a small model, plus an endpoint that turns text into
embeddings (numerical fingerprints of text, used for searching by meaning). The gateway has
no document search, no tool-calling and no conversation memory. All of that has to be built
by us, in our own backend.

A few other facts shaped the decisions:

- The gateway has a known bug: asking it for structured output through the OpenAI Python
  SDK does not work, and the brief tells us to plan a fallback.
- Judges must be able to clone our repository and run it. This is pass or fail.
- Scoring weights: architecture 30%, scoping and trade-offs 25%, security and identity 20%,
  UX and empathy 15%, video 10%.
- There are two kinds of user. A policyholder can do everything: ask questions, get what-if
  premium estimates, update their details and file claims. A beneficiary can only ask
  questions and file claims, and someone only becomes a beneficiary when a deceased flag is
  set on the policyholder's profile.

## The decisions at a glance

| # | Decision | What we chose |
|---|----------|---------------|
| 1 | Backend runtime | Node.js |
| 2 | Vector store | Postgres with the pgvector extension |
| 3 | JWT signing scheme | RS256 signed tokens with a mock JWKS endpoint |
| 4 | Embedding mechanism | iframe with postMessage handoff |
| 5 | Orchestration pattern | Classify first, then act, built by hand |
| 6 | Session memory shape | Recent messages plus a running summary card |
| 7 | Workflow state location | The backend keeps the state, not the model |
| 8 | App datastore | Same Postgres database, separate tables |
| 9 | Ingestion timing | A one-time script, seed data committed to the repo |
| 10 | Chunking and retrieval parameters | Along the guide's own headings, top 3 to 5 matches |

---

## Decision 1: Backend Runtime (Node vs Python)

The backend is where everything that gets scored actually lives, so this call came first.
The brief allows Python or Node and nothing else.

We picked Node for three reasons. The known gateway bug is specifically about the Python
SDK, and our whole design depends on getting reliable JSON out of the model, so building on
the flagged path felt like an unforced error. Node also means one language across the whole
project, since the frontend is Next.js. And it keeps setup simple for the judges: npm
install and run, one toolchain instead of two.

Python's appeal was team familiarity and its excellent validation tooling, but neither
outweighed the above. In any case we validate the model's JSON output ourselves whatever the
language, because the documentation does not promise that Node's structured output mode
works either.

## Decision 2: Vector Store (in-memory vs SQLite vs pgvector)

To answer policy questions, we break the policy guide into pieces, turn each piece into an
embedding, and store those embeddings so the backend can find the relevant pieces when a
user asks something. The store that holds them is called a vector store. The candidates
were: keep the vectors in memory, keep them in a SQLite file, or use Postgres with its
pgvector extension.

We chose Postgres with pgvector. It is the path the gateway's own documentation showcases,
it does the similarity search natively inside the database, and the same database holds the
rest of our application data (decision 8), so there is one system to set up and one to
explain. It also needs no rework at the finals, when the full policy guide arrives and the
document set grows.

The price is that judges need Postgres running, and their clone-and-run test is pass or
fail. The setup section at the end covers how we take the sting out of that: a
docker-compose file starts everything in one command, and plain instructions are included
for anyone not using Docker.

The other two options lost on durability. In-memory vectors disappear every time the
backend restarts, which means re-embedding the guide on every boot and a backend that
cannot start at all when the gateway is down. SQLite persists, but it has no vector search
of its own, so we would be writing the similarity maths in our own code and spending the
write-up defending it.

## Decision 3: JWT Signing Scheme (mock end-user identity)

When someone logs into the host portal, the portal gives their browser a token: a small
signed package stating who they are, what role they have and which policy is theirs. The
chatbot backend checks that token on every request. The signature is the part that matters,
because it is what stops a user from editing "beneficiary" to "policyholder" in their
browser and granting themselves extra access.

The decision was how to sign. We went with RS256: the portal signs tokens with a private
key that only it holds, and the backend verifies them using a matching public key published
at a standard web address (called a JWKS endpoint). This is exactly how real login
providers such as Okta and Auth0 work. Our backend can check any token but could never
create one, which keeps the security boundary honest.

That simpler alternative, HS256, uses one shared secret for both signing and checking. It
lost because the secret would have to live on both sides, and anything that can verify a
token can then also forge one. That blurs the exact boundary this architecture is supposed
to demonstrate. We also looked at running a real login server, which is far too heavy a
dependency for a judged clone-and-run repository, and at unsigned tokens, which are
precisely the shortcut the brief says is not acceptable.

## Decision 4: Embedding mechanism (host to companion)

Users meet the chatbot inside the host portal, not on a separate site, so we had to choose
how it gets embedded in the portal page.

We chose an iframe. The chat runs as its own small app on its own web address, displayed
inside a frame on the portal page. Browsers keep an iframe and the page around it strictly
separated: portal code cannot reach into the chat and read anything, and chat code cannot
reach out. The portal hands the login token across using postMessage, the standard browser
channel for talking across that separation, and the chat only accepts messages from
addresses on its allowlist. This is also the approach the brief itself recommends.

The main alternative was a script widget, the floating chat bubble many websites use. Those
run inside the host page itself, which means any other code on that page could read the
user's token and the conversation. The last option, making the chat just another page of
the portal, removes the separation entirely. This blurs the security boundary, as the
brief warns.

## Decision 5: Orchestration pattern (tool-calling without tool-calling)

Modern AI platforms let a model trigger actions directly, a feature called tool-calling.
Our gateway has none, so on every message our backend must itself figure out what the user
is asking for. A policy question? A premium what-if? An address change? A claim?

We handle each message in two steps. First comes a small model call whose only job is to
classify the request and pull out the details the user gave, such as amounts or addresses.
Then our own code takes over: it checks whether this user's role allows that action, does
the actual work, and finally asks the model to phrase a friendly reply. The moment between
the two steps is the valuable part, because it belongs to our code and not to the model.
That is where a beneficiary asking for a premium quote gets refused, reliably and with an
audit trail, before any answer is ever generated. Small models are also simply better when
each call has one narrow job.

The one-call alternative, a single big prompt returning the intent and the answer together,
is cheaper per message but asks a small model to juggle three jobs at once, and one giant
prompt is hard to tune without breaking something else. Frameworks such as LangChain lost
because their abstractions assume the tool-calling our gateway lacks, and because the
judges are testing whether we understand orchestration ourselves. "The library does it" is
a poor answer. Two Haiku calls per message is a cost we accept; the model is fast and
cheap.

## Decision 6: Session memory shape

Because the gateway remembers nothing, every request must carry whatever the model needs to
know about the conversation so far.

We send the last six to ten messages, together with a small structured card that our code
keeps up to date: which task the user is busy with, what information they have already
given, and what their role allows. The card is always included, however old the facts on it
are. The prompt therefore stays roughly the same size forever, while the facts that matter
never fall out of view. For a small model, a compact "here is where we are" note works
better than pages of transcript.

Sending the full history every time lost because the prompt grows without limit, and long
histories genuinely make small models worse; they get distracted by stale messages and miss
the current question. Having the model periodically summarise old messages lost because it
spends gateway calls on housekeeping, and a small model summarising its own conversation
can distort facts, which is a real hazard when the conversation is about insurance.

## Decision 7: Workflow state location

Filing a claim or updating an address takes several messages back and forth. Something has
to keep track of where the user is: which claim type, which documents are still missing,
which fields are already filled in.

We keep that record in the backend, as an explicit checklist per task, instead of trusting
the model to work it out from the conversation each time. The backend always knows exactly
what has been provided and what is still outstanding, so nothing gets asked twice or
forgotten. Permission rules and validation attach to each step, every step change gets an
audit log entry, and the user can offer information in any order, because we track what is
missing rather than following a fixed script. The model's job shrinks to phrasing the next
question warmly. The machine carries the structure; the model carries the tone.

The alternative, letting the model infer the state from the transcript each turn, lost
because small models drop and invent details across multi-step tasks. In a claims
conversation that means asking a grieving person for the death certificate twice, or never.

## Decision 8: App datastore (profiles, sessions, audit log)

Mock user profiles, policy data, conversation sessions, the audit log and the human review
queue all need a home. They live in the same Postgres instance as the search index, in
their own tables.

This gives us one system and one seed script, plus proper database transactions, so a chat
turn saves its session update and its audit entry together or not at all. It also means the
audit log survives restarts, which is the entire point of an audit log.

A second database engine lost because it is one more thing for judges to install, for no
benefit when the demo has a handful of mock users. Plain JSON files lost because they
corrupt when two things write at once, and an audit log that vanishes on restart fails the
requirement in spirit.

## Decision 9: Ingestion timing

Before the assistant can answer anything, the policy guide has to be split up, embedded
through the gateway, and stored. We do this with a standalone script that is run once, not
something that happens whenever the backend starts.

The backend therefore starts instantly and does not depend on the gateway being reachable.
The whole pipeline sits in one readable file that judges can open and follow. And because
we commit the resulting seed data to the repository, a fresh clone boots with the guide
already loaded, even on placeholder gateway credentials. One caveat belongs in the
write-up: answering a live question still sends the user's query through the gateway to be
embedded, so real credentials are needed for actual answers. Startup and seed data are not
affected.

Embedding at startup lost because it makes boot slow, ties startup to gateway availability,
and re-spends embedding calls on every restart during a week of development. Embedding
lazily on the first question lost because it makes the first user sit through the entire
loading wait in the middle of their conversation.

## Decision 10: Chunking and retrieval parameters

How the guide gets split into pieces largely decides how good the answers are. If the
backend retrieves the wrong paragraphs, no amount of clever prompting saves the reply.

The Myriad guide is neatly organised under short headings such as "Cooling-off", "Cessions"
and "Premium patterns", so we split it along those headings, one section per piece, keeping
the heading inside the text. A question about cancelling then lands cleanly on the
Cooling-off section, and the heading gives the answer a natural citation, as in "per the
Cooling-off section, 31 days". For any section that runs too long, or a future document
that is less tidy, a plain fixed-size splitter is the fallback.

At question time the backend fetches the three to five best matching pieces, using cosine
similarity computed inside the database by pgvector. There is also an honesty rule enforced
in code: if nothing matches well enough, the backend declines to answer with the approved
fallback response instead of letting the model guess.

The standard alternative, splitting purely by size, lost because it slices across topics. A
piece that is half "Cooling-off" and half "Fees" matches both subjects weakly and neither
well, and citations turn vague.

---

## Setting the project up

Choosing Postgres means the repository has to make setup painless for anyone who clones it,
so it ships with:

- A docker-compose.yml that starts Postgres with the pgvector extension, already loaded
  from the committed seed file. This is the recommended one-command path.
- Plain instructions for running against a locally installed Postgres (version 15 or newer
  with pgvector), because Docker is a convenience and must never be the only way to run the
  project.
- The committed seed file, seed.sql, containing the schema, the mock profiles and the
  pre-embedded policy guide, so the backend starts with data even on placeholder gateway
  credentials.
- A single DATABASE_URL environment variable whose default matches the compose file, so the
  standard path needs no configuration at all.
