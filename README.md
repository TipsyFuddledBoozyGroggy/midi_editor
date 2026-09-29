# MIDI Captain Mini 6 — Configuration Editor

A local, browser-based editor for building and editing the `pageN.txt` configuration files that
the **PaintAudio MIDI Captain Mini 6** (firmware 5.0) reads from its USB drive. It gives you a
friendly UI over the pedal's INI-style config format — footswitch colors, LED modes, MIDI
commands, multi-page setups — and exports files that are byte-compatible with the firmware.

> The editor is intentionally dedicated to the **MIDI Captain Mini 6** (six footswitches:
> `1`, `2`, `3`, `A`, `B`, `C`).

---

## Table of contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Usage guide](#usage-guide)
- [The `page0.txt` contract](#the-page0txt-contract)
- [Repository layout](#repository-layout)
- [Documentation](#documentation)
- [Developer: the `page-config` core package](#developer-the-page-config-core-package)
- [Roadmap](#roadmap)
- [Project rules & contributing](#project-rules--contributing)

---

## What it does

- **Edit every page setting** — global options (name, brightness, wireless, tap range, expression
  pedals, encoder) and per-footswitch options (LED mode, colors, step counts, MIDI commands).
- **Multi-page workflow** — import a single `pageN.txt` or a whole folder of pages; each becomes a
  tab. Create a new page (optionally cloned from an existing one), and delete pages.
- **Quick-fills** — one-click command presets for three targets, each with a "linked to" badge and
  a "clear" option, and each detected automatically on import:
  - **QC** — Quad Cortex actions (scenes, modes, footswitches, looper, tap, tuner, …).
  - **SYN** — Synergy SYN-20IR actions (channel, structure, IR select, IR bypass, filters).
  - **MC** — MIDI Captain built-ins (page/preset navigation, PC/bank, time engine, transport,
    system common).
- **Auto channel detection** — on import, the navbar **QC Ch** / **SYN Ch** selectors are set from
  the channels used in the file.
- **Color wheel** — 24-bit `0xRRGGBB` color picker with common-color presets.
- **Swap Keys** — exchange every setting between two keys (e.g. Key 1 ↔ Key B).
- **Save to Pedal** — exports the active page under its own filename (`page2.txt`, …); uses the
  browser Save-location picker when available, otherwise a normal download.
- **In-memory by design** — a refresh starts empty; import your files to work, save to keep them.
- **Built-in docs** — a **📖 Docs** link opens a full Mini 6 reference and the manufacturer manuals.

---

## Quick start

This is a static, self-contained web app — no build step required to use it.

1. Open **`editer/editer.html`** in a modern **Chromium-based browser** (Chrome or Edge
   recommended).
   - The "Save to Pedal" location picker and folder import use the **File System Access API** and
     `webkitdirectory`, which are best supported in Chromium. In other browsers, saving falls back
     to a normal download.
2. Click **Import** (single `pageN.txt`) or **Import Folder** (a folder of `page0.txt`,
   `page1.txt`, …). To start fresh, just begin editing the empty page.
3. Make your changes.
4. Click **Save to Pedal** and save into your pedal's config folder (e.g. `D:\supersetup`).

> Tip: after pulling changes to the HTML, hard-refresh (Ctrl+Shift+R) to bypass the browser cache.

---

## Usage guide

| Task | How |
|---|---|
| Load one page | **Import** → pick a `pageN.txt` |
| Load a whole set | **Import Folder** → pick the folder (select the folder itself, then approve the upload prompt) |
| Switch pages | Click a **page tab** |
| Add a page | **+ Page** tab → enter a number → optionally clone an existing page |
| Delete a page | The **×** on a page tab (hidden when only one page remains) |
| Fill a command fast | Use the **QC**, **SYN**, or **MC** quick-fill dropdown on that command |
| Clear a command | Pick **"None (clear this command)"** in any quick-fill |
| Swap two footswitches | **Swap Keys** → choose two keys → **Swap** |
| Pick a color | Click a color box → color wheel / common colors |
| Export | **Save to Pedal** (exports the active page as its own `pageN.txt`) |
| Read the manual/reference | **📖 Docs** in the navbar |

---

## The `page0.txt` contract

`page0.txt` (and every `pageN.txt`) is a **fixed contract** the firmware depends on. Its section
names, key names, ordering, and `[..]` value wrapping must be preserved exactly. The editor only
ever changes the **values** inside that existing structure, so exported files stay
byte-compatible.

```ini
[GlobalSetup]
page_name = [LEAD]
ledbright = [80]
...

[key1]
keytimes = [1]
ledmode = [normal]
ledcolor0 = [0xFF0000][0xFF0000][0xFF0000]
short_up1_name = [DRIVE]
short_up1 = [1][CC][43][0]
```

Full details (global keys, per-key settings, command types, LED modes, triggers, page navigation)
are in the in-app docs at `editer/docs.html`. This rule is enforced as project steering — see
[`.kiro/steering/page0-protection.md`](.kiro/steering/page0-protection.md).

---

## Repository layout

```
midi_editor/
├─ editer/
│  ├─ editer.html            # the editor application (self-contained HTML/CSS/JS)
│  ├─ editer.reference.html  # reference copy
│  ├─ docs.html              # in-app MIDI Captain Mini 6 documentation
│  └─ pages/                 # sample pageN.txt files (page0 … page23)
├─ MIDICaptainMINI6FW5/
│  └─ MIDICaptainMINI6FW5.0manual/
│     ├─ MIDI Captain MINI6 FW5.0manual EN.pdf   # official manual (English)
│     └─ MIDI Captain MINI6 FW5.0说明书 CN.pdf    # official manual (Chinese)
├─ packages/
│  └─ page-config/           # typed core: parse / serialize / validate / lint pageN.txt (no DOM)
│     ├─ src/
│     │  ├─ document.ts       # format-preserving line model (byte-exact round trip)
│     │  ├─ brackets.ts       # [a][b][c] + command parsing / serialization
│     │  ├─ model.ts          # semantic API: getEntry / setRawValue / buildPage
│     │  ├─ schema.ts         # Zod-based contract validation
│     │  ├─ lint.ts           # behavioral lint rules + QC/SYN device detection
│     │  ├─ cli.ts            # validate | lint | roundtrip | check
│     │  └─ index.ts          # public API (parse / serialize / analyze / roundtripEquals)
│     ├─ test/               # round-trip + decomposition + schema + lint tests, real fixtures
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ vitest.config.ts
├─ docs/
│  └─ ENTERPRISE-REFACTOR.md # design doc: path to an enterprise-grade app
├─ QuadCortexMini-MIDI-Reference.md      # Quad Cortex MIDI map (used by the QC quick-fill)
├─ SynergySYN20IR-MIDI-Reference.md      # Synergy SYN-20IR notes (see caveat below)
├─ SYNERGY-SYN-20IR-MANUAL-FINAL-2026.pdf
├─ page0.txt                 # a working page file
└─ README.md                 # this file
```

> **Caveat:** `SynergySYN20IR-MIDI-Reference.md` currently lists older CC numbers. The editor and
> `editer/docs.html` use the corrected SYN-20IR map (CC24 channel, CC25 structure, CC27 IR bypass,
> CC28 IR select, CC29/CC30 filters).

---

## Documentation

- **In-app reference:** open `editer/docs.html` (or the **📖 Docs** link in the editor).
- **Official manuals:** English and Chinese PDFs under `MIDICaptainMINI6FW5/`.
- **MIDI maps:** `QuadCortexMini-MIDI-Reference.md`, `SynergySYN20IR-MIDI-Reference.md`.
- **Architecture / roadmap:** `docs/ENTERPRISE-REFACTOR.md`.

---

## Developer: the `page-config` core package

`packages/page-config` is the typed, DOM-free core that extracts the firmware-contract logic out of
the HTML so it can be tested and reused. It is the first delivered step of the
[enterprise refactor](docs/ENTERPRISE-REFACTOR.md). What it does:

- **Parse** a page file into a *format-preserving* line model.
- **Serialize** back **byte-for-byte** — unedited content is emitted from its original bytes; only
  the values you actually change are regenerated.
- **Read / edit** values by section + key through a semantic API, without touching structure.
- **Validate** the file against the contract (known sections/keys, value ranges, enums) with Zod.
- **Lint** for behavioral bugs — see [what the linter catches](#what-the-linter-catches).

The headline guarantee is a **byte-exact round-trip test** over the real device files in
`packages/page-config/test/fixtures/`:

```
serialize(parse(file)) === file   // for every fixture
```

### Prerequisites

- **[Node.js](https://nodejs.org/) 20+** (bundles `npm`), **or**
- **[Docker](https://www.docker.com/)** — if you'd rather not install Node, every command below has
  a Docker equivalent that runs in a throwaway `node:20` container. The tests were developed and
  verified this way.

### Setup

```bash
cd packages/page-config
npm install
```

With Docker instead of local Node (run from `packages/page-config`):

```bash
docker run --rm -v "${PWD}:/app" -w /app node:20 npm install
```

> **Windows:** in PowerShell `${PWD}` works as written; in `cmd.exe` use `%cd%` instead. The
> `node_modules/` folder created by a Docker install is Linux-native — keep using Docker to run it,
> or reinstall with local Node if you switch.

### Everyday commands

| Task | With local Node | With Docker (from `packages/page-config`) |
|---|---|---|
| Run tests once | `npm test` | `docker run --rm -v "${PWD}:/app" -w /app node:20 sh -c "npm install && npm test"` |
| Tests in watch mode | `npm run test:watch` | *(use local Node)* |
| Typecheck (strict) | `npm run typecheck` | `docker run --rm -v "${PWD}:/app" -w /app node:20 sh -c "npm install && npm run typecheck"` |
| Run the CLI | `npm run cli -- <cmd> <path…>` | `docker run --rm -v "${PWD}:/app" -w /app node:20 sh -c "npm install && npm run cli -- <cmd> <path…>"` |

Tests use [Vitest](https://vitest.dev/); typechecking is `tsc --noEmit` under a strict `tsconfig`.

### The CLI

The CLI checks one or more page files (or folders of them) and exits non-zero if it finds any
error-level problem, so it can gate CI:

```bash
npm run cli -- roundtrip test/fixtures/pages   # prove serialize(parse(file)) === file
npm run cli -- validate  ../../page0.txt       # contract checks (structure, ranges, enums)
npm run cli -- lint      ../../page0.txt        # behavioral rules only
npm run cli -- check     ../../page0.txt        # validate + lint together
```

Example finding:

```
test/fixtures/pages/page21.txt
  WARN  lint/step-overflow  line 50: Step 1 of key1 has 9 commands across its triggers. The editor
        holds only 4 per step, so opening and re-saving this page here would drop the extras.
```

### What the linter catches

| Rule | Severity | Flags |
|---|---|---|
| `lint/long-press-page-retrigger` | warning | Page nav (`[preset]`) on a press-down `long#` trigger instead of the release `long_up#` |
| `lint/step-overflow` | warning | More than 4 commands on one step — the editor holds only 4/step (shared across a step's triggers), though the pedal firmware itself accepts more |
| `lint/beyond-keytimes` | warning | A trigger or color whose step index exceeds `keytimes` |
| `lint/mixed-select-groups` | warning | A page mixing the global `select` mode with numbered `select1`–`select5` groups |
| `lint/select-keytimes` | info | A `select`-mode switch with `keytimes > 1` |
| `lint/channel-mismatch` | warning | A Quad Cortex / SYN-20IR command whose channel differs from that device's configured (or first-seen) channel |
| `lint/color-format` | error | An `ledcolorN` value that isn't three `0xRRGGBB` groups |
| `schema/*` | error / warning | Unknown section or key, out-of-range value, bad enum, or an unrecognized command |

### Using it as a library

```ts
import { analyze, parse, serialize, setRawValue } from "@midicaptain/page-config";

// One-shot report: schema validation + lint findings.
const report = analyze(fileText);          // { validation, lint, all, ok }
if (!report.ok) console.log(report.all);

// Format-preserving edit: only the one value's bytes change.
const doc = parse(fileText);
setRawValue(doc, "GlobalSetup", "ledbright", "[90]");
const out = serialize(doc);
```

> Status: the core is **complete** — format-preserving parser/serializer, semantic API, Zod
> validation, the behavioral linter and the CLI, all covered by the byte-exact round-trip tests over
> the real device files (plus unit tests for each module). Next on the
> [roadmap](#roadmap): the SPA shell and a single data-driven key panel.

---

## Roadmap

The plan to evolve this from a single-file app into a modular, tested, enterprise-grade tool
(while still running locally, with Docker only where it helps) is in
[`docs/ENTERPRISE-REFACTOR.md`](docs/ENTERPRISE-REFACTOR.md). Highlights:

1. ✅ **Done** — the `page-config` core with byte-exact round-trip tests.
2. ✅ **Done** — a **config linter** (long-press page retrigger, step overflow, channel mismatch, …),
   shipped inside `page-config`.
3. Componentize the UI (Vite + TypeScript SPA); collapse the duplicated key panels.
4. Introduce a state store with undo/redo.
5. Optional Dockerized API + Postgres for saved setups, version history, and hosted linting.

---

## Project rules & contributing

- **Never change the `page0.txt` structure or wording** — only the values within the existing
  shape. This is a hard rule (see `.kiro/steering/page0-protection.md`); it keeps exported files
  compatible with the pedal firmware.
- Keep the app **local-first** and **English-only** (the pedal ships EN/CN manuals; the editor UI
  is English).
- Prefer changes that are covered by the `page-config` tests. Run `npm test` (and `npm run typecheck`)
  in `packages/page-config` before submitting — the byte-exact round-trip test must stay green.

---

*This project is not affiliated with PaintAudio or Neural DSP. Product names and manuals belong to
their respective owners; bundled manuals are included for user convenience.*
