/**
 * A folder on this computer, connected to a project.
 *
 * An engineer's work does not live in a browser. The L5X came off a controller
 * into a folder, the drawings are beside it, and the handover pack has to end
 * up there too. Making somebody download each generated file and then move it
 * is the kind of small friction that means the files end up in Downloads and
 * the project folder stays out of date.
 *
 * This uses the File System Access API, which grants a page a handle to one
 * directory the user picked, and nothing else. The page cannot browse the disk,
 * cannot see the path, and cannot reach anything outside what was chosen. The
 * handle survives a reload because it is stored in IndexedDB, but the
 * permission does not: the browser asks again, which is the right trade and not
 * something to work around.
 *
 * Chromium only, today. Firefox and Safari have not shipped it. That is stated
 * where somebody would otherwise press a button and get nothing, rather than
 * hidden behind a feature flag.
 */

const DB = "ladx-folders";
const STORE = "handles";

/** Whether this browser can connect a folder at all. */
export function isFolderConnectionSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function"
  );
}

/** What to tell somebody whose browser cannot do it. */
export const UNSUPPORTED_REASON =
  "Connecting a folder needs Chrome, Edge or another Chromium browser. Firefox and Safari have not shipped the API yet. Everything else works; files download instead.";

/* ───────────────────────────── the handle ──────────────────────────── */

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get<T>(key: string): Promise<T | null> {
  const db = await open();
  const out = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

async function del(key: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/* ────────────────────────────── the folder ─────────────────────────── */

export interface ConnectedFolder {
  /** What the user called it. The full path is not available to a web page. */
  name: string;
  handle: FileSystemDirectoryHandle;
}

/**
 * Ask for a folder.
 *
 * Returns null when the picker is dismissed, which is not an error: somebody
 * changing their mind should leave the form exactly as it was.
 */
export async function pickProjectFolder(): Promise<ConnectedFolder | null> {
  if (!isFolderConnectionSupported()) throw new Error(UNSUPPORTED_REASON);
  try {
    const handle = await (
      window as unknown as {
        showDirectoryPicker: (o?: {
          mode?: "read" | "readwrite";
          id?: string;
        }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker({ mode: "readwrite", id: "ladx-project" });
    return { name: handle.name, handle };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

/** Keep the folder against a project, so it is still there tomorrow. */
export async function rememberFolder(projectId: string, folder: ConnectedFolder): Promise<void> {
  await put(projectId, folder.handle);
}

export async function recallFolder(projectId: string): Promise<ConnectedFolder | null> {
  if (!isFolderConnectionSupported()) return null;
  try {
    const handle = await get<FileSystemDirectoryHandle>(projectId);
    return handle ? { name: handle.name, handle } : null;
  } catch {
    // A blocked or wiped IndexedDB is a folder that is no longer connected,
    // not a broken page.
    return null;
  }
}

export async function forgetFolder(projectId: string): Promise<void> {
  try {
    await del(projectId);
  } catch {
    // Nothing to do: the point was to stop using it, and we already have.
  }
}

/**
 * Whether the folder can still be written to.
 *
 * The handle survives a reload; the permission does not. Asking again has to
 * happen inside a click, so this reports rather than prompts unless asked.
 */
export async function folderPermission(
  folder: ConnectedFolder,
  request = false,
): Promise<"granted" | "prompt" | "denied"> {
  const h = folder.handle as FileSystemDirectoryHandle & {
    queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
    requestPermission?: (d: { mode: string }) => Promise<PermissionState>;
  };
  const opts = { mode: "readwrite" };
  const current = (await h.queryPermission?.(opts)) ?? "granted";
  if (current === "granted" || !request) return current as "granted" | "prompt" | "denied";
  return ((await h.requestPermission?.(opts)) ?? "denied") as "granted" | "prompt" | "denied";
}

/**
 * Write a file into the folder, creating any directories on the way.
 *
 * Paths are relative and slash separated, "documents/handover/manifest.md".
 */
export async function writeIntoFolder(
  folder: ConnectedFolder,
  path: string,
  contents: string | Blob,
): Promise<void> {
  if (path.endsWith("/") || !path.trim()) {
    throw new Error("that path has no file name on the end of it");
  }
  const parts = path.split("/").filter(Boolean);
  const file = parts.pop();
  if (!file) throw new Error("that path has no file name on the end of it");

  let dir = folder.handle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const handle = await dir.getFileHandle(file, { create: true });
  const stream = await handle.createWritable();
  await stream.write(contents);
  await stream.close();
}

/**
 * The folders a LADX project keeps, and a note saying what they are for.
 *
 * Created on connection rather than on first use, because an empty folder
 * structure tells somebody where things will go; a folder that stays empty
 * until the first export tells them nothing.
 */
export const PROJECT_FOLDERS = [
  "programs",
  "drawings",
  "documents",
  "handover",
  "from-site",
] as const;

export function readmeFor(projectName: string, dated: string): string {
  return `# ${projectName}

Connected to LADX. Files this project generates are written here.

- \`programs/\`   exported logic: L5X, SCL, structured text
- \`drawings/\`   panel and wiring drawings
- \`documents/\`  specifications and narratives
- \`handover/\`   the pack that goes to the customer
- \`from-site/\`  exports pulled off the controller, for comparing

LADX can only see this folder, because it is the one you chose. It cannot
read anything else on this computer, and it does not know where this folder
is: a browser gives a page the folder and not the path.

Connected ${dated}.
`;
}

/** Lay out the folders and drop the note in. */
export async function prepareFolder(
  folder: ConnectedFolder,
  projectName: string,
  dated: string,
): Promise<void> {
  for (const name of PROJECT_FOLDERS) {
    await folder.handle.getDirectoryHandle(name, { create: true });
  }
  await writeIntoFolder(folder, "README.md", readmeFor(projectName, dated));
}
