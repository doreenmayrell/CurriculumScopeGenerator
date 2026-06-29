# Scope-analysis prompt — cross-standard-set gap fix

## Where the prompt lives

The live scope analysis runs in the production app (SME Curriculum Scoping
Companion), in `src/lib/scope.functions.ts` → `runScopeAnalysis` → the `system`
string sent to the model. This local app only **simulates** runs from
`src/data/scopeSeed.js`, so this doc is the source of truth for the prompt change.

## The problem

Uploading a state standard set (e.g. TEKS) against a CCSS-aligned lesson library
missed gap lessons it should have produced — specifically Kindergarten:

- **K.2.A** count forward **and backward** to 20 (CCSS counts forward only)
- **K.2.F** **generate** one-more / one-less, **without objects** (CCSS only says
  the successor is "one larger", typically tested *with* models)

Whole domains absent from CCSS were caught (K.4 coins, K.9 financial literacy),
but **within-domain** TEKS-only nuances were not.

## Root cause

The system prompt tells the model to deconstruct each standard and audit it against
the **existing library**. It never instructs an explicit **crosswalk of the uploaded
standard set against CCSS at the lettered-expectation grain**, so a TEKS expectation
that looks superficially like a CCSS skill ("counting") gets marked covered and its
distinguishing nuance (direction, generative demand, with/without models) is dropped.

## The fix — add this section to the `system` prompt

Insert immediately **before** the line:

```
SUPPLEMENTAL REFERENCE DOCUMENTS (strict — when any are provided):
```

```text
CROSS-STANDARD-SET GAP ANALYSIS (strict — the primary job when the uploaded
standards belong to a different standard set than the library's alignment,
e.g. TEKS uploaded against a CCSS-aligned library):

- Treat the UPLOADED standards as authoritative. The library may be aligned to a
  DIFFERENT set (commonly CCSS). Never assume the library's set covers the uploaded one.
- Decompose every uploaded standard to its smallest LABELED student expectation
  (e.g. K.2A, K.2B … K.2F; K.9A–D) and evaluate EACH separately. Never collapse a
  knowledge-and-skills strand into one chunk — within-strand expectations are where gaps hide.
- For each uploaded expectation, find the nearest analog in the comparison set (CCSS)
  AND in the library, then classify:
   * Fully covered — comparison set requires the SAME action, direction, representation,
     range, and support level, AND a library lesson delivers it.
   * Partially covered — the closest analog covers only a WEAKER/ADJACENT form; the
     missing delta MUST become a new gap lesson.
   * Not covered (gap) — no analog in the comparison set; generate a new lesson and state
     plainly that the comparison set does not address it.
- Do NOT mark an expectation covered because a superficially similar skill exists. Require
  an EXACT match on every divergence axis before declaring coverage:
   * Direction (count forward vs. backward)
   * Generative vs. recognition (generate one-more/one-less vs. recognize the successor is "one larger")
   * Representation/support (with vs. without objects or models)
   * Whole domains absent at this grade (money & coin identification, personal financial literacy)
   * Number range/magnitude; verbal/contextual vs. symbolic
- Known failure modes to never repeat: counting BACKWARD (K.2A) and generating
  one-more/one-less WITHOUT models (K.2F) are TEKS expectations CCSS does not require — they
  MUST surface as gap lessons even though CCSS "counting" looks similar.
- Reconcile counts: every uploaded lettered expectation appears exactly once as fully
  covered, partially covered, or a new lesson. If any is omitted, you erred — re-audit.
```

## Local demo parity

`src/data/scopeSeed.js` → `KINDERGARTEN_SCOPE_STANDARDS` now includes a `TEKS.MATH.K.2`
group with the two previously-missing gap lessons (K.2.A, K.2.F), so the prototype's
Kindergarten result mirrors what the improved prompt should produce.
