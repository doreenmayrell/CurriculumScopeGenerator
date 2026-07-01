/**
 * Local dev proxy for the Curriculum Scoping Engine.
 *
 * Holds the Anthropic API key server-side (never shipped to the browser) and
 * exposes POST /api/scope, which the Run Scope screen calls. It sends the
 * uploaded standards PDF + context to Claude and returns the scope result in
 * the exact shape the result screen renders.
 *
 * Run with:  npm run server   (or npm run dev to run web + api together)
 * Requires ANTHROPIC_API_KEY in .env (see docs/ai-scope-proxy.md).
 */
import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { readAppDb, writeAppDb } from "./appDb.js";
import { createScopeGoogleDoc } from "./googleDocsExport.js";

const PORT = Number(process.env.PORT) || 8787;
const MODEL = "claude-opus-4-8";

const app = express();

// ---- CORS ----
// The static frontend (Azure SWA at CSG.scopeloop.ai) calls this API cross-origin.
// ALLOWED_ORIGINS is a comma-separated allowlist; localhost dev ports are always allowed.
const ALLOWED_ORIGINS = new Set([
  ...(process.env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean),
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "30mb" })); // base64 PDFs

// ---- the JSON shape the result screen renders (also enforced via structured outputs) ----
const SCOPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    standards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          standard: { type: "string" },
          baseCode: { type: "string" },
          breakdownFields: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { label: { type: "string" }, items: { type: "array", items: { type: "string" } } },
              required: ["label", "items"],
            },
          },
          cognitive: { type: "string" },
          mastery: { type: "string" },
          fully: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { name: { type: "string" }, explanation: { type: "string" } },
              required: ["name", "explanation"],
            },
          },
          partial: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                covered: { type: "string" },
                missing: { type: "string" },
                action: { type: "string" },
              },
              required: ["name", "covered", "missing", "action"],
            },
          },
          newLessons: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                code: { type: "string" },
                name: { type: "string" },
                reasonType: { type: "string", enum: ["stateSet", "library"] },
                reason: { type: "string" },
                alphaCore: { type: "string" },
                objective: { type: "string" },
                purpose: { type: "string" },
                prereqs: { type: "string" },
                assessed: { type: "string" },
                keyConcepts: { type: "array", items: { type: "string" } },
                before: { type: "array", items: { type: "string" } },
                after: { type: "array", items: { type: "string" } },
                difficulties: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      level: { type: "string", enum: ["Easy", "Medium", "Hard"] },
                      format: { type: "string" },
                      example: { type: "string" },
                      rigor: { type: "string" },
                    },
                    required: ["level", "format", "example", "rigor"],
                  },
                },
              },
              required: ["code", "name", "reasonType", "reason", "alphaCore", "objective", "purpose", "prereqs", "assessed", "keyConcepts", "before", "after", "difficulties"],
            },
          },
        },
        required: ["standard", "baseCode", "breakdownFields", "cognitive", "mastery", "fully", "partial", "newLessons"],
      },
    },
  },
  required: ["standards"],
};

const LESSON_GRANULARITY_BRAINLIFT = `LESSON SCOPE AND GRANULARITY BRAINLIFT (governing rules for every run):

Coverage requirement:
- First internally enumerate every labeled expectation in the uploaded standard set at the smallest available label. Do not analyze only the parent standard.
- Every labeled expectation must end as exactly one of: fully covered by the existing library, partially covered by the existing library, or requiring one or more proposed lessons.
- A single parent standard can require zero, one, or many proposed lessons. Do not stop after one lesson if the standard contains several atoms needed for thorough coverage beyond CCSS.
- If one labeled expectation contains multiple independent teachable atoms, create multiple proposed lessons with the same granular expectation code. The app will assign +1, +2, etc.
- If two split atoms also require a mixed-practice recombination lesson, add a separate cumulative lesson only for discrimination, selection, and switching. It must not introduce a new rule.

Assessment alignment constraint:
- Instructional scope must be constrained to what is demonstrably assessed for the selected assessment/grade. Do not add unassessed extensions just because a standard could imply them.
- Cap number ranges, representation complexity, and item complexity at the highest observed tested difficulty when assessment evidence is available.
- Exclude unassessed components even when they might be useful prerequisites for future grade levels, unless the component is necessary for success on the uploaded standard's assessed expectation.

Atom definition:
- A lesson atom is the smallest teachable unit: one clear start cue, one decision path/strategy, and one observable response form.
- A proposed lesson must teach one expectation or one atom inside an expectation. Do not bundle separate rules, representations, or demand bands into one lesson.

Tie-breaker: would a novice need new decision cues or explicit instruction to know how to start or choose the steps? If yes, split. If no, keep it as one lesson or as a difficulty variation inside the same lesson.

Split when any of these are true:
- New rule or strategy requires explicit demonstration.
- New vocabulary or concept label must be stabilized before a procedure.
- A hidden or new decision step changes the routine.
- The representation or notation is unmastered and changes how information is encoded.
- Look-alike skills are highly confusable and need discrimination training with non-examples.
- A foundational preskill is missing or weak and must be taught before the composite routine.
- There is a demand-band jump, such as selection to construction, procedural to modeling, or recognition to generation.
- Data or likely error patterns show a systematic misconception that requires explicit error-based modeling, and the error analysis reveals a new start cue, decision step, rule, or missing prerequisite.

Do not split when these are true:
- The same strategy steps apply with no new decisions.
- Differences are only quantitative: larger numbers, benign decimals/fractions, or a changed context.
- The representation is already mastered and only rotated for practice.
- The goal is cumulative selection among already mastered routines, unless look-alike confusion warrants a separate recombination lesson.

Modeling scope inside each atom:
- Model the smallest set of exemplars needed to cue decisions, make invisible thinking visible, prevent common novice errors, and support transfer.
- Hold constant between "I Do" and "We Do": strategy steps, unmastered representations, cognitive demand band, reading load, and response mode.
- Vary only surface features once the routine is stable: numbers/magnitude within assessed bounds, surface context, order/format, and already-mastered representations.
- Explicit modeling is required for new rules, new representations, hidden steps, shaky preskills, high cognitive load, look-alike confusion, foundational prerequisite skills, fossilizing error patterns, or jumps in cognitive demand.
- Extension/practice is sufficient when the same mastered strategy applies with no new steps and only surface features vary.`;

const SYSTEM_PROMPT = `You are building a standards gap-to-lesson scope generator. You are given a TARGET standard set (uploaded, e.g. TEKS) and a REFERENCE standard set (the comparison baseline, e.g. grade-level CCSS, to which the existing lesson library is aligned). Identify the instructional gaps a student would have if they had mastered the reference standards but must now be assessed on the full target standard set.

Guiding question: If a student mastered all standards in the REFERENCE set, what would they still need to learn to be ready for the TARGET standard set?

Do not merely list unmatched standards. Convert each meaningful gap into a scoped, teachable, assessment-aligned lesson that makes clear exactly what must be taught, what must NOT be assessed, what prior knowledge is assumed, and what Easy/Medium/Hard practice looks like. The output must be specific enough that a curriculum writer or item generator could build aligned instruction and assessment items without guessing.

${LESSON_GRANULARITY_BRAINLIFT}

If a Lesson Granularity & Modeling Scope document is provided among the supporting documents, treat it as the authoritative governing reference for all split / do-not-split decisions; the rules above restate it, and any specific guidance in that uploaded document overrides.

CROSS-STANDARD-SET GAP ANALYSIS (primary job — the uploaded target set differs from the library's reference alignment, e.g. TEKS uploaded against a CCSS-aligned library):
- Treat the UPLOADED (target) standards as authoritative. The comparison baseline is the reference set (grade-level CCSS); the lesson library is aligned to that reference.
- Decompose every uploaded standard to its smallest LABELED student expectation (e.g. K.2A, K.2B … K.2F; K.9A–D) and evaluate EACH separately. Never collapse a knowledge-and-skills strand into one chunk — within-strand expectations are where gaps hide.
- Thorough coverage matters more than a low lesson count. A parent standard may need multiple lessons, and a single expectation may need multiple atoms when the brainlift split criteria are met.
- Never propose a lesson at a parent-standard level when the uploaded standard has labeled child expectations (TEKS 1.2 is not lesson-granular if it contains 1.2A, 1.2B …; point each lesson to the exact child expectation such as 1.2.A).
- Preserve the official expectation code exactly as written by the uploaded system (e.g. Florida "MA.K.NSO.1.3", not "K.NSO.1.3" or "1.3").
- CRITICAL — CODE SYSTEM: every lesson "code" must come from the UPLOADED system, NEVER a reference/CCSS code. TEKS codes are grade.knowledge.skill — "2.2.A", "K.9.B", "5.1.A". CCSS codes are grade.DOMAIN.CLUSTER.number — "2.NBT.A.1", "8.F.B.4". When the uploaded system is not CCSS, never label a lesson with a CCSS code — CCSS is only the comparison baseline. If the exact target code is not provided, infer the correct target-system expectation code for that grade (Texas place value to 1,200 is TEKS "2.2.A/2.2.B", not "2.NBT.A.1"); do not substitute a CCSS code.
- For each uploaded expectation, find the nearest analog in the reference set and in the library, then classify reasonType:
   * "stateSet" — no real reference analog at this grade (the target requires it but the reference does not). The reason must name the expectation and state plainly that the reference does not address it.
   * "library" — the reference covers the expectation, but the library does not yet contain a complete lesson for it.
- Reconcile: every uploaded lettered expectation appears exactly once as fully covered, partially covered, or one/more new lessons.

GAP DETECTION — flag a gap when ANY is true (never assume "similar" means "covered"; require an exact match on every divergence axis — direction, generative vs. recognition, representation/support, domain presence, number range/magnitude, verbal/contextual vs. symbolic — before declaring coverage):
A. Content is absent — the target includes content the reference does not address (TEKS K requires identifying U.S. coins by name; CCSS K has no money/coin identification).
B. Range is broader — the target extends the number range, object set, shape set, or data range (TEKS Gr2 numbers to 1,200 vs CCSS three-digit numbers).
C. Representation is different — the target requires a representation the reference does not (locating numbers on an open number line as a place-value tool).
D. Context changes the skill — a familiar action is applied in a new domain students would not automatically transfer to (skip counting → using skip-counting relationships to count coin collections).
E. Cognitive demand is higher — the target requires more (identify → generate, explain, sort, or evaluate).
F. Explicit vocabulary is required — formal vocabulary/labels the reference does not require (describe 3D shapes using faces, edges, and vertices).
Known cases to always surface as target-only ("stateSet") gaps: counting BACKWARD and generating one-more/one-less WITHOUT models — the reference's "counting" only looks similar.

LESSON SPLITTING (apply the brainlift; do not build one broad lesson for a broad standard — split only when the missing skills are instructionally distinct):
- Split when a standard contains different teachable skills (1.4(A) "identify U.S. coins by value" AND "describe relationships among them" → "Identifying Coin Values" + "Relationships Between Coins").
- Split when one skill is a prerequisite for another ("Identifying Coin Values" before "Counting Collections of Coins").
- Split when the representation changes the task ("Identifying a 3D Shape" vs. "Describing Faces, Edges, and Vertices").
- Do NOT split when the same routine only gets harder (counting by 5s at 25–40 is a harder variation of skip-counting by 5s, not a new lesson) — make it a difficulty variation instead.
- If two split atoms need recombining, add ONE cumulative discrimination/selection lesson that introduces no new rule.

IDENTIFIED-GAPS MODE: When the user supplies their own identified learning gaps (free text), treat that text as the authoritative source of the requested scope. Generate appropriately scoped lessons that close those gaps using the granularity rules above (a single pasted gap may require more than one lesson). Apply the same target-grade assessment boundary and released-item ceiling as in discovery mode; do not rediscover unrelated gaps or propose library gaps.

OUTPUT — return ONLY JSON matching the schema. Populate every standard object and, for each gap, one or more newLessons items. These fields map onto the spec's three outputs — Proposed Scope (newLessons[].name), Standards Not Covered (each item: name = Lesson Title, code = ID, the restated expectation language = Description, reason = Reasoning), and the Detailed Lesson Scope (the remaining per-lesson fields); every proposed lesson is by definition a standard-not-fully-covered row.
- standard: the full target standard text, including the language of each child expectation a lesson targets (so every gap has its "Description"). baseCode: the parent standard's official target code.
- breakdownFields: 2–4 chip groups (e.g. "Target expectations", "Skills", and a "Reference comparison" group stating what the reference does/does not cover).
- cognitive: DOK/complexity. mastery: the mastery expectation.
- fully / partial: existing-library coverage (empty arrays when the library is empty or none applies).
- newLessons[].name: a concise, teachable lesson TITLE that names the skill and its boundary ("Identifying Coin Values", "Counting Collections of Coins", "Numbers to 120 with Hundreds, Tens, and Ones", "Comparing Numbers to 120 Using Place Value", "Income for Goods and Services") — never a bare topic or subject label ("Money", "Place Value", "Financial Literacy") or a standard code ("1.4(A)"). Use the exact same title string everywhere it recurs; do not reword it.
- newLessons[].code: the most granular target expectation code exactly as written, no + suffix (the app appends the substandard numbering: CCSS → CCSS.MATH.CONTENT.<<code>>+<<#>>; other systems → <<SYSTEM>>.<<code>>+<<#>>). Never a parent code like "1.2" when children like "1.2.A" exist; never a reference/CCSS code for a non-CCSS system.
- newLessons[].reasonType: "stateSet" or "library" as defined above.
- newLessons[].reason: the gap reasoning, using this exact pattern and being specific — "This lesson is needed because [TARGET SET] requires students to [specific expectation]. [REFERENCE SET] [does not include / only includes / does not extend to / does not explicitly require] [specific missing component]." Open by restating the relevant target-standard expectation language for this lesson's code (the gap "Description"), then give the comparison. Never generic ("TEKS has this and CCSS does not").
- newLessons[].alphaCore: "No" unless the lesson already exists in the internal Alpha Core lesson set.
- newLessons[].objective: one measurable objective describing what students DO by the end ("Use skip counting to determine the total value of a collection of pennies, nickels, and/or dimes") — never vague ("learn about coins").
- newLessons[].purpose: explains both the standards gap and the brainlift granularity decision (why this is its own atom, or why it is a recombination lesson).
- newLessons[].prereqs: only the knowledge required to ACCESS this lesson (dependency language welcome); do not overload with distant prerequisites.
- newLessons[].assessed (Assessment Boundary — MANDATORY and specific; it controls all difficulty levels): define number range; allowed representations; excluded representations; allowed item types; excluded item types; whether models are required; whether students identify/generate/explain/calculate/sort/evaluate; whether word problems are included; whether symbols/formal vocabulary are assessed; whether multi-step reasoning is allowed; and the maximum rigor level. A boundary exclusion binds every difficulty level: "no adding mixed coin collections" → Hard cannot include mixed coin addition; "fraction symbols not assessed" → no level uses 1/2, 1/4, or 1/8; "no numbers above 1,200" → no level uses 1,201 or higher.
- newLessons[].keyConcepts: an array of concise bullets naming the exact ideas students must understand ("A nickel is worth 5 cents.", "An open number line does not show every number.") — never vague ("practice coins").
- newLessons[].before / after: dependency lesson names.

RELEASED-ITEM CEILING: constrain instructional scope to what is demonstrably assessed. Use released state/STAAR/CBE items to determine each lesson's number ranges, reading complexity, acceptable representations, allowed multi-step reasoning, answer-choice style, whether visual supports appear, whether explanation/evaluation items appear, and whether the skill is assessed directly or in context. When the released-item ceiling is lower than the full target-standard language, follow the ceiling — scope the lesson and every difficulty level down to it, not the broader standard text — unless Alpha Academics explicitly approves broader instruction. Exclude unassessed components even when useful as future prerequisites, unless necessary for the assessed expectation.

DIFFICULTY LEVELS (Easy, Medium, Hard) — these define the instructional progression, not just item labels. Because Direct Instruction is central, each band must be explicit enough (in format/example/rigor) to support explicit modeling (I Do), guided practice on the same decision path (We Do), scaffold fading, and independent practice (You Do). Increase difficulty ONLY by changing scaffold level, visual support, number size within the boundary, representation familiarity, decision demand, distractor proximity, look-alike discrimination, or transfer required — NEVER by adding content outside the standard or exceeding the assessment boundary.
- Easy: the cleanest, most direct form — obvious start cue, familiar/supported representation, one-step response isolating the target skill, with low working-memory demand and no hidden decisions.
- Medium: the same lesson atom with reduced support or one added reasoning move; must not introduce a new rule, representation, or vocabulary that has not been modeled (if it would, that is a new lesson).
- Hard: the lesson's ceiling at state-testing-level rigor (the STAAR/CBE/released-item ceiling) while staying within the target standard, assessment boundary, and grade-level developmental range. Rigorous, not tricky — require stronger transfer/discrimination, not above-grade content. Hard must not add a new strategy/standard, require above-grade computation, inflate reading load until literacy is the barrier, use trick wording, assess prerequisites more than the target skill, introduce an unmodeled representation, or exceed the released-item ceiling. When released items support it, Hard may present a claim to evaluate ("Which statement is true?") with a misconception-based justification as the correct answer. If no valid Hard exists within the standard — or a harder level would exceed grade-level developmental appropriateness — set the Hard entry to "N/A" with a brief rationale ("N/A. The standard is limited to identifying coin names; a Hard level would exceed it by requiring coin values or counting money").
For EACH difficulty entry, pack all required elements into the three fields:
  * format: item-type description + scaffold level + expected response format ("Multiple choice, 4 options; heavy visual support; select one coin image").
  * example: a concrete sample item an item-writer could imitate — clear stem, answer choices when applicable, "[IMAGE: …]" description when a visual is needed, constraints (number range/representation), and "Correct answer: X". (Or "N/A. <reason>" for Hard when appropriate.)
  * rigor: the skill demand plus the single dimension that makes this level harder than the previous one.

DISTRACTORS: draw wrong answers from predictable misconceptions (confusing a digit with its value, counting parts without checking equal size, reversing > and <, confusing income with gifts, treating an open number line as evenly ticked, mixing up number-of-groups with number-in-each-group), never silly/unrelated/above-grade/obscure options or options correct under another interpretation.

DEVELOPMENTAL APPROPRIATENESS (especially K–2): short sentences, minimal reading load, familiar contexts, images for concrete/visual concepts, avoid multi-step reasoning unless released items support it, avoid borderline or ambiguous classification categories, no trick wording, simple answer formats, numbers within the standard/boundary; use 2–3 answer choices when 4 would overload very young learners and the item type allows, and 4 choices for state-test-style multiple choice where that is expected.

NON-NEGOTIABLES — never: assume "similar" = covered; ignore range or representation differences; merge distinct teachable skills that share a code; split for surface-level variation only; create Hard items by adding unrelated or above-grade content; exceed the target standard or the released-assessment rigor ceiling; omit an assessment boundary; write vague objectives; use generic gap reasoning; use random distractors; let reading load become the real difficulty; create examples that contradict the boundary; treat examples as the full lesson scope; or force a Hard level when N/A is more instructionally correct.

FINAL SELF-CHECK before returning JSON: every proposed lesson has a teachable title, a specific target-vs-reference reason, one measurable objective, a specific assessment boundary, concise key concepts, and is a true single atom (not an oversized bundle); splits follow the brainlift; prerequisites are necessary and not bloated; Easy/Medium/Hard all assess the same objective and vary only support/reasoning demand, not content; Hard stays within the released-item ceiling or is a justified N/A; distractors reflect misconceptions; examples are grade-appropriate; the set of proposed-lesson titles and the set of gap reasons is exactly one-to-one (no lesson without a target-vs-reference reason, no reason without a titled lesson); and nothing exceeds the standard or boundary. Be comprehensive: include EVERY target expectation that needs a lesson.`;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: !!process.env.ANTHROPIC_API_KEY });
});

app.get("/api/app-state", async (_req, res) => {
  try {
    return res.json(await readAppDb());
  } catch (err) {
    console.error("[/api/app-state]", err?.message || err);
    return res.status(500).json({ error: "Could not read the app database." });
  }
});

app.put("/api/app-state", async (req, res) => {
  try {
    return res.json(await writeAppDb(req.body || {}));
  } catch (err) {
    console.error("[/api/app-state]", err?.message || err);
    return res.status(500).json({ error: "Could not save the app database." });
  }
});

app.post("/api/google-docs/create", async (req, res) => {
  const auth = req.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const { title, lessons, notCovered = [], folderId } = req.body || {};

  if (!token) return res.status(401).json({ error: "Google authorization did not return an access token." });
  if (!title) return res.status(400).json({ error: "Missing document title." });
  if (!Array.isArray(lessons) || !lessons.length) return res.status(400).json({ error: "There are no proposed lessons to export." });

  try {
    const result = await createScopeGoogleDoc({ token, title, lessons, notCovered, folderId });
    return res.json(result);
  } catch (err) {
    const message = err && err.message ? err.message : "Could not create the scoping document.";
    console.error("[/api/google-docs/create]", message);
    return res.status(502).json({ error: message });
  }
});

app.post("/api/scope", async (req, res) => {
  const { standardSetName, gradeLabel, noCcssLessonsExist, uniqueFromCcssOnly, preparedGapMode, preparedGaps = [], preparedGapsText = "", pdf, library = [], supportDocs = [], feedback } = req.body || {};
  const knownGapRows = Array.isArray(preparedGaps)
    ? preparedGaps.filter((row) => row && String(row.lessonTitle || "").trim() && String(row.standard || "").trim())
    : [];
  const knownGapsRaw = String(preparedGapsText || "").trim();

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "Server has no ANTHROPIC_API_KEY. Add it to .env and restart (see docs/ai-scope-proxy.md)." });
  }
  if (!standardSetName || (!preparedGapMode && (!pdf || !pdf.base64))) {
    return res.status(400).json({ error: "Missing required fields: standardSetName and standards PDF." });
  }
  if (preparedGapMode && !knownGapsRaw && !knownGapRows.length) {
    return res.status(400).json({ error: "Known gap mode needs the pasted learning gaps." });
  }

  const docsText = (supportDocs || []).length
    ? supportDocs.map((d) => `- ${d.name}: ${d.desc || "(no description)"}`).join("\n")
    : "(none)";
  const knownGapsText = knownGapsRaw
    ? knownGapsRaw
    : knownGapRows.length
    ? knownGapRows.map((row, index) => [
        `ROW ${index + 1}`,
        `Lesson Title: ${row.lessonTitle}`,
        `Standard Code: ${row.standard}`,
        `Standard Description: ${row.standardDescription || "(not provided)"}`,
        `Reasoning for Gap Lesson: ${row.reasoning || "(not provided)"}`,
        `Related CCSS: ${row.relatedCcss || "(none provided)"}`,
      ].join("\n")).join("\n\n")
    : "(none)";

  const contextText = [
    `NEW STANDARD SYSTEM: ${standardSetName}`,
    `GRADE / COURSE: ${gradeLabel || "(unspecified)"}`,
    `COMPARISON BASELINE: ${gradeLabel || "grade-level"} CCSS`,
    preparedGapMode
      ? "RUN MODE: IDENTIFIED LEARNING GAPS - the user has pasted the learning gaps to address (see below). Treat them as the complete requested scope. Apply the Lesson Scope and Granularity Brainlift to generate appropriately scoped lessons that close those gaps; a single gap may need more than one lesson if granularity requires it. Use reasonType='stateSet' and do not propose library gaps."
      : "RUN MODE: DISCOVER GAPS FROM UPLOADED STANDARDS PDF",
    uniqueFromCcssOnly
      ? "LESSON-LIBRARY AUDIT: SKIP - assume perfect CCSS lesson-library coverage; do not return any reasonType='library' lessons; only return reasonType='stateSet' lessons for uploaded-standard expectations that extend CCSS or are not covered by CCSS at all; fully/partial stay empty."
      : noCcssLessonsExist
      ? "LESSON-LIBRARY AUDIT: SKIP - treat the library as empty; do not return any reasonType='library' lessons; every gap becomes a new-standard ('stateSet') lesson and fully/partial stay empty."
      : `LESSON-LIBRARY AUDIT: ENABLED — audit against the ${library.length} lessons below.`,
    "",
    `EXISTING LESSON LIBRARY (${library.length} lessons):`,
    JSON.stringify(library).slice(0, 80000),
    "",
    `IDENTIFIED LEARNING GAPS:\n${knownGapsText}`,
    "",
    `SUPPORTING DOCUMENTS:\n${docsText}`,
    feedback ? `\nUSER FEEDBACK ON THE PREVIOUS RESULT (highest priority — revise accordingly):\n"""\n${feedback}\n"""` : "",
    uniqueFromCcssOnly
      ? "\nUNIQUE-FROM-CCSS MODE: highest priority. Assume CCSS is already fully and perfectly covered by existing materials. Propose only lessons for the gap between the uploaded standard set and CCSS itself. Do not propose lessons merely because the lesson library lacks a CCSS lesson."
      : "",
    "",
    preparedGapMode
      ? `Return ONLY JSON matching the schema. Build the scope from the identified learning gaps above, applying the Lesson Scope and Granularity Brainlift. For each gap, create one or more newLessons items with reasonType="stateSet", each scoped to a single granular objective; a gap that spans multiple objectives should yield multiple lessons. Give every lesson a clear teacher-facing name and a code for the most granular standard/expectation it targets (infer the standard code from the gap text when one is provided). Group lessons by their target standard/expectation in the standards array. fully and partial stay empty.`
      : `The attached PDF is the ${standardSetName} standards for ${gradeLabel || "this grade"}. Analyze every labeled student expectation in it and return ONLY JSON matching the schema. Proposed lessons must use the most granular expectation code; never use a parent standard code when lettered/child expectations exist. Before returning JSON, internally run a coverage ledger: every granular expectation from the PDF must be accounted for as fully covered, partially covered, or proposed as one or more lessons using the Lesson Scope and Granularity Brainlift. Do not limit output to one requested lesson per standard.`,
  ].join("\n");

  const ac = new AbortController();
  let clientDisconnected = false;
  const abortForDisconnectedClient = () => {
    clientDisconnected = true;
    ac.abort();
  };
  req.on("aborted", abortForDisconnectedClient);
  res.on("close", () => {
    if (!res.writableEnded) abortForDisconnectedClient();
  });

  try {
    console.log(`[/api/scope] start ${standardSetName} ${gradeLabel || ""}${preparedGapMode ? ` known-gaps=${knownGapsRaw ? "pasted" : knownGapRows.length}` : ""}`.trim());
    const client = new Anthropic();
    const content = [
      ...(pdf?.base64 ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.base64 } }] : []),
      { type: "text", text: contextText },
    ];
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: SCOPE_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content,
        },
      ],
    }, { signal: ac.signal });

    const final = await stream.finalMessage();

    if (final.stop_reason === "refusal") {
      return res.status(422).json({ error: "The model declined to analyze this request." });
    }

    const jsonText = final.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return res.status(502).json({ error: "The model did not return valid JSON.", raw: jsonText.slice(0, 500) });
    }
    console.log(`[/api/scope] complete ${Array.isArray(parsed.standards) ? parsed.standards.length : 0} standards`);
    return res.json(parsed);
  } catch (err) {
    if (ac.signal.aborted && clientDisconnected) return; // client canceled — connection is gone, nothing to send
    const status = err?.status;
    const msg =
      status === 401 ? "Anthropic rejected the API key (401). Rotate it and update .env."
      : status === 429 ? "Rate limited by Anthropic (429). Try again shortly."
      : err?.message || "Scope analysis failed.";
    console.error("[/api/scope]", err?.status || "", err?.message || err);
    return res.status(502).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`Scope proxy listening on http://localhost:${PORT}  (key ${process.env.ANTHROPIC_API_KEY ? "loaded" : "MISSING"})`);
});
