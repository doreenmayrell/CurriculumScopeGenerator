# Curriculum Scoping Engine

A web app for curriculum designers. It ingests a school's existing lesson library
(a structured "data model"), then lets a designer paste in academic standards and runs
an AI **scope analysis** that:

1. Deconstructs each standard into concepts, skills, sub-skills, and prerequisites.
2. Audits the existing library and classifies each relevant lesson as **fully covered**,
   **partially covered**, or a gap.
3. Proposes the **smallest set of new lessons** needed for mastery — each with a full spec
   (objective, prerequisites, assessment boundary, dependencies, and an Easy/Medium/Hard
   difficulty matrix with example stimuli).

Built around **8th-grade math (CCSS/TEKS)** sample data, but grade/subject agnostic.

This is the React + Vite implementation imported from the
[Claude Design handoff](https://claude.ai/design/p/2954d10d-69b7-44c5-9612-c2daff457c18)
(`Curriculum Scoping Engine.dc.html`). The prototype's simulated steps (library build,
scope run, regenerate) stand in for production CSV parsing and streaming AI calls.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

## Project layout

```
index.html
src/
  main.jsx                 global styles + React root
  App.jsx                  all screens (list / workspace / lesson / result) + dialogs
  theme.js                 design tokens (colors, fonts, radii, shadows)
  hooks/useScopingEngine.js  all state + actions, incl. suggestSubId()
  lib/csv.js               CSV parser + buildLibraryFromCSVs() (real import)
  data/
    library.json           pre-joined fallback library shown before an import
    scopeSeed.js           sample scope-result fixtures (8.F.B.4, 8.EE.B.5)
public/
  samples/                 example data-model exports for trying the importer
```

## Screens

- **Workspaces list** — one workspace per grade/course; create + delete.
- **Workspace detail** — tabbed: **Lesson Library** (CSV import → build → lessons grouped by
  domain), **Run Scope** (paste standards + optional supporting docs → staged analysis),
  **Scope History**.
- **Lesson detail** — substandard, learning objectives, difficulty matrix, assessment
  boundary, prerequisites.
- **Scope Result** — summary stats, per-standard breakdown, fully/partially covered audits,
  and expandable new-lesson cards with full specs. Supports whole-scope and per-lesson
  feedback re-runs.

## Data model

The library is built by uploading two CSV exports and joining them on **`Substandard ID`**:

- **Standards** — `Active`, `Course Name`, `Domain`, `Standard Id (L1)` + description,
  `Unit Name`, `Lesson Title`, **`Substandard ID`**, `Substandard Description`,
  `Assessment Boundary`, `Difficulty Matrix` (free text with EASY/MEDIUM/HARD sections),
  `Prerequisites`.
- **Learning Objectives** — `Active`, **`Substandard ID`** (join key), `Task` (the LO text).

One substandard → one lesson → many Learning-Objective rows.

### Import is real (`src/lib/csv.js`)

"Import & Build Library" parses both uploaded CSVs with a proper RFC-4180 parser (quoted
fields, embedded newlines/commas), then:

- keeps **every** Standards row with `Active = TRUE` and a Substandard ID — one row → one lesson;
- carries the **Substandard ID through verbatim** and uses it as the join key;
- attaches each lesson's learning objectives from the active `Task` rows that share its
  Substandard ID;
- splits the `Difficulty Matrix` cell into Easy / Medium / Hard;
- reports an auditable summary (active lessons, LOs, domains, inactive rows skipped,
  missing/duplicate IDs) so you can confirm nothing was dropped.

`data/library.json` is only a fallback shown before an import. Sample exports for trying the
importer live in `public/samples/`.

### Key business rule — suggested Substandard ID for new lessons

When the engine proposes a new lesson for a standard, it assigns a suggested Substandard ID
that **continues that standard's existing `+N` sequence**: find the highest `+N` already used
for the standard's base code, then number new lessons `+(N+1)`, `+(N+2)`, …

- Library has `…8.EE.B.5+1` → new lesson = `…8.EE.B.5+2`.
- Library has `…8.F.B.4+1, +2, +4, +8` → new lessons = `…8.F.B.4+9`, `+10`.

Implemented in `suggestSubId()` (`src/hooks/useScopingEngine.js`).

## Productionizing

- CSV upload → parse → join-on-Substandard-ID is implemented (`src/lib/csv.js`); persist the
  built library to your backend rather than holding it only in component state.
- Replace `runScope` / `rerunScope` / `rerunLesson` (staged-string simulations) with real
  streaming AI calls.
- Add real routes (`/`, `/workspace/:id`, `/workspace/:id/lesson/:n`, `/workspace/:id/run/:runId`).
- Persist workspaces + run history to a backend; keep per-run UI interaction state local.
- Swap emoji placeholders for your icon set, and map the inline styles in `App.jsx` onto your
  design system if integrating into an existing codebase.
