# TAP App V1 — Developer Guide

The single authoritative reference for contributors extending the React UI, adding Java reactors, wiring MCP tools, or maintaining the build for TAP App V1.

This guide covers everything: repository layout, environment setup, the architectural constraints, "how do I add a…" patterns, the full reactor catalog with SPARQL and response shapes, the RDF data model, and the do-not-do list. The companion [USER_GUIDE.md](USER_GUIDE.md) covers what the application does from an analyst's perspective — read it once if you don't yet have a mental model of the three pages.

---

## Table of Contents

1. [What You Are Working On](#1-what-you-are-working-on)
2. [Repository Layout](#2-repository-layout)
3. [Tech Stack at a Glance](#3-tech-stack-at-a-glance)
4. [Local Development Setup](#4-local-development-setup)
5. [Architecture and the Constraints](#5-architecture-and-the-constraints)
6. [Adding to the React UI](#6-adding-to-the-react-ui)
7. [Adding a Java Reactor](#7-adding-a-java-reactor)
8. [Adding a Python MCP Tool](#8-adding-a-python-mcp-tool)
9. [Build, Publish, Verify](#9-build-publish-verify)
10. [Java Utility Classes](#10-java-utility-classes)
11. [Reactor Reference](#11-reactor-reference)
12. [Data Model Reference](#12-data-model-reference)
13. [Anti-Patterns — Do Not Do This](#13-anti-patterns--do-not-do-this)
14. [Glossary](#14-glossary)

---

## 1. What You Are Working On

TAP App V1 is a SEMOSS-hosted analytics app over the Military Health System (MHS) systems portfolio. It is **read-only** over a single RDF triplestore (`TAP_Core_Data`) and surfaces three interactive visualizations:

- **Capability Group Overview** (default landing page) — bubble chart of capability groups + per-group similarity sidebar.
- **System Network Map** — searchable directory + force-directed graph of a focal system's data exchanges.
- **Data Flow Impact Analyzer** (a.k.a. Removal Impact) — per-system Authoritative-Data-Source, CRM data objects, and first-order inbound/outbound connection report.

There is no write path back to the graph, no first-party auth (all auth is delegated to SEMOSS), and no Python production code today. See [USER_GUIDE.md](USER_GUIDE.md) for end-user behavior and [../../_bmad-output/project-knowledge/project-overview.md](../../_bmad-output/project-knowledge/project-overview.md) for the project's brownfield context.

---

## 2. Repository Layout

### Top-level vs `assets/`

> **`assets/` is the source tree.** The Git repository sits inside `assets/`. The top-level `client/`, `java/`, `py/` directories that may appear outside `assets/` are mirrors or scaffolding from an earlier setup. **All authoritative source paths in this guide reference `assets/...`** — investigate carefully before editing anything outside that folder.

### Tour of `assets/`

```
assets/
├── AGENTS.md              SEMOSS MCP template patterns (canonical for MCP work)
├── CLAUDE.md              Identical content to AGENTS.md for Claude-based agents
├── pom.xml                Maven config for the Java reactor module
│
├── docs/                  Human-authored documentation (this folder)
│   ├── DEVELOPER_GUIDE.md   ← you are here (authoritative dev reference)
│   └── USER_GUIDE.md        Analyst-facing user guide
│
├── client/                React + Vite + Tailwind v4 + shadcn/ui frontend
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── components.json    shadcn/ui CLI config (style=new-york)
│   └── src/
│       ├── index.tsx      createRoot → <App />
│       ├── App.tsx        Env.update + InsightProvider + Router + Toaster
│       ├── pages/         Route-level components + Router.tsx + InitializedLayout
│       ├── components/    Feature components (graphs, sidebars, panels)
│       ├── components/ui/ shadcn primitives — do not put business logic here
│       ├── lib/           Domain utilities (subgraph reduction, overlap scoring)
│       ├── types/         Shared TypeScript types
│       └── index.css      Tailwind v4 theme tokens
│
├── java/                  Java reactor module
│   ├── project.properties   databaseId for the TAP_Core_Data engine
│   └── src/
│       ├── reactors/
│       │   ├── AbstractProjectReactor.java   Base class — lifecycle + error wrapping
│       │   └── networkOfSystems/             The seven production reactors
│       └── util/
│           ├── ProjectProperties.java        Singleton config loader
│           ├── QueryExecutor.java            SPARQL SELECT wrapper
│           ├── SimilarityFunctions.java      Pair-similarity scoring helpers
│           ├── SimilarityChartingUtils.java  Bucket aggregation
│           ├── Constants.java                Currently empty placeholder
│           └── HelperMethods.java            Currently empty placeholder
│
├── py/
│   └── mcp_driver.py      Template-only Python MCP tools (replace as needed)
│
├── mcp/                   GENERATED — do not hand-edit
│   ├── pixel_mcp.json     Produced by MakePixelMCP() in SEMOSS Playground
│   └── py_mcp.json        Produced by MakePythonMCP() in SEMOSS Playground
│
├── portals/               GENERATED — Vite production build output
├── classes/               GENERATED — mvn compile output
└── target/                GENERATED — Maven scratch space
```

### Generated artifact directories (never hand-edit)

| Path | Produced by |
|---|---|
| [../portals/](../portals/) | `pnpm build` in [../client/](../client/) |
| [../classes/](../classes/) | `mvn compile` in [../](../) |
| [../target/](../target/) | Maven |
| [../mcp/pixel_mcp.json](../mcp/pixel_mcp.json) | `MakePixelMCP()` in SEMOSS Playground |
| [../mcp/py_mcp.json](../mcp/py_mcp.json) | `MakePythonMCP()` in SEMOSS Playground |

Treat any commit that hand-edits a file in one of these directories as suspect.

---

## 3. Tech Stack at a Glance

| Surface | Stack | Manifest |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind v4 + shadcn/ui + D3 + `@semoss/sdk` + `react-router-dom` (hash) | [../client/package.json](../client/package.json) |
| Backend | Java 21 + Maven + SEMOSS runtime (`prerna.*`, scope=`provided`) | [../pom.xml](../pom.xml) |
| Python MCP | CPython runtime supplied by SEMOSS; `smssutil` decorator injection | [../py/mcp_driver.py](../py/mcp_driver.py) |
| Data | RDF triplestore (engine id `133db94b-4371-4763-bff9-edf7e5ed021b`) under the TAP Core Data ontology; SPARQL SELECT only | [../java/project.properties](../java/project.properties) |

The exhaustive version table — SDK beta version, Radix primitives, sonner, lucide-react, the shadcn style, Maven plugin versions — lives in [../../_bmad-output/project-knowledge/tech-stack.md](../../_bmad-output/project-knowledge/tech-stack.md). Consult it before bumping any dependency.

**Notable absences:** no automated test framework (no Vitest, JUnit, pytest), no CI/CD pipeline (no GitHub Actions, GitLab CI, Jenkinsfile), no ESLint or Prettier config, no state-management library. Verification is currently manual — see [§9](#9-build-publish-verify).

---

## 4. Local Development Setup

### Prerequisites

- **Node.js** with `pnpm` installed globally.
- **Java 21** (matches the Maven compiler source/target).
- **Maven**.
- Access to a SEMOSS instance and an App ID you can publish into.

### Frontend environment file

Create [../client/.env.local](../client/.env.local) (gitignored):

```
APP=your-app-id
MODULE=/your/semoss/module/path
ENDPOINT=https://your.semoss.host
VITE_ACCESS_KEY=local-dev-only
VITE_SECRET_KEY=local-dev-only
```

How these are consumed:

| Variable | Purpose | Where it lands |
|---|---|---|
| `APP` | SEMOSS App ID | `Env.update({ APP })` in [../client/src/App.tsx](../client/src/App.tsx) |
| `MODULE` | Path prefix that Vite proxies to `ENDPOINT` in dev | [../client/vite.config.ts](../client/vite.config.ts) dev-server proxy |
| `ENDPOINT` | SEMOSS backend base URL (dev only) | [../client/vite.config.ts](../client/vite.config.ts) dev-server proxy target |
| `VITE_ACCESS_KEY` / `VITE_SECRET_KEY` | SEMOSS credentials for local dev | `Env.update(...)` — **must never be set in production** |

Vite reads these from the project root (`envDir: "../"`), not from `src/`. The full configuration walkthrough is in [../../_bmad-output/project-knowledge/config-and-env.md](../../_bmad-output/project-knowledge/config-and-env.md).

> **Secrets:** `.env.local` is gitignored. Never commit it. In production environments the SEMOSS session supplies credentials — the two `VITE_*` keys should not be present.

### First-time setup

From [../client/](../client/):

```
pnpm i
```

From [../](../) (where `pom.xml` lives):

```
mvn clean compile
```

If a `package.json` exists at the [../](../) root as well, run `pnpm i` there too — [AGENTS.md](../AGENTS.md) calls this out for template apps.

### Day-to-day

```
pnpm dev      # in assets/client/  — Vite dev server with proxy
```

The dev server proxies requests under `MODULE` to `ENDPOINT` so the local React app can call a remote SEMOSS backend.

---

## 5. Architecture and the Constraints

### The four boundaries

```
┌───────────────────────────────────────────────────────────────────┐
│                    SEMOSS Insight (host iframe)                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  React app (assets/portals/, built from assets/client/)     │  │
│  └────────────────────────────┬────────────────────────────────┘  │
│                               │ Pixel commands via actions.run()  │
│                               ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  SEMOSS Pixel runtime  (resolves reactor names → classes)   │  │
│  └────┬──────────────────────────────────────────────────┬─────┘  │
│       │                                                  │        │
│       ▼ reactor invocation                               ▼ MCP    │
│  ┌─────────────────────────┐                  ┌─────────────────┐ │
│  │  Java reactors          │                  │  Python MCP     │ │
│  │  assets/java/src/       │                  │  assets/py/     │ │
│  │  reactors/networkOfSys/ │                  │  mcp_driver.py  │ │
│  └────────────┬────────────┘                  │  (template now) │ │
│               │ SPARQL via QueryExecutor      └─────────────────┘ │
│               ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  RDF database engine (TAP_Core_Data, id 133db94b-…)         │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

Three boundaries you cannot break and one transport you must always honor:

1. **Frontend ↔ SEMOSS SDK.** The app must be wrapped in `<InsightProvider>` ([../client/src/App.tsx](../client/src/App.tsx)). Routes are nested inside `InitializedLayout` ([../client/src/pages/layouts/InitializedLayout.tsx](../client/src/pages/layouts/InitializedLayout.tsx)) so nothing renders until `useInsight().isInitialized === true`. Any component that calls `actions.run(...)` before initialization will throw.
2. **SEMOSS Pixel ↔ Java reactors.** Every backend call goes through `actions.run("ReactorName(param=...)")`. Reactor names drop the `Reactor` suffix in the Pixel string. User-supplied text must be `JSON.stringify(...)`'d for quote safety. Errors surface as `pixelReturn[0].operationType.includes("ERROR")`.
3. **Java reactor ↔ RDF engine.** Reactors extend `AbstractProjectReactor` ([../java/src/reactors/AbstractProjectReactor.java](../java/src/reactors/AbstractProjectReactor.java)) and execute SPARQL only through `util.QueryExecutor(engineId).executeSelect(...)` ([../java/src/util/QueryExecutor.java](../java/src/util/QueryExecutor.java)). No HTTP, no file I/O outside config loading.
4. **Hash routing only.** The app runs inside a SEMOSS iframe. Use `createHashRouter(...)` ([../client/src/pages/Router.tsx](../client/src/pages/Router.tsx)). Browser-history routing breaks deep links and SEMOSS embedding.

The deeper boundary-by-boundary walkthrough lives in [../../_bmad-output/project-knowledge/architecture.md](../../_bmad-output/project-knowledge/architecture.md).

### Inviolable rules — read these before you change anything

These contradict either intuition, older docs in the workspace, or naïve assumptions. Verify them against source before assuming otherwise.

1. **`assets/` is the source tree.** Top-level `client/`, `java/`, `py/` outside `assets/` are mirrors/scaffolding — investigate before editing.
2. **No tests exist.** Do not invent a `pnpm test`, `mvn test`, or `pytest` step. State plainly that verification is currently manual.
3. **No CI/CD exists.** Build and publish are manual. There is no `.github/workflows/`, no `Jenkinsfile`, no `.gitlab-ci.yml`.
4. **[../py/mcp_driver.py](../py/mcp_driver.py) is template-only.** The Fahrenheit/Celsius converters are placeholders. Python is available scaffolding, not a production surface today.
5. **The `database=[...]` Pixel parameter is mostly ignored.** Engine resolution happens through `ProjectProperties.getInstance().getDatabaseId()` reading [../java/project.properties](../java/project.properties). Frontend code still passes it for convention. The **one exception** is `GetCapabilityGroupSimilarity`, which honors a non-empty value and only falls back to `ProjectProperties` when the parameter is missing or blank. Do not imply the engine is selectable per call elsewhere.
6. **Three SPARQL filters are baked in and inviolable.** Every new reactor must honor them — copy them from existing reactors:
   - `?System rdf:type ActiveSystem` — inactive systems are invisible to the app.
   - `?SystemInterface Phase LifeCycle/Supported` — retired interfaces never form edges.
   - `?provide Contains/CRM ?crm . FILTER(?crm = 'C' || ?crm = 'M')` — only Creator (`C`) and Modifier (`M`) provide-edges count for provider analysis; Reference (`R`) is ignored.
7. **No global state library.** React `useState` + `useMemo` only. Cross-page coordination uses `react-router-dom`'s `location.state` exclusively. Do not introduce Redux, Zustand, Jotai, MobX, or a Context-based store as a casual addition.
8. **Hash routing is mandatory** (see boundary 4 above). `createHashRouter`, never `createBrowserRouter`.
9. **Reactor names omit the `Reactor` suffix in Pixel calls.** `GetCapabilityGroupsReactor` is invoked as `GetCapabilityGroups()`.
10. **`organizeKeys()` appears twice — that's intentional in this project.** `AbstractProjectReactor.preExecute()` calls it, and the convention in each subclass's `doExecute()` also calls it defensively. Mirror what every reactor in [../java/src/reactors/networkOfSystems/](../java/src/reactors/networkOfSystems/) does. Do not "fix" this in examples. (Note: [AGENTS.md](../AGENTS.md) gives different advice for new template apps — for *this* project, follow what the existing reactors do.)
11. **There is no error boundary beyond the router's `ErrorPage`** ([../client/src/pages/ErrorPage.tsx](../client/src/pages/ErrorPage.tsx)). Reactor errors surface inline per page (typically `sonner` toasts). Do not document a centralized error-handling layer that doesn't exist.
12. **`actions.runMCPTool()` is deprecated.** Use `actions.run('RunMCPTool(tool=["tool_name"], param=...)')` to invoke Python MCP tools. This is the single most common foot-gun in the codebase.

---

## 6. Adding to the React UI

### Adding a new page

1. Create the component under [../client/src/pages/](../client/src/pages/) using PascalCase (e.g. `MyNewPage.tsx`).
2. Register the route in [../client/src/pages/Router.tsx](../client/src/pages/Router.tsx). The route must be a child of `InitializedLayout`:
   ```tsx
   {
     Component: InitializedLayout,
     ErrorBoundary: ErrorPage,
     children: [
       { index: true, Component: HomePage },
       { path: "system-network", Component: SystemNetworkPage },
       { path: "removal-impact", Component: RemovalImpactPage },
       { path: "my-new-page", Component: MyNewPage },   // ← add here
     ],
   }
   ```
3. If the page should appear in the top nav, update [../client/src/components/MainNavigation.tsx](../client/src/components/MainNavigation.tsx).
4. Export it from [../client/src/pages/index.ts](../client/src/pages/index.ts) if you use the barrel.

### Adding a new component

- Place feature components under [../client/src/components/](../client/src/components/) (PascalCase).
- Keep low-level shadcn primitives in [../client/src/components/ui/](../client/src/components/ui/). **Never put business logic in `components/ui/`** — it is reserved for shadcn primitives generated/maintained via the shadcn CLI.
- Use the `@/` path alias (configured in [../client/vite.config.ts](../client/vite.config.ts) and [../client/tsconfig.json](../client/tsconfig.json)) for imports across the app — prefer it over deep relative paths.
- Theme tokens are CSS variables in [../client/src/index.css](../client/src/index.css). Tailwind v4 reads them as the source of truth.

The full component inventory is in [../../_bmad-output/project-knowledge/ui-component-inventory.md](../../_bmad-output/project-knowledge/ui-component-inventory.md).

### Calling a reactor

The canonical pattern, mirrored from every production page:

```tsx
import { useInsight } from "@semoss/sdk/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const { actions, isInitialized, insightId } = useInsight();
const [rawData, setRawData] = useState<MyResponse | null>(null);

useEffect(() => {
  if (!isInitialized || !insightId) return;

  let cancelled = false;
  (async () => {
    const pixel = `GetSystemDetails(database=[${JSON.stringify(DB_ID)}], system=[${JSON.stringify(systemUri)}])`;
    const { pixelReturn } = await actions.run(pixel);
    if (cancelled) return;

    const result = pixelReturn[0];
    if (result.operationType.includes("ERROR")) {
      toast.error("Failed to load system details");
      return;
    }
    setRawData(result.output as MyResponse);
  })();

  return () => { cancelled = true; };
}, [isInitialized, insightId, systemUri]);
```

Key rules:

- **Gate every reactor call on `isInitialized && insightId`.** The SDK is asynchronous — calls before initialization throw.
- **Drop the `Reactor` suffix in the Pixel string** (`GetSystemDetails`, not `GetSystemDetailsReactor`).
- **JSON-stringify any user-supplied text** to handle quotes, brackets, and special characters.
- **Check `pixelReturn[0].operationType.includes("ERROR")`** before reading `output`.
- **Replace state wholesale** (`setRawData(response)`). Never mutate reactor response state in place — derived state via `useMemo` depends on object identity.

For working examples, mirror these specific files:

| Pattern | Mirror this file |
|---|---|
| Page with one mount-time fetch + memoized derivation | [../client/src/pages/SystemNetworkPage.tsx](../client/src/pages/SystemNetworkPage.tsx) |
| Page that triggers N parallel fetches | [../client/src/pages/SystemInspectionPage.tsx](../client/src/pages/SystemInspectionPage.tsx) + [../client/src/lib/groupOverlap.ts](../client/src/lib/groupOverlap.ts) |
| Page with a per-selection background fetch | [../client/src/pages/RemovalImpactPage.tsx](../client/src/pages/RemovalImpactPage.tsx) |
| Tripartite-to-direct graph reduction | [../client/src/lib/systemSubgraph.ts](../client/src/lib/systemSubgraph.ts) |

### State management — no globals; `location.state` for cross-page

Every page follows the same shape:

```
useEffect (gated on isInitialized + insightId)
   └─> actions.run("ReactorName(...)") → setState(rawResponse)

useMemo (depends on rawResponse + user interaction state)
   └─> derive view-model (subgraph, sort order, classification)

render: pure function of (rawResponse, userInteractionState, derivedViewModel)
```

The raw reactor response is the single source of truth per page. Derived state is recomputed on demand via `useMemo` — no caching layer, no normalization. Heavy client-side computation (BFS degree expansion, group overlap) lives in [../client/src/lib/](../client/src/lib/) and is wrapped in `useMemo` with explicit dependency arrays.

Cross-page coordination uses the `location.state` protocol:

```ts
type CrossPageState = {
  systemUri:    string;   // URI of the system to auto-select on arrival
  systemLabel:  string;   // Display name for breadcrumbs / back arrows
  returnGroup?: string;   // (optional) capability group URI to restore on back navigation
};
```

`SystemNetworkPage` and `RemovalImpactPage` both read this on mount and auto-select. The `returnGroup` field round-trips the user back to the originally zoomed capability group when they press Back. See [../../_bmad-output/project-knowledge/state-management.md](../../_bmad-output/project-knowledge/state-management.md) for the full per-page state contracts.

### Per-page component map

Which components each page composes, and which reactors back them:

| Page | Key components | Reactors used |
|---|---|---|
| [SystemInspectionPage.tsx](../client/src/pages/SystemInspectionPage.tsx) (rendered at `/` via [HomePage.tsx](../client/src/pages/HomePage.tsx)) | [CapabilityBubbleGraph](../client/src/components/CapabilityBubbleGraph.tsx), [CapabilityGroupSidebar](../client/src/components/CapabilityGroupSidebar.tsx), [SystemInspectionPanel](../client/src/components/SystemInspectionPanel.tsx) | `GetCapabilityGroups` (once on mount), `GetSystemDetails` (on system click + ×N for overlap), `GetSystemsByConcept` (on concept click), `GetCapabilityGroupSimilarity` (on group zoom-in) |
| [SystemNetworkPage.tsx](../client/src/pages/SystemNetworkPage.tsx) at `/system-network` | [NetworkGraph](../client/src/components/NetworkGraph.tsx), [SystemGraphSidebar](../client/src/components/SystemGraphSidebar.tsx), [EdgeDetailSidebar](../client/src/components/EdgeDetailSidebar.tsx) | `GetSystemNetwork` (once on mount) |
| [RemovalImpactPage.tsx](../client/src/pages/RemovalImpactPage.tsx) at `/removal-impact` | inline directory + impact-report panels | `GetActiveSystems` (once on mount), `GetDataFlowImpact` (per selection) |

---

## 7. Adding a Java Reactor

### The subclass contract

Every reactor extends `AbstractProjectReactor` and follows the pattern below. Mirror [GetActiveSystemsReactor.java](../java/src/reactors/networkOfSystems/GetActiveSystemsReactor.java) (no params), [GetSystemDetailsReactor.java](../java/src/reactors/networkOfSystems/GetSystemDetailsReactor.java) (required param), or [GetCapabilityGroupsReactor.java](../java/src/reactors/networkOfSystems/GetCapabilityGroupsReactor.java) (optional param + branching).

```java
package reactors.networkOfSystems;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import prerna.sablecc2.om.PixelDataType;
import prerna.sablecc2.om.nounmeta.NounMetadata;

import reactors.AbstractProjectReactor;
import util.ProjectProperties;
import util.QueryExecutor;

public class GetMyThingReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(GetMyThingReactor.class);

  private static final String SYSTEM_KEY = "system";

  public GetMyThingReactor() {
    this.keysToGet   = new String[] { SYSTEM_KEY };
    this.keyRequired = new int[]    { 1 };   // 1 = required, 0 = optional
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();   // mirror existing reactors — see Inviolable Rule #10
    String engineId = ProjectProperties.getInstance().getDatabaseId();
    String systemUri = this.keyValue.get(SYSTEM_KEY);
    LOGGER.info("GetMyThing: engine=" + engineId + " system=" + systemUri);

    String sparql = ""
      + "SELECT DISTINCT ?Thing WHERE { "
      + "  ?System <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "
      + "          <http://semoss.org/ontologies/Concept/ActiveSystem> . "
      + "  FILTER(STR(?System) = \"" + systemUri + "\") . "
      + "  /* ... */ "
      + "} ";

    List<Map<String, String>> rows = new QueryExecutor(engineId).executeSelect(sparql);

    Map<String, Object> out = new HashMap<>();
    // ... shape rows into the response map ...
    return new NounMetadata(out, PixelDataType.MAP);
  }

  // Error return pattern (used inside doExecute):
  //   return NounMetadata.getErrorNounMessage("description");

  @Override
  public String getReactorDescription() {
    return "One-sentence description of what this reactor returns.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (SYSTEM_KEY.equals(key)) return "URI of the focal ActiveSystem.";
    return null;
  }
}
```

Notes on the boilerplate:

- **`keysToGet` + `keyRequired`** define the Pixel parameters. The arrays must be the same length. Use `1` for required, `0` for optional.
- **`organizeKeys()`** is called by `preExecute()` *and* in `doExecute()`. Mirror existing reactors — see Inviolable Rule #10.
- **Engine resolution** is `ProjectProperties.getInstance().getDatabaseId()`. The `database=[...]` Pixel parameter is conventional but ignored by every reactor except `GetCapabilityGroupSimilarity`.
- **Return shape** is `new NounMetadata(map, PixelDataType.MAP)`. SEMOSS serializes the map to JSON.
- **Errors** use `NounMetadata.getErrorNounMessage("...")` from inside `doExecute`. Any thrown exception is caught and wrapped by `AbstractProjectReactor.execute()`.
- **`getReactorDescription()` and `getDescriptionForKey(String)`** feed the MCP manifest generator. Implement both — the manifest is unusable without them.
- **Label extraction convention** — the existing reactors define `extractLabel(String uri)` as `uri.substring(uri.lastIndexOf('/') + 1).replace('_', ' ')`. Mirror that.
- **Logging** — every reactor logs `LOGGER.info("ReactorName: engine=" + engineId + ...)` on entry. Use `LOGGER.warn(...)` for missing optional fields or non-fatal query failures, and `LOGGER.error(...)` for query execution errors.

### Honor the three baked-in SPARQL filters

Every new reactor that touches systems, interfaces, or provider analysis **must** honor:

1. `?System rdf:type <http://semoss.org/ontologies/Concept/ActiveSystem>` — never query un-`ActiveSystem` systems.
2. `?SystemInterface <…/Relation/Phase> <…/Concept/LifeCycle/Supported>` on any interface-traversing query.
3. `?provide <…/Relation/Contains/CRM> ?crm . FILTER(?crm = "C" || ?crm = "M")` on any provider-determination query.

Copy these clauses from a neighboring reactor rather than re-deriving them.

### Heavier reactor patterns

For batched SPARQL + complex result shaping, mirror [GetDataFlowImpactReactor.java](../java/src/reactors/networkOfSystems/GetDataFlowImpactReactor.java) — it runs four phased queries (ADS status → CRM data objects → outbound → inbound) and assembles the response on the Java side.

For pair-similarity scoring with BINDINGS-scoped queries, mirror [GetCapabilityGroupSimilarityReactor.java](../java/src/reactors/networkOfSystems/GetCapabilityGroupSimilarityReactor.java) plus the helpers in [SimilarityFunctions.java](../java/src/util/SimilarityFunctions.java) and [SimilarityChartingUtils.java](../java/src/util/SimilarityChartingUtils.java).

### Querying multiple engines

If a reactor needs to query more than one engine, add the additional engine IDs to [../java/project.properties](../java/project.properties), expose getters on `ProjectProperties`, and instantiate one `QueryExecutor` per engine:

```java
QueryExecutor base      = new QueryExecutor(ProjectProperties.getInstance().getDatabaseId());
QueryExecutor secondary = new QueryExecutor(ProjectProperties.getInstance().getSecondaryEngineId());
List<Map<String, String>> rows1 = base.executeSelect(query1);
List<Map<String, String>> rows2 = secondary.executeSelect(query2);
```

Today the project only uses one engine, but the wrapper supports as many as needed.

### Register the reactor

After the class compiles, tell the user to regenerate the Java MCP manifest in SEMOSS Playground (see [§9](#9-build-publish-verify)):

```
MakePixelMCP();
```

This reads each reactor class's `getReactorDescription()` and `getDescriptionForKey()` results and rewrites [../mcp/pixel_mcp.json](../mcp/pixel_mcp.json). **Do not hand-edit the manifest.** The agent must not run this command itself — it is a Pixel command that must execute in the Playground.

---

## 8. Adding a Python MCP Tool

> **Today's state:** [../py/mcp_driver.py](../py/mcp_driver.py) is template-only. Production data work currently happens in Java reactors. The instructions below describe how to extend Python MCP when you need it.

### Tool definition

Define every tool in [../py/mcp_driver.py](../py/mcp_driver.py) — SEMOSS only scans that single file for `@mcp_metadata`-decorated functions.

```python
import json
from smssutil import mcp_metadata

@mcp_metadata({
    "execution": "auto",          # "ask" | "auto" | "disabled"
    "displayLocation": "inline",  # "inline" | "sidebar" | "none"
    "loadingMessage": "Computing my thing...",
    # omit "resourceURI" to use the auto-generated Playground UI
})
def my_tool(param_one: float, param_two: str) -> str:
    """One-line docstring becomes the MCP tool description."""
    result = {"value": param_one * 2, "label": param_two}
    return json.dumps(result)
```

Rules:

- Every tool needs `@mcp_metadata({...})`. The `smssutil` import is auto-injected by the SEMOSS runtime.
- **Use type hints on every parameter.** They become required MCP parameters and drive the auto-generated UI.
- The tool **title** is parsed from the function name; the **description** is parsed from the docstring.
- **Return JSON strings.** The MCP tooling expects serialized JSON.
- `ROOT` is injected by SEMOSS for file-path access. For LLM calls, use `ModelEngine` from `ai_server` and always accept `model_id` as a parameter.

### Metadata options

| Key | Values | Meaning |
|---|---|---|
| `execution` | `"ask"`, `"auto"`, `"disabled"` | Whether Playground auto-runs the tool or prompts the user |
| `displayLocation` | `"inline"`, `"sidebar"`, `"none"` | Where Playground renders the tool UI |
| `loadingMessage` | string | Message shown while the tool is executing |
| `resourceURI` | string (hash route, e.g. `/#/my-route`) | Path to a custom React UI; omit to use the auto-generated Playground UI |

### Default UI vs custom UI

Tools can use either the **default Playground UI** (auto-generated form per parameter) or a **custom React UI** routed under a hash path. Python tools tend to be simple and typically use the default UI — omit `resourceURI`. For custom UIs, the route must be hash-based (`/#/my-route`) because SEMOSS serves the app in an iframe.

### Calling a Python tool from React

```ts
await actions.run(
  `RunMCPTool(tool=["my_tool"], param=${JSON.stringify({ param_one: 21, param_two: "hello" })})`
);
```

> **Do not use `actions.runMCPTool()`** — it is the deprecated SDK method. `actions.run('RunMCPTool(...)')` is the correct call. The two have confusingly similar names but `actions.runMCPTool()` also auto-sends the response to Playground, which is almost never what you want.

### Register the tool

Tell the user to run in SEMOSS Playground:

```
MakePythonMCP();
```

This reads `@mcp_metadata` decorators from [../py/mcp_driver.py](../py/mcp_driver.py) and rewrites [../mcp/py_mcp.json](../mcp/py_mcp.json). Same rule as the Java side — never hand-edit the manifest, and the agent must not run the command itself.

### React UIs that consume a tool's invocation context

When Playground invokes a tool with a custom React UI, the SDK provides:

- `tool.parameters` — prepopulated inputs (use this; **not** `tool.inputs`).
- `tool.tool_response` — prior execution's result, if any.
- `tool.executedParameters` — parameters from the prior execution.

To send the result back to Playground:

```ts
await actions.sendMCPResponseToPlayground(JSON.stringify(result), "success", { param });
```

Call it directly — the SDK handles tool-name matching. Do not wrap it with custom matching logic.

---

## 9. Build, Publish, Verify

There is no CI/CD pipeline. All build and publish operations are manual, either from a local dev machine or from the SEMOSS UI.

### Frontend

From [../client/](../client/):

```
pnpm i
pnpm build      # vite build → outputs to assets/portals/
```

[../portals/](../portals/) is the folder SEMOSS serves as the published app. After building, publish via the SEMOSS UI (it picks up the contents of `portals/`). The output directory is configured in [../client/vite.config.ts](../client/vite.config.ts) as `build.outDir = "../../portals"` with `emptyOutDir: true`.

### Backend (Java reactors)

From [../](../) (where [../pom.xml](../pom.xml) lives):

```
mvn clean compile
```

Output goes to [../classes/](../classes/). SEMOSS loads the compiled `.class` files at runtime. The SEMOSS UI also exposes a build button that runs the same Maven compile — use it in environments without local Maven.

### MCP manifests — regenerate, never hand-edit

After any reactor or Python tool change, the corresponding manifest must be regenerated. Tell the user (or run in SEMOSS Playground):

```
MakePixelMCP();     // regenerates assets/mcp/pixel_mcp.json
MakePythonMCP();    // regenerates assets/mcp/py_mcp.json
```

To register a reactor with custom UI metadata, pass it through:

```
MakePixelMCP(
  reactor=["GetDataFlowImpact"],
  mcpMetadata=[{
    "SMSS_MCP_UI": { "displayLocation": "sidebar", "resourceURI": "/#/removal-impact" },
    "SMSS_MCP_EXECUTION": "ask"
  }]
);
```

> **The agent must not run `MakePixelMCP()` / `MakePythonMCP()` itself** — those are Pixel commands that execute in the SEMOSS Playground runtime. The agent's role is to instruct the user to run them after any reactor or tool change.

### End-to-end release flow

When changes touch multiple surfaces:

```
1. Edit frontend code under assets/client/src/
   └─> pnpm build  (writes assets/portals/)

2. Edit / add Java reactors under assets/java/src/reactors/
   └─> mvn clean compile  (writes assets/classes/)
   └─> Tell user: run MakePixelMCP() in SEMOSS Playground

3. Edit assets/py/mcp_driver.py (if Python tools change)
   └─> Tell user: run MakePythonMCP() in SEMOSS Playground

4. Verify in SEMOSS:
   - Browse to the app — confirm the new build is served
   - Check Playground tool listings (if MCP manifests changed)
   - Smoke-test changed reactors via the appropriate page
```

### Manual verification checklist

No automated suite exists. Walk this checklist for every change:

**Frontend changes**

1. `pnpm dev` in [../client/](../client/) — confirm Vite serves with no compile errors.
2. Browser console — no SDK errors during init or first reactor call.
3. Exercise the affected page end-to-end.
4. `pnpm build` succeeds and writes to [../portals/](../portals/).

**Java reactor changes**

1. `mvn clean compile` in [../](../) — no compile errors.
2. In SEMOSS Playground, invoke the reactor directly via the Pixel REPL: e.g. `GetSystemDetails(system=["..."])`. Inspect the JSON response shape.
3. Run `MakePixelMCP()` in Playground — confirm the reactor appears (or is updated) in [../mcp/pixel_mcp.json](../mcp/pixel_mcp.json).
4. Exercise the reactor through the consuming UI page.

**Python MCP changes**

1. Confirm `@mcp_metadata` decorator is present and parameters have type hints.
2. Run `MakePythonMCP()` in Playground — confirm the tool appears in [../mcp/py_mcp.json](../mcp/py_mcp.json).
3. Invoke the tool from Playground UI and verify the response.

**MCP manifest verification**

After any reactor or Python tool change, confirm the corresponding JSON in [../mcp/](../mcp/) was regenerated and the tool surfaces correctly in Playground's tool listing.

### Git hygiene

[../.gitignore](../.gitignore) covers the standard ignored set. Notably:

- `.env.local` and other secret files **must** remain gitignored.
- The generated directories ([../portals/](../portals/), [../classes/](../classes/), [../target/](../target/), [../mcp/*.json](../mcp/)) are typically committed so SEMOSS can serve them without a rebuild. Verify project convention before changing this.

Any future test framework (Vitest for frontend, JUnit for reactors) or CI/CD adoption should go through a proper PRD/architecture cycle.

---

## 10. Java Utility Classes

All reactor-shared helpers live in [../java/src/util/](../java/src/util/). Four are real; two are placeholders.

### `project.properties`

One RDF engine UUID is configured in [../java/project.properties](../java/project.properties):

| Key | Engine | Role |
|---|---|---|
| `databaseId` | `TAP_Core_Data` | Base SPARQL graph for all system, interface, data object, and capability queries |

Current value:

```properties
databaseId=133db94b-4371-4763-bff9-edf7e5ed021b
```

> **Process-scoped singleton.** `ProjectProperties` is loaded once via `ProjectProperties.getInstance(projectId)` in `AbstractProjectReactor.preExecute()` and never invalidated. **If the engine ID changes in `project.properties`, the SEMOSS process must be restarted.**

### `ProjectProperties`

Singleton in [../java/src/util/ProjectProperties.java](../java/src/util/ProjectProperties.java) that loads `project.properties` from disk on first access.

**Initialization.** Called in `AbstractProjectReactor.preExecute()` via `ProjectProperties.getInstance(projectId)`. Path is resolved as `AssetUtility.getProjectAssetsFolder(projectId) + "/java/project.properties"`.

**Exposes:**

- `getDatabaseId()` — returns the TAP_Core_Data engine UUID.

**Error behavior.** If the file is missing, the internal `INSTANCE` stays `null` and calling the no-arg `getInstance()` later throws `RuntimeException`. Always reach the singleton from inside a reactor `doExecute()` (where `preExecute()` has already initialized it) — never from a static initializer.

### `QueryExecutor`

Thin wrapper in [../java/src/util/QueryExecutor.java](../java/src/util/QueryExecutor.java) around SEMOSS's `WrapperManager.getRawWrapper()` for SPARQL SELECT queries. The **only** sanctioned way to query the RDF engine from a reactor.

**Construction:**

```java
new QueryExecutor(engineId)
```

Resolves the engine UUID via `MasterDatabaseUtility.testDatabaseIdIfAlias(...)` then fetches the underlying `IDatabaseEngine` via `Utility.getDatabase(...)`. Throws `IllegalArgumentException` if the engine cannot be resolved.

**Primary method:**

```java
List<Map<String, String>> executeSelect(String query)
```

Each map in the returned list represents one result row, keyed by SPARQL variable name (e.g. `"System"`, `"Interface"`, `"DataObject"`). Returns an empty list if the query produces no results.

**Value resolution.** Values are returned as-is from the SPARQL engine — URIs are verbatim (e.g. `http://health.mil/ontologies/Concept/System/AHLTA`) and literals include any datatype or language annotations. Strip wrapping quotes and underscores in the caller using `formatLiteralText`-style helpers (defined as private methods in the reactors that need them).

**Also exposes:**

- `getEngine()` — returns the underlying `IDatabaseEngine`.
- `getEngineId()` — returns the resolved engine UUID.

### `SimilarityFunctions` and `SimilarityChartingUtils`

Helpers used exclusively by [GetCapabilityGroupSimilarityReactor.java](../java/src/reactors/networkOfSystems/GetCapabilityGroupSimilarityReactor.java).

- [`SimilarityFunctions`](../java/src/util/SimilarityFunctions.java) — exposes `compareObjectParameterScore(engineId, sparql, mode)` for set-overlap buckets and `stringCompareBinaryResultGetter(engineId, sparql, optionA, optionB, both)` for literal-comparison buckets (used for the Environment bucket).
- [`SimilarityChartingUtils`](../java/src/util/SimilarityChartingUtils.java) — `processHashForCharting(rawMap, keyHash, ...)` folds each bucket's raw pair scores into the directional `pairs[]` shape returned by the reactor.

### `Constants` and `HelperMethods` (placeholders)

Both files in [../java/src/util/](../java/src/util/) are currently empty scaffolding. All constants (RDF type URIs, predicate URIs, base namespace) and helpers are defined as `private static final` fields or private methods inside each reactor class. If any become shared across multiple reactors, move them here rather than duplicating.

Prime candidates for promotion to `HelperMethods`:

- `extractLabel(String uri)` — substring after the last `/`, underscores replaced with spaces.
- `formatLiteralText(String value)` — strips wrapping quotes, replaces underscores with spaces, collapses whitespace.
- `normalizeCrm(String rawCrm)` — strips quotes and whitespace, returns canonical `"C"` or `"M"` (or `null` if unrecognized).

---

## 11. Reactor Reference

The seven production reactors. All live under `reactors.networkOfSystems`, are invoked through `actions.run("ReactorName(...)")` (the `Reactor` suffix is dropped in the Pixel string), and route their SPARQL through `util.QueryExecutor`.

### `GetActiveSystems`

**Source:** [GetActiveSystemsReactor.java](../java/src/reactors/networkOfSystems/GetActiveSystemsReactor.java)

**Purpose:** Returns every system typed as `ActiveSystem`, unfiltered by interface connectivity or payload. Used to populate directory lists that should show all active systems regardless of data-flow participation (e.g. the Removal Impact page's left rail).

**Pixel call:**

```
GetActiveSystems();
```

**Parameters:** none.

**SPARQL:**

```sparql
SELECT DISTINCT ?System WHERE {
  ?System <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <http://semoss.org/ontologies/Concept/ActiveSystem>
} ORDER BY ?System
```

**Response:**

```json
{
  "systems": [
    { "uri": "http://health.mil/ontologies/Concept/System/AHLTA",       "label": "AHLTA" },
    { "uri": "http://health.mil/ontologies/Concept/System/CHCS",        "label": "CHCS" },
    { "uri": "http://health.mil/ontologies/Concept/System/MHS_GENESIS", "label": "MHS GENESIS" }
  ]
}
```

Labels are derived from the URI local name (substring after the last `/`) with underscores replaced by spaces. Results are sorted alphabetically by label.

---

### `GetCapabilityGroups`

**Source:** [GetCapabilityGroupsReactor.java](../java/src/reactors/networkOfSystems/GetCapabilityGroupsReactor.java)

**Purpose:** Returns capability groups (or capabilities) each with the list of systems that support them. Backs the bubble chart on the Capability Group Overview page.

**Pixel call:**

```
GetCapabilityGroups();                         // default mode = capabilityGroup
GetCapabilityGroups(mode=["capabilityGroup"]);
GetCapabilityGroups(mode=["capability"]);
```

**Parameters:**

| Name | Required | Type | Allowed values | Default |
|---|---|---|---|---|
| `mode` | no | string | `"capabilityGroup"`, `"capability"` | `"capabilityGroup"` |

**Execution flow.** Two stages:

**Stage 1 — query groups and systems.** In `capabilityGroup` mode:

```sparql
SELECT DISTINCT ?CapabilityGroup ?System WHERE {
  ?CapabilityGroup <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
                   <http://semoss.org/ontologies/Concept/CapabilityGroup> .
  ?System          <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
                   <http://semoss.org/ontologies/Concept/ActiveSystem> .
  ?System          <http://semoss.org/ontologies/Relation/Supports> ?CapabilityGroup .
} ORDER BY ?CapabilityGroup ?System
```

In `capability` mode, `CapabilityGroup` is replaced with `Capability`.

**Stage 2 — fetch descriptions.** For each group/capability, a follow-up query fetches its `Contains/Description`:

```sparql
SELECT DISTINCT ?Description WHERE {
  <groupUri> <http://semoss.org/ontologies/Relation/Contains/Description> ?Description .
}
```

**Response:**

```json
{
  "mode": "capabilityGroup",
  "capabilityGroups": [
    {
      "uri": "http://semoss.org/ontologies/Concept/CapabilityGroup/Personnel_Services",
      "label": "Personnel Services",
      "description": "Personnel management and staffing",
      "systems": [
        { "uri": "http://health.mil/ontologies/Concept/System/AHLTA", "label": "AHLTA" },
        { "uri": "http://health.mil/ontologies/Concept/System/CHCS",  "label": "CHCS" }
      ]
    }
  ]
}
```

---

### `GetSystemDetails`

**Source:** [GetSystemDetailsReactor.java](../java/src/reactors/networkOfSystems/GetSystemDetailsReactor.java)

**Purpose:** Retrieves all attribute categories for a single system (data objects, interfaces, environment, transactional status, business processes, activities, user types, plus description / disposition / owner metadata). Used by the System Inspection Panel and by capability-group overlap analysis (called once per system in the group).

**Pixel call:**

```
GetSystemDetails(
  database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
  system=["http://health.mil/ontologies/Concept/System/AHLTA"]
);
```

**Parameters:**

| Name | Required | Type | Notes |
|---|---|---|---|
| `system` | yes | string (URI) | The target system URI |
| `database` | conventional only | string | Passed by frontend but not read by the reactor — engine ID comes from `ProjectProperties` |

**Execution flow — 11 phased queries:**

**Q1 — data objects provided.** Uses `rdfs:subPropertyOf` to capture every concrete specialization of `Provide`:

```sparql
SELECT DISTINCT ?Data WHERE {
  ?Data    <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
           <http://semoss.org/ontologies/Concept/DataObject> .
  ?Provide <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
           <http://semoss.org/ontologies/Relation/Provide> .
  <systemUri> ?Provide ?Data .
}
```

**Q2 / Q3 — interfaces (provider and consumer).** Outgoing interfaces (this system provides):

```sparql
SELECT DISTINCT ?Interface WHERE {
  ?Interface <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
             <http://semoss.org/ontologies/Concept/SystemInterface> .
  <systemUri> <http://semoss.org/ontologies/Relation/Provide> ?Interface .
  ?Interface  <http://semoss.org/ontologies/Relation/Phase>
              <http://health.mil/ontologies/Concept/LifeCycle/Supported> .
}
```

Incoming interfaces (this system consumes from) flip `Provide` for `Consume`. For each returned interface, a nested query finds the connected system and the data objects on that interface.

**Q4–Q11 — scalar and multi-valued attributes:**

| Query | Property | Result field |
|---|---|---|
| Q4 | `Contains/GarrisonTheater` | `environment` (Theater / Garrison / Both) |
| Q5 | `Contains/Transactional` | `transactional` |
| Q6 | `Supports` → `BusinessProcess` | `businessProcesses` |
| Q7 | `Supports` → `Activity` | `activities` |
| Q8 | `UsedBy` → `Personnel` | `userTypes` |
| Q9 | `Contains/Description` | `description` |
| Q10 | `Contains/Disposition` | `disposition` |
| Q11 | `OwnedBy` → `SystemOwner` | `owner` |

**Response:**

```json
{
  "systemUri": "http://health.mil/ontologies/Concept/System/AHLTA",
  "systemName": "AHLTA",
  "dataObjects": [
    { "uri": "http://health.mil/ontologies/Concept/DataObject/Admissions", "label": "Admissions" }
  ],
  "interfaces": [
    {
      "uri": "http://health.mil/ontologies/Concept/SystemInterface/IFC_X",
      "label": "IFC X",
      "role": "provider",
      "connectedSystem": "CHCS",
      "connectedSystemUri": "http://health.mil/ontologies/Concept/System/CHCS",
      "dataObjects": [
        { "uri": "http://health.mil/ontologies/Concept/DataObject/Admissions", "label": "Admissions" }
      ]
    }
  ],
  "environment": "Theater",
  "transactional": "Yes",
  "businessProcesses": [
    { "uri": "http://health.mil/ontologies/Concept/BusinessProcess/Scheduling", "label": "Scheduling" }
  ],
  "activities": [
    { "uri": "http://health.mil/ontologies/Concept/Activity/Appointment", "label": "Appointment" }
  ],
  "userTypes": [
    { "uri": "http://health.mil/ontologies/Concept/Personnel/Clinician", "label": "Clinician" }
  ],
  "description": "Electronic health record system",
  "disposition": "Active",
  "owner": "MHS Director"
}
```

---

### `GetSystemNetwork`

**Source:** [GetSystemNetworkReactor.java](../java/src/reactors/networkOfSystems/GetSystemNetworkReactor.java)

**Purpose:** Returns the full tripartite system network (System / Interface / DataObject nodes + Provide / Consume / Payload edges). Only interfaces carrying at least one DataObject are included — systems connected solely through data-less interfaces are excluded. Backs the System Network Map page and the Removal Impact page's directory listing.

**Pixel call:**

```
GetSystemNetwork(database=["133db94b-4371-4763-bff9-edf7e5ed021b"]);
```

**Parameters:** none required by reactor (engine ID from `ProjectProperties`).

**Execution flow — three stages.** The `?anyData` and `?anyCapGroup` triples in stages 1 and 2 act as existence filters, excluding data-less interfaces and systems with no recorded capabilities.

**Stage 1 — Systems → Interfaces (Provide):**

```sparql
SELECT DISTINCT ?System ?Interface WHERE {
  ?System    <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
             <http://semoss.org/ontologies/Concept/ActiveSystem> .
  ?Interface <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
             <http://semoss.org/ontologies/Concept/SystemInterface> .
  ?System    <http://semoss.org/ontologies/Relation/Provide>  ?Interface .
  ?Interface <http://semoss.org/ontologies/Relation/Payload>  ?anyData .
  ?System    <http://semoss.org/ontologies/Relation/Supports> ?anyCapGroup .
} ORDER BY ?System
```

**Stage 2 — Interfaces → Systems (Consume):**

```sparql
SELECT DISTINCT ?Interface ?System WHERE {
  ?Interface <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
             <http://semoss.org/ontologies/Concept/SystemInterface> .
  ?System    <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
             <http://semoss.org/ontologies/Concept/ActiveSystem> .
  ?Interface <http://semoss.org/ontologies/Relation/Consume>  ?System .
  ?Interface <http://semoss.org/ontologies/Relation/Payload>  ?anyData .
  ?System    <http://semoss.org/ontologies/Relation/Supports> ?anyCapGroup .
} ORDER BY ?Interface
```

**Stage 3 — Interfaces → DataObjects (Payload):**

```sparql
SELECT DISTINCT ?Interface ?DataObj WHERE {
  ?Interface <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
             <http://semoss.org/ontologies/Concept/SystemInterface> .
  ?Interface <http://semoss.org/ontologies/Relation/Payload> ?DataObj .
} ORDER BY ?Interface
```

Only data objects connected to interfaces that passed Stages 1 and 2 are included; client-side deduplication runs via the reactor's `nodeMap`. Edges are deduplicated by generated ID (`sourceUri||targetUri`).

**Response:**

```json
{
  "nodes": [
    { "uri": "http://health.mil/ontologies/Concept/System/AHLTA",          "label": "AHLTA",      "type": "System"     },
    { "uri": "http://health.mil/ontologies/Concept/SystemInterface/IFC_X", "label": "IFC X",      "type": "Interface"  },
    { "uri": "http://health.mil/ontologies/Concept/DataObject/Admissions", "label": "Admissions", "type": "DataObject" }
  ],
  "edges": [
    { "id": ".../System/AHLTA||.../SystemInterface/IFC_X",       "sourceUri": ".../System/AHLTA",          "targetUri": ".../SystemInterface/IFC_X", "edgeType": "provide" },
    { "id": ".../SystemInterface/IFC_X||.../System/CHCS",        "sourceUri": ".../SystemInterface/IFC_X", "targetUri": ".../System/CHCS",            "edgeType": "consume" },
    { "id": ".../SystemInterface/IFC_X||.../DataObject/Admissions", "sourceUri": ".../SystemInterface/IFC_X", "targetUri": ".../DataObject/Admissions", "edgeType": "carries" }
  ]
}
```

**Frontend transform:** the raw tripartite shape is reduced to a direct system-to-system graph by [../client/src/lib/systemSubgraph.ts](../client/src/lib/systemSubgraph.ts) (`computeSubgraph(rawData, systemUri, degree)`). Degree expansion is pure client-side computation — the full tripartite graph is fetched once and re-traversed via BFS on every slider tick.

---

### `GetSystemsByConcept`

**Source:** [GetSystemsByConceptReactor.java](../java/src/reactors/networkOfSystems/GetSystemsByConceptReactor.java)

**Purpose:** For a given concept URI (typically an Activity or BusinessProcess), return every system that `Supports` it. Triggered when a user clicks a concept item in the System Inspection Panel to find peers.

**Pixel call:**

```
GetSystemsByConcept(
  database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
  concept=["http://health.mil/ontologies/Concept/Activity/Scheduling"]
);
```

**Parameters:**

| Name | Required | Type | Notes |
|---|---|---|---|
| `concept` | yes | string (URI) | Activity or BusinessProcess URI |
| `database` | conventional only | string | Passed by frontend but not read by the reactor |

**SPARQL:**

```sparql
SELECT DISTINCT ?System WHERE {
  ?System <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <http://semoss.org/ontologies/Concept/System> .
  ?System <http://semoss.org/ontologies/Relation/Supports> <conceptUri> .
} ORDER BY ?System
```

**Response:**

```json
{
  "conceptUri":   "http://health.mil/ontologies/Concept/Activity/Scheduling",
  "conceptLabel": "Scheduling",
  "systems": [
    { "uri": "http://health.mil/ontologies/Concept/System/AHLTA", "label": "AHLTA" },
    { "uri": "http://health.mil/ontologies/Concept/System/CHCS",  "label": "CHCS" }
  ]
}
```

---

### `GetDataFlowImpact`

**Source:** [GetDataFlowImpactReactor.java](../java/src/reactors/networkOfSystems/GetDataFlowImpactReactor.java)

**Purpose:** For a single system, return its Authoritative Data Source (ADS) status, the data objects it creates or modifies, and its first-order outbound and inbound data connections through supported interfaces. Backs the Data Flow Impact Analyzer (Removal Impact) page.

> **Important:** Despite the page name, this reactor is **not** a what-if simulator. It does not remove the system from the graph, does not classify peers as `soleProvider` / `criticalRelay` / `nonCritical`, and does not run BFS isolation analysis. It is a current-state reporter built on four direct SPARQL queries. (An earlier implementation did the what-if analysis; that contract has been replaced. The legacy client-side helper at [../client/src/lib/dataFlowImpact.ts](../client/src/lib/dataFlowImpact.ts) is now an empty placeholder — do not import it.)

**Pixel call:**

```
GetDataFlowImpact(
  database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
  system=["http://health.mil/ontologies/Concept/System/AHLTA"]
);
```

**Parameters:**

| Name | Required | Type | Notes |
|---|---|---|---|
| `system` | yes | string (URI) | The target system URI |
| `database` | yes | string | Engine ID; read directly by the reactor (`this.keyValue.get("database")`) |

**Execution flow — four phased queries.**

**Q1 — ADS status.** Uses UNION to handle `ADS_Indicator` stored on either the `Has` edge or the `Data_Subject_Area` node directly:

```sparql
SELECT DISTINCT ?area WHERE {
  ?has <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
       <http://semoss.org/ontologies/Relation/Has> .
  <systemUri> ?has ?area .
  ?area <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
        <http://semoss.org/ontologies/Concept/Data_Subject_Area> .
  {
    ?has <http://semoss.org/ontologies/Relation/Contains/ADS_Indicator> ?adsIndicator .
  } UNION {
    ?area <http://semoss.org/ontologies/Relation/Contains/ADS_Indicator> ?adsIndicator .
  }
  FILTER(?adsIndicator = 'Yes')
}
```

**Q2 — CRM data objects.** Data objects for which this system is an authoritative originator:

```sparql
SELECT DISTINCT ?Data ?crm WHERE {
  ?provide <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
           <http://semoss.org/ontologies/Relation/Provide> .
  <systemUri> ?provide ?Data .
  ?Data    <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
           <http://semoss.org/ontologies/Concept/DataObject> .
  ?provide <http://semoss.org/ontologies/Relation/Contains/CRM> ?crm .
  FILTER(?crm = 'C' || ?crm = 'M')
}
```

**Q3 — outbound connections.** First-order targets via supported interfaces, grouped by target system:

```sparql
SELECT DISTINCT ?icd ?targetSystem ?dataObject WHERE {
  ?icd <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
       <http://semoss.org/ontologies/Concept/SystemInterface> .
  <systemUri> <http://semoss.org/ontologies/Relation/Provide> ?icd .
  FILTER NOT EXISTS {
    ?icd <http://semoss.org/ontologies/Relation/Phase>
         <http://health.mil/ontologies/Concept/LifeCycle/Retired_(Not_Supported)>
  }
  ?icd          <http://semoss.org/ontologies/Relation/Consume> ?targetSystem .
  ?targetSystem <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
                <http://semoss.org/ontologies/Concept/ActiveSystem> .
  FILTER(?targetSystem != <systemUri>)
  ?icd        <http://semoss.org/ontologies/Relation/Payload> ?dataObject .
  ?dataObject <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
              <http://semoss.org/ontologies/Concept/DataObject> .
}
```

**Q4 — inbound connections.** Reverses the Q3 pattern — sources reached by `ActiveSystem → Provide → SystemInterface → Consume → <selectedSystem>` — and groups by source system:

```sparql
SELECT DISTINCT ?icd ?sourceSystem ?dataObject WHERE {
  ?icd <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
       <http://semoss.org/ontologies/Concept/SystemInterface> .
  ?sourceSystem <http://semoss.org/ontologies/Relation/Provide>  ?icd .
  ?icd          <http://semoss.org/ontologies/Relation/Consume>  <systemUri> .
  FILTER NOT EXISTS {
    ?icd <http://semoss.org/ontologies/Relation/Phase>
         <http://health.mil/ontologies/Concept/LifeCycle/Retired_(Not_Supported)>
  }
  ?sourceSystem <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
                <http://semoss.org/ontologies/Concept/ActiveSystem> .
  FILTER(?sourceSystem != <systemUri>)
  ?icd        <http://semoss.org/ontologies/Relation/Payload> ?dataObject .
  ?dataObject <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
              <http://semoss.org/ontologies/Concept/DataObject> .
}
```

Both Q3 and Q4 results are grouped by peer system, merging data objects from multiple interfaces into a single connection entry. Data objects are deduplicated within each peer. Each list is sorted alphabetically by the peer system's label.

**Response:**

```json
{
  "systemUri": "http://health.mil/ontologies/Concept/System/AHLTA",
  "systemName": "AHLTA",
  "isAuthoritativeDataSource": true,
  "dataSubjectAreas": [
    { "uri": "http://health.mil/ontologies/Concept/Data_Subject_Area/Clinical", "label": "Clinical" }
  ],
  "crmDataObjects": [
    { "uri": "http://health.mil/ontologies/Concept/DataObject/Encounter",  "label": "Encounter",  "crm": "C" },
    { "uri": "http://health.mil/ontologies/Concept/DataObject/Medication", "label": "Medication", "crm": "M" }
  ],
  "outboundConnections": [
    {
      "targetSystemUri": "http://health.mil/ontologies/Concept/System/CHCS",
      "targetSystemLabel": "CHCS",
      "dataObjects": [
        { "uri": "http://health.mil/ontologies/Concept/DataObject/Lab_Result", "label": "Lab Result" }
      ]
    }
  ],
  "inboundConnections": [
    {
      "sourceSystemUri": "http://health.mil/ontologies/Concept/System/MHS_GENESIS",
      "sourceSystemLabel": "MHS GENESIS",
      "dataObjects": [
        { "uri": "http://health.mil/ontologies/Concept/DataObject/Encounter", "label": "Encounter" }
      ]
    }
  ]
}
```

**Field semantics:**

| Field | Meaning |
|---|---|
| `isAuthoritativeDataSource` | `true` if the system is recognized as an ADS for at least one Data Subject Area. |
| `dataSubjectAreas[]` | Distinct DSAs for which the system is the ADS. Empty when `isAuthoritativeDataSource` is `false`. |
| `crmDataObjects[].crm` | `"C"` = Creator, `"M"` = Modifier (Reference `R` is filtered out). |
| `outboundConnections[]` | First-order targets reached via `System → Provide → SystemInterface → Consume → ActiveSystem` over supported interfaces only. Grouped by target system. |
| `inboundConnections[]` | First-order sources reached by reversing the same pattern. Grouped by source system. |

Frontend transform: none. [RemovalImpactPage.tsx](../client/src/pages/RemovalImpactPage.tsx) consumes the `SystemImpactReactorResponse` directly.

---

### `GetCapabilityGroupSimilarity`

**Source:** [GetCapabilityGroupSimilarityReactor.java](../java/src/reactors/networkOfSystems/GetCapabilityGroupSimilarityReactor.java)

**Purpose:** Compute pairwise system similarity for an arbitrary set of system URIs (typically the systems inside a zoomed-in capability group on the Capability Group Overview page). Powers the right-side similarity readout in [CapabilityGroupSidebar.tsx](../client/src/components/CapabilityGroupSidebar.tsx). Six similarity buckets are computed independently and combined into a directional summary score.

**Pixel call:**

```
GetCapabilityGroupSimilarity(
  systemList=["http://health.mil/ontologies/Concept/System/A",
              "http://health.mil/ontologies/Concept/System/B"],
  database=["133db94b-4371-4763-bff9-edf7e5ed021b"]   // optional; defaults to ProjectProperties
);
```

**Parameters:**

| Name | Required | Type | Notes |
|---|---|---|---|
| `systemList` | yes | string[] (URIs) | Must contain **at least 2** system URIs. Duplicates and blanks are stripped. Returns a constant-string error message if fewer than 2 valid URIs remain. |
| `database` | no | string | If empty/missing, the reactor falls back to `ProjectProperties.getInstance().getDatabaseId()`. **This is the one reactor in the codebase that honors `database=[...]` from the frontend.** |

**Execution flow.** The reactor builds a `BINDINGS ?System { … }` clause from `systemList` and appends it to six independent bucket queries (cost is proportional to the size of the supplied set, not the full system count). The shape of each bucket query is identical — only the joined predicate and the projected variable differ:

```sparql
SELECT DISTINCT ?System ?<BucketTarget> WHERE {
  { ?System         <rdf:type> <http://semoss.org/ontologies/Concept/System> }
  { ?<BucketTarget> <rdf:type> <http://semoss.org/ontologies/Concept/<BucketTargetClass>> }
  { ?System         <…/Relation/<JoinPredicate>> ?<BucketTarget> }
  { ?System         ?UsedBy ?SystemUser }
}
BINDINGS ?System { (<uriA>) (<uriB>) … }
```

The six buckets:

| Bucket key | Built from | Scoring helper |
|---|---|---|
| `Business_Processes_Supported` | `System → Supports → BusinessProcess` | `SimilarityFunctions.compareObjectParameterScore` |
| `Activities_Supported` | `System → Supports → Activity` | `SimilarityFunctions.compareObjectParameterScore` |
| `Data_Subject_Area` | `System →(Provide subproperty)→ DataObject` | `SimilarityFunctions.compareObjectParameterScore` |
| `Environment` | `System → Contains/GarrisonTheater → "Theater"\|"Garrison"\|"Both"` literal | `SimilarityFunctions.stringCompareBinaryResultGetter` |
| `User_Types` | `System → UsedBy → Personnel` | `SimilarityFunctions.compareObjectParameterScore` |
| `Interfaces` | `System →(Provide)→ SystemInterface` ∪ `SystemInterface →(Consume)→ System` (UNION) | `SimilarityFunctions.compareObjectParameterScore` |

Each bucket's raw pair scores are folded into the response by `SimilarityChartingUtils.processHashForCharting(...)`.

**Response:**

```json
{
  "systems": ["http://.../System/A", "http://.../System/B"],
  "pairs": [
    {
      "system1Uri": "http://.../System/A",
      "system2Uri": "http://.../System/B",
      "direction": "forward",
      "summaryScore": 72.5,
      "categoryScores": {
        "Business_Processes_Supported": 80.0,
        "Activities_Supported":         75.0,
        "Data_Subject_Area":            60.0,
        "Environment":                  100.0,
        "User_Types":                   50.0,
        "Interfaces":                   70.0
      },
      "hasScore": true
    }
  ]
}
```

**Score semantics:**

- Each bucket score is in `[0, 100]`.
- `summaryScore` is the **arithmetic mean of the six bucket scores** when every bucket has a score (`hasScore = true`). If any bucket is missing for the pair, `summaryScore` is `null` and `hasScore` is `false`.
- Pairs are **directional**: both `(A, B)` and `(B, A)` appear in `pairs`; the reactor emits `direction: "forward"` on every entry, leaving asymmetric scoring to the caller to interpret. Self-pairs are not emitted.

**Frontend transform:** [CapabilityGroupSidebar.tsx](../client/src/components/CapabilityGroupSidebar.tsx) parses `pairs[]` into a `Map<pairKey, PairSimilarityResult>` keyed by `system1Uri + "::" + system2Uri`, with each bucket score clamped to `[0, 100]`. Pair keys are intentionally directional.

---

### Conventions across all reactors

- **Engine resolution** — every reactor except `GetCapabilityGroupSimilarity` resolves the engine from `ProjectProperties.getInstance().getDatabaseId()` regardless of the `database=[...]` parameter.
- **The three baked-in filters** apply globally: `?System rdf:type ActiveSystem`, `?SystemInterface Phase LifeCycle/Supported`, and the `CRM = 'C' || 'M'` filter on provider analysis.
- **URI label extraction** — labels are derived from the trailing segment of the URI (after the last `/`), with underscores replaced by spaces. See `extractLabel(...)` in each reactor.
- **Logging** — every reactor logs `LOGGER.info("ReactorName: engine=" + engineId + ...)` on entry. Errors propagate through `AbstractProjectReactor.execute()`'s try/catch.

---

## 12. Data Model Reference

The app reads from a single RDF triplestore (engine id `133db94b-4371-4763-bff9-edf7e5ed021b`) following the **TAP Core Data ontology**. There are no relational tables, no schema migrations, and no ORM. All access is SPARQL SELECT through [QueryExecutor.java](../java/src/util/QueryExecutor.java).

### Core vocabularies

| Prefix | Namespace | Used for |
|---|---|---|
| `rdf:` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` | `rdf:type` |
| `rdfs:` | `http://www.w3.org/2000/01/rdf-schema#` | `rdfs:subPropertyOf` |
| (SEMOSS base) | `http://semoss.org/ontologies` | All TAP concepts and most relations |
| (health) | `http://health.mil/ontologies` | System URIs and the `LifeCycle` taxonomy |

### Node types (RDF classes)

| Class URI suffix | Meaning | Used by |
|---|---|---|
| `Concept/System` | Any system (active or not) | `GetSystemsByConcept` |
| `Concept/ActiveSystem` | Currently operational systems. **All app-facing queries filter to this class.** | All reactors |
| `Concept/SystemInterface` | A directional data exchange channel (ICD) between systems | `GetSystemNetwork`, `GetDataFlowImpact`, `GetSystemDetails`, `GetCapabilityGroupSimilarity` |
| `Concept/DataObject` | A unit of data carried over an interface | `GetSystemDetails`, `GetSystemNetwork`, `GetDataFlowImpact`, `GetCapabilityGroupSimilarity` |
| `Concept/CapabilityGroup` | A top-level grouping of capabilities | `GetCapabilityGroups` (default mode) |
| `Concept/Capability` | A specific capability within a group | `GetCapabilityGroups` (`mode="capability"`) |
| `Concept/BusinessProcess` | A business process a system supports | `GetSystemDetails`, `GetSystemsByConcept`, `GetCapabilityGroupSimilarity` |
| `Concept/Activity` | A finer-grained activity a system supports | `GetSystemDetails`, `GetSystemsByConcept`, `GetCapabilityGroupSimilarity` |
| `Concept/Personnel` | A user type / role assigned to a system | `GetSystemDetails`, `GetCapabilityGroupSimilarity` |
| `Concept/SystemOwner` | Entity responsible for a system | `GetSystemDetails` |
| `Concept/Data_Subject_Area` | Categorization of data domains (for ADS designation) | `GetDataFlowImpact` |
| `Concept/LifeCycle` | Lifecycle phase node (e.g. `Supported`, `Retired_(Not_Supported)`) | `GetSystemNetwork`, `GetDataFlowImpact`, `GetSystemDetails` |

### Relations (RDF properties)

| Relation | Direction | Meaning | Where used |
|---|---|---|---|
| `Relation/Provide` (subproperty hierarchy) | `System → SystemInterface` *or* `System → DataObject` | System provides an interface or directly provides a data object | All flow queries |
| `Relation/Consume` (subproperty hierarchy) | `SystemInterface → System` | Interface delivers data to a system | All flow queries |
| `Relation/Payload` (subproperty hierarchy) | `SystemInterface → DataObject` | Interface carries this data object | `GetSystemNetwork`, `GetDataFlowImpact` |
| `Relation/Contains/CRM` | On `Provide` instances | Authoritativeness flag (`C` = Creator, `M` = Modifier, `R` = Reference). **App filters to `C` or `M`.** | `GetDataFlowImpact` (Q2) |
| `Relation/Contains/ADS_Indicator` | On `Has` instances or on `Data_Subject_Area` directly | `'Yes'` literal flags an ADS assignment | `GetDataFlowImpact` (Q1) |
| `Relation/Contains/GarrisonTheater` | `System → string` | Deployment env literal (`Theater` / `Garrison` / `Both`) | `GetSystemDetails`, `GetCapabilityGroupSimilarity` |
| `Relation/Contains/Transactional` | `System → string` | Whether the system is transactional (`Yes` / `No` / `Both`) | `GetSystemDetails` |
| `Relation/Contains/Description` | `System` / `CapabilityGroup → string` | Free-text description literal | `GetSystemDetails`, `GetCapabilityGroups` |
| `Relation/Contains/Disposition` | `System → string` | Current disposition (e.g. `Active`) | `GetSystemDetails` |
| `Relation/Supports` | `System → BusinessProcess` *or* `System → Activity` *or* `System → CapabilityGroup` | System supports a process, activity, or capability | `GetSystemDetails`, `GetSystemsByConcept`, `GetCapabilityGroups`, `GetCapabilityGroupSimilarity` |
| `Relation/UsedBy` | `System → Personnel` | System is used by a personnel/user type | `GetSystemDetails`, `GetCapabilityGroupSimilarity` |
| `Relation/Has` (subproperty hierarchy) | `System → Data_Subject_Area` | System is associated with a data subject area | `GetDataFlowImpact` (Q1) |
| `Relation/OwnedBy` | `System → SystemOwner` | System owner | `GetSystemDetails` |
| `Relation/Phase` | `SystemInterface → LifeCycle` | Lifecycle phase of the interface | All flow queries |

**Important pattern:** `Provide`, `Consume`, `Payload`, and `Has` are all queried via `rdfs:subPropertyOf` rather than as direct property URIs. Each is a parent relation with multiple concrete subproperties in the dataset.

### The tripartite flow pattern

The fundamental data-flow shape that the app traces:

```
ActiveSystem  --[Provide]-->  SystemInterface  --[Consume]-->  ActiveSystem
                                    │
                               [Payload]
                                    ▼
                               DataObject
```

A data flow exists from System A to System B for DataObject D when:

- A has a `Provide` edge to some `SystemInterface` I, **and**
- I has a `Consume` edge to B, **and**
- I has a `Payload` edge to D, **and**
- I has `Phase → LifeCycle/Supported`.

Both A and B must be `ActiveSystem`.

### Filters that apply globally

These filters are baked into the reactor SPARQL and shape every analysis the app produces. Bypassing any of them changes correctness silently.

1. **`?System rdf:type ActiveSystem`** — inactive systems are invisible.
2. **`?SystemInterface Phase LifeCycle/Supported`** — retired interfaces never form edges in flow analyses (`GetSystemNetwork`, `GetDataFlowImpact`, `GetSystemDetails`).
3. **`?provide Contains/CRM ?crm . FILTER(?crm = 'C' || ?crm = 'M')`** — only Creator/Modifier provide-edges count for provider analysis; Reference (`R`) is ignored.

### Capability group structure

```
CapabilityGroup ─[Supports]──> ActiveSystem
Capability      ─[Supports]──> ActiveSystem
```

`GetCapabilityGroups()` default mode returns CapabilityGroup → systems (flattening capabilities). Mode `"capability"` returns Capability → systems directly.

### Computed (non-RDF) layers

Some structures are produced by code rather than stored as triples:

| Structure | Where |
|---|---|
| Direct system-to-system aggregated edges | [../client/src/lib/systemSubgraph.ts](../client/src/lib/systemSubgraph.ts) (`buildSystemGraph`) |
| BFS subgraph at degree N | [../client/src/lib/systemSubgraph.ts](../client/src/lib/systemSubgraph.ts) (`computeSubgraph`) |
| Capability group overlap score | [../client/src/lib/groupOverlap.ts](../client/src/lib/groupOverlap.ts) (`computeOverlap`) — N parallel `GetSystemDetails` calls, then per-system shared/unique partition |
| ADS + CRM + Outbound + Inbound report | [GetDataFlowImpactReactor.java](../java/src/reactors/networkOfSystems/GetDataFlowImpactReactor.java) (server-side 4-phase SPARQL) |
| Pairwise similarity (6 buckets + summary mean) | [GetCapabilityGroupSimilarityReactor.java](../java/src/reactors/networkOfSystems/GetCapabilityGroupSimilarityReactor.java) via `util.SimilarityFunctions` + `util.SimilarityChartingUtils` |

### Frontend type definitions

| File | What it types |
|---|---|
| [../client/src/types/system.ts](../client/src/types/system.ts) | System, capability group, system-details types |
| [../client/src/types/graph.ts](../client/src/types/graph.ts) | `ProcessedNode`, `ProcessedEdge`, `DirectionBucket`, `InterfaceRecord`, `LegendEntry` |
| [../client/src/types/dataFlowImpact.ts](../client/src/types/dataFlowImpact.ts) | `DataSubjectArea`, `CrmDataObject`, `OutboundConnection`, `InboundConnection`, `SystemImpactReactorResponse` |

The authoritative OWL file is [../../external_reference_docs/db_specific/TAP_Core_Data_OWL.OWL](../../external_reference_docs/db_specific/TAP_Core_Data_OWL.OWL). Consult it only when extending the data model.

---

## 13. Anti-Patterns — Do Not Do This

| Anti-pattern | Correct alternative |
|---|---|
| `createBrowserRouter(...)` | `createHashRouter(...)` — see [Router.tsx](../client/src/pages/Router.tsx) |
| Mutating reactor response state in place | Wholesale replace via `setRawData(newResponse)` |
| Calling `actions.run(...)` before `isInitialized` | Gate every reactor call on `useInsight().isInitialized && insightId` |
| Hand-editing [../mcp/](../mcp/) `*.json` | Run `MakePixelMCP()` / `MakePythonMCP()` in Playground |
| Hand-editing [../portals/](../portals/), [../classes/](../classes/), [../target/](../target/) | These are generated — only `pnpm build` / `mvn compile` write here |
| `actions.runMCPTool('toolName', ...)` | `actions.run('RunMCPTool(tool=["toolName"], param=...)')` |
| `someModelResponse.toString()` in Java | Use reflection on `IModelEngine.ask()` results to call `getResponse()` |
| Accessing `tool.inputs` in React MCP UIs | Use `tool.parameters` |
| Including the `Reactor` suffix in Pixel calls | Drop the suffix: `GetSystemDetails(...)`, not `GetSystemDetailsReactor(...)` |
| Subclass `doExecute()` that omits `organizeKeys()` | Call `organizeKeys()` defensively at the top — mirror existing reactors (see Inviolable Rule #10) |
| Bypassing `ActiveSystem` / `Supported` / `CRM` filters in new SPARQL | All three are correctness-critical — copy them from a neighboring reactor |
| Wrapping `sendMCPResponseToPlayground()` with custom matching logic | Call it directly — the SDK handles tool-name matching |
| Introducing a global store (Redux, Zustand, Context) for cross-page coordination | Use `react-router-dom` `location.state`; any cross-cutting store is a PRD-level change |
| Putting business logic in [../client/src/components/ui/](../client/src/components/ui/) | That folder is reserved for shadcn primitives — put feature components in [../client/src/components/](../client/src/components/) |
| Importing the retired [../client/src/lib/dataFlowImpact.ts](../client/src/lib/dataFlowImpact.ts) helper | The reactor returns a fully shaped response; the helper is an empty placeholder |
| Committing secrets in `.env.local` | `.env.local` is gitignored and stays that way |

---

## 14. Glossary

Runtime and SDK terminology you'll encounter throughout this guide.

| Term | Meaning |
|---|---|
| **Pixel** | SEMOSS's command language. The frontend invokes backend logic by sending Pixel strings via `actions.run("ReactorName(...)")`. |
| **Reactor** | A Java class extending `AbstractProjectReactor` that handles one Pixel command. Reactor names omit the `Reactor` suffix when invoked from Pixel. |
| **NounMetadata** | Wrapper type SEMOSS uses to carry reactor return values back to the caller. Reactors return `new NounMetadata(map, PixelDataType.MAP)` on success, `NounMetadata.getErrorNounMessage("...")` on error. |
| **Insight** | A SEMOSS execution context. `useInsight()` is the SDK hook that exposes `actions`, `isInitialized`, `insightId`, and `tool`. |
| **InsightProvider** | The SDK React provider that initializes the insight context. The app root is wrapped in it inside [App.tsx](../client/src/App.tsx). |
| **Playground** | SEMOSS's LLM chat / tool harness. The destination for MCP tool registration and execution. |
| **MCP** | Model Context Protocol — the standard SEMOSS uses to expose reactors and Python tools as LLM-callable tools. Manifests live in [../mcp/](../mcp/). |
| **ICD** | Interface Control Document — in this domain, the formal specification of a `SystemInterface` data exchange. |
| **CRM** | Creator / Modifier / Reference flag on a system's relationship to a data object. Only `C` and `M` count for provider analysis; `R` is filtered out. |
| **ADS** | Authoritative Data Source — a system flagged as the canonical originator for one or more Data Subject Areas. Surfaced by `GetDataFlowImpact`. |
| **DSA** | Data Subject Area — categorization of data domains used for ADS designation. |
| **LifeCycle** | RDF node type for interface phase. The app's queries filter to `LifeCycle/Supported`; retired interfaces never form edges. |
| **ProjectProperties** | Singleton in [util/ProjectProperties.java](../java/src/util/ProjectProperties.java) that reads [../java/project.properties](../java/project.properties) (notably the `databaseId`). Process-scoped — config changes require a SEMOSS restart. |
| **QueryExecutor** | Thin wrapper in [util/QueryExecutor.java](../java/src/util/QueryExecutor.java) around SEMOSS's SPARQL SELECT path. The only sanctioned way to query the RDF engine from a reactor. |
| **useInsight** | The SDK React hook ([../client/src/App.tsx](../client/src/App.tsx) uses it indirectly via `InsightProvider`). All reactor calls must gate on `isInitialized`. |

---

## Further Reading

| When you need… | Read this |
|---|---|
| Page-by-page frontend deep-dive (layouts, components, interactions, flow summaries) | [../README.md](../README.md) |
| Analyst-facing UX walkthrough of the three pages | [USER_GUIDE.md](USER_GUIDE.md) |
| SEMOSS MCP template patterns (canonical SDK + reactor + Python rules) | [../AGENTS.md](../AGENTS.md) |
| AI-context knowledge library (architecture, entry points, API contracts, state, components, data, config, build, tech stack, overview) | [../../_bmad-output/project-knowledge/](../../_bmad-output/project-knowledge/) |
| Authoritative TAP RDF ontology | [../../external_reference_docs/db_specific/TAP_Core_Data_OWL.OWL](../../external_reference_docs/db_specific/TAP_Core_Data_OWL.OWL) |
