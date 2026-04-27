# apps/desktop — ladX.ai Studio (Tauri)

Windows-first desktop app. **Air-gapped capable.** Ollama for inference.

## CRITICAL — Network policy

The desktop app makes EXACTLY ONE outbound HTTP call in its entire lifetime: a licence activation check against `https://auth.ladx.ai/activate`. No telemetry, no analytics, no model downloads, no anything else.

If you find yourself adding `fetch()` or `reqwest::get()` to anything in this app, stop and read this rule again. There is almost certainly a different way.

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
- Cached models reference: `%APPDATA%\ladX\models.json` (NOT the model weights — Ollama owns those)

## Ollama lifecycle (Phase 2+)

- Detect Ollama on startup (`http://localhost:11434/api/tags`)
- If not running, prompt user to install/start (don't try to start it ourselves — permission issues)
- Cache available models in `models.json`
- Default model selection logic in `src-tauri/src/ollama/models.rs`

## Vendor connector loading (Phase 2+)

- Vendor packs are detected at startup based on installed vendor IDEs.
- TIA Openness detection: check for `Siemens.Engineering.dll` in known paths.
- Studio 5000 detection: check Windows Registry for installed Logix Designer.
- TwinCAT detection: check for `TwinCAT XAE Shell` registration.
- A connector being unavailable is fine — disable the related UI rather than erroring.

## Things to never do
- Don't cache PLC project parses to disk in cleartext. Encrypt with a per-install key.
- Don't add localStorage / sessionStorage / IndexedDB. Use Tauri filesystem APIs.
- Don't write to `%APPDATA%\ladX\` from the frontend directly. Always go through Tauri commands.
- Don't bundle Ollama. The model weights alone are 5–20GB. User installs Ollama separately.
