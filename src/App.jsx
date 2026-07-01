import React from "react";
import { useScopingEngine } from "./hooks/useScopingEngine.js";
import { gradeLabel as formatGradeLabel, gradeTitle } from "./data/scopeSeed.js";
import { beginGoogleRedirectAuth, clearGoogleRedirectHash, createScopeGoogleDocWithToken, getGoogleRedirectToken } from "./lib/googleDocsExport.js";
import { color as C, font, radius, shadow } from "./theme.js";

/* ============================================================================
 * Curriculum Scoping Engine — React reference implementation.
 * Single-file for readability; split into per-screen components in production.
 * Styling is inline to mirror the HTML prototype 1:1 — swap for your styling
 * system (Tailwind / CSS modules / styled-components) as appropriate.
 * ==========================================================================*/

const lines = (txt) => (txt || "").split("\n").map((x) => x.replace(/^[\s\-•]+/, "").trim()).filter(Boolean);
const formatFileSize = (bytes = 0) => {
  if (!bytes) return "0 KB";
  const units = ["bytes", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value.toFixed(value >= 10 || power === 0 ? 0 : 1)} ${units[power]}`;
};
const isPdfFile = (file) => !!file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name));
const GAP_REASONS = {
  stateSet: {
    label: "Covered in new standard system, not CCSS",
    shortLabel: "New standard, not CCSS",
    bg: C.indigoBg,
    fg: C.indigo,
  },
  library: {
    label: "Covered in CCSS, missing from lesson library",
    shortLabel: "CCSS library gap",
    bg: "#fef3c7",
    fg: C.amberText,
  },
};
const gapReasonFor = (type) => GAP_REASONS[type] || GAP_REASONS.library;
// Compact display of a Substandard ID: drop the redundant namespace prefix but
// keep the "+N" suffix that distinguishes each substandard within a standard.
const shortId = (id) => (id || "").replace(/^(?:CCSS|TEKS)\.MATH\.CONTENT\./, "");
const DEFAULT_SCOPING_DRIVE_FOLDER_ID = "1NSZfxPSnE-y9Oab_K9XMX2QQVMGKk1l7";
const PENDING_GOOGLE_EXPORT_KEY = "curriculum-scope.pendingGoogleExport";
const formatStandardSetTitle = (name = "") => {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (/^[a-z]{2,6}$/i.test(trimmed)) return trimmed.toUpperCase();
  return trimmed.replace(/\b(teks|ccss)\b/gi, (match) => match.toUpperCase());
};

export default function App() {
  const e = useScopingEngine();
  const { screen } = e;
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: font.ui }}>
      <GoogleExportReturnHandler e={e} />
      <Header e={e} />
      {screen === "list" && <WorkspacesList e={e} />}
      {screen === "workspace" && <WorkspaceDetail e={e} />}
      {screen === "lesson" && <LessonDetail e={e} />}
      {screen === "result" && <ScopeResult e={e} />}
      <CreateDialog e={e} />
      <DeleteDialog e={e} />
      <Toast text={e.toast} />
    </div>
  );
}

function GoogleExportReturnHandler({ e }) {
  const handledRef = React.useRef(false);

  React.useEffect(() => {
    if (handledRef.current || typeof window === "undefined") return;
    const tokenResult = getGoogleRedirectToken();
    if (!tokenResult) return;

    handledRef.current = true;
    clearGoogleRedirectHash();

    const pendingRaw = window.localStorage.getItem(PENDING_GOOGLE_EXPORT_KEY);
    if (!pendingRaw) {
      e.flash(tokenResult.errorDescription || "Google sign-in returned, but no pending export was found.");
      return;
    }

    let pending;
    try {
      pending = JSON.parse(pendingRaw);
    } catch {
      window.localStorage.removeItem(PENDING_GOOGLE_EXPORT_KEY);
      e.flash("Could not read the pending scoping document export.");
      return;
    }

    if (tokenResult.error) {
      window.localStorage.removeItem(PENDING_GOOGLE_EXPORT_KEY);
      e.flash(tokenResult.errorDescription || "Google sign-in failed.");
      return;
    }

    e.setScreen("result");
    e.flash("Creating scoping document…");
    createScopeGoogleDocWithToken({
      token: tokenResult.accessToken,
      title: pending.title,
      lessons: pending.lessons || [],
      notCovered: pending.notCovered || [],
      folderId: pending.folderId,
    })
      .then(({ title, url }) => {
        window.localStorage.removeItem(PENDING_GOOGLE_EXPORT_KEY);
        window.open(url, "_blank", "noopener");
        e.flash(`${title} created in the scoping folder`);
      })
      .catch((err) => {
        window.localStorage.removeItem(PENDING_GOOGLE_EXPORT_KEY);
        e.flash(err && err.message ? err.message : "Could not create the scoping document.");
      });
  }, [e]);

  return null;
}

/* ---------------- Header ---------------- */
function Header({ e }) {
  const { screen, ws, setScreen } = e;
  const back = screen === "result" || screen === "lesson" ? "workspace" : "list";
  const showBack = screen !== "list";
  const backLabel = screen === "result" ? "Back" : screen === "lesson" ? "Library" : "Workspaces";
  const title = screen === "list" ? "Curriculum Scoping Engine" : ws.name;
  const sub = screen === "workspace" ? [e.gradeLabel, ws.subject].filter(Boolean).join(" · ") : screen === "lesson" ? "Lesson Library" : "";
  return (
    <header style={{ borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: "rgba(255,255,255,.85)", backdropFilter: "blur(8px)", zIndex: 40 }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 28px", height: 60, display: "flex", alignItems: "center", gap: 14 }}>
        {showBack && (
          <>
            <button onClick={() => setScreen(back)} style={ghostBtn}>← {backLabel}</button>
            <div style={{ width: 1, height: 22, background: C.border }} />
          </>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: C.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>◵</div>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-.01em" }}>{title}</span>
          {sub && (<><span style={{ color: C.textFaint }}>·</span><span style={{ fontSize: 13, color: C.textMuted }}>{sub}</span></>)}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: C.textFaint, fontWeight: 500, letterSpacing: ".02em" }}>CURRICULUM SCOPING ENGINE</span>
      </div>
    </header>
  );
}

/* ---------------- Workspaces list ---------------- */
function WorkspacesList({ e }) {
  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 28px 80px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 7px" }}>Curriculum Workspaces</h1>
          <p style={{ fontSize: 14, color: C.textMuted, margin: 0, maxWidth: 560, lineHeight: 1.5 }}>One workspace per grade level or course. Each holds its own lesson library, granularity rules, and difficulty framework.</p>
        </div>
        <button onClick={() => { e.setForm({ name: "", grade: "", subject: "" }); e.setDialog(true); }} style={primaryBtn}>+ New workspace</button>
      </div>
      {e.workspaces.length === 0 && (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: "44px 28px", textAlign: "center", background: "#fff" }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>No workspaces yet</p>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 18px" }}>Create a workspace for a grade level or course. It’s saved automatically and stays until you delete it.</p>
          <button onClick={() => { e.setForm({ name: "", grade: "", subject: "" }); e.setDialog(true); }} style={primaryBtn}>+ New workspace</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {e.workspaces.map((w) => (
          <div key={w.id} onClick={() => { e.setWsId(w.id); e.setTab("library"); e.setScreen("workspace"); }} style={cardHover}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: w.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{w.icon}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={pill}>{w.lessons} lessons</span>
                <button title="Delete workspace" onClick={(ev) => { ev.stopPropagation(); e.setDeleteWsId(w.id); }} style={trashBtn}>🗑</button>
              </div>
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.01em", margin: "0 0 4px" }}>{w.name}</p>
            <p style={{ fontSize: 12.5, color: C.textFaint, margin: "0 0 14px" }}>{[formatGradeLabel(w.grade), w.subject].filter(Boolean).join(" · ")}</p>
            <div style={{ borderTop: `1px solid ${C.borderSoft}`, paddingTop: 11, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {(() => { const n = (e.runsByWorkspace[w.id] || []).length; return <span style={{ fontSize: 12, color: C.textMuted }}>{n} scope run{n === 1 ? "" : "s"}</span>; })()}
              <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>Open →</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

/* ---------------- Workspace detail (tabs) ---------------- */
function WorkspaceDetail({ e }) {
  const tabs = [["library", "Lesson Library"], ["run", "Run Scope"], ["history", "Scope History"]];
  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 28px 80px" }}>
      <div style={{ display: "flex", gap: 2, background: C.borderSoft, padding: 4, borderRadius: 11, width: "fit-content", marginBottom: 24 }}>
        {tabs.map(([id, label]) => {
          const active = e.tab === id;
          return <button key={id} onClick={() => e.setTab(id)} style={{ border: "none", font: "inherit", fontSize: 13, fontWeight: 600, padding: "8px 15px", borderRadius: 8, cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? C.ink : C.textMuted, boxShadow: active ? shadow.card : "none" }}>{label}</button>;
        })}
      </div>
      {e.tab === "library" && <LibraryTab e={e} />}
      {e.tab === "run" && <RunScopeTab e={e} />}
      {e.tab === "history" && <HistoryTab e={e} />}
    </main>
  );
}

function LibraryTab({ e }) {
  const scopeModeControls = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 9, maxWidth: 720 }}>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: "11px 13px", background: e.noCcssLessonsExist ? C.indigoTint : C.panelAlt, cursor: "pointer" }}>
        <input type="checkbox" checked={e.noCcssLessonsExist} onChange={(ev) => e.setNoCcssLessonsExist(ev.target.checked)} style={{ marginTop: 2 }} />
        <span>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.textStrong, marginBottom: 2 }}>No CCSS lessons exist yet</span>
          <span style={{ display: "block", fontSize: 12.5, color: C.textMuted, lineHeight: 1.45 }}>Skip lesson-library coverage when running scope analysis. The run will only find gaps between the uploaded new standard system and CCSS.</span>
        </span>
      </label>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: "11px 13px", background: e.uniqueFromCcssOnly ? C.indigoTint : C.panelAlt, cursor: "pointer" }}>
        <input type="checkbox" checked={e.uniqueFromCcssOnly} onChange={(ev) => e.setUniqueFromCcssOnly(ev.target.checked)} style={{ marginTop: 2 }} />
        <span>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.textStrong, marginBottom: 2 }}>Only identify lessons that are unique from CCSS</span>
          <span style={{ display: "block", fontSize: 12.5, color: C.textMuted, lineHeight: 1.45 }}>Assume CCSS coverage is perfect. Only propose lessons for uploaded-standard expectations that extend CCSS or are not covered by CCSS at all.</span>
        </span>
      </label>
    </div>
  );

  if (!e.built) {
    const both = !!(e.uploaded.standards && e.uploaded.objectives);
    const slot = (key, file, title, desc) => {
      const f = e.uploaded[key];
      const on = !!f;
      return (
        <div style={{ border: `1px dashed ${on ? "#86efac" : C.borderHover}`, borderRadius: 12, padding: 18, background: C.panel, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, letterSpacing: ".05em", margin: "0 0 6px" }}>{file}</p>
          <p style={{ fontSize: 14.5, fontWeight: 600, margin: "0 0 4px" }}>{title}</p>
          <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 14px", lineHeight: 1.5 }}>{desc}</p>
          <label title={on ? f.name : undefined} style={{ ...attachBtn, background: on ? C.green : "#fff", color: on ? "#fff" : C.textStrong, maxWidth: "100%", marginTop: "auto", alignSelf: "flex-start", overflow: "hidden" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{on ? "✓ " + f.name : "↑ Attach CSV"}</span>
            <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(ev) => { const sel = ev.target.files && ev.target.files[0]; e.setUploaded((u) => ({ ...u, [key]: sel || null })); ev.target.value = ""; }} />
          </label>
        </div>
      );
    };
    return (
      <div style={panel}>
        <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>Import the Data Model</p>
        <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 18px", maxWidth: 680, lineHeight: 1.5 }}>The lesson library is built from two CSV exports of the math data model. Upload both — every <strong style={{ color: C.textStrong }}>active</strong> lesson is read from the Standards file and joined to its learning objectives on <code style={codeChip}>Substandard ID</code>.</p>
        <div style={{ marginBottom: 18 }}>{scopeModeControls}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {slot("standards", "FILE 1", "Data Model — Standards", "Course, domain, standard, unit, lesson, Substandard ID, substandard description, assessment boundary, difficulty matrix, prerequisites.")}
          {slot("objectives", "FILE 2", "Data Model — Learning Objectives", "The LO-level Task rows for each Substandard ID — joined to its lesson to complete the library.")}
        </div>
        {e.buildError && (
          <div style={{ marginTop: 14, border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 10, padding: "11px 13px", display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span>⚠️</span>
            <p style={{ fontSize: 12.5, color: C.redText, margin: 0, lineHeight: 1.5 }}>{e.buildError}</p>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.borderSoft}` }}>
          <button onClick={e.buildLibrary} style={{ ...primaryBtn, cursor: both && !e.building ? "pointer" : "default", opacity: both ? 1 : 0.5 }}>{e.building && <Spinner />} {e.building ? "Building Library…" : "Import & Build Library"}</button>
          <span style={{ fontSize: 12.5, color: C.textFaint }}>Both files are required.</span>
        </div>
      </div>
    );
  }

  const byDomain = {};
  e.library.forEach((l, i) => { (byDomain[l.domain] = byDomain[l.domain] || []).push({ l, i }); });
  const st = e.buildStats;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <p style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.01em", margin: "0 0 3px" }}>Lesson Library <span style={{ color: C.textFaint, fontWeight: 500 }}>· {e.library.length} lessons</span></p>
        <p style={{ fontSize: 12.5, color: C.textMuted, margin: 0 }}>This data is built directly from the data model. Select a lesson to view its full record.</p>
        <div style={{ marginTop: 12 }}>{scopeModeControls}</div>
        {st && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 11 }}>
            <Chip>{st.lessons} active lessons</Chip>
            <Chip>{st.learningObjectives} learning objectives</Chip>
            {st.lessonsWithoutLOs > 0 && <Chip tone="amber">{st.lessonsWithoutLOs} without LOs</Chip>}
            {st.standardsRowsSkippedInactive > 0 && <Chip tone="muted">{st.standardsRowsSkippedInactive} inactive skipped</Chip>}
            {st.standardsRowsSkippedNoId > 0 && <Chip tone="muted">{st.standardsRowsSkippedNoId} missing Substandard ID</Chip>}
            {st.duplicateSubstandards > 0 && <Chip tone="muted">{st.duplicateSubstandards} duplicate IDs</Chip>}
          </div>
        )}
      </div>
      {Object.keys(byDomain).map((d) => (
        <div key={d} style={{ border: `1px solid ${C.border}`, borderRadius: 13, overflow: "hidden" }}>
          <div style={{ padding: "11px 18px", background: C.panelAlt, borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between" }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: C.textStrong, margin: 0 }}>{d}</p>
            <span style={{ fontSize: 11.5, color: C.textFaint }}>{byDomain[d].length} lesson{byDomain[d].length === 1 ? "" : "s"}</span>
          </div>
          {byDomain[d].map(({ l, i }) => (
            <div key={i} onClick={() => { e.setLessonId(i); e.setScreen("lesson"); }} style={{ padding: "14px 18px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 3px", textAlign: "left" }}>{l.lesson}</p>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: C.textMuted, margin: "0 0 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.subId || l.standardId}</p>
                <p style={{ fontSize: 12.5, color: C.textMuted, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.subDesc}</p>
              </div>
              <span style={{ fontSize: 11, color: C.textFaint }}>{l.los.filter(Boolean).length} LOs</span>
              <span style={{ fontSize: 14, color: C.borderHover }}>→</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function RunScopeTab({ e }) {
  const selectedStandards = e.standardSetFile;
  const selectedDoc = e.supportDocFile;
  const preparedGapReady = !e.preparedGapMode || !!e.preparedGapText.trim();
  const sourceReady = e.preparedGapMode ? preparedGapReady : !!selectedStandards;
  const canRun = sourceReady && !!e.standardSetName.trim() && !e.running;
  const gradeLabel = e.gradeLabel;
  const runProgress = Math.max(0, Math.min(100, Math.round(e.runProgress || 0)));
  const waitingOnClaude = e.running && runProgress >= 90;

  const handleStandardSetChange = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;

    if (!isPdfFile(file)) {
      e.setStandardSetFile(null);
      e.flash("Please attach a PDF file");
      ev.target.value = "";
      return;
    }

    e.setStandardSetFile(file);
    ev.target.value = "";
  };

  const handleSupportDocChange = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;

    if (!isPdfFile(file)) {
      e.setSupportDocFile(null);
      e.flash("Please attach a PDF file");
      ev.target.value = "";
      return;
    }

    e.setSupportDocFile(file);
    ev.target.value = "";
  };

  return (
    <div style={{ ...panel, maxWidth: 760 }}>
      <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>Analyze Standards</p>
      <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 14px", lineHeight: 1.5 }}>Upload the new standard system PDF for this grade or course, such as TEKS, or provide a known gap list when the lesson gaps are already identified.</p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, background: C.panelAlt, border: "1px solid #eef2f6", borderRadius: 10, padding: "11px 13px", marginBottom: 18 }}>
        <span>🔒</span>
        <p style={{ fontSize: 12.5, color: C.textMuted, margin: 0, lineHeight: 1.5 }}><strong style={{ color: C.textStrong }}>Built-in granularity framework.</strong> Every run applies the governed Lesson Scope and Granularity Brainlift.</p>
      </div>

      <label style={lbl}>New Standard System Name</label>
      <input
        value={e.standardSetName}
        onChange={(ev) => e.setStandardSetName(ev.target.value)}
        placeholder="e.g., TEKS, Florida B.E.S.T., Virginia SOL"
        style={{ ...input, marginBottom: 20 }}
      />

      <label style={lbl}>New Standard System PDF{e.preparedGapMode && <span style={{ color: C.textFaint, fontWeight: 500 }}> (optional with known gaps)</span>}</label>
      <div style={{ border: `1px dashed ${selectedStandards ? "#86efac" : C.borderHover}`, borderRadius: 12, padding: 16, background: C.panel, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label title={selectedStandards ? selectedStandards.name : "Attach new standard system PDF"} style={{ ...attachBtn, background: selectedStandards ? C.green : "#fff", color: selectedStandards ? "#fff" : C.textStrong, flex: "none", maxWidth: 260 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedStandards ? "✓ " + selectedStandards.name : "↑ Attach system PDF"}</span>
            <input type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={handleStandardSetChange} />
          </label>
          {selectedStandards && <span style={{ fontSize: 12.5, color: C.textFaint }}>{formatFileSize(selectedStandards.size)} PDF</span>}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, border: `1px solid ${e.preparedGapMode ? C.indigoBorder : C.borderSoft}`, borderRadius: 10, padding: "11px 13px", background: e.preparedGapMode ? C.indigoTint : C.panelAlt, cursor: "pointer" }}>
          <input type="checkbox" checked={e.preparedGapMode} onChange={(ev) => e.setPreparedGapMode(ev.target.checked)} style={{ marginTop: 2 }} />
          <span>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.textStrong, marginBottom: 2 }}>Use known lesson gaps</span>
            <span style={{ display: "block", fontSize: 12.5, color: C.textMuted, lineHeight: 1.45 }}>Paste the identified learning gaps. The system will generate appropriately scoped lessons based on the Granularity Brainlift.</span>
          </span>
        </label>
        {e.preparedGapMode && (
          <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 12, padding: 16, background: C.panel, marginTop: 12 }}>
            <textarea
              rows={7}
              value={e.preparedGapText}
              onChange={(ev) => e.setPreparedGapText(ev.target.value)}
              placeholder="Paste the identified learning gaps here…"
              style={{ ...textarea, fontSize: 13, lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 9 }}>
              <button onClick={() => e.setPreparedGapText("")} style={{ ...outlineBtn, fontSize: 12, padding: "6px 10px" }}>Clear</button>
            </div>
          </div>
        )}
      </div>

      {/* Supporting documents */}
      <div style={{ marginTop: 20, marginBottom: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 3px" }}>Supporting Documents&nbsp;&nbsp;<span style={{ color: C.textFaint, fontWeight: 500 }}>(Optional)</span></p>
        <p style={{ fontSize: 12.5, color: C.textMuted, margin: "0 0 14px", maxWidth: 680, lineHeight: 1.5 }}>Add reference PDFs — pacing guides, state blueprints, prior-year exam analyses, rubrics. Describe what each contains so the engine knows how to weigh it when making scoping decisions for this run.</p>
        {e.supportDocs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {e.supportDocs.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, border: "1px solid #eef2f6", borderRadius: 10, padding: "12px 14px", background: C.panel }}>
                <span>📎</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px", fontFamily: font.mono }}>{d.name}</p>
                  {d.size > 0 && <p style={{ fontSize: 11.5, color: C.textFaint, margin: "0 0 3px" }}>{formatFileSize(d.size)} PDF</p>}
                  <p style={{ fontSize: 12.5, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>{d.desc}</p>
                </div>
                <span onClick={() => e.setSupportDocs((s) => s.filter((_, idx) => idx !== i))} style={{ cursor: "pointer", color: C.borderHover }}>✕</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ border: `1px dashed ${C.borderHover}`, borderRadius: 12, padding: 16, background: C.panel }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <label title={selectedDoc ? selectedDoc.name : "Attach PDF"} style={{ ...attachBtn, background: selectedDoc ? C.green : "#fff", color: selectedDoc ? "#fff" : C.textStrong, flex: "none", maxWidth: 220 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedDoc ? "✓ " + selectedDoc.name : "↑ Attach PDF"}</span>
              <input type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={handleSupportDocChange} />
            </label>
            <textarea rows={2} value={e.docDesc} onChange={(ev) => e.setDocDesc(ev.target.value)} placeholder="Describe what this document contains and how it should inform scoping — e.g., “STAAR blueprint: % of items per reporting category; use to prioritize heavily-tested standards.”" style={{ ...textarea, flex: 1, fontSize: 12.5 }} />
          </div>
          <button onClick={e.addDoc} style={{ ...smallDark, marginTop: 12, cursor: e.docAttached ? "pointer" : "default", opacity: e.docAttached ? 1 : 0.5 }}>+ Add document</button>
        </div>
      </div>

      {e.noCcssLessonsExist && (
        <div style={{ border: `1px solid ${C.indigoBorder}`, background: C.indigoTint, borderRadius: 10, padding: "11px 13px", marginBottom: 18 }}>
          <p style={{ fontSize: 12.5, color: C.textMuted, margin: 0, lineHeight: 1.5 }}><strong style={{ color: C.textStrong }}>No CCSS lesson library mode is on.</strong> This run will compare the uploaded new standard system against {gradeLabel} CCSS only, then generate bridge lessons for new-standard expectations that CCSS does not cover.</p>
        </div>
      )}

      {e.scopeError && !e.running && (
        <div style={{ marginTop: 16, border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 10, padding: "11px 13px", display: "flex", gap: 9, alignItems: "flex-start" }}>
          <span>⚠️</span>
          <p style={{ fontSize: 12.5, color: C.redText, margin: 0, lineHeight: 1.5 }}>{e.scopeError}</p>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
        <button onClick={e.runScope} style={{ ...primaryBtn, cursor: canRun ? "pointer" : "default", opacity: canRun || e.running ? 1 : 0.5 }}>
          {e.running && <Spinner />} {e.running ? "Analyzing…" : e.preparedGapMode ? "▶  Run scope from known gaps" : "▶  Run scope analysis"}
        </button>
        {e.running && <button onClick={e.cancelScope} style={{ ...outlineBtn, color: C.redStrong, borderColor: "#fecaca" }}>■ Stop</button>}
        {e.running && <span style={{ fontSize: 13, color: C.textMuted }}>{e.runStage}</span>}
      </div>
      {e.running && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.textStrong }}>Estimated progress</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.indigo, fontFamily: font.mono }}>{runProgress}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={runProgress}
            style={{ height: 9, borderRadius: 999, background: C.borderSoft, overflow: "hidden", border: `1px solid ${C.border}` }}
          >
            <div style={{ width: `${runProgress}%`, height: "100%", borderRadius: 999, background: C.indigo, transition: "width .45s ease" }} />
          </div>
          <p style={{ fontSize: 12.5, color: C.textMuted, margin: "8px 0 0", lineHeight: 1.45 }}>
            {waitingOnClaude
              ? "Claude is finalizing the standards comparison. Long PDFs can sit here for a few minutes; an error will appear here if the request fails."
              : "Preparing the standards PDF and comparison request."}
          </p>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ e }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 13, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Scope Runs</p>
        <button onClick={e.clearHistory} disabled={!e.runs.length} style={{ ...outlineBtn, fontSize: 12.5, padding: "7px 12px", cursor: e.runs.length ? "pointer" : "default", opacity: e.runs.length ? 1 : 0.45 }}>Clear history</button>
      </div>
      {!e.runs.length && (
        <div style={{ padding: "28px 20px", background: C.panel }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>No scope runs yet</p>
          <p style={{ fontSize: 12.5, color: C.textMuted, margin: 0 }}>New analyses will appear here after you run scope.</p>
        </div>
      )}
      {e.runs.map((r) => (
        <div key={r.id} onClick={() => e.openRun(r.id)} style={{ padding: "14px 20px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", background: r.id === e.activeRunId ? C.panelAlt : "transparent" }}>
          <span>📄</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 2px" }}>{r.title}</p>
            <p style={{ fontSize: 12, color: C.textFaint, margin: 0 }}>{r.date}</p>
          </div>
          <StatusBadge status={r.status} />
        </div>
      ))}
    </div>
  );
}

/* ---------------- Lesson detail ---------------- */
function LessonDetail({ e }) {
  const l = e.library[e.lessonId];
  if (!l) return null;
  const code = shortId(l.subId || l.standardId);
  const diffs = [
    { level: "Easy", dot: C.greenBorder, text: l.diff.easy },
    { level: "Medium", dot: C.amber, text: l.diff.medium },
    { level: "Hard", dot: C.red, text: l.diff.hard },
  ];
  const Meta = ({ label, value }) => (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 11, padding: "13px 15px" }}>
      <p style={metaLbl}>{label}</p><p style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>{value}</p>
    </div>
  );
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 28px 90px" }}>
      <p style={{ fontSize: 12.5, color: C.textFaint, margin: "0 0 14px", fontWeight: 500 }}>{l.course} / {l.domain} / {l.unit}</p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 24 }}>
        <span style={{ ...codeBadge, fontSize: 12, padding: "5px 11px", marginTop: 4, fontFamily: font.mono }}>{code}</span>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 6px", lineHeight: 1.15 }}>{l.lesson}</h1>
          <p style={{ fontSize: 13.5, color: C.textBody, margin: 0, lineHeight: 1.5 }}>{l.standardDesc}</p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
        <Meta label="COURSE" value={l.course} /><Meta label="DOMAIN" value={l.domain} /><Meta label="UNIT" value={l.unit} />
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.ink}`, borderRadius: 10, padding: "15px 17px", marginBottom: 22, background: C.panel }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, letterSpacing: ".05em", margin: "0 0 5px" }}>SUBSTANDARD · {l.subId}</p>
        <p style={{ fontSize: 14, color: "#1e293b", margin: 0, lineHeight: 1.55 }}>{l.subDesc}</p>
      </div>
      <Section title="LEARNING OBJECTIVES">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {l.los.filter(Boolean).map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 11, border: "1px solid #eef2f6", borderRadius: 10, padding: "12px 14px" }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.indigoBg, color: C.indigo, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{i + 1}</span>
              <p style={{ fontSize: 13, color: C.textStrong, margin: 0, lineHeight: 1.55 }}>{t}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="DIFFICULTY MATRIX">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {diffs.map((d) => {
            const na = !d.text || /^na$/i.test(d.text.trim());
            return (
              <div key={d.level} style={{ border: `1px solid ${C.border}`, borderRadius: 11, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 15px", background: C.panelAlt, borderBottom: `1px solid ${C.borderSoft}` }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: d.dot }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.textStrong }}>{d.level}</span>
                </div>
                <div style={{ padding: "13px 15px" }}>
                  {na ? <p style={{ fontSize: 13, color: C.textFaint, margin: 0, fontStyle: "italic" }}>Not applicable for this lesson.</p>
                    : <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>{lines(d.text).map((p, i) => <li key={i} style={{ fontSize: 13, color: C.textBody, lineHeight: 1.5 }}>{p}</li>)}</ul>}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="ASSESSMENT BOUNDARY"><Bullets items={lines(l.ab)} /></Section>
      <Section title="PREREQUISITES"><Bullets items={lines(l.prereq)} /></Section>
    </main>
  );
}

/* ---------------- Scope result ---------------- */
function ScopeResult({ e }) {
  const preparedGapResult = e.scopeResult?._scopeMode === "preparedGaps";
  const skipLibraryCoverage = e.noCcssLessonsExist || e.uniqueFromCcssOnly || preparedGapResult;
  const gradeLabel = e.scopeResult?._gradeLabel || e.gradeLabel;
  const stdsWithMode = e.scopedStandards.map((s) => ({
    ...s,
    newStandardLessons: s.newLessons.filter((l) => l.reasonType === "stateSet"),
    libraryGapLessons: skipLibraryCoverage ? [] : s.newLessons.filter((l) => l.reasonType === "library"),
  }));
  const stds = skipLibraryCoverage ? stdsWithMode.filter((s) => s.newStandardLessons.length > 0) : stdsWithMode;
  const newStandardProposals = stds.flatMap((x) => x.newStandardLessons);
  const libraryGapProposals = stds.flatMap((x) => x.libraryGapLessons);
  const standardsFileName = e.standardSetFile?.name || e.scopeResult?._sourceFileName || (preparedGapResult ? "Known gap list" : "Uploaded new standard system PDF");
  const standardSetName = e.scopeResult?._standardSetName || e.standardSetName?.trim();
  const standardsLabel = standardSetName ? `${standardSetName} · ${standardsFileName}` : standardsFileName;
  const resultContext = preparedGapResult
    ? `${standardsLabel} · scope built from known gap list for ${gradeLabel}`
    : skipLibraryCoverage
    ? `${standardsLabel} · new standard system compared against ${gradeLabel} CCSS only`
    : `${standardsLabel} · new standard system compared against ${gradeLabel} CCSS, with optional lesson-library audit`;
  const stats = [
    { value: stds.length, label: "Alignment areas", color: C.ink },
    { value: newStandardProposals.length, label: "New-standard lessons", color: "#2563eb" },
    { value: newStandardProposals.length, label: "Not covered by CCSS", color: C.indigo },
    preparedGapResult
      ? { value: "Known", label: "Gap source", color: C.indigo }
      : skipLibraryCoverage
      ? { value: "Skipped", label: "Library coverage", color: C.textMuted }
      : { value: libraryGapProposals.length, label: "CCSS library gaps", color: C.amberText },
  ];

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const driveFolderId = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || DEFAULT_SCOPING_DRIVE_FOLDER_ID;
  const [exporting, setExporting] = React.useState(false);
  // Doc/report name is always "<Standard Set> <Ordinal Grade>" — e.g. "TEKS 5th Grade".
  const docTitle = [formatStandardSetTitle(standardSetName), gradeTitle(e.ws?.grade)].filter(Boolean).join(" ").trim() || "Standards Gap Analysis";
  const exportLabel = "Create Scoping Document";

  // Merge the user's per-field edits into each lesson so the export uses the edited text.
  const mergeEdits = (l, k) => {
    const ed = e.lessonEdits[k] || {};
    const pick = (field, original) => (ed[field] !== undefined && ed[field] !== null ? ed[field] : original);
    const merged = {
      ...l,
      name: pick("name", l.name),
      alphaCore: pick("alphaCore", l.alphaCore || "No"),
      objective: pick("objective", l.objective),
      purpose: pick("purpose", l.purpose),
      prereqs: pick("prereqs", l.prereqs),
      assessed: pick("assessed", l.assessed),
      keyConcepts: pick("keyConcepts", l.keyConcepts),
      reason: pick("reason", l.reason),
      suggestedSubId: pick("alignedId", l.suggestedSubId),
      code: pick("alignedId", l.code),
      difficulties: (l.difficulties || []).map((d, i) => ({
        ...d,
        format: pick(`difficulty.${i}.format`, d.format),
        example: pick(`difficulty.${i}.example`, d.example),
        rigor: pick(`difficulty.${i}.rigor`, d.rigor),
      })),
    };
    if (ed.dependencies !== undefined && ed.dependencies !== null) merged.dependencies = ed.dependencies;
    return merged;
  };
  const editedNewStandard = [];
  const editedLibraryGap = [];
  stds.forEach((s, si) => {
    s.newStandardLessons.forEach((l, li) => editedNewStandard.push(mergeEdits(l, `${si}-${li}`)));
    s.libraryGapLessons.forEach((l, li) => editedLibraryGap.push(mergeEdits(l, `${si}-lib-${li}`)));
  });

  const handleExport = async () => {
    if (exporting) return;
    const lessons = [...editedNewStandard, ...editedLibraryGap];
    if (!lessons.length) {
      e.flash("There are no proposed lessons to export");
      return;
    }
    if (!clientId) {
      e.flash("Add VITE_GOOGLE_CLIENT_ID in .env and restart the app to create Google Drive documents.");
      return;
    }
    setExporting(true);
    try {
      window.localStorage.setItem(PENDING_GOOGLE_EXPORT_KEY, JSON.stringify({
        title: docTitle,
        lessons,
        notCovered: editedNewStandard,
        folderId: driveFolderId,
        createdAt: Date.now(),
      }));
      e.flash("Opening Google sign-in…");
      beginGoogleRedirectAuth({ clientId, state: "scope-export" });
    } catch (err) {
      const message = err && err.message ? err.message : "Could not create the Google Doc";
      e.flash(message);
      setExporting(false);
    }
  };

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 28px 90px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 6px" }}>Standards Gap Analysis</h1>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{resultContext} <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: C.greenBg, color: C.greenText }}>complete</span></p>
        </div>
        <div style={{ display: "flex", gap: 9, flex: "none" }}>
          <button onClick={() => e.setScopeFbOpen((v) => !v)} style={outlineBtn}>↻ Re-run with feedback</button>
          <button onClick={handleExport} style={{ ...primaryBtn, opacity: exporting ? 0.7 : 1, cursor: exporting ? "default" : "pointer" }}>{exporting && <Spinner />} {exporting ? "Exporting…" : exportLabel}</button>
        </div>
      </div>

      {e.scopeFbOpen && (
        <div style={{ border: `1px solid ${C.indigoBorder}`, background: C.indigoTint, borderRadius: 13, padding: 18, marginBottom: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Re-run the whole scope with feedback</p>
          <p style={{ fontSize: 12.5, color: C.textMuted, margin: "0 0 12px", lineHeight: 1.5 }}>Tell the engine what to change — granularity, coverage calls, lesson count, rigor. It re-analyzes every standard with your guidance applied.</p>
          <textarea rows={3} value={e.scopeFb} onChange={(ev) => e.setScopeFb(ev.target.value)} placeholder="e.g., Split the interpretation lesson into two; keep new lessons to a max of 2 per standard." style={{ ...textarea, borderColor: C.indigoBorder, background: "#fff" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={e.rerunScope} style={primaryBtn}>↻ Re-run scope</button>
            <button onClick={() => e.setScopeFbOpen(false)} style={outlineBtn}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ border: `1px solid ${C.border}`, borderRadius: 11, padding: "14px 16px" }}>
            <p style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 2px", color: s.color }}>{s.value}</p>
            <p style={{ fontSize: 12, color: C.textMuted, margin: 0, fontWeight: 500 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {skipLibraryCoverage && (
        <div style={{ border: `1px solid ${C.indigoBorder}`, background: C.indigoTint, borderRadius: 13, padding: 16, marginBottom: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>{preparedGapResult ? "Identified learning gaps applied" : "Lesson-library coverage skipped"}</p>
          <p style={{ fontSize: 12.5, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
            {preparedGapResult
              ? "This run used the learning gaps you pasted as the source of truth. Each proposed lesson is scoped from those gaps using the Lesson Scope and Granularity Brainlift."
              : e.uniqueFromCcssOnly
              ? `This run assumes ${gradeLabel} CCSS coverage is already complete and only proposes uploaded-standard lessons that extend CCSS or are not covered by CCSS.`
              : `Because this workspace says no CCSS lessons exist yet, this run only checks the uploaded new standard system against ${gradeLabel} CCSS. Each proposed lesson is aligned to the new standard system and covers an expectation that appears there but is not covered in CCSS.`}
          </p>
        </div>
      )}

      {stds.map((s, si) => (
        <div key={si} style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, letterSpacing: ".05em" }}>ALIGNMENT AREA</span>
          <p style={{ fontSize: 15, lineHeight: 1.55, margin: "6px 0 22px", color: "#1e293b" }}>{s.standard}</p>

          <Label>STANDARD BREAKDOWN</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {s.breakdownFields.map((bf, i) => (
              <div key={i} style={{ background: C.panel, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted, margin: "0 0 7px" }}>{bf.label}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {bf.items.map((it, j) => <span key={j} style={{ fontSize: 12, background: "#fff", border: `1px solid ${C.border}`, color: C.textStrong, padding: "3px 9px", borderRadius: 7 }}>{it}</span>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: C.textBody, margin: 0, lineHeight: 1.5 }}><strong style={{ color: C.ink }}>Cognitive complexity:</strong> {s.cognitive}</p>
            <p style={{ fontSize: 13, color: C.textBody, margin: 0, lineHeight: 1.5 }}><strong style={{ color: C.ink }}>Mastery expectations:</strong> {s.mastery}</p>
          </div>

          {!skipLibraryCoverage && (
            <>
              <Label>{`FULLY COVERED (${s.fully.length})`}</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {s.fully.map((f, i) => (
                  <div key={i} style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.greenBorder}`, borderRadius: 9, padding: "12px 14px" }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 3px" }}>{f.name}</p>
                    <p style={{ fontSize: 12.5, color: C.textBody, margin: 0, lineHeight: 1.5 }}>{f.explanation}</p>
                  </div>
                ))}
              </div>

              <Label>{`PARTIALLY COVERED (${s.partial.length})`}</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {s.partial.map((p, i) => (
                  <div key={i} style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.amber}`, borderRadius: 9, padding: "12px 14px" }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 5px" }}>{p.name}</p>
                    <p style={{ fontSize: 12.5, color: C.textBody, margin: "0 0 3px", lineHeight: 1.5 }}><span style={{ color: C.green, fontWeight: 600 }}>Covered:</span> {p.covered}</p>
                    <p style={{ fontSize: 12.5, color: C.textBody, margin: "0 0 3px", lineHeight: 1.5 }}><span style={{ color: C.amberText, fontWeight: 600 }}>Missing:</span> {p.missing}</p>
                    <p style={{ fontSize: 12.5, color: C.textBody, margin: 0, lineHeight: 1.5 }}><strong style={{ color: C.ink }}>Recommended:</strong> {p.action}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {s.newStandardLessons.length > 0 && (
            <>
              <Label>{`NEW-STANDARD-ALIGNED LESSON PROPOSALS (${s.newStandardLessons.length})`}</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {s.newStandardLessons.map((l, li) => <NewLessonCard key={li} e={e} l={l} k={`${si}-${li}`} />)}
              </div>
            </>
          )}
          {!skipLibraryCoverage && s.libraryGapLessons.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <Label>{`CCSS LESSON-LIBRARY GAPS (${s.libraryGapLessons.length})`}</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {s.libraryGapLessons.map((l, li) => <NewLessonCard key={`lib-${li}`} e={e} l={l} k={`${si}-lib-${li}`} />)}
              </div>
            </div>
          )}
        </div>
      ))}
    </main>
  );
}

function NewLessonCard({ e, l, k }) {
  const open = !!e.openLessons[k];
  const fbOpen = e.lessonFbOpen === k;
  const regenerating = e.regenKey === k;
  const wasRegen = !!e.regenerated[k];
  const reason = gapReasonFor(l.reasonType);
  const gradeLabel = e.gradeLabel;
  const edits = e.lessonEdits[k] || {};
  const readField = (field, fallback) => edits[field] ?? fallback ?? "";
  const writeField = (field, value) => e.updateLessonEdit(k, field, value);
  const dependencies = `Before:  ${(l.before || []).join(", ")}\nAfter:  ${(l.after || []).join(", ")}`;
  const keyConceptsText = Array.isArray(l.keyConcepts) ? l.keyConcepts.join("\n") : (l.keyConcepts || "");
  const title = readField("name", l.name);
  const alignedId = readField("alignedId", l.suggestedSubId);
  const rows = [
    ["Why proposed", "reason", `${reason.label}\n${l.reason || ""}`],
    ...((e.noCcssLessonsExist || e.uniqueFromCcssOnly) && l.reasonType === "stateSet"
      ? [["Instructional goal", "instructionalGoal", `Give students who only followed ${gradeLabel} CCSS exposure, practice, and mastery for this new-standard-system expectation.`]]
      : []),
    ["Lesson Title", "name", l.name],
    ["Alpha Core", "alphaCore", l.alphaCore || "No"],
    ["Student Objective", "objective", l.objective],
    ["Purpose", "purpose", l.purpose],
    ["Suggested ID", "alignedId", l.suggestedSubId],
    ["Prerequisites", "prereqs", l.prereqs],
    ["Assessment Boundary", "assessed", l.assessed],
    ["Key Concepts", "keyConcepts", keyConceptsText],
    ["Dependencies", "dependencies", dependencies],
  ];
  const diffDot = (lvl) => (lvl === "Easy" ? C.greenBorder : lvl === "Medium" ? C.amber : C.red);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 11, overflow: "hidden" }}>
      <div onClick={() => e.setOpenLessons((p) => ({ ...p, [k]: !p[k] }))} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", background: open ? C.panelAlt : "#fff" }}>
        <span style={{ ...codeBadge, fontFamily: font.mono, letterSpacing: "-.01em" }}>{alignedId}</span>
        <p style={{ flex: 1, fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</p>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: reason.fg, background: reason.bg, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>{reason.shortLabel}</span>
        {wasRegen && <span style={{ fontSize: 10.5, fontWeight: 600, color: C.indigo, background: C.indigoBg, padding: "3px 9px", borderRadius: 20 }}>↻ regenerated</span>}
        <span style={{ fontSize: 13, color: C.textFaint, transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </div>
      {open && (
        <div style={{ padding: "4px 16px 18px", borderTop: `1px solid ${C.borderSoft}` }}>
          <p style={{ fontSize: 11.5, color: C.textFaint, margin: "12px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
            <span>✎</span> Every field below is editable — changes save automatically and are used in the export.
          </p>
          <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
            {rows.map(([label, field, value]) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "172px 1fr", borderTop: `1px solid ${C.borderSoft}` }}>
                <div style={kvKey}>{label}</div>
                <div style={{ padding: "9px 12px" }}>
                  <EditableLessonField value={readField(field, value)} onChange={(next) => writeField(field, next)} rows={label === "Lesson Title" || label === "Suggested ID" ? 1 : 3} />
                </div>
              </div>
            ))}
            {(l.difficulties || []).map((d, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "172px 1fr", borderTop: `1px solid ${C.borderSoft}` }}>
                <div style={{ ...kvKey, display: "flex", alignItems: "flex-start", gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: diffDot(d.level), marginTop: 5, flex: "none" }} />Difficulty — {d.level}</div>
                <div style={{ padding: "11px 14px" }}>
                  <EditableLessonField value={readField(`difficulty.${i}.format`, d.format)} onChange={(next) => writeField(`difficulty.${i}.format`, next)} rows={2} />
                  <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 8, padding: "10px 12px" }}>
                    <p style={{ fontSize: 10.5, fontWeight: 600, color: C.textFaint, letterSpacing: ".05em", margin: "0 0 4px" }}>EXAMPLE STIMULUS</p>
                    <EditableLessonField value={readField(`difficulty.${i}.example`, d.example)} onChange={(next) => writeField(`difficulty.${i}.example`, next)} rows={2} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontSize: 10.5, fontWeight: 600, color: C.textFaint, letterSpacing: ".05em", margin: "0 0 4px" }}>RIGOR</p>
                    <EditableLessonField value={readField(`difficulty.${i}.rigor`, d.rigor)} onChange={(next) => writeField(`difficulty.${i}.rigor`, next)} rows={2} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            {fbOpen ? (
              <div style={{ border: `1px solid ${C.indigoBorder}`, background: C.indigoTint, borderRadius: 10, padding: 14 }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, margin: "0 0 8px" }}>Regenerate just this lesson with feedback</p>
                <textarea rows={2} value={e.lessonFb} onChange={(ev) => e.setLessonFb(ev.target.value)} placeholder="e.g., Make the Hard tier require a two-step computation." style={{ ...textarea, fontSize: 12.5, borderColor: C.indigoBorder, background: "#fff" }} />
                <div style={{ display: "flex", gap: 9, marginTop: 10 }}>
                  <button onClick={() => e.rerunLesson(k)} style={smallDark}>↻ Regenerate</button>
                  <button onClick={() => e.setLessonFbOpen(null)} style={{ ...outlineBtn, fontSize: 12.5, padding: "8px 14px" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { if (!regenerating) { e.setLessonFbOpen(k); e.setLessonFb(""); } }} style={{ ...outlineBtn, fontSize: 12.5, padding: "8px 14px", opacity: regenerating ? 0.6 : 1 }}>
                {regenerating && <Spinner dark />} ↻ {regenerating ? "Regenerating…" : "Regenerate with feedback"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EditableLessonField({ value, onChange, rows = 2 }) {
  const [focused, setFocused] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  return (
    <textarea
      rows={rows}
      value={value}
      title="Editable — click to change"
      onClick={(ev) => ev.stopPropagation()}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onChange={(ev) => onChange(ev.target.value)}
      style={{
        ...editableText,
        borderColor: focused ? C.indigo : hovered ? C.borderHover : C.border,
        background: focused ? "#fff" : C.panel,
        boxShadow: focused ? `0 0 0 3px ${C.indigoTint}` : "none",
      }}
    />
  );
}

/* ---------------- Dialogs + shared bits ---------------- */
function CreateDialog({ e }) {
  if (!e.dialog) return null;
  return (
    <Overlay onClose={() => e.setDialog(false)}>
      <p style={{ fontSize: 18, fontWeight: 700, margin: "0 0 18px" }}>New workspace</p>
      <Field label="Name" value={e.form.name} onChange={(v) => e.setForm({ ...e.form, name: v })} placeholder="Grade 5 Math" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "0 0 22px" }}>
        <Field label="Grade level" value={e.form.grade} onChange={(v) => e.setForm({ ...e.form, grade: v })} placeholder="5" />
        <Field label="Subject" value={e.form.subject} onChange={(v) => e.setForm({ ...e.form, subject: v })} placeholder="Math" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={() => e.setDialog(false)} style={outlineBtn}>Cancel</button>
        <button onClick={e.createWorkspace} style={{ ...primaryBtn, opacity: e.form.name.trim() ? 1 : 0.5 }}>Create</button>
      </div>
    </Overlay>
  );
}

function DeleteDialog({ e }) {
  if (!e.deleteWsId) return null;
  const name = (e.workspaces.find((w) => w.id === e.deleteWsId) || {}).name || "";
  return (
    <Overlay onClose={() => e.setDeleteWsId(null)} maxWidth={400}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 14 }}>🗑</div>
      <p style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Delete workspace?</p>
      <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 22px", lineHeight: 1.5 }}>“{name}” and its lesson library, granularity rules, and scope history will be permanently removed. This can’t be undone.</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={() => e.setDeleteWsId(null)} style={outlineBtn}>Cancel</button>
        <button onClick={() => e.deleteWorkspace(e.deleteWsId)} style={{ ...primaryBtn, background: C.redStrong }}>Delete workspace</button>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose, maxWidth = 420 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,41,.4)", backdropFilter: "blur(2px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(ev) => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth, padding: 24, boxShadow: shadow.modal }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={lbl}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={input} />
    </div>
  );
}

const Section = ({ title, children }) => (<><Label>{title}</Label><div style={{ marginBottom: 24 }}>{children}</div></>);
const Label = ({ children }) => <p style={{ fontSize: 11.5, fontWeight: 700, color: C.textFaint, letterSpacing: ".06em", margin: "0 0 11px" }}>{children}</p>;
const Bullets = ({ items }) => (
  <div style={{ border: `1px solid ${C.border}`, borderRadius: 11, padding: "15px 17px" }}>
    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>{items.map((x, i) => <li key={i} style={{ fontSize: 13, color: C.textBody, lineHeight: 1.5 }}>{x}</li>)}</ul>
  </div>
);
const StatusBadge = ({ status }) => {
  const map = { complete: [C.greenBg, C.greenText], failed: [C.redBg, C.redText] };
  const [bg, fg] = map[status] || [C.borderSoft, C.textMuted];
  return <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: bg, color: fg }}>{status}</span>;
};
const Chip = ({ children, tone }) => {
  const tones = { amber: ["#fef3c7", C.amberText], muted: [C.borderSoft, C.textMuted] };
  const [bg, fg] = tones[tone] || [C.indigoBg, C.indigo];
  return <span style={{ fontSize: 11.5, fontWeight: 600, color: fg, background: bg, padding: "4px 10px", borderRadius: 20 }}>{children}</span>;
};
const Spinner = ({ dark }) => <span style={{ width: 13, height: 13, border: `2px solid ${dark ? "rgba(15,23,41,.25)" : "rgba(255,255,255,.4)"}`, borderTopColor: dark ? C.ink : "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />;
const Toast = ({ text }) => text ? <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.ink, color: "#fff", fontSize: 13.5, fontWeight: 500, padding: "11px 20px", borderRadius: 10, boxShadow: shadow.toast, zIndex: 80, display: "flex", gap: 9 }}><span style={{ color: "#4ade80" }}>✓</span>{text}</div> : null;

/* ---------------- inline style atoms ---------------- */
const primaryBtn = { display: "inline-flex", alignItems: "center", gap: 7, background: C.ink, color: "#fff", border: "none", font: "inherit", fontSize: 13.5, fontWeight: 600, padding: "10px 18px", borderRadius: radius.md, cursor: "pointer" };
const outlineBtn = { background: "#fff", color: C.textStrong, border: `1px solid ${C.border}`, font: "inherit", fontSize: 13, fontWeight: 600, padding: "9px 14px", borderRadius: radius.md, cursor: "pointer" };
const smallDark = { display: "inline-flex", alignItems: "center", gap: 7, background: C.ink, color: "#fff", border: "none", font: "inherit", fontSize: 12.5, fontWeight: 600, padding: "8px 15px", borderRadius: 8, cursor: "pointer" };
const attachBtn = { display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${C.border}`, font: "inherit", fontSize: 13, fontWeight: 600, padding: "9px 14px", borderRadius: radius.md, cursor: "pointer", whiteSpace: "nowrap" };
const ghostBtn = { display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: C.textBody, font: "inherit", fontSize: 13, fontWeight: 500, padding: "7px 10px", borderRadius: 7, cursor: "pointer" };
const trashBtn = { border: "none", background: "transparent", color: C.borderHover, fontSize: 15, cursor: "pointer", padding: 4, borderRadius: 7, lineHeight: 1 };
const pill = { fontSize: 11, fontWeight: 600, color: C.textMuted, background: C.borderSoft, padding: "4px 9px", borderRadius: 20 };
const cardHover = { border: `1px solid ${C.border}`, borderRadius: radius.xl, padding: "18px 18px 16px", cursor: "pointer", background: "#fff" };
const panel = { border: `1px solid ${C.border}`, borderRadius: radius.xl, padding: 20 };
const codeChip = { fontFamily: font.mono, fontSize: 12, background: C.borderSoft, padding: "1px 5px", borderRadius: 4 };
const codeBadge = { fontSize: 10.5, fontWeight: 700, color: "#fff", background: C.ink, padding: "4px 9px", borderRadius: 6, flex: "none" };
const lbl = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 };
const metaLbl = { fontSize: 11, fontWeight: 600, color: C.textFaint, letterSpacing: ".04em", margin: "0 0 4px" };
const kvKey = { background: C.panelAlt, padding: "11px 14px", fontSize: 12.5, fontWeight: 600, color: C.textStrong, borderRight: `1px solid ${C.borderSoft}` };
const input = { width: "100%", font: "inherit", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: radius.md, padding: "9px 12px", outline: "none", color: C.ink, boxSizing: "border-box" };
const textarea = { width: "100%", font: "inherit", fontSize: 13.5, lineHeight: 1.6, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, resize: "vertical", outline: "none", color: C.textStrong, boxSizing: "border-box" };
const editableText = { width: "100%", font: "inherit", fontSize: 13, lineHeight: 1.55, border: `1px solid transparent`, borderRadius: 8, padding: "6px 8px", resize: "vertical", outline: "none", color: C.textBody, boxSizing: "border-box", background: "transparent" };
