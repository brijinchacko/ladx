// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  PROJECT_FOLDERS,
  UNSUPPORTED_REASON,
  isFolderConnectionSupported,
  pickProjectFolder,
  prepareFolder,
  readmeFor,
  writeIntoFolder,
} from "./project-folder";

/** A directory that records what was written to it. */
interface FakeDir {
  handle: {
    name: string;
    kind: "directory";
    getDirectoryHandle(child: string, opts?: { create?: boolean }): Promise<FakeDir["handle"]>;
    getFileHandle(
      child: string,
      opts?: { create?: boolean },
    ): Promise<{
      name: string;
      createWritable(): Promise<{ write(chunk: string): Promise<void>; close(): Promise<void> }>;
    }>;
  };
  dirs: Map<string, FakeDir>;
  files: Map<string, string>;
}

function fakeDir(name = "Job 4412"): FakeDir {
  const dirs = new Map<string, FakeDir>();
  const files = new Map<string, string>();
  const handle: FakeDir["handle"] = {
    name,
    kind: "directory" as const,
    async getDirectoryHandle(child: string, opts?: { create?: boolean }) {
      if (!dirs.has(child)) {
        if (!opts?.create) throw new DOMException("not found", "NotFoundError");
        dirs.set(child, fakeDir(child));
      }
      const found = dirs.get(child);
      if (!found) throw new Error("unreachable: just created");
      return found.handle;
    },
    async getFileHandle(child: string, opts?: { create?: boolean }) {
      if (!files.has(child) && !opts?.create) {
        throw new DOMException("not found", "NotFoundError");
      }
      return {
        name: child,
        async createWritable() {
          let buf = "";
          return {
            async write(chunk: string) {
              buf += chunk;
            },
            async close() {
              files.set(child, buf);
            },
          };
        },
      };
    },
  };
  return { handle, dirs, files };
}

afterEach(() => {
  // @ts-expect-error cleaning the shim between tests
  window.showDirectoryPicker = undefined;
});

describe("support", () => {
  it("is false without the API, and says why", () => {
    expect(isFolderConnectionSupported()).toBe(false);
    expect(UNSUPPORTED_REASON).toMatch(/Chrome|Chromium/);
    // The message has to say what still works, or it reads as the feature
    // being broken rather than absent.
    expect(UNSUPPORTED_REASON).toMatch(/download/i);
  });

  it("refuses to pick rather than throwing something unreadable", async () => {
    await expect(pickProjectFolder()).rejects.toThrow(/Chromium/);
  });
});

describe("picking", () => {
  it("returns the folder that was chosen", async () => {
    const { handle } = fakeDir("Line 7 rebuild");
    // @ts-expect-error shim
    window.showDirectoryPicker = async () => handle;
    const folder = await pickProjectFolder();
    expect(folder?.name).toBe("Line 7 rebuild");
  });

  // Dismissing a picker is a decision, not a failure. Treating it as an error
  // would put a red message on the form for somebody who simply changed their
  // mind.
  it("returns null when the picker is dismissed", async () => {
    // @ts-expect-error shim
    window.showDirectoryPicker = async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    };
    await expect(pickProjectFolder()).resolves.toBeNull();
  });

  it("passes a real failure through", async () => {
    // @ts-expect-error shim
    window.showDirectoryPicker = async () => {
      throw new DOMException("no", "SecurityError");
    };
    await expect(pickProjectFolder()).rejects.toThrow();
  });

  it("asks for write access, not read", async () => {
    const { handle } = fakeDir();
    const seen: unknown[] = [];
    // @ts-expect-error shim
    window.showDirectoryPicker = async (o: unknown) => {
      seen.push(o);
      return handle;
    };
    await pickProjectFolder();
    expect(seen[0]).toMatchObject({ mode: "readwrite" });
  });
});

describe("writing", () => {
  it("writes a file at the top of the folder", async () => {
    const dir = fakeDir();
    await writeIntoFolder({ name: dir.handle.name, handle: dir.handle as never }, "notes.md", "hi");
    expect(dir.files.get("notes.md")).toBe("hi");
  });

  it("creates the directories on the way to a nested file", async () => {
    const dir = fakeDir();
    await writeIntoFolder(
      { name: dir.handle.name, handle: dir.handle as never },
      "handover/pack/00-manifest.md",
      "# manifest",
    );
    const handover = dir.dirs.get("handover");
    expect(handover).toBeDefined();
    expect(handover?.dirs.get("pack")?.files.get("00-manifest.md")).toBe("# manifest");
  });

  it("refuses a path with no file on the end", async () => {
    const dir = fakeDir();
    await expect(
      writeIntoFolder({ name: dir.handle.name, handle: dir.handle as never }, "handover/", "x"),
    ).rejects.toThrow(/file name/);
  });
});

describe("preparing a folder", () => {
  it("lays out the folders and leaves a note saying what they are", async () => {
    const dir = fakeDir();
    await prepareFolder(
      { name: dir.handle.name, handle: dir.handle as never },
      "Line 7 rebuild",
      "2026-09-01",
    );
    for (const name of PROJECT_FOLDERS) {
      expect(dir.dirs.has(name), `${name} was not created`).toBe(true);
    }
    const readme = dir.files.get("README.md") ?? "";
    expect(readme).toContain("Line 7 rebuild");
    expect(readme).toContain("2026-09-01");
  });

  // Somebody handing their computer's folder to a web page deserves to be told
  // exactly what it can reach, in the folder itself rather than only in a
  // dialog they clicked through.
  it("says in the folder what LADX can and cannot see", () => {
    const readme = readmeFor("Job 4412", "2026-09-01");
    expect(readme).toContain("only see this folder");
    expect(readme).toContain("does not know where this folder");
  });

  it("names every folder it creates in the note", () => {
    const readme = readmeFor("Job 4412", "2026-09-01");
    for (const name of PROJECT_FOLDERS) {
      expect(readme, `${name} is created but not explained`).toContain(`${name}/`);
    }
  });
});
