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
import { createScopeGoogleDoc } from "./googleDocsExport.js";

const PORT = Number(process.env.PORT) || 8787;
const MODEL = "claude-opus-4-8";

const app = express();
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
                objective: { type: "string" },
                purpose: { type: "string" },
                prereqs: { type: "string" },
                assessed: { type: "string" },
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
              required: ["code", "name", "reasonType", "reason", "objective", "purpose", "prereqs", "assessed", "before", "after", "difficulties"],
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

const SYSTEM_PROMPT = `You are an expert curriculum designer. You analyze a state academic standard system, deconstruct each standard into the teachable chunks needed for mastery, audit an existing lesson library for coverage, and propose the smallest set of new lessons required.

${LESSON_GRANULARITY_BRAINLIFT}

CROSS-STANDARD-SET GAP ANALYSIS (this is the primary job — the uploaded standards belong to a different standard set than the library's alignment, e.g. TEKS uploaded against a CCSS-aligned library):
- Treat the UPLOADED standards as authoritative. The comparison baseline is the grade-level CCSS; the lesson library is aligned to CCSS.
- Decompose every uploaded standard to its smallest LABELED student expectation (e.g. K.2A, K.2B … K.2F; K.9A–D) and evaluate EACH separately. Never collapse a knowledge-and-skills strand into one chunk — within-strand expectations are where gaps hide.
- Thorough coverage matters more than keeping the lesson count low. A parent standard may need multiple requested lessons, and a single granular expectation may need multiple lesson atoms when the brainlift split criteria are met.
- Never propose a lesson at a parent standard level when the uploaded standard has labeled child expectations. For example, TEKS 1.2 is not lesson-granular if it contains 1.2A, 1.2B, etc.; each proposed lesson must point to the exact child expectation such as 1.2.A.
- For each uploaded expectation, find the nearest analog in CCSS and in the library, then classify the new lesson's reasonType:
   * "stateSet" — no real CCSS analog at this grade (the uploaded system requires it but CCSS does not). The reason MUST name the expectation and state plainly that CCSS does not address it.
   * "library" — CCSS covers the expectation, but the existing library does not yet contain a complete lesson for it.
- Do NOT treat an expectation as covered because a superficially similar skill exists. Require an EXACT match on every divergence axis before declaring coverage: direction (e.g. count forward vs. backward); generative vs. recognition (generate one-more/one-less vs. recognize the successor is "one larger"); representation/support (with vs. without objects or models); whole domains absent at this grade in CCSS (money & coin identification, personal financial literacy); number range/magnitude; verbal/contextual vs. symbolic.
- Known failure modes to never repeat: counting BACKWARD and generating one-more/one-less WITHOUT models are TEKS expectations CCSS does not require — surface them as "stateSet" gap lessons even though CCSS "counting" looks similar.
- Reconcile: every uploaded lettered expectation appears exactly once as fully covered, partially covered, or a new lesson.

GRANULARITY: Apply the Lesson Scope and Granularity Brainlift above. One lesson teaches one expectation or one atom inside an expectation - a single skill mastered in a short session. Split by rule, decision step, representation, confusability, prerequisite, demand band, and systematic error pattern. Do not split for surface-only changes. Constrain scope to what is actually assessed at this grade.

DIFFICULTY LEVELS: For each new lesson, write Easy / Medium / Hard. Each level needs a question "format" (include the state-testing item type and stem template), one concrete "example" stimulus written exactly as a student would see it, and a "rigor" note. Prefer text entry, number entry, equation entry, or multi-text entry whenever the answer can be machine-scored. Use MCQ or multi-select when selected-response is more grade-appropriate. You may describe number lines, tables, graphs, models, or images in the stimulus or answer choices when those are state-test-like for the grade. Rigor rises through cognitive demand, NOT reading load - keep every stem at or below grade-level reading and aligned to the difficulty for that grade. No open-ended constructed-response or "explain in writing" items.

OUTPUT (return ONLY JSON matching the provided schema):
- standard: the full standard text. baseCode: the parent standard's code (e.g. "TEKS.MATH.K.2"). code (per new lesson): the most granular raw uploaded expectation only, with no + suffix and no proposed Substandard ID numbering (e.g. "K.2.A", "K.9.B", "5.1.A"). Do not return parent codes like "1.2" when the PDF contains children like "1.2.A". The app converts the granular code to <<STANDARD SYSTEM>>.MATH.CONTENT.<<STANDARD>>+<<#>> and chooses the next available number from the lesson library.
- breakdownFields: 2–4 chip groups (e.g. Concepts, Skills, Sub-skills or "TEKS expectations", and a "CCSS comparison" group noting what CCSS does/doesn't cover).
- cognitive: DOK/complexity. mastery: the mastery expectation.
- fully / partial: existing-library coverage (empty arrays when the library is empty or no lesson applies).
- newLessons: the proposed lessons. There may be multiple proposed lessons per parent standard and multiple proposed lessons with the same granular code when the standard contains multiple atoms. objective is a plain "I can…" student objective; purpose explains both the standards gap and the brainlift granularity decision (why this is its own atom, or why it belongs as a recombination lesson); prereqs lists prior lessons; assessed is the assessment boundary; before/after are dependency lesson names.
- Be comprehensive: include EVERY uploaded expectation that needs a lesson.`;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: !!process.env.ANTHROPIC_API_KEY });
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
  const { standardSetName, gradeLabel, noCcssLessonsExist, pdf, library = [], supportDocs = [], feedback } = req.body || {};

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "Server has no ANTHROPIC_API_KEY. Add it to .env and restart (see docs/ai-scope-proxy.md)." });
  }
  if (!standardSetName || !pdf || !pdf.base64) {
    return res.status(400).json({ error: "Missing required fields: standardSetName and pdf.base64." });
  }

  const docsText = (supportDocs || []).length
    ? supportDocs.map((d) => `- ${d.name}: ${d.desc || "(no description)"}`).join("\n")
    : "(none)";

  const contextText = [
    `NEW STANDARD SYSTEM: ${standardSetName}`,
    `GRADE / COURSE: ${gradeLabel || "(unspecified)"}`,
    `COMPARISON BASELINE: ${gradeLabel || "grade-level"} CCSS`,
    noCcssLessonsExist
      ? "LESSON-LIBRARY AUDIT: SKIP - treat the library as empty; do not return any reasonType='library' lessons; every gap becomes a new-standard ('stateSet') lesson and fully/partial stay empty."
      : `LESSON-LIBRARY AUDIT: ENABLED — audit against the ${library.length} lessons below.`,
    "",
    `EXISTING LESSON LIBRARY (${library.length} lessons):`,
    JSON.stringify(library).slice(0, 80000),
    "",
    `SUPPORTING DOCUMENTS:\n${docsText}`,
    feedback ? `\nUSER FEEDBACK ON THE PREVIOUS RESULT (highest priority — revise accordingly):\n"""\n${feedback}\n"""` : "",
    "",
    `The attached PDF is the ${standardSetName} standards for ${gradeLabel || "this grade"}. Analyze every labeled student expectation in it and return ONLY JSON matching the schema. Proposed lessons must use the most granular expectation code; never use a parent standard code when lettered/child expectations exist. Before returning JSON, internally run a coverage ledger: every granular expectation from the PDF must be accounted for as fully covered, partially covered, or proposed as one or more lessons using the Lesson Scope and Granularity Brainlift. Do not limit output to one requested lesson per standard.`,
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
    console.log(`[/api/scope] start ${standardSetName} ${gradeLabel || ""}`.trim());
    const client = new Anthropic();
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: SCOPE_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.base64 } },
            { type: "text", text: contextText },
          ],
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
