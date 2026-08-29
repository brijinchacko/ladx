# apps/desktop, ladX.ai Studio (Tauri)

Windows-first desktop app. **Air-gapped capable.** Ollama for inference.

## CRITICAL, Network policy

**The desktop app makes no outbound call the person has not asked for.** There
are exactly two, both deliberate, and everything else is forbidden: no
telemetry, no analytics, no model downloads, no anything else.

1. **Licence activation**, once, against `https://auth.ladx.ai/activate`.
2. **The update check**, against `https://ladx.ai/downloads/latest.json`, and
   only when somebody has turned it on in Settings. It is off by default and
   the default is the product: a plant that has air gapped the machine has to
   be able to rely on that without reading the source.

Loopback is not outbound. Ollama on `127.0.0.1:11434` leaves no machine, and
the rule was never written about it; `lib/ask-model.ts` and the chat stream
both go there through Tauri commands.

If you find yourself adding `fetch()` or `reqwest::get()` to anything else in
this app, stop and read this again. There is almost certainly a different way,
and `scripts/check-no-network.mjs` fails the build if the shipped bundle names
a host that is not on its list.

## Tauri command pattern

All Rust→TS communication goes through `#[tauri::command]` functions in `src-tauri/src/commands/*.rs`. Never expose Rust state directly to the frontend.

Frontend calls them via `lib/invoke.ts`:
```typescript
import { invoke } from "@/lib/invoke";
const result = await invoke("parse_project", { path: "/path/to/file" });
```

## Storage locations (Phase 2+)

- Project Memory: `%APPDATA%\ladX\rag\` (LanceDB)
- Audit log: `%APPDATA%\ladX\audit.db` (SQLite)
- Settings: `%APPDATA%\ladX\settings.json`
- Cached models reference: `%APPDATA%\ladX\models.json` (NOT the model weights, Ollama owns those)

## Ollama lifecycle (Phase 2+)

- Detect Ollama on startup (`http://localhost:11434/api/tags`)
- If not running, prompt user to install/start (don't try to start it ourselves, permission issues)
- Cache available models in `models.json`
- Default model selection logic in `src-tauri/src/ollama/models.rs`

## Vendor connector loading (Phase 2+)

- Vendor packs are detected at startup based on installed vendor IDEs.
- TIA Openness detection: check for `Siemens.Engineering.dll` in known paths.
- Studio 5000 detection: check Windows Registry for installed Logix Designer.
- TwinCAT detection: check for `TwinCAT XAE Shell` registration.
- A connector being unavailable is fine, disable the related UI rather than erroring.

## The window turns off Tauri's own drag and drop

`app.windows[0].dragDropEnabled` is `false` in `tauri.conf.json`, and it has to
stay false. It defaults to true, and while it is true the webview hands every
drag to the operating system's file-drop handler and the page never sees one.
That is the right default for an app whose windows accept dropped files. This
one does not; it drags instructions onto rungs, symbols onto drawings and
objects onto panels, all with HTML5 drag events and `dataTransfer`. With the
default left alone none of that works and nothing reports an error, because
from the page's side the events simply never arrive.

It is a JSON file and cannot carry a comment, which is why this is written
here. If dropping real files into the app is ever wanted, it has to be built on
Tauri's own drag-drop events rather than by turning this back on.

## The layout sets the fonts, and that is not cosmetic

`app/layout.tsx` loads Public Sans, Saira and JetBrains Mono through
`next/font/google`, exactly as the web app does. next/font fetches them while
building and emits them into the bundle, so the running app loads them from its
own files and never asks the network.

It is load-bearing. The ladder editor, the monitor and the tag tables lay out
in columns against monospace advance widths. Without this the three font
variables are undefined, neither face is on the machine, every column falls
back to whatever the system offers, and the ladder drifts out of alignment.

## The DMG step fails locally and that is a Mac setting, not a bug

`pnpm tauri:build` builds `LADX Studio.app` and then fails on the DMG with

```
failed to bundle project error running bundle_dmg.sh
```

Tauri swallows the script's own output, which is why this looks like a build
problem. It is not. Running the bundler by hand shows the real error:

```
execution error: Not authorized to send Apple events to Finder. (-1743)
```

`bundle_dmg.sh` runs an AppleScript to lay the DMG window out, and macOS needs
Automation permission for that. Grant it once, to whichever app runs the build,
in System Settings, Privacy and Security, Automation, then Finder. It needs the
person at the keyboard; it cannot be done from a script.

Two things follow. The `.app` is built before this step, so a failed DMG still
leaves a testable application in `target/release/bundle/macos/`. And CI is
unaffected and always has been, which is why every release so far has produced
a DMG while local builds do not: releases are cut by the workflow, not here.

To produce one locally without granting the permission, run the bundler
directly with `--skip-jenkins`, which is the flag that skips the AppleScript:

```bash
cd target/release/bundle/dmg
cp -R "../macos/LADX Studio.app" .
bash bundle_dmg.sh --volname "LADX Studio" --skip-jenkins \
  --icon "LADX Studio.app" 180 170 --app-drop-link 480 170 \
  --window-size 660 400 --hide-extension "LADX Studio.app" \
  "LADX Studio.dmg" "LADX Studio.app"
```

The result has no custom window layout. That is cosmetic and it installs the
same way.

## Things to never do
- Don't cache PLC project parses to disk in cleartext. Encrypt with a per-install key.
- Don't put the person's work in localStorage / sessionStorage / IndexedDB.
  Anything that is theirs goes through a Tauri command: the SQLite database for
  records, the project folder for documents. Webview storage is not the project
  folder, is not backed up with it, does not travel on the memory stick at
  handover, and is cleared by things that have nothing to do with LADX.

  Window state is the exception, and it is deliberate rather than an oversight.
  Where the assistant panel is docked, how the tool panes are laid out, and
  whether a tool is in focus mode all belong to the window they are in, not to
  the job, so they stay in browser storage on both surfaces. Following
  somebody's screen layout onto another machine would be wrong even if it were
  free. See `packages/ui/src/lib/assistant-store.ts` for where the line is
  drawn. On the window side of it: `assistant-frame.ts` (where the assistant is
  docked), `dock.ts` and `panels.ts` (which panes are open and how wide),
  `focus-mode.ts`, and `tour.ts` (whether the guided tour has been seen).

  Not everything that looks like a preference is window state. Which Ollama
  model is the default, where projects live and which one was last open are all
  in `settings.json` through Tauri, because they follow the person rather than
  the window.
- Don't write to `%APPDATA%\ladX\` from the frontend directly. Always go through Tauri commands.
- Don't bundle Ollama. The model weights alone are 5-20GB. User installs Ollama separately.
