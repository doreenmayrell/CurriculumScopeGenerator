import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "curriculum-scope-db.json");

const EMPTY_DB = {
  version: 1,
  workspaces: [],
  runsByWorkspace: {},
  activeWorkspace: null,
  activeRun: null,
  updatedAt: null,
};

let writeQueue = Promise.resolve();

function cleanState(input = {}) {
  return {
    version: 1,
    workspaces: Array.isArray(input.workspaces) ? input.workspaces : [],
    runsByWorkspace: input.runsByWorkspace && typeof input.runsByWorkspace === "object" ? input.runsByWorkspace : {},
    activeWorkspace: input.activeWorkspace || null,
    activeRun: input.activeRun || null,
    updatedAt: new Date().toISOString(),
  };
}

export async function readAppDb() {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return { ...EMPTY_DB, ...JSON.parse(raw) };
  } catch (err) {
    if (err?.code === "ENOENT") return EMPTY_DB;
    throw err;
  }
}

export async function writeAppDb(state) {
  const next = cleanState(state);
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DB_DIR, { recursive: true });
    await fs.writeFile(DB_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  });
  await writeQueue;
  return next;
}
