# MIDI Captain Editor — Enterprise Refactor Design Doc

**Status:** Draft for review
**Scope:** Evolve the single-file `editer/editer.html` MIDI Captain configuration editor into a
maintainable, testable, enterprise-grade application that still runs locally, using Docker only
where it adds real value (optional backend, database, tooling).

---

## 1. Context

The app configures `pageN.txt` files for the MIDI Captain Mini 6. `page0.txt` is a **fixed
firmware contract**: section names, key names, ordering, and `[..]` value wrapping must be
preserved byte-for-byte. The editor's whole job is to change *values* within that shape.

### Current state

| Area | Today |
|---|---|
| Delivery | One self-contained `editer/editer.html` (~164k lines) with inline CSS + multiple inline `<script>` blocks |
| UI structure | Per-key panels (key1–5, A–E) duplicated ~10× as literal HTML in a giant template string |
| State | Globals (`pages`, `activePage`, `globalCfg`); in-memory only (refresh = empty, by design) |
| Domain logic | `parsePage0Text` / exporter / quick-fill maps tangled with DOM code |
| Persistence | None server-side; USB read/write via the browser File System Access API |
| Tests | None |
| Build | None (open the HTML directly) |
| Docs | New `editer/docs.html` + reference `.md` files + bundled manufacturer PDFs |

### Pain points

1. **Unmaintainable size / duplication** — the 10× key panels are the single biggest source of
   risk and edit cost.
2. **Firmware contract is unguarded** — nothing automatically proves the exported file still
   matches the required structure.
3. **No separation of concerns** — parsing/serialization/validation live inside UI code, so they
   can't be tested or reused.
4. **No tests, no CI, no types** — regressions are only caught by manual clicking.

---

## 2. Goals & non-goals

### Goals
- Preserve the `page0.txt` contract with an **automated, byte-exact guarantee**.
- Make the codebase modular, typed, and testable.
- Keep it **local-first**: it must run on the user's machine and read/write the pedal's USB drive.
- Use Docker for optional, high-value backend features (history, sharing, linting service).
- Ship confidence: tests + CI that block regressions.

### Non-goals
- No cloud-only/SaaS lock-in. The app must work offline/locally.
- No moving USB file access to a server (browsers, not servers, reach the drive).
- No rewrite-in-one-shot. Migration is incremental and reversible.

---

## 3. Target architecture

A small monorepo with a **framework-agnostic domain core**, a **thin UI**, and **optional
Dockerized services**.

```
midi-captain/
├─ packages/
│  ├─ page-config/          # CORE: parse / serialize / validate / lint pageN.txt (pure TS, no DOM)
│  │  ├─ src/
│  │  │  ├─ document.ts     # format-preserving line model (byte-exact round trip)
│  │  │  ├─ brackets.ts     # [a][b][c] + command-line parsing
│  │  │  ├─ model.ts        # semantic getSections / getEntry / setEntryValue
│  │  │  ├─ schema.ts       # Zod schemas + validate()
│  │  │  ├─ lint.ts         # behavioral rules (long-press retrigger, step overflow, …)
│  │  │  ├─ cli.ts          # validate | lint | roundtrip
│  │  │  └─ index.ts
│  │  └─ test/              # round-trip + decomposition + schema + lint tests, real fixtures
│  ├─ device-profiles/      # DATA: Mini6/Nano/Std layouts, limits, key sets
│  └─ midi-maps/            # DATA: Quad Cortex, Synergy SYN-20IR, MIDI Captain native (JSON)
├─ apps/
│  ├─ editor/               # UI: Vite + TypeScript + React/Vue SPA
│  └─ api/                  # OPTIONAL backend (Node/Express or Fastify) — Docker
├─ infra/
│  └─ docker-compose.yml    # editor (nginx) + api + postgres (+ optional minio)
└─ .github/workflows/ci.yml
```

### 3.1 Core domain package — `page-config` (the crown jewel)
Pure TypeScript, no DOM. Responsibilities:
- **Parse** a page file into a *format-preserving* document model (keeps exact separators,
  blank lines, EOLs, ordering).
- **Serialize** back **byte-for-byte** for unedited content; regenerate only edited values.
- **Semantic API** to read/edit values by section+key without touching structure.
- **Validate** against a schema (Zod): known keys, value ranges, enums.
- **Lint** for behavioral problems (see §7).

> This package makes the firmware contract *executable*: a round-trip test over real device files
> asserts `serialize(parse(file)) === file`. It is the foundation everything else builds on and is
> already scaffolded at `packages/page-config`.

### 3.2 Device profiles & MIDI maps as **data, not code**
- `device-profiles`: which keys exist per model (Mini6 = 1,2,3,A,B,C), color/keytimes limits.
- `midi-maps`: the QC / SYN-20IR / MIDI-Captain-native action tables as versioned JSON. Adding a
  new controller or fixing a CC becomes a data edit + test, not a code change.

### 3.3 Frontend SPA (`apps/editor`)
- **Vite + TypeScript + React (or Vue)**. TypeScript models the page schema as types.
- The ten duplicated key panels collapse into **one component** rendered per key from the device
  profile.
- **State store** (Zustand/Pinia/Redux Toolkit) replaces globals → enables **undo/redo**, and a
  clean import → state → render → export flow.
- Design tokens capture the existing "modern pro-audio" dark theme.
- USB import/export stays client-side (File System Access API), exactly as today.

### 3.4 Optional backend (`apps/api`) + DB — only if wanted
Justified when the user wants persistence beyond a single session: saved setups, **version
history/diff**, sharing, and a hosted **config linter**. Otherwise a local file / SQLite is enough.
- API: Node + Fastify/Express, OpenAPI-documented.
- DB: Postgres with migrations (Prisma/Drizzle). Optional MinIO for uploaded bundles/manuals.
- The API never touches the USB drive; it stores/serves config JSON and runs validation/lint.

---

## 4. Docker & local run

Everything comes up with `docker compose up`; the editor remains usable with **no** backend too.

```yaml
# infra/docker-compose.yml (sketch)
services:
  editor:                     # built SPA served by nginx
    build: ../apps/editor
    ports: ["8080:80"]
  api:                        # optional; feature-flagged in the UI
    build: ../apps/api
    environment:
      DATABASE_URL: postgres://mc:mc@db:5432/midicaptain
    ports: ["8081:8081"]
    depends_on: [db]
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: mc
      POSTGRES_PASSWORD: mc
      POSTGRES_DB: midicaptain
    volumes: ["mcdata:/var/lib/postgresql/data"]
volumes: { mcdata: {} }
```

- **Local dev without Docker**: `pnpm dev` runs the SPA + core tests (needs Node). If Node isn't
  installed locally, the core tests can run in a `node:20` container.
- **Local prod-like**: `docker compose up` serves the editor at `localhost:8080`; the API/DB are
  opt-in.

---

## 5. Data model

```
Setup            # a whole pedal layout (a folder of pageN.txt)
 └─ Page[]       # page0, page1, …
     ├─ global   # GlobalSetup values
     └─ key{1..3,A..C}
         ├─ ledmode, keytimes, colors[]
         └─ step[] → trigger (down/up/long/longup) + command[]
Command = CC | CCT | NT | PC | Preset | TimeEngine | SystemCommon | RealTime
```
Stored as normalized JSON with a `schemaVersion` for migrations. Export = serialize each page to
`pageN.txt` (via `page-config`) and bundle.

---

## 6. Cross-cutting concerns

- **Testing pyramid**
  - Unit: `page-config` (parse/serialize/validate/lint) — the priority.
  - **Contract/golden**: round-trip real device files byte-for-byte.
  - Component: the key panel, quick-fills, color wheel (Testing Library).
  - E2E: import → edit → export happy paths (Playwright).
- **CI/CD** (GitHub Actions): typecheck → lint → unit/contract → build → e2e → docker build.
  A failing round-trip test **blocks merge**.
- **Quality gates**: strict `tsconfig`, ESLint + Prettier, `noUncheckedIndexedAccess`.
- **Contract enforcement**: the steering rule ("never change `page0.txt` structure/wording")
  becomes code — the serializer can only emit known keys in original order; a test proves it.
- **Observability** (if API): structured logs, health checks, Sentry (client + server).
- **Security**: no secrets in the client; validate/parse all imported files defensively; if the API
  is multi-user, add auth + per-user setups. USB writes remain a user-gesture in the browser.
- **Accessibility**: keyboard nav, focus states, contrast, ARIA on custom controls; audit with axe.
- **i18n**: English-only today, but keep strings in a catalog so CN (matching the manual) is easy later.
- **Docs**: ADRs for big decisions, OpenAPI for the API, Storybook for components, plus the existing
  `editer/docs.html` reference.

---

## 7. Domain-specific enterprise features (high value)

These are worth building because they're unique to this domain:

1. **Config linter** — encode the real bugs we've hit as rules:
   | Rule | Flags |
   |---|---|
   | Long-press page retrigger | page nav on `long#` (press-down) instead of `long_up#` |
   | Step overflow | more than 4 commands in a step, or commands beyond `keytimes` |
   | Select-group sanity | `select` with `keytimes > 1`; mixed select groups on a page |
   | Channel mismatch | QC/SYN commands whose channel ≠ the configured device channel |
   | Color format | non-`0xRRGGBB` values |
   | Unknown key/section | anything outside the firmware contract |
2. **Version history & diff** — see exactly what changed between saves of a page.
3. **Device profiles** — support other MIDI Captain models from data.
4. **Preset/template library & sharing** — reusable page layouts.
5. **Whole-folder backup/restore** of `D:\supersetup`.

---

## 8. Migration plan (incremental, low-risk)

1. **Extract `page-config`** with round-trip tests over real files. No UI change. *(started)*
2. **Stand up the SPA shell** (Vite + TS): navbar, page tabs, theme tokens.
3. **One data-driven key panel** replacing the 10× duplication, wired to `page-config`.
4. **State store** for pages/active/undo; port import/export to use the core.
5. **Port features** (quick-fills, color wheel, swap, channel detection, badges) as components.
6. **Optional API + DB** behind a feature flag (history/lint), `docker-compose`.
7. **Cut over & delete** the monolith `editer.html` once parity + tests are green.

Each step ships independently; the old editor keeps working until step 7.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Breaking the firmware format | Byte-exact round-trip tests gate every change |
| Big-bang rewrite stalls | Strict incremental steps; monolith stays live until parity |
| Losing quirky formatting on export | Format-preserving document model (edit values only) |
| Scope creep into a server app | Backend is optional and feature-flagged; local-first is the default |
| No local Node | Run core tests in a `node:20` container |

---

## 10. What to do first (ROI order)

1. **Finish `page-config`** (parser/serializer + round-trip tests). Highest ROI, zero UI risk.
2. Add the **config linter** rules to it (immediate user value: catches real bugs).
3. Scaffold the **SPA** and the **single key panel** to kill the duplication.
4. Introduce the **state store** + undo/redo.
5. Only then, if desired, add the **Docker API + DB** for history/sharing.
