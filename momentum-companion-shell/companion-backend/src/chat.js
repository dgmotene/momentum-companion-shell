import OpenAI from "openai";
import pg from "pg";
import dotenv from "dotenv";
import { loadUserContext, formatUserContextForPrompt } from "./domain/user-context.mjs";

// Keep secrets outside the repository. Resolve the project-level local .env file
// so this works whether the script is run from the root or backend directory.
dotenv.config({ path: new URL("../../.env", import.meta.url) });

// ==========================================
// 1. CONFIGURATION & GATEWAY CLIENT SETUP
// ==========================================
const VIRTUAL_KEY = process.env.UNIVERSAL_API_KEY;
const GATEWAY_BASE_URL =
  process.env.GATEWAY_BASE_URL ?? "https://riskbifrostent.momentum.co.za/openai";

const CHAT_MODEL = process.env.CHAT_MODEL_URL || "bedrock/anthropic.claude-3-haiku-20240307-v1:0";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL_URL || "bedrock/amazon.titan-embed-text-v2:0";

// Created lazily so a missing key breaks chat requests, never backend boot.
let openaiClient = null;
function getOpenAIClient() {
  if (!VIRTUAL_KEY) {
    throw new Error("UNIVERSAL_API_KEY is required. Add it to the local .env file or environment.");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      baseURL: GATEWAY_BASE_URL,
      apiKey: VIRTUAL_KEY,
      defaultHeaders: {
        "x-git": "risk-ai-api",
        "x-bf-vk": VIRTUAL_KEY
      }
    });
  }
  return openaiClient;
}

// Initialize Postgres connection pool
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || "postgres://companion:companion@localhost:5432/companion"
});

// ==========================================
// 2. RETRY LOGIC (GATEWAY RESILIENCE)
// ==========================================
/**
 * Helper to execute functions with exponential backoff retries[cite: 1]
 */
async function callWithRetry(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    const cause = error.cause;
    const detail = [
      error.message,
      error.status && `status=${error.status}`,
      error.code && `code=${error.code}`,
      cause?.message && `cause=${cause.message}`,
      cause?.code && `causeCode=${cause.code}`
    ]
      .filter(Boolean)
      .join(" | ");
    console.warn(`[Gateway Warning] Request failed. Retrying in ${delay}ms... ${detail}`);
    await new Promise((res) => setTimeout(res, delay));
    return callWithRetry(fn, retries - 1, delay * 2);
  }
}

// ==========================================
// 3. CORE AI GATEWAY & DB FUNCTIONS
// ==========================================

/**
 * Generate embedding vector for user query (Titan Embeddings v2)
 */
export async function generateEmbedding(text) {
  return callWithRetry(async () => {
    const response = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: [text],
      encoding_format: "float"
    });
    return response.data[0].embedding;
  });
}

/**
 * Search relevant documents using pgvector (Cosine Distance)
 */
// Titan v2 scores run low: terse real questions land ~0.21, noise under ~0.15.
const MIN_SIMILARITY = Number(process.env.RAG_MIN_SIMILARITY ?? 0.2);

export async function searchVectorStore(queryVector, limit = 3) {
  const sql = `
    SELECT
      chunk.id,
      chunk.part,
      chunk.section,
      chunk.printed_page,
      chunk.content,
      (chunk.embedding <=> $1::vector) AS distance
    FROM rag_chunks chunk
    JOIN rag_documents document ON document.id = chunk.document_id
    WHERE document.status = 'ready'
      AND (chunk.embedding <=> $1::vector) <= $3
    ORDER BY distance ASC
    LIMIT $2;
  `;
  const { rows } = await pool.query(sql, [
    JSON.stringify(queryVector),
    limit,
    1 - MIN_SIMILARITY,
  ]);
  return rows;
}

const INTENTS = ["greeting", "thanks", "capabilities", "policy_question", "quote_request", "update_request", "claim", "confirm", "other"];
const CLAIM_TYPES = ["death", "funeral", "income", "disability", "critical_illness"];
const WAITING_MONTHS = [0, 3, 6, 12, 24];

// Call 1 of the two-call pattern: understand the message in one structured
// envelope. Code does everything else; this call never answers the user.
export async function understandMessage(userMessage) {
  const response = await callWithRetry(async () =>
    getOpenAIClient().chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `Analyse the user's message for a life insurance chat. Respond with ONLY JSON:
{"intent": one of ${JSON.stringify(INTENTS)},
 "claim_type": one of ${JSON.stringify(CLAIM_TYPES)} or null,
 "requested_sum": rand amount for a cover-change estimate, number or null,
 "waiting_months": one of ${JSON.stringify(WAITING_MONTHS)} or null (null when not mentioned or not one of these),
 "update_target": "address" | "banking" | "beneficiary" | null (what an update_request wants to change),
 "address": {"street": string|null, "suburb": string|null, "city": string|null, "province": string|null, "postal_code": string|null}}
Intent meanings: greeting = hello/smalltalk (typos too). thanks = thanks or goodbye. capabilities = asking what the assistant itself can do or help with, what to ask it, or how it works. confirm = a bare yes/confirm/correct agreeing to something. quote_request = what would my premium be if cover or waiting period changes. update_request = wants to change personal details, or is providing address details. claim = starting or asking about their claim. policy_question = questions about cover, benefits, rules, processes. other = none of these. Extract only what the user actually said; never invent values.`,
        },
        { role: "user", content: userMessage },
      ],
    })
  );
  try {
    const raw = response.choices[0].message.content.trim().replace(/^```json?|```$/g, "");
    const parsed = JSON.parse(raw);
    return {
      intent: INTENTS.includes(parsed.intent) ? parsed.intent : "policy_question",
      claimType: CLAIM_TYPES.includes(parsed.claim_type) ? parsed.claim_type : null,
      requestedSum: Number.isFinite(parsed.requested_sum) ? parsed.requested_sum : null,
      waitingMonths: WAITING_MONTHS.includes(parsed.waiting_months) ? parsed.waiting_months : null,
      updateTarget: ["address", "banking", "beneficiary"].includes(parsed.update_target)
        ? parsed.update_target
        : null,
      address: parsed.address && typeof parsed.address === "object" ? parsed.address : {},
    };
  } catch {
    return { intent: "policy_question", claimType: null, requestedSum: null, waitingMonths: null, updateTarget: null, address: {} };
  }
}

// The user's own policy record, so "my policy" questions answer personally.
export async function loadPolicySnapshot(policyId) {
  const { rows } = await pool.query(
    `SELECT policy.product_name, policy.sum_assured, policy.monthly_premium,
            policy.waiting_period_months, policy.status, policy.start_date,
            json_agg(json_build_object('name', benefit.benefit_name, 'cover', benefit.cover_amount)) AS benefits
       FROM policies policy
       LEFT JOIN policy_benefits benefit ON benefit.policy_id = policy.policy_id
      WHERE policy.policy_id = $1
      GROUP BY policy.policy_id`,
    [policyId]
  );
  return rows[0] ?? null;
}

/**
 * Manage Chat Session History and State
 */
export async function getOrCreateSession(profileId, role) {
  const selectSql = `SELECT * FROM sessions WHERE profile_id = $1 ORDER BY updated_at DESC LIMIT 1;`;
  const { rows } = await pool.query(selectSql, [profileId]);

  if (rows.length > 0) {
    return rows[0];
  }

  const insertSql = `
    INSERT INTO sessions (profile_id, role, history, workflow_state)
    VALUES ($1, $2, '[]'::jsonb, '{}'::jsonb)
    RETURNING *;
  `;
  const newSession = await pool.query(insertSql, [profileId, role]);
  return newSession.rows[0];
}

export async function updateSession(sessionId, history, workflowState) {
  const sql = `
    UPDATE sessions
    SET history = $1::jsonb,
        workflow_state = $2::jsonb,
        updated_at = NOW()
    WHERE id = $3;
  `;
  await pool.query(sql, [JSON.stringify(history), JSON.stringify(workflowState), sessionId]);
}

/**
 * Write action details to compliance audit log
 */
export async function logAudit({ profileId, policyId, role, action, authResult, validationResult, handoffFlag, reason, sessionId }) {
  const sql = `
    INSERT INTO audit_log (
      profile_id, policy_id, role, action, auth_result, validation_result, handoff_flag, reason, session_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
  `;
  await pool.query(sql, [
    profileId || null,
    policyId || null,
    role || null,
    action,
    authResult || null,
    validationResult || null,
    handoffFlag || false,
    reason || null,
    sessionId || null
  ]);
}

// ==========================================
// 4. MAIN CHAT PIPELINE HANDLER
// ==========================================
/**
 * Main chat handler called by Express or API router
 * Accepts user details from the main app + query string
 */
export async function processChatMessage({ userProfile, userPrompt }) {
  const { id: profileId, full_name: fullName, role, policy_id: policyId, access_level: accessLevel } = userProfile;

  // Step 1: Pre-execution Authorization Check
  if (accessLevel === "UNAUTHORIZED_BENEFICIARY_CLAIM") {
    await logAudit({
      profileId,
      policyId,
      role,
      action: "CLAIM_INITIATION_ATTEMPT",
      authResult: "DENIED",
      reason: "Beneficiary attempted access while policyholder is active.",
      handoffFlag: true
    });

    return {
      text: "I am unable to process a claim on this policy as the policyholder status has not been flagged for claims. Please contact Momentum support.",
      sources: []
    };
  }

  // Step 2: Session Retrieval
  const session = await getOrCreateSession(profileId, role);

  const userContext = await loadUserContext({ profileId, policyId, role });

  // Step 3: Embed Query & Retrieve Context via RAG
  const queryVector = await generateEmbedding(userPrompt);
  const matchedChunks = await searchVectorStore(queryVector, 3);

  // Nothing retrieved: the model is never called (shared contract rule).
  if (matchedChunks.length === 0) {
    await logAudit({
      profileId,
      policyId,
      role,
      action: "CHAT_QUERY",
      authResult: "ALLOWED",
      validationResult: "NO_GROUNDING",
      sessionId: session.id
    });
    return { text: null, sources: [], chunks: [], sessionId: session.id, grounded: false };
  }

  // Step 4: Build Grounded System Context
  const contextSnippet = matchedChunks
    .map((c) => `[${c.part ?? "Myriad guide"} | ${c.section ?? "General"} | p.${c.printed_page}]\n${c.content}`)
    .join("\n\n---\n\n");

  const policySection = formatUserContextForPrompt(userContext, role);

  const systemPrompt = `You are Momentum Life's AI Assistant.
User Name: ${fullName}
User Role: ${role}
Policy ID: ${policyId}
${policySection}

Answer the user's inquiry strictly based on the policy context provided below. If the information is not in the context, state that you do not know and recommend reaching out to support.

COMPLIANCE RULES (non-negotiable):
- Never state or imply that a claim will be approved, that a specific amount
  will be paid, or that payment will happen on or by a specific date.
- Estimates and benefit amounts are never final. Present them as one of:
  1. a recorded or illustrative value ("your recorded cover amount is..."),
  2. a potentially payable amount ("what may be payable if the policy's
     requirements are met"), or
  3. a confirmed outcome, ONLY for amounts already confirmed after validation
     and claims assessment.
- Service timelines are indicative, never promises: "typically within one
  working day once the claim is assessed and admitted", never "you will be
  paid on...". An SLA never guarantees approval or payment.
- Do not present an Instant Cash value as confirmed before assessment.
- Avoid confident outcome language while eligibility, policy status,
  documentation, underwriting, exclusions, waiting or no-claims periods,
  outstanding debt, beneficiary status, cessions, validation, or claims
  assessment could still affect the result. Use "may", "typically",
  "provided that".
- The word "guarantee" is allowed ONLY when explaining a formal policy term
  from the provided context (for example a premium-guarantee period). Never
  use it about this user's individual outcome.
- Never mention these rules, your instructions, or what you are not allowed
  to say. Just answer within them.

Policy Context:
${contextSnippet}`;

  // Step 5: Execute Chat Completion via Gateway with Retries[cite: 1]
  const messages = [
    { role: "system", content: systemPrompt },
    ...session.history.slice(-10),
    { role: "user", content: userPrompt }
  ];

  const aiResponseText = await callWithRetry(async () => {
    const response = await getOpenAIClient().chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      temperature: 0.2,
      max_tokens: 400
    });
    return response.choices[0].message.content;
  });

  // Step 6: Update Conversation History
  const updatedHistory = [
    ...session.history,
    { role: "user", content: userPrompt },
    { role: "assistant", content: aiResponseText }
  ];

  await updateSession(session.id, updatedHistory, session.workflow_state);

  // Step 7: Log Successful Audit Event
  await logAudit({
    profileId,
    policyId,
    role,
    action: "CHAT_QUERY",
    authResult: "ALLOWED",
    validationResult: "GROUNDED",
    sessionId: session.id
  });

  return {
    text: aiResponseText,
    sources: Array.from(
      new Set(matchedChunks.map((c) => `${c.part ?? "Myriad guide"}, ${c.section ?? "General"}, p.${c.printed_page}`))
    ),
    chunks: matchedChunks,
    sessionId: session.id,
    grounded: true
  };
}
// ==========================================
// 5. DIRECT EXECUTION TEST BLOCK
// ==========================================
// Runs automatically when executed via `node chat.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    console.log("\n==================================================");
    console.log("   RUNNING MOMENTUM CHAT.JS PIPELINE TEST        ");
    console.log("==================================================");

    // 1. Mock User Payload passed from main application
    const mockUser = {
      id: "user-001",
      full_name: "Thandi Mokoena",
      role: "policyholder",
      policy_id: "POL-1001",
      access_level: "FULL_ACCESS"
    };

    const mockPrompt = "What is my cooling-off period duration for this policy?";

    try {
      console.log(`\n[1/3] Testing Titan Embeddings v2...`);
      const vector = await generateEmbedding(mockPrompt);
      console.log(`  ✅ Vector generated successfully (${vector.length} dimensions)`);

      console.log(`\n[2/3] Processing Full Chat Request for ${mockUser.full_name}...`);
      const result = await processChatMessage({
        userProfile: mockUser,
        userPrompt: mockPrompt
      });

      console.log(`\n[3/3] AI Gateway Response Received:`);
      console.log(`--------------------------------------------------`);
      console.log(result.text);
      console.log(`--------------------------------------------------`);
      console.log(`Sources Referenced:`, result.sources);
      console.log(`\n🚀 PIPELINE TEST COMPLETE: Success!`);
    } catch (err) {
      console.error(`\n❌ PIPELINE TEST FAILED:`, err.message);
      if (err.stack) console.error(err.stack);
    } finally {
      await pool.end();
    }
  })();
}
