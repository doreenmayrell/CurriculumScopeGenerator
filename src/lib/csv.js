/**
 * CSV import for the Curriculum Scoping Engine.
 *
 * Turns the two raw data-model exports (Standards + Learning Objectives) into the
 * canonical library row shape used everywhere else in the app. The contract:
 *
 *   - The Substandard ID is the join key AND is carried through verbatim.
 *   - Every row with `Active = TRUE` (and a Substandard ID) becomes a lesson.
 *   - Each lesson's learning objectives are the active `Task` rows from the LO file
 *     whose Substandard ID matches.
 *
 * Nothing here is AI/heuristic — it's a deterministic extraction so "every active
 * lesson is pulled in" is guaranteed and auditable (see the returned `stats`).
 */

/**
 * RFC-4180 CSV parser. Handles quoted fields, embedded commas/newlines, and
 * doubled "" escapes. Returns an array of string-cell rows.
 */
export function parseCSV(input) {
  let text = input || "";
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else if (c === "\r") {
        // normalize embedded CRLF -> LF inside quoted fields
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c === "\r") {
      if (text[i + 1] !== "\n") { row.push(field); rows.push(row); row = []; field = ""; } // lone CR
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Parse a CSV string into an array of objects keyed by the (trimmed) header row. */
export function parseCSVToObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => (h || "").trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every((c) => (c || "").trim() === "")) continue; // skip blank lines
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] !== undefined ? cells[i] : ""; });
    out.push(obj);
  }
  return out;
}

const isActive = (v) => String(v == null ? "" : v).trim().toUpperCase() === "TRUE";
const clean = (v) => (v == null ? "" : String(v)).replace(/\r\n/g, "\n").trim();
// For single-line label fields (domain, lesson title, IDs): also collapse any
// internal whitespace/newlines so source typos like "Geometry and\nMeasurement"
// don't create a separate group from "Geometry and Measurement".
const cleanInline = (v) => clean(v).replace(/\s+/g, " ");

/**
 * Split a free-text "Difficulty Matrix" cell into { easy, medium, hard }.
 * Sections are headed by EASY / MEDIUM / HARD on their own line. A missing or
 * "NA" section is left as "" — the lesson view renders that as "Not applicable".
 */
export function parseDifficultyMatrix(raw) {
  const out = { easy: "", medium: "", hard: "" };
  const text = clean(raw);
  if (!text) return out;

  const re = /^[ \t]*(EASY|MEDIUM|HARD)[ \t]*:?[ \t]*$/gim;
  const marks = [...text.matchAll(re)];
  if (!marks.length) return out;

  for (let i = 0; i < marks.length; i++) {
    const key = marks[i][1].toLowerCase();
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    out[key] = /^na$/i.test(body) ? "" : body;
  }
  return out;
}

/**
 * Build the lesson library from the two CSV exports.
 *
 * @returns {{ lessons: object[], stats: object }}
 */
export function buildLibraryFromCSVs(standardsText, objectivesText) {
  const stdRows = parseCSVToObjects(standardsText);
  const loRows = parseCSVToObjects(objectivesText);

  if (!stdRows.length) throw new Error("The Standards file appears to be empty or could not be read as CSV.");

  // Resolve the Substandard ID header tolerantly (exports vary in casing/spacing).
  const findKey = (rows, candidates) => {
    if (!rows.length) return null;
    const headers = Object.keys(rows[0]);
    for (const cand of candidates) {
      const hit = headers.find((h) => h.trim().toLowerCase() === cand);
      if (hit) return hit;
    }
    return null;
  };
  const stdSubKey = findKey(stdRows, ["substandard id"]);
  const loSubKey = findKey(loRows, ["substandard id"]);
  if (!stdSubKey) throw new Error('The Standards file has no "Substandard ID" column — that column is required as the join key.');

  // ---- group active learning objectives by Substandard ID ----
  const losBySub = {};
  let loActive = 0;
  loRows.forEach((r) => {
    const sub = clean(loSubKey ? r[loSubKey] : "");
    const task = clean(r["Task"]);
    if (!isActive(r["Active"]) || !sub || !task) return;
    (losBySub[sub] = losBySub[sub] || []).push(task);
    loActive++;
  });

  // ---- one active Standards row (= one Substandard) -> one lesson ----
  const lessons = [];
  const seen = new Set();
  let skippedInactive = 0;
  let skippedNoId = 0;
  let duplicates = 0;

  stdRows.forEach((r) => {
    if (!isActive(r["Active"])) { skippedInactive++; return; }
    const sub = clean(r[stdSubKey]);
    if (!sub) { skippedNoId++; return; }
    if (seen.has(sub)) { duplicates++; return; }
    seen.add(sub);

    const standardId = cleanInline(r["Standard Id (L1)"]) || sub.replace(/\+\d+\s*$/, "");
    lessons.push({
      course: cleanInline(r["Course Name"]),
      domain: cleanInline(r["Domain"]) || "Uncategorized",
      standardId,
      standardDesc: clean(r["Standard Description (L1)"]),
      unit: cleanInline(r["Unit Name"]),
      lesson: cleanInline(r["Lesson Title"]) || sub,
      subId: sub, // verbatim — never reformatted
      subDesc: clean(r["Substandard Description"]),
      ab: clean(r["Assessment Boundary"]),
      diff: parseDifficultyMatrix(r["Difficulty Matrix"]),
      prereq: clean(r["Prerequisites"]),
      los: losBySub[sub] || [],
    });
  });

  if (!lessons.length) {
    throw new Error("No active lessons found. Check that the Standards file has rows with Active = TRUE and a Substandard ID.");
  }

  return {
    lessons,
    stats: {
      lessons: lessons.length,
      learningObjectives: loActive,
      lessonsWithoutLOs: lessons.filter((l) => l.los.length === 0).length,
      standardsRowsSkippedInactive: skippedInactive,
      standardsRowsSkippedNoId: skippedNoId,
      duplicateSubstandards: duplicates,
      domains: [...new Set(lessons.map((l) => l.domain))].length,
    },
  };
}
