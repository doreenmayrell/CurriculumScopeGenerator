const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const MAX_TAB_TITLE_LENGTH = 50;
const TABLE_HEADERS = ["Lesson Title", "ID", "Description", "Reasoning for Gap Lesson"];

async function googleFetch(url, token, { method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const service = String(url).includes("docs.googleapis.com") ? "Docs" : "Drive";
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Google denied ${service} access. Grant permission again and confirm the ${service} API is enabled.`);
    }
    if (res.status === 404) {
      throw new Error(`Google ${service} could not find the requested document or folder.`);
    }
    throw new Error(`Google ${service} API error ${res.status}: ${detail.slice(0, 500)}`);
  }
  return res.json();
}

async function docsApi(token, path, body, { method = "POST", params = {} } = {}) {
  const url = new URL(`https://docs.googleapis.com/v1/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return googleFetch(url.toString(), token, { method, body });
}

async function driveApi(token, path, { method = "GET", params = {}, body } = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return googleFetch(url.toString(), token, { method, body });
}

async function getDoc(token, documentId, { includeTabsContent = false } = {}) {
  const url = new URL(`https://docs.googleapis.com/v1/documents/${documentId}`);
  if (includeTabsContent) url.searchParams.set("includeTabsContent", "true");
  return googleFetch(url.toString(), token);
}

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

function safeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function tabTitle(value, fallback = "Lesson") {
  const title = safeText(value, fallback).replace(/\s+/g, " ");
  if (title.length <= MAX_TAB_TITLE_LENGTH) return title;
  return `${title.slice(0, MAX_TAB_TITLE_LENGTH - 3).trim()}...`;
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

export async function createScopeGoogleDoc({ token, title, lessons, notCovered = [], folderId }) {
  if (!token) throw new Error("Google authorization did not return an access token.");
  if (!lessons || !lessons.length) throw new Error("There are no proposed lessons to export.");

  const documentTitle = folderId ? await nextAvailableDriveTitle(token, folderId, title) : title;
  return createTabbedScopeDoc(token, documentTitle, lessons, notCovered, folderId);
}
