# ADR 0004, LADX Studio as a desktop app for Windows and macOS

**Date:** 2026-08-28
**Status:** Proposed. Needs decisions on signing spend and the update policy before work starts.

## Context

`apps/desktop` already exists and is further along than it looks. It is Tauri 2
with a Next.js static export, Rust commands for chat, Ollama, projects,
settings, the validator and licence activation, and it already depends on
`@ladx/studio`, `@ladx/hmi` and `@ladx/ui`. It is Windows only and versioned
`0.0.0`.

The ask is a shipping desktop application for Windows and macOS carrying the
Studio.

Most of what makes this achievable was decided earlier and by accident of good
seams rather than by planning for desktop: the HMI editor takes `onSave` and
`onGenerate` as props because the desktop cannot make an HTTP call, the ladder
studio takes a `StudioStorage`, and the assistant takes a `run` function and a
`modelsUrl` that can be null. Those seams are the plan. What is left is a
platform problem, not an architecture problem.

## What actually stands in the way

Not the code. Four things, in order of how likely they are to sink a date.

### 1. Signing, and it is not optional

An unsigned installer for industrial customers is a non-starter. It is also the
one item here with an external dependency and a lead time.

**macOS.** Apple Developer Program, 99 USD a year. A Developer ID Application
certificate, `codesign`, and then **notarisation**: the build is uploaded to
Apple, scanned, and a ticket is stapled to it. Without notarisation Gatekeeper
refuses to open it at all on a current macOS, and the error a customer sees says
the app is damaged, which is worse than a warning. This needs an Apple ID with
the Developer Program, an app specific password for the notary tool, and the
certificate in the CI keychain.

**Windows.** An Authenticode certificate. The choice matters more than the
price:

- An OV certificate is cheaper and does **not** clear SmartScreen. Every early
  download shows "Windows protected your PC" until the certificate accrues
  reputation, which takes downloads we will not have at first. For a first
  release this is close to useless.
- An EV certificate clears SmartScreen immediately, costs more, and requires the
  key on a hardware token or a cloud HSM, which complicates CI.
- Azure Trusted Signing is the newer option, cheaper than EV, cloud held, and
  worth pricing before committing to a token.

**Decision needed from the business, not from engineering:** whether to buy EV
or equivalent. Shipping OV means telling every early customer to click through a
malware warning.

### 2. The update policy contradicts the network rule

`CLAUDE.md` is unambiguous: the desktop makes exactly one outbound call in its
lifetime, licence activation. Tauri's updater plugin is an outbound call to a
release server on every launch.

Both cannot be true. The options:

- **Manual updates.** The app never phones home; new versions are downloaded
  from the site by a person. Honest for an air gapped product, and genuinely
  what some sites require. Costs us the ability to push a fix.
- **Opt in updates, off by default.** A setting a person turns on, stated
  plainly, with the rule reworded to "makes no outbound call you have not
  asked for". Keeps the promise's intent and the ability to ship fixes.
- **Always on.** Breaks the rule and the positioning. Not proposed.

**Recommendation: opt in, off by default**, with the rule reworded in this ADR
rather than quietly. A customer who has air gapped the machine leaves it off and
loses nothing they were promised.

### 3. Localhost is not "outbound", and that has to be written down

The assistant needs a model. On desktop that is Ollama on `127.0.0.1:11434`. A
loopback request leaves no machine and is not what the rule was written about,
but the rule as written says "no `reqwest` to public domains", and somebody will
eventually read `reqwest` and stop. Stating it here means the next person does
not have to guess.

### 4. Storage is Postgres on the web and has to be SQLite here

The web app's data lives in Postgres with S3 for files. None of that exists on a
laptop in a switchroom. `rusqlite` is already in the workspace and the Rust side
already has a `db` module, so the shape exists; what does not exist is the
schema for the surfaces that have never run on desktop.

## Decisions

1. **One codebase, two targets.** No desktop fork. Everything in `packages/*`
   stays surface neutral and the difference lives in what `apps/desktop` injects.
   This is already true and is the only reason the estimate below is short.
2. **macOS is a universal binary.** Intel and Apple Silicon in one download.
   Two downloads is a support question we should not create.
3. **Built on the target.** macOS builds on macOS, Windows on Windows, in a
   GitHub Actions matrix. Cross compiling a signed and notarised macOS app is
   not a thing to attempt.
4. **Opt in updates, off by default.** See above. The network rule is reworded
   accordingly, in this document.
5. **Ollama is required, and detected rather than bundled.** Bundling model
   weights would make the installer gigabytes and would put us in the business
   of redistributing other people's models under their licences. The app detects
   Ollama, and says clearly what to install when it is missing.

## Versioning

The desktop app gets its own SemVer, published in three places that have to
agree: `apps/desktop/src-tauri/tauri.conf.json` (the source of truth for Tauri),
`apps/desktop/package.json`, and the workspace `Cargo.toml`.

**Scheme.** `MAJOR.MINOR.PATCH`, and it means what it says:

- **MAJOR** for a change that invalidates existing local data or licences.
- **MINOR** for a surface arriving: CAD, the planner, the knowledge base.
- **PATCH** for fixes.

**Where it starts: `0.1.0`.** Not `1.0.0`. A one dot oh says the shape is
settled and the data format will be honoured, and neither is true while surfaces
are still landing. `1.0.0` is earned when everything in Phase 3 below ships and
a local project opened in the previous version still opens.

Platform quirks worth knowing before the first release: a Windows MSI version is
four numbers and the fourth is ignored for upgrade decisions, so the SemVer maps
to the first three and nothing may rely on the fourth. macOS needs both
`CFBundleShortVersionString`, which is the SemVer, and `CFBundleVersion`, which
must increase on every upload to the notary even for a rebuild of the same
version; a build number appended there does that.

**Channels.** `0.x.y-alpha.N` for internal, `-beta.N` for named customers,
unsuffixed for public. The channel is in the version rather than in a separate
field, so a screenshot of the About box is unambiguous.

## What ships, in three phases

Judged by whether a surface can work with no server, since that is the whole
product.

### Phase 1, `0.1.0`: what already runs

The surfaces that are pure client side today and need only storage swapped.

| Surface | Why it works offline |
|---|---|
| Ladder editor and simulator | The scan engine is TypeScript, in the browser |
| HMI/SCADA builder | Runtime is the same scan engine; renderer is inline styles |
| Convert | Reading and writing formats, all in process |
| Monitor | The simulator again |
| Settings, licence | Already built |

Work: SQLite behind `StudioStorage`, the assistant wired to Ollama through
`invoke()` rather than `/api/*`, macOS added to the build, and both platforms
signed. This is the release that proves the pipeline, which is the thing worth
proving early.

### Phase 2, `0.2.0`: the rest of the drawing tools

CAD, and Documents from templates. CAD is already pure client side in
`apps/web/components/cad`; what it needs is a home in the desktop app and file
storage. Documents need the template engine and PDF generation, which is `jspdf`
and already client side.

### Phase 3, `0.3.0` to `1.0.0`: the workspace

Projects, Clients, Planner, Knowledge. These are the ones that genuinely need
the SQLite schema rather than a file per document, and Knowledge additionally
needs embeddings, which means Ollama doing more than chat.

`1.0.0` when all of the above ships and a project written by the previous
version opens in the next.

## What is deliberately not on the desktop

Admin, the forum, the marketing site, and anything reading the shared free tier.
The first three are a website. The last is a hosted service and cannot exist on
a machine with no network, which is the point of the product.

## Consequences

- A macOS machine is now required in the release process. GitHub's hosted
  runners cover it; a local Mac is needed for anything hands on.
- Two certificates to buy, renew and keep out of the repository. Both live in CI
  secrets and neither is ever committed.
- The network rule in `CLAUDE.md` changes wording. It should say what it means:
  no outbound call the person has not asked for, loopback to Ollama excepted.
- A local data format that has to be migratable. From `1.0.0` a project written
  by an older version must open, which means schema migrations on SQLite and a
  version stamp in the file from Phase 1, before there is anything to migrate.
- The installer is the product for these customers. It has to be signed,
  notarised, and it has to say what it needs, because the person running it is
  frequently not the person who chose it.
