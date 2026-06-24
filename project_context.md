# SEMOSS Platform Context

This application is built **inside the SEMOSS platform** — it is not a standalone web app deployed to a browser directly. Understanding this distinction is essential before writing any code.

---

## What is SEMOSS?

SEMOSS is a Java-based data analytics and AI platform served as a WAR on Apache Tomcat. Users interact with it through the SEMOSS web UI (the "monolith"), which hosts project apps inside **iframes**. Your app runs sandboxed within that iframe — it has no direct access to the host page, cannot use standard browser history routing, and communicates with the backend exclusively through the SEMOSS SDK.

---

## Pixel — The SEMOSS Query Language

**Pixel** is SEMOSS's custom scripting language for executing backend logic. It maps named function calls to Java classes called **Reactors**.

```pixel
MyResult = MyReactor(param1=["value"], param2=[42]);
```

- Each `FunctionName(...)` maps to a Java class named `FunctionNameReactor`
- Parameters are always passed as key-value pairs with list-style values `[...]`
- Operations can be chained with `|` (pipe) for dataflow
- Scripts run server-side inside an **Insight** (a scoped execution session)

Pixel is the only way the frontend talks to the backend. There are no REST calls to custom endpoints — everything goes through Pixel.

---

## Reactors — Backend Logic Units

Reactors are Java classes (`extends AbstractProjectReactor`) that handle all backend computation: database queries, data transformation, AI calls, file I/O, etc.

- Live in `java/src/reactors/`
- Declare inputs via `keysToGet` / `keyRequired` arrays
- Execute logic in `doExecute()` (not `execute()` — the base class handles setup)
- Return `new NounMetadata(result, PixelDataType.MAP)` (or other data types)
- Invoked from the frontend by name without the "Reactor" suffix: `GetSystemDetails(...)` calls `GetSystemDetailsReactor.java`

---

## Frontend ↔ Backend Interaction

The frontend is a **React + Vite** app bootstrapped with the `@semoss/sdk` package. All backend calls use:

```typescript
const { actions } = useInsight();

// Call a Java reactor
const result = await actions.run('MyReactor(param=["value"])');

// Check for errors
if (result[0].operationType.includes("ERROR")) { /* handle */ }

// Extract output
const data = result[0].output;
```

- `actions.run(pixelString)` — sends Pixel to the SEMOSS backend and returns the result
- `useInsight().isInitialized` — must be `true` before any SDK call; gate all data loads on this
- `useInsight().tool` — available when the app is launched as an MCP tool; carries `tool.parameters`
- Routing **must** use `createHashRouter()` — hash-based routes (`/#/path`) because the app is served inside an iframe

---

## Project Structure

```
assets/
  client/          # React app (source)
  java/
    src/reactors/  # Java reactor classes
  py/
    mcp_driver.py  # Python MCP tools (optional)
  mcp/             # Auto-generated manifests — never edit directly
  portals/         # Built frontend output — never edit directly
  classes/         # Compiled Java — never edit directly
```

Build and publish workflow:
1. `pnpm build` in `client/` → outputs to `portals/`
2. Maven build compiles Java → outputs to `classes/`
3. Publish through the SEMOSS UI to make changes live

---

## Key Rules for Agents

- **No standalone deployment** — the app only runs inside SEMOSS; don't design for direct browser hosting
- **No custom REST endpoints** — all backend communication is Pixel via `actions.run()`
- **Hash routing only** — `/#/route`, never `/route`
- **Gate on `isInitialized`** — never call SDK methods before the insight is ready
- **Reactors own all data access** — frontend never queries databases directly
- **Don't edit generated files** — `mcp/*.json`, `portals/`, `classes/`, `target/` are outputs
- **Manifests are regenerated via Pixel** — run `MakePixelMCP(...)` or `MakePythonMCP()` in SEMOSS Playground after changing reactor or Python tool signatures
