# System Removal Impact Analyzer

Visualizes the network of enterprise systems and analyzes what happens when a system is removed.

## What It Does

- **Capability View** — Bubble chart showing systems grouped by capability. Expand a group to see overlap analysis across shared business processes, activities, and data objects.
- **Network View** — Force-directed graph of system-to-system data flows. Select any system to explore its connections up to N degrees. Click edges to see the data objects and interfaces carried between systems.
- **Removal Impact View** — Select a system and get a tiered impact report: which data objects it solely provides, where it acts as a critical relay, and which downstream systems would lose data if it were removed.

Data source: RDF database — Systems, SystemInterfaces, DataObjects, CapabilityGroups, and their relationships. The target database is configured via `DATABASE_ID` constants in the frontend and reactor parameters.

---

## Project Structure

```
├── client/          React + Vite frontend (D3.js graphs, Tailwind v4, shadcn/ui)
├── java/            Java reactors (DB queries, impact analysis logic)
├── py/              Python MCP tools
├── mcp/             Auto-generated MCP manifests (do not edit)
├── portals/         Built frontend output (do not edit)
├── docs/            Additional documentation
└── pom.xml          Maven build config for Java
```

## Setup

### Prerequisites

- Node.js 18+ and [pnpm](https://pnpm.io/)
- Java 11+ (for reactor development)
- Access to a running SEMOSS instance with a compatible RDF database

### Frontend

```bash
cd client
pnpm i
```

Create `client/.env.local` with your app ID:

```
APP="your-app-id"
```

Then start the dev server:

```bash
pnpm dev
```

### Java Reactors

After editing `.java` files in `java/src/reactors/`, click **"Recompile reactors"** in the SEMOSS UI editor. Compiled output goes to `classes/` automatically.

See [java/README.md](java/README.md) for full reactor development details.

### Publishing

1. Run `pnpm build` in `client/` to produce the `portals/` output
2. In the SEMOSS UI editor, click **"Publish files"** to deploy to users

---

## Further Reading

- [client/README.md](client/README.md) — Frontend dev commands, patterns, and structure
- [java/README.md](java/README.md) — Reactor authoring, compiling, and MCP manifest generation
- [docs/system-network-map.md](docs/system-network-map.md) — System Network Map page architecture and data flow
- [docs/removal-impact.md](docs/removal-impact.md) — Removal Impact page architecture and data flow

