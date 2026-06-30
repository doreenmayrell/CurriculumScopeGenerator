/**
 * useScopingEngine — all app state + actions for the Curriculum Scoping Engine.
 *
 * This is a faithful port of the prototype's logic class. In production:
 *  - Replace `buildLibrary` with the real CSV upload + parse + join-on-Substandard-ID.
 *  - Replace `runScope` / `rerunScope` / `rerunLesson` with real AI calls.
 *  - Persist workspaces + runs to your backend.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import seedLibrary from "../data/library.json";
import { RUNS, getScopeStandardsForGrade, gradeLabel as formatGradeLabel } from "../data/scopeSeed.js";
import { buildLibraryFromCSVs } from "../lib/csv.js";
import { apiUrl } from "../lib/apiBase.js";

const INITIAL_WORKSPACES = [
  { id: "g8math", name: "Grade 8 Math (TEKS)", grade: "8", subject: "Math", icon: "📈", tint: "#eef2ff", lessons: seedLibrary.length, runs: 4 },
  { id: "alg1",   name: "Algebra I",           grade: "9", subject: "Math", icon: "🧮", tint: "#fef3f2", lessons: 76, runs: 2 },
  { id: "g7math", name: "Grade 7 Math (TEKS)", grade: "7", subject: "Math", icon: "📐", tint: "#f0fdf4", lessons: 81, runs: 6 },
];
const STORAGE_KEYS = {
  workspaces: "curriculum-scope.workspaces",
  activeWorkspace: "curriculum-scope.activeWorkspace",
  scopeResult: "curriculum-scope.scopeResult",
  lessonEdits: "curriculum-scope.lessonEdits",
  runsByWorkspace: "curriculum-scope.runsByWorkspace",
  activeRun: "curriculum-scope.activeRun",
};

function loadSavedJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function loadSavedWorkspaces() {
  if (typeof window === "undefined") return INITIAL_WORKSPACES;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEYS.workspaces);
    // Seed the demo workspaces only on the very first run (no key yet). Once the
    // key exists we honor exactly what's saved — including an empty list — so a
    // workspace stays put until it's deleted and deleted ones never resurrect.
    if (saved === null) return INITIAL_WORKSPACES;

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return INITIAL_WORKSPACES;
    return parsed.map((w) => ({ ...w, noCcssLessonsExist: !!w.noCcssLessonsExist }));
  } catch {
    return INITIAL_WORKSPACES;
  }
}

function loadSavedWorkspaceId() {
  if (typeof window === "undefined") return "g8math";
  return window.localStorage.getItem(STORAGE_KEYS.activeWorkspace) || "g8math";
}

function demoRunsForWorkspace(workspace) {
  const count = Math.min(Math.max(workspace.runs || 0, 0), RUNS.length);
  if (!count) return [];
  return RUNS.slice(0, count).map((run, i) => ({
    ...run,
    id: `${workspace.id}-${run.id}`,
    title: workspace.id === "g8math" ? run.title : `${workspace.name} scope run ${i + 1}`,
  }));
}

function initialRunsByWorkspace(workspaces) {
  return Object.fromEntries(workspaces.map((workspace) => [workspace.id, demoRunsForWorkspace(workspace)]));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatStandardSystemId(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const acronym = trimmed.match(/\(([A-Z]{2,12})\)/);
  if (acronym) return acronym[1];
  const known = trimmed.match(/\b(TEKS|CCSS)\b/i);
  if (known) return known[1].toUpperCase();
  return trimmed
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^a-z0-9]+/gi, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "")
    .toUpperCase();
}

function systemFromCode(value = "") {
  const match = String(value || "").match(/\b([A-Z][A-Z0-9]*)\.MATH(?:\.CONTENT)?\./i);
  return match ? formatStandardSystemId(match[1]) : "";
}

function normalizeStandardCode(value = "") {
  let code = String(value || "").trim();
  if (!code) return "";

  const fullIdMatch = code.match(/\b[A-Z][A-Z0-9]*\.MATH(?:\.CONTENT)?\.([A-Z0-9][A-Z0-9.()]*[A-Z0-9)]?)(?:\+\d+)?\b/i);
  if (fullIdMatch) code = fullIdMatch[1];
  else {
    const teksMatch = code.match(/\b(?:K|\d{1,2})\.\d+(?:\s*\(?[A-Z]\)?)?\b/i);
    const ccssMatch = code.match(/\b\d{1,2}\.[A-Z]+\.[A-Z]+\.\d+[A-Z]?\b/i);
    if (teksMatch) code = teksMatch[0];
    else if (ccssMatch) code = ccssMatch[0];
  }

  code = code
    .replace(/\+\d+\s*$/i, "")
    .replace(/\(([^)]+)\)/g, ".$1")
    .replace(/^(?:[A-Z][A-Z0-9]*\.)?MATH(?:\.CONTENT)?\./i, "")
    .replace(/[^a-z0-9]+/gi, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");

  // TEKS-style codes often arrive as K.9B or 5.1A; the data model wants K.9.B / 5.1.A.
  code = code.replace(/(\d)([A-Z]+)$/i, "$1.$2");
  return code.toUpperCase();
}

function standardCodeCandidates(value = "") {
  const text = String(value || "");
  const candidates = [];
  const add = (raw) => {
    const code = normalizeStandardCode(raw);
    if (code && !candidates.includes(code)) candidates.push(code);
  };

  for (const match of text.matchAll(/\b[A-Z][A-Z0-9]*\.MATH(?:\.CONTENT)?\.[A-Z0-9][A-Z0-9.()]*[A-Z0-9)]?(?:\+\d+)?\b/gi)) {
    add(match[0]);
  }
  for (const match of text.matchAll(/\b(?:K|\d{1,2})\.\d+\s*\([A-Z]+\)/gi)) {
    add(match[0]);
  }
  for (const match of text.matchAll(/\b(?:K|\d{1,2})\.\d+(?:(?:\.[A-Z]+)|(?:[A-Z]+))?\b/gi)) {
    add(match[0]);
  }
  for (const match of text.matchAll(/\b(?:K|\d{1,2})\.[A-Z]+\.[A-Z]+\.\d+[A-Z]?\b/gi)) {
    add(match[0]);
  }
  return candidates;
}

function isExplicitLeafStandardCode(code = "") {
  const normalized = normalizeStandardCode(code);
  return /^(?:K|\d{1,2})\.\d+\.[A-Z]+(?:\.\d+)?$/i.test(normalized)
    || /^(?:K|\d{1,2})\.[A-Z]+\.[A-Z]+\.\d+[A-Z]?$/i.test(normalized);
}

function standardTextForFallback(standard) {
  const fieldItems = (standard?.breakdownFields || []).flatMap((field) => [field.label, ...(field.items || [])]);
  return [standard?.standard, standard?.baseCode, ...fieldItems].filter(Boolean).join("\n");
}

function leafExpectationCodesForStandard(standard) {
  return standardCodeCandidates(standardTextForFallback(standard)).filter(isExplicitLeafStandardCode);
}

function suggestedBaseId({ standardSetName, lessonCode, baseCode, standardText, lessonText, fallbackCode }) {
  const system =
    systemFromCode(lessonCode) ||
    systemFromCode(baseCode) ||
    systemFromCode(standardText) ||
    formatStandardSystemId(standardSetName);
  const candidates = [
    ...standardCodeCandidates(lessonCode),
    ...standardCodeCandidates(lessonText),
    ...standardCodeCandidates(fallbackCode),
    ...standardCodeCandidates(standardText),
    ...standardCodeCandidates(baseCode),
  ];
  const standard = candidates.find(isExplicitLeafStandardCode) || candidates[0] || normalizeStandardCode(lessonCode) || normalizeStandardCode(baseCode) || normalizeStandardCode(standardText);
  return system && standard ? `${system}.MATH.CONTENT.${standard}` : "";
}

// Continue a standard's substandard numbering from the highest +N already in the library.
export function suggestSubId({ standardSetName, lessonCode, baseCode, standardText, lessonText, fallbackCode, libraryRows, nextByBase }) {
  const base = suggestedBaseId({ standardSetName, lessonCode, baseCode, standardText, lessonText, fallbackCode });
  if (!base) return lessonCode || baseCode || "";
  if (nextByBase?.has(base)) {
    const next = nextByBase.get(base);
    nextByBase.set(base, next + 1);
    return `${base}+${next}`;
  }

  const re = new RegExp("^" + escapeRegExp(base) + "\\+(\\d+)$", "i");
  let maxN = 0;
  (libraryRows || []).forEach((r) => {
    const m = String(r.subId || "").trim().match(re);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  });
  const next = maxN + 1;
  if (nextByBase) nextByBase.set(base, next + 1);
  return `${base}+${next}`;
}

// Read a File as bare base64 (no data: prefix) for the scope proxy.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read the PDF file"));
    reader.readAsDataURL(file);
  });
}

export function useScopingEngine() {
  const [workspaces, setWorkspaces] = useState(loadSavedWorkspaces);
  const [screen, setScreen] = useState("list");        // list | workspace | lesson | result
  const [wsId, setWsId] = useState(loadSavedWorkspaceId);
  const [tab, setTab] = useState("library");           // library | run | history
  const [lessonId, setLessonId] = useState(0);

  // library (seeded from the bundled fixture; replaced by a real CSV import)
  const [library, setLibrary] = useState(seedLibrary);

  // library build
  const [uploaded, setUploaded] = useState({ standards: null, objectives: null });
  const [built, setBuilt] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [buildStats, setBuildStats] = useState(null);
  const [noCcssLessonsExist, setNoCcssLessonsExist] = useState(false);

  // supporting docs (on Run Scope tab)
  const [supportDocs, setSupportDocs] = useState([]);  // [{name, desc, file, size, type}]
  const [docDesc, setDocDesc] = useState("");
  const [supportDocFile, setSupportDocFile] = useState(null);

  // run scope
  const [standardSetFile, setStandardSetFile] = useState(null);
  const [standardSetName, setStandardSetName] = useState("");
  const [running, setRunning] = useState(false);
  const [runStage, setRunStage] = useState("");
  const [runProgress, setRunProgress] = useState(0);
  const [scopeResult, setScopeResult] = useState(() => loadSavedJson(STORAGE_KEYS.scopeResult, null)); // live result from /api/scope (null → demo fixtures)
  const [scopeError, setScopeError] = useState("");
  // Real saved runs, per workspace, each carrying its own result + edits. Persisted.
  const [runsByWorkspace, setRunsByWorkspace] = useState(() => loadSavedJson(STORAGE_KEYS.runsByWorkspace, {}));
  const [activeRunId, setActiveRunId] = useState(() => loadSavedJson(STORAGE_KEYS.activeRun, null));

  // result interactions
  const [openLessons, setOpenLessons] = useState({});
  const [scopeFbOpen, setScopeFbOpen] = useState(false);
  const [scopeFb, setScopeFb] = useState("");
  const [lessonFbOpen, setLessonFbOpen] = useState(null);
  const [lessonFb, setLessonFb] = useState("");
  const [regenKey, setRegenKey] = useState(null);
  const [regenerated, setRegenerated] = useState({});
  const [lessonEdits, setLessonEdits] = useState(() => loadSavedJson(STORAGE_KEYS.lessonEdits, {}));

  // dialogs + toast
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ name: "", grade: "", subject: "" });
  const [deleteWsId, setDeleteWsId] = useState(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const iv = useRef(null);
  const progressIv = useRef(null);
  const abortRef = useRef(null); // AbortController for an in-flight scope run

  const ws = useMemo(() => workspaces.find((w) => w.id === wsId) || workspaces[0], [workspaces, wsId]);
  const gradeLabel = formatGradeLabel(ws?.grade);
  const runs = runsByWorkspace[wsId] || [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.workspaces, JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.activeWorkspace, wsId);
  }, [wsId]);

  // Persist the live scope result + per-lesson edits so they survive a reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (scopeResult) window.localStorage.setItem(STORAGE_KEYS.scopeResult, JSON.stringify(scopeResult));
    else window.localStorage.removeItem(STORAGE_KEYS.scopeResult);
  }, [scopeResult]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.lessonEdits, JSON.stringify(lessonEdits));
  }, [lessonEdits]);

  // Persist saved runs + which run is open.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.runsByWorkspace, JSON.stringify(runsByWorkspace));
  }, [runsByWorkspace]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeRunId) window.localStorage.setItem(STORAGE_KEYS.activeRun, JSON.stringify(activeRunId));
    else window.localStorage.removeItem(STORAGE_KEYS.activeRun);
  }, [activeRunId]);

  // Mirror live edits into the open run's saved record so reopening shows the latest version.
  useEffect(() => {
    if (!activeRunId) return;
    setRunsByWorkspace((prev) => {
      const list = prev[wsId];
      if (!list) return prev;
      let changed = false;
      const next = list.map((r) => {
        if (r.id !== activeRunId || r.edits === lessonEdits) return r;
        changed = true;
        return { ...r, edits: lessonEdits };
      });
      return changed ? { ...prev, [wsId]: next } : prev;
    });
  }, [lessonEdits, activeRunId, wsId]);

  useEffect(() => {
    if (workspaces.length && !workspaces.some((w) => w.id === wsId)) {
      setWsId(workspaces[0].id);
    }
  }, [workspaces, wsId]);

  useEffect(() => {
    setNoCcssLessonsExist(!!ws?.noCcssLessonsExist);
  }, [ws?.id, ws?.noCcssLessonsExist]);

  useEffect(() => {
    return () => {
      clearInterval(iv.current);
      clearInterval(progressIv.current);
    };
  }, []);

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  // ---- library build (real CSV import) ----
  // Reads both uploaded CSVs, joins them on Substandard ID, keeps every active
  // lesson, and replaces the library with the parsed result. See src/lib/csv.js.
  const buildLibrary = useCallback(async () => {
    const sFile = uploaded.standards;
    const oFile = uploaded.objectives;
    if (!sFile || !oFile || building) return;
    setBuilding(true);
    setBuildError("");
    try {
      const [sText, oText] = await Promise.all([sFile.text(), oFile.text()]);
      const { lessons, stats } = buildLibraryFromCSVs(sText, oText);
      setLibrary(lessons);
      setBuildStats(stats);
      setBuilt(true);
      setWorkspaces((w) => w.map((x) => (x.id === wsId ? { ...x, lessons: stats.lessons } : x)));
      flash(`Library built — ${stats.lessons} active lessons · ${stats.learningObjectives} learning objectives`);
    } catch (err) {
      setBuildError(err && err.message ? err.message : "Could not parse the CSV files. Make sure both are the data-model exports.");
      flash("Import failed");
    } finally {
      setBuilding(false);
    }
  }, [uploaded, building, wsId, flash]);

  const addDoc = useCallback(() => {
    if (!supportDocFile) return;
    setSupportDocs((d) => [...d, {
      name: supportDocFile.name,
      desc: docDesc.trim() || "(no description provided)",
      file: supportDocFile,
      size: supportDocFile.size,
      type: supportDocFile.type || "application/pdf",
    }]);
    setDocDesc("");
    setSupportDocFile(null);
    flash("Supporting document added");
  }, [supportDocFile, docDesc, flash]);

  // ---- staged analysis (simulated AI) ----
  const stagedRun = useCallback((stages, opts = {}) => {
    let i = 0;
    setRunning(true);
    setRunStage(stages[0]);
    setRunProgress(5);
    setScreen("workspace");
    setTab("run");
    clearInterval(iv.current);
    clearInterval(progressIv.current);
    iv.current = setInterval(() => {
      i += 1;
      setRunProgress(Math.min(96, Math.round((i / stages.length) * 100)));
      if (i < stages.length) setRunStage(stages[i]);
      else {
        clearInterval(iv.current);
        setRunProgress(100);
        setRunning(false);
        setScreen("result");
        setOpenLessons(opts.openFirst ? { "0-0": true } : {});
        if (opts.done) opts.done();
      }
    }, opts.interval || 800);
  }, []);

  // Real scope analysis: send the standards PDF + context to the local proxy,
  // which calls Claude and returns the result in the shape the UI renders.
  const runScope = useCallback(async () => {
    if (running) return;
    if (!standardSetName.trim()) { flash("Name the new standard system first"); return; }
    if (!standardSetFile) { flash("Attach the standards PDF first"); return; }

    const stages = noCcssLessonsExist
      ? ["Reading uploaded new standard system PDF…", `Comparing new standards against ${gradeLabel} CCSS…`, "Applying Lesson Scope and Granularity Brainlift…", "Generating new-standard bridge lessons…"]
      : ["Reading uploaded new standard system PDF…", `Comparing new standards against ${gradeLabel} CCSS…`, "Auditing lesson library coverage…", "Applying Lesson Scope and Granularity Brainlift…", "Generating new-standard-aligned lesson proposals…"];

    const controller = new AbortController();
    abortRef.current = controller;
    setScopeError("");
    setRunning(true);
    setRunProgress(4);
    setScreen("workspace");
    setTab("run");
    let i = 0;
    setRunStage(stages[0]);
    clearInterval(iv.current);
    clearInterval(progressIv.current);
    iv.current = setInterval(() => { i = (i + 1) % stages.length; setRunStage(stages[i]); }, 1600);
    progressIv.current = setInterval(() => {
      setRunProgress((current) => {
        if (current >= 92) return current;
        const next = current < 35 ? current + 4 : current < 70 ? current + 2 : current + 1;
        return Math.min(92, next);
      });
    }, 1200);

    try {
      const healthResp = await fetch(apiUrl("/api/health"), { signal: controller.signal });
      const health = await healthResp.json().catch(() => ({}));
      if (!healthResp.ok || !health.ok) {
        throw new Error(health.error || "Claude proxy is not responding. Start it with npm run server or npm run dev.");
      }
      if (!health.hasKey) {
        throw new Error("Claude proxy is running, but ANTHROPIC_API_KEY is missing from .env.");
      }
      setRunProgress((current) => Math.max(current, 12));

      const base64 = await fileToBase64(standardSetFile);
      setRunProgress((current) => Math.max(current, 24));
      const resp = await fetch(apiUrl("/api/scope"), {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          standardSetName: standardSetName.trim(),
          grade: ws?.grade ?? "",
          gradeLabel,
          noCcssLessonsExist,
          pdf: { name: standardSetFile.name, base64 },
          library: built ? library : [],
          supportDocs: supportDocs.map((d) => ({ name: d.name, desc: d.desc })),
        }),
      });
      setRunProgress((current) => Math.max(current, 88));
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Scope request failed (${resp.status})`);
      if (!data || !Array.isArray(data.standards) || !data.standards.length) {
        throw new Error("The model returned no standards.");
      }
      clearInterval(iv.current);
      clearInterval(progressIv.current);
      setRunProgress(100);
      const runId = `${wsId}-${Date.now()}`;
      setScopeResult(data);
      setLessonEdits({});
      setActiveRunId(runId);
      setRunning(false);
      setScreen("result");
      setOpenLessons({ "0-0": true });
      setRunsByWorkspace((prev) => ({
        ...prev,
        [wsId]: [
          {
            id: runId,
            title: `${standardSetName.trim()} — ${gradeLabel}`,
            date: new Date().toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
            createdAt: Date.now(),
            status: "complete",
            result: data,
            edits: {},
          },
          ...(prev[wsId] || []),
        ],
      }));
      flash("Scope analysis complete");
    } catch (err) {
      clearInterval(iv.current);
      clearInterval(progressIv.current);
      setRunning(false);
      if (controller.signal.aborted || (err && err.name === "AbortError")) {
        setRunStage("");
        setRunProgress(0);
        flash("Scope analysis canceled");
      } else {
        const msg = err && err.message ? err.message : "Scope run failed";
        setScopeError(msg);
        flash(msg);
      }
    } finally {
      abortRef.current = null;
    }
  }, [running, standardSetName, standardSetFile, noCcssLessonsExist, gradeLabel, ws, wsId, built, library, supportDocs, flash]);

  // Kill an in-flight scope run: aborts the fetch (and, via the server, the Claude stream).
  const cancelScope = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const rerunScope = useCallback(() => {
    setScopeFbOpen(false);
    const stages = noCcssLessonsExist
      ? ["Re-reading your feedback…", `Re-comparing new standards against ${gradeLabel} CCSS…`, "Applying Lesson Scope and Granularity Brainlift…", "Regenerating new-standard bridge lessons…"]
      : ["Re-reading your feedback…", `Re-comparing new standards against ${gradeLabel} CCSS…`, "Re-auditing lesson library coverage…", "Applying Lesson Scope and Granularity Brainlift…", "Regenerating new-standard-aligned lesson proposals…"];
    stagedRun(stages, { interval: 750, done: () => { setScopeFb(""); flash("Scope re-run with your feedback"); } });
  }, [noCcssLessonsExist, gradeLabel, stagedRun, flash]);

  const rerunLesson = useCallback((key) => {
    const fb = lessonFb.trim();
    setRegenKey(key);
    setLessonFbOpen(null);
    setTimeout(() => {
      setRegenKey(null);
      setLessonFb("");
      setRegenerated((r) => ({ ...r, [key]: fb || "regenerated" }));
      flash("Lesson regenerated with your feedback");
    }, 1400);
  }, [lessonFb, flash]);

  const updateLessonEdit = useCallback((lessonKey, field, value) => {
    setLessonEdits((edits) => ({
      ...edits,
      [lessonKey]: {
        ...(edits[lessonKey] || {}),
        [field]: value,
      },
    }));
  }, []);

  // ---- workspace CRUD ----
  const createWorkspace = useCallback(() => {
    if (!form.name.trim()) return;
    const workspace = {
      id: "ws" + Date.now(),
      name: form.name,
      grade: form.grade,
      subject: form.subject,
      icon: "✏️",
      tint: "#fefce8",
      lessons: 0,
      runs: 0,
      noCcssLessonsExist: false,
    };
    setWorkspaces((w) => [...w, workspace]);
    setRunsByWorkspace((r) => ({ ...r, [workspace.id]: [] }));
    setWsId(workspace.id);
    setTab("library");
    setScreen("workspace");
    setDialog(false);
    flash("Workspace saved");
  }, [form, flash]);

  const updateNoCcssLessonsExist = useCallback((checked) => {
    setNoCcssLessonsExist(checked);
    setWorkspaces((w) => w.map((x) => (x.id === wsId ? { ...x, noCcssLessonsExist: checked } : x)));
  }, [wsId]);

  const deleteWorkspace = useCallback((id) => {
    setWorkspaces((w) => w.filter((x) => x.id !== id));
    setRunsByWorkspace((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
    setDeleteWsId(null);
    flash("Workspace deleted");
  }, [flash]);

  const clearHistory = useCallback(() => {
    const list = runsByWorkspace[wsId] || [];
    const clearingOpenRun = list.some((r) => r.id === activeRunId);
    setRunsByWorkspace((r) => ({ ...r, [wsId]: [] }));
    setWorkspaces((w) => w.map((x) => (x.id === wsId ? { ...x, runs: 0 } : x)));
    if (clearingOpenRun) {
      setActiveRunId(null);
      setScopeResult(null);
      setLessonEdits({});
    }
    flash("Scope history cleared for this workspace");
  }, [wsId, activeRunId, runsByWorkspace, flash]);

  // Open a saved run: load its result + latest edits onto the result screen.
  const openRun = useCallback((runId) => {
    const run = (runsByWorkspace[wsId] || []).find((r) => r.id === runId);
    if (!run) { flash("This run is no longer available"); return; }
    if (run.status !== "complete" || !run.result) { flash("This run didn't complete — re-run to retry"); return; }
    setActiveRunId(runId);
    setScopeResult(run.result);
    setLessonEdits(run.edits || {});
    setOpenLessons({ "0-0": true });
    setScreen("result");
  }, [runsByWorkspace, wsId, flash]);

  // ---- derived: standards for the result screen, with suggested substandard IDs ----
  const scopedStandards = useMemo(() => {
    const base =
      scopeResult && Array.isArray(scopeResult.standards) && scopeResult.standards.length
        ? scopeResult.standards
        : getScopeStandardsForGrade(ws?.grade);
    const nextByBase = new Map();
    return base.map((st) => {
      const fallbackCodes = leafExpectationCodesForStandard(st);
      let countedProposalIndex = 0;
      return {
        ...st,
        newLessons: (st.newLessons || []).map((l, li) => {
          const countsForThisRun = !noCcssLessonsExist || l.reasonType === "stateSet";
          const fallbackCode = countsForThisRun ? fallbackCodes[countedProposalIndex++] : undefined;
          return {
            ...l,
            suggestedSubId: countsForThisRun
              ? suggestSubId({
                  standardSetName,
                  lessonCode: l.code,
                  baseCode: st.baseCode,
                  standardText: standardTextForFallback(st),
                  lessonText: [l.name, l.reason, l.objective, l.purpose, l.prereqs, l.assessed, ...(l.before || []), ...(l.after || [])].filter(Boolean).join("\n"),
                  fallbackCode,
                  libraryRows: library,
                  nextByBase,
                })
              : "",
          };
        }),
      };
    });
  }, [scopeResult, library, ws?.grade, standardSetName, noCcssLessonsExist]);

  return {
    // data
    workspaces, ws, gradeLabel, library, scopedStandards, runs, runsByWorkspace, activeRunId, openRun,
    // nav
    screen, setScreen, wsId, setWsId, tab, setTab, lessonId, setLessonId,
    // build
    uploaded, setUploaded, built, building, buildLibrary, buildError, buildStats,
    noCcssLessonsExist, setNoCcssLessonsExist: updateNoCcssLessonsExist,
    supportDocs, setSupportDocs, docDesc, setDocDesc,
    supportDocFile, setSupportDocFile, docAttached: !!supportDocFile, addDoc,
    // run
    standardSetFile, setStandardSetFile, standardSetName, setStandardSetName, running, runStage, runProgress, runScope, cancelScope, scopeError,
    // result
    openLessons, setOpenLessons, regenerated, regenKey, lessonEdits, updateLessonEdit,
    scopeFbOpen, setScopeFbOpen, scopeFb, setScopeFb, rerunScope,
    lessonFbOpen, setLessonFbOpen, lessonFb, setLessonFb, rerunLesson,
    // dialogs + toast
    dialog, setDialog, form, setForm, createWorkspace,
    deleteWsId, setDeleteWsId, deleteWorkspace, clearHistory, toast, flash,
  };
}
