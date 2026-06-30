/**
 * Export a scope result to a Google Doc in the user's Drive.
 *
 * The export creates a Google Doc with one "Proposed Scope" tab and one tab per
 * proposed lesson. Lesson tabs are populated with a two-column table that mirrors
 * the structure of the user's example scoping document.
 *
 * Requires a Google OAuth client id - see docs/google-docs-export.md.
 */

import { apiUrl } from "./apiBase.js";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const OAUTH_SRC = "https://accounts.google.com/o/oauth2/v2/auth";
// Drive creates the converted Google Doc in the configured folder. Docs scope
// remains requested so existing users do not have to reconfigure OAuth scopes.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DOCS_SCOPE = "https://www.googleapis.com/auth/documents";
const SCOPE = `${DOCS_SCOPE} ${DRIVE_SCOPE}`;
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const MAX_TAB_TITLE_LENGTH = 80;

let gisPromise = null;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google sign-in. Check your connection and ad blockers."));
    document.head.appendChild(s);
  });
  return gisPromise;
}

function googleErrorMessage(err) {
  const msg = String(err?.message || err || "");
  if (/origin|idpiframe|not a valid origin|redirect_uri_mismatch/i.test(msg)) {
    return "Google blocked sign-in for this local address. Add http://127.0.0.1:5173 as an Authorized JavaScript origin and http://127.0.0.1:5173/ as an Authorized redirect URI in Google Cloud.";
  }
  return msg || "Could not create the Google Doc";
}

async function requestAccessToken(clientId) {
  await loadGis();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn) => (arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };
    const ok = finish(resolve);
    const fail = finish(reject);
    const timer = setTimeout(() => fail(new Error("Google sign-in timed out - allow the popup, or use the downloaded report.")), 120000);
    let client;
    try {
      client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp && resp.access_token) ok(resp.access_token);
          else fail(new Error(resp?.error_description || resp?.error || "Google sign-in failed"));
        },
        error_callback: (err) => fail(new Error(err?.message || "Google sign-in was cancelled")),
      });
    } catch (err) {
      fail(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    try {
      client.requestAccessToken();
    } catch (err) {
      fail(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

async function driveApi(token, path, { method = "GET", params = {}, body } = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });

  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 404) throw new Error("The configured Drive folder wasn't found or you can't access it.");
    if (res.status === 401 || res.status === 403) {
      throw new Error("Google denied Drive access. Enable the Drive API, grant permission, and confirm you can add files to the folder.");
    }
    throw new Error(`Google Drive API error ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

async function docsApi(token, path, body, { method = "POST", params = {} } = {}) {
  const url = new URL(`https://docs.googleapis.com/v1/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });

  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error("Google denied access. Make sure the Docs API is enabled and you granted permission.");
    }
    throw new Error(`Google Docs API error ${res.status}: ${detail.slice(0, 220)}`);
  }
  return res.json();
}

async function getDoc(token, documentId, { includeTabsContent = false } = {}) {
  const url = new URL(`https://docs.googleapis.com/v1/documents/${documentId}`);
  if (includeTabsContent) url.searchParams.set("includeTabsContent", "true");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not read the new document (${res.status})`);
  return res.json();
}

export function getGoogleRedirectToken() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  if (!hash.includes("access_token=") && !hash.includes("error=")) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const error = params.get("error");
  if (error) {
    return { error, errorDescription: params.get("error_description") || error };
  }
  const accessToken = params.get("access_token");
  return accessToken ? { accessToken, state: params.get("state") || "" } : null;
}

export function clearGoogleRedirectHash() {
  if (typeof window === "undefined") return;
  if (!window.location.hash) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

export function beginGoogleRedirectAuth({ clientId, state = "scope-export" }) {
  if (!clientId) throw new Error("No Google client id configured. See docs/google-docs-export.md.");
  const redirectUri = `${window.location.origin}/`;
  const url = new URL(OAUTH_SRC);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  window.location.assign(url.toString());
}

const TABLE_HEADERS = ["Lesson Title", "ID", "Description", "Reasoning for Gap Lesson"];

function driveQueryString(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function exactVersionRegex(baseTitle) {
  return new RegExp(`^${baseTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: V(\\d+))?$`, "i");
}

async function nextAvailableDriveTitle(token, folderId, baseTitle) {
  const q = [
    `'${driveQueryString(folderId)}' in parents`,
    "trashed = false",
    `mimeType = '${GOOGLE_DOC_MIME}'`,
    `name contains '${driveQueryString(baseTitle)}'`,
  ].join(" and ");

  const result = await driveApi(token, "files", {
    params: {
      q,
      fields: "files(id,name)",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    },
  });
  const re = exactVersionRegex(baseTitle);
  const usedVersions = new Set();
  (result.files || []).forEach((file) => {
    const match = String(file.name || "").match(re);
    if (!match) return;
    usedVersions.add(match[1] ? Number(match[1]) : 1);
  });

  if (!usedVersions.has(1)) return baseTitle;
  let version = 2;
  while (usedVersions.has(version)) version += 1;
  return `${baseTitle} V${version}`;
}

async function moveDocToFolder(token, documentId, folderId) {
  if (!folderId) return null;
  const file = await driveApi(token, `files/${documentId}`, {
    params: { fields: "parents", supportsAllDrives: "true" },
  });
  const previousParents = (file.parents || []).join(",");
  return driveApi(token, `files/${documentId}`, {
    method: "PATCH",
    params: {
      addParents: folderId,
      removeParents: previousParents,
      fields: "id,name,parents,webViewLink",
      supportsAllDrives: "true",
    },
    body: {},
  });
}

function flattenTabs(tabs = []) {
  return tabs.flatMap((tab) => [tab, ...flattenTabs(tab.childTabs || [])]);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function tabTitle(value, fallback = "Lesson") {
  const title = safeText(value, fallback).replace(/\s+/g, " ");
  if (title.length <= MAX_TAB_TITLE_LENGTH) return title;
  return `${title.slice(0, MAX_TAB_TITLE_LENGTH - 3).trim()}...`;
}

function filenameFor(title) {
  const safe = safeText(title, "scope-export")
    .replace(/[^a-z0-9\s._-]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 90);
  return `${safe || "scope-export"}.doc`;
}

function textLines(value) {
  if (Array.isArray(value)) return value.map((x) => String(x ?? "").trim()).filter(Boolean);
  return String(value ?? "")
    .split(/\r?\n|;/)
    .map((x) => x.replace(/^[\s\-*]+/, "").trim())
    .filter(Boolean);
}

function plainList(items) {
  const lines = (items || []).map((item) => String(item ?? "").trim()).filter(Boolean);
  return lines.length ? lines.map((item) => `- ${item}`).join("\n") : "-";
}

function plainBlock(value, fallback = "-") {
  const lines = textLines(value);
  return lines.length ? lines.join("\n") : fallback;
}

function htmlParagraphs(value) {
  const items = textLines(value);
  if (!items.length) return "<p>-</p>";
  return items.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
}

function htmlList(items) {
  const safeItems = (items || []).map((item) => String(item ?? "").trim()).filter(Boolean);
  if (!safeItems.length) return "<p>-</p>";
  return `<ul>${safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function lessonDependencies(l) {
  if (l.dependencies != null && l.dependencies !== "") return l.dependencies;
  return `Before: ${(l.before || []).join(", ") || "-"} | After: ${(l.after || []).join(", ") || "-"}`;
}

function lessonStandard(l) {
  return safeText(l.suggestedSubId || l.code);
}

function lessonReason(l) {
  const category = l.reasonType === "library"
    ? "Expected in CCSS, but no matching lesson currently exists in the lesson library."
    : "Covered in the uploaded standard set but not CCSS.";
  return [category, l.reason].filter(Boolean).join("\n");
}

function lessonKeyConcepts(l) {
  const explicit = l.keyConcepts || l.keyConceptsText;
  const items = textLines(explicit);
  if (items.length) return items;
  const purposeItems = textLines(l.purpose);
  if (purposeItems.length) return purposeItems;
  const objective = safeText(l.objective, "");
  return objective ? [objective] : [];
}

function difficultyHtml(d) {
  const parts = [];
  if (d.format) parts.push(htmlParagraphs(d.format));
  if (d.example) parts.push(`<p><strong>Examples:</strong></p>${htmlParagraphs(d.example)}`);
  if (d.rigor) parts.push(`<p><strong>Rigor:</strong> ${escapeHtml(d.rigor)}</p>`);
  return parts.length ? parts.join("") : "<p>-</p>";
}

function difficultyText(d) {
  return [
    d.format ? plainBlock(d.format) : "",
    d.example ? `Examples:\n${plainBlock(d.example)}` : "",
    d.rigor ? `Rigor:\n${plainBlock(d.rigor)}` : "",
  ].filter(Boolean).join("\n\n") || "-";
}

function lessonRows(l) {
  return [
    ["Lesson Name", safeText(l.name, "Untitled Lesson")],
    ["Alpha Core", safeText(l.alphaCore, "No")],
    ["Lesson Objective", plainBlock(l.objective)],
    ["Standard", lessonStandard(l)],
    ["Why Proposed", lessonReason(l)],
    ["Prerequisites", plainBlock(l.prereqs)],
    ["Assessment Boundary", plainBlock(l.assessed)],
    ["Key Concepts", plainList(lessonKeyConcepts(l))],
    ["Dependencies", plainBlock(lessonDependencies(l))],
    ...(l.difficulties || []).map((d) => [`Difficulty Levels - ${safeText(d.level, "Level")}`, difficultyText(d)]),
  ];
}

function proposedScopeText({ title, lessons, notCovered = [] }) {
  const lessonList = lessons.map((lesson, index) => `${index + 1}. ${safeText(lesson.name, "Untitled Lesson")} (${lessonStandard(lesson)})`).join("\n");
  const gaps = notCovered.map((lesson, index) => [
    `${index + 1}. ${safeText(lesson.name, "Untitled Lesson")}`,
    `Standard: ${lessonStandard(lesson)}`,
    `Reason: ${lessonReason(lesson)}`,
  ].join("\n")).join("\n\n");

  return [
    title,
    "",
    "Proposed Scope",
    lessonList || "-",
    "",
    "Standards Not Covered in CCSS",
    gaps || "-",
  ].join("\n");
}

function tableCellInsertsForTab(tab, rows) {
  const tabId = tab?.tabProperties?.tabId;
  const tableEl = (tab?.documentTab?.body?.content || []).find((content) => content.table);
  if (!tabId || !tableEl) return [];

  const inserts = [];
  (tableEl.table.tableRows || []).forEach((rowData, rowIndex) => {
    (rowData.tableCells || []).forEach((cell, colIndex) => {
      const firstPara = cell.content?.[0];
      const index = firstPara?.startIndex;
      const value = rows[rowIndex]?.[colIndex];
      if (index == null || !value) return;
      inserts.push({ tabId, index, text: value });
    });
  });
  return inserts;
}

function tableLabelStyleRequestsForTab(tab) {
  const tabId = tab?.tabProperties?.tabId;
  const tableEl = (tab?.documentTab?.body?.content || []).find((content) => content.table);
  if (!tabId || !tableEl) return [];

  return (tableEl.table.tableRows || []).flatMap((rowData) => {
    const labelCell = rowData.tableCells?.[0];
    const elements = labelCell?.content?.flatMap((content) => content.paragraph?.elements || []) || [];
    return elements
      .filter((element) => element.textRun?.content?.trim())
      .map((element) => ({
        updateTextStyle: {
          range: {
            tabId,
            startIndex: element.startIndex,
            endIndex: element.endIndex,
          },
          textStyle: { bold: true },
          fields: "bold",
        },
      }));
  });
}

function row(label, valueHtml) {
  return `
    <tr>
      <td class="label">${escapeHtml(label)}</td>
      <td class="value">${valueHtml}</td>
    </tr>
  `;
}

function lessonTable(l) {
  const difficulties = (l.difficulties || []).map((d) => row(`Difficulty Levels - ${safeText(d.level, "Level")}`, difficultyHtml(d))).join("");
  return `
    <h1>${escapeHtml(safeText(l.name, "Untitled Lesson"))}</h1>
    <table class="lesson-table">
      <tbody>
        ${row("Lesson Name", htmlParagraphs(l.name))}
        ${row("Alpha Core", htmlParagraphs(l.alphaCore || "No"))}
        ${row("Lesson Objective", htmlParagraphs(l.objective))}
        ${row("Standard", htmlParagraphs(lessonStandard(l)))}
        ${row("Why Proposed", htmlParagraphs(lessonReason(l)))}
        ${row("Prerequisites", htmlParagraphs(l.prereqs))}
        ${row("Assessment Boundary", htmlParagraphs(l.assessed))}
        ${row("Key Concepts", htmlList(lessonKeyConcepts(l)))}
        ${row("Dependencies", htmlParagraphs(lessonDependencies(l)))}
        ${difficulties}
      </tbody>
    </table>
  `;
}

function buildWordHtml({ title, lessons, notCovered = [] }) {
  const rows = notCovered.map((l) => `
    <tr>
      <td>${escapeHtml(safeText(l.name))}</td>
      <td>${escapeHtml(lessonStandard(l))}</td>
      <td>${escapeHtml(safeText(l.objective))}</td>
      <td>${escapeHtml(safeText(lessonReason(l)))}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 0.55in; }
    body { font-family: Arial, sans-serif; color: #111111; font-size: 11pt; line-height: 1.3; }
    h1 { font-size: 16pt; margin: 18pt 0 8pt; page-break-after: avoid; }
    h1.title { font-size: 20pt; margin-top: 0; }
    h2 { font-size: 13pt; margin: 14pt 0 6pt; page-break-after: avoid; }
    p { margin: 0 0 6pt; }
    ol { margin-top: 0; margin-bottom: 14pt; }
    ul { margin-top: 0; margin-bottom: 0; padding-left: 18pt; }
    li { margin: 0 0 3pt; }
    table { border-collapse: collapse; width: 100%; margin: 8pt 0 16pt; }
    th, td { border: 1px solid #111111; padding: 6pt 7pt; vertical-align: top; }
    th { background: #f1f5f9; font-weight: bold; text-align: left; }
    .lesson-table { page-break-inside: avoid; }
    .lesson-table .label { width: 24%; font-weight: bold; }
    .lesson-table .value { width: 76%; }
    .summary { color: #334155; margin-bottom: 12pt; }
  </style>
</head>
<body>
  <h1 class="title">${escapeHtml(title)}</h1>
  <h1>Proposed Scope</h1>
  <p class="summary">New-standard-aligned lessons proposed to cover expectations from the uploaded standard set that are not covered by CCSS.</p>
  <ol>
    ${lessons.map((l) => `<li>${escapeHtml(safeText(l.name, "Untitled Lesson"))}</li>`).join("")}
  </ol>
  ${notCovered.length ? `
    <h1>Standards Not Covered in CCSS</h1>
    <table>
      <thead><tr>${TABLE_HEADERS.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  ` : ""}
  ${lessons.map((l) => lessonTable(l)).join("")}
</body>
</html>`;
}

export function downloadScopeAsWordDoc({ title, lessons, notCovered = [] }) {
  if (!lessons || !lessons.length) throw new Error("There are no proposed lessons to export.");
  const filename = filenameFor(title);
  const blob = new Blob([buildWordHtml({ title, lessons, notCovered })], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { filename };
}

async function createTabbedScopeDoc(token, documentTitle, lessons, notCovered, folderId) {
  const created = await docsApi(token, "documents", { title: documentTitle });
  const documentId = created.documentId;
  if (!documentId) throw new Error("Google Docs did not return a document id.");

  let movedFile = null;
  if (folderId) movedFile = await moveDocToFolder(token, documentId, folderId);

  const initialDoc = await getDoc(token, documentId, { includeTabsContent: true });
  const firstTabId = flattenTabs(initialDoc.tabs || [])[0]?.tabProperties?.tabId;
  if (!firstTabId) throw new Error("Google Docs did not return the document's first tab.");

  const setupRequests = [
    {
      updateDocumentTabProperties: {
        tabProperties: { tabId: firstTabId, title: "Proposed Scope" },
        fields: "title",
      },
    },
    ...lessons.map((lesson, index) => ({
      addDocumentTab: {
        tabProperties: {
          title: tabTitle(lesson.name, `Lesson ${index + 1}`),
          index: index + 1,
        },
      },
    })),
  ];
  const setup = await docsApi(token, `documents/${documentId}:batchUpdate`, { requests: setupRequests });
  const lessonTabs = (setup.replies || [])
    .map((reply) => reply.addDocumentTab?.tabProperties?.tabId)
    .filter(Boolean)
    .map((tabId, index) => ({ tabId, lesson: lessons[index] }))
    .filter((item) => item.lesson);

  await docsApi(token, `documents/${documentId}:batchUpdate`, {
    requests: [
      {
        insertText: {
          location: { tabId: firstTabId, index: 1 },
          text: proposedScopeText({ title: documentTitle, lessons, notCovered }),
        },
      },
      ...lessonTabs.map(({ tabId, lesson }) => ({
        insertTable: {
          rows: lessonRows(lesson).length,
          columns: 2,
          location: { tabId, index: 1 },
        },
      })),
    ],
  });

  const docWithTables = await getDoc(token, documentId, { includeTabsContent: true });
  const tabsById = new Map(flattenTabs(docWithTables.tabs || []).map((tab) => [tab.tabProperties?.tabId, tab]));
  const cellInserts = lessonTabs.flatMap(({ tabId, lesson }) => tableCellInsertsForTab(tabsById.get(tabId), lessonRows(lesson)));
  cellInserts.sort((a, b) => (a.tabId === b.tabId ? b.index - a.index : String(a.tabId).localeCompare(String(b.tabId))));

  if (cellInserts.length) {
    await docsApi(token, `documents/${documentId}:batchUpdate`, {
      requests: cellInserts.map((cell) => ({
        insertText: {
          location: { tabId: cell.tabId, index: cell.index },
          text: cell.text,
        },
      })),
    });
  }

  const docWithText = await getDoc(token, documentId, { includeTabsContent: true });
  const textTabsById = new Map(flattenTabs(docWithText.tabs || []).map((tab) => [tab.tabProperties?.tabId, tab]));
  const labelStyleRequests = lessonTabs.flatMap(({ tabId }) => tableLabelStyleRequestsForTab(textTabsById.get(tabId)));
  if (labelStyleRequests.length) {
    await docsApi(token, `documents/${documentId}:batchUpdate`, { requests: labelStyleRequests });
  }

  return {
    documentId,
    title: movedFile?.name || documentTitle,
    url: movedFile?.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`,
  };
}

/**
 * @returns {Promise<{ documentId: string, title: string, url: string }>}
 */
export async function exportScopeToGoogleDoc({ clientId, title, lessons, notCovered = [], folderId }) {
  if (!clientId) throw new Error("No Google client id configured. See docs/google-docs-export.md.");
  if (!lessons || !lessons.length) throw new Error("There are no proposed lessons to export.");

  let token;
  try {
    token = await requestAccessToken(clientId);
  } catch (err) {
    throw new Error(googleErrorMessage(err));
  }

  return createScopeGoogleDocWithToken({ token, title, lessons, notCovered, folderId });
}

export async function createScopeGoogleDocWithToken({ token, title, lessons, notCovered = [], folderId }) {
  if (!token) throw new Error("Google authorization did not return an access token.");
  if (!lessons || !lessons.length) throw new Error("There are no proposed lessons to export.");

  let res;
  try {
    res = await fetch(apiUrl("/api/google-docs/create"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, lessons, notCovered, folderId }),
    });
  } catch {
    throw new Error("Could not reach the local Google export service. Make sure the app server is running, then try creating the scoping document again.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Could not create the scoping document (${res.status}).`);
  }
  return data;
}
