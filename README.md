# TAP App V1 — Developer Documentation

This README is the **living document** for all page-level documentation in the TAP App V1. Each page has its own section below. As new pages are built or updated, add their documentation here.

> **Contributing:** Add a new `---`-delimited section per page following the same structure (Purpose → What the Page Shows → Frontend Architecture → Backend → Flow Summary → Constraints). Keep the Table of Contents up to date.

---

## Table of Contents

1. [Capability Group Overview](#1-capability-group-overview)
2. [System Network Map](#2-system-network-map)
3. [Data Flow Impact Analyzer (System Removal Impact Page)](#3-data-flow-impact-analyzer--system-removal-impact-page)

---

# 1. Capability Group Overview

`client/src/pages/SystemInspectionPage.tsx` (rendered via `HomePage.tsx`)

The default landing page. Answers the question: *"For each capability group, which systems have the most overlap with other systems?"*

It shows all capability groups as an interactive bubble chart, lets users zoom into a group to analyze system redundancy, and allows clicking any system bubble to inspect its full attribute profile.

---

## Layout

Three layers that stack on top of each other as the user drills in:

1. **Bubble graph** (always present) — fills the available canvas
2. **Capability Group Sidebar** (right panel, slides in) — when a group bubble is zoomed into
3. **System Inspection Panel** (right panel, replaces or co-exists with sidebar) — when a system bubble is clicked

When a system is selected, the bubble graph shrinks to half-width to make room for the inspection panel.

---

## Data Sources

| Reactor | When Called | Purpose |
|---|---|---|
| `GetCapabilityGroups` | Once on mount | All capability groups and their member systems |
| `GetSystemDetails` | On system click | Full attribute profile of the selected system (7 data categories) |
| `GetSystemDetails` (×N) | When a group bubble is zoomed into | Details for every system in that group, for overlap analysis |
| `GetSystemsByConcept` | On concept click in the inspection panel | Other systems that share the same business process or activity |

---

## Bubble Graph (`CapabilityBubbleGraph`)

`client/src/components/CapabilityBubbleGraph.tsx`

A D3 zoomable circle-packing layout with two levels:

- **Level 0 (zoomed out)** — Each capability group is a large labeled circle. System circles are packed inside their group bubble. Groups are colored distinctly (15-color rotating palette).
- **Level 1 (zoomed in)** — Click a group bubble to zoom in on it. The selected group fills the canvas; individual system circles become large enough to interact with.

### Interactions

| Action | Result |
|---|---|
| Click a group bubble | Zoom into that group; opens the Capability Group Sidebar |
| Click the background (while zoomed in) | Zoom back out; closes the sidebar |
| Click a system circle | Selects the system; opens the System Inspection Panel |
| Hover a system circle | Shows a tooltip with the system name |

The graph re-renders on container resize (ResizeObserver). After a resize, the previously zoomed group is restored via the `focusedGroupUri` prop so the user's context is not lost.

---

## Capability Group Sidebar

`client/src/components/CapabilityGroupSidebar.tsx`

Opens on the right when a group bubble is zoomed into. Answers: *"Which systems in this group are most redundant with each other?"*

### What it shows

- **Stats bar** — count of systems, business processes, activities, and data objects across the whole group
- **Per-system overlap cards** — sorted descending by overlap score, one card per system

### Overlap Score

Computed by `computeOverlap()` in `client/src/lib/groupOverlap.ts`:

1. Fetch `GetSystemDetails` for every system in the group in parallel.
2. For each business process, activity, and data object, track which systems in the group cover it.
3. For each system system, partition its items into:
   - **Shared** — covered by ≥2 systems in the group
   - **Unique** — only this system covers it within the group
4. **Score** = `sharedItems.length / totalItems` (0–1). Higher score = more redundant with peers.

Systems are sorted descending by score. A score of 1.0 means every item this system covers is also covered by at least one other group member.

### Per-system card

Collapsed by default; click to expand. Shows:
- Overlap score
- **Shared items** (with colored kind badges: BP / Activity / Data Object)
- **Unique items** (same badge types)

### Navigation

Each system card has a "View Network" button that navigates to the [System Network Map](#2-system-network-map) with `location.state = { systemUri, systemLabel, returnGroup }`. The `returnGroup` carries the current group so pressing Back returns here with the same group still zoomed in.

---

## System Inspection Panel

`client/src/components/SystemInspectionPanel.tsx`

Opens when a system circle is clicked anywhere on the bubble graph. Displays all known attributes of the selected system across 7 tabs:

| Tab | Contents |
|---|---|
| **Data Objects** | Data objects this system provides |
| **Interfaces** | Interfaces (with provider/consumer role) |
| **Business Processes** | Business processes the system supports |
| **Activities** | Activities the system supports |
| **User Types** | Personnel/user types assigned to this system |
| **Environment** | Deployment environment (e.g. Theater / Garrison / Both) |
| **Transactional** | Whether the system is transactional |

---

# 2. System Network Map

`client/src/pages/SystemNetworkPage.tsx`

Shows how systems are connected through their data flows. Select any system to see a force-directed graph of every other system it exchanges data with, expandable outward by degree.

---

## Layout

The page has two states: a **list view** and a **graph view**. They share a single data fetch.

### List View (default)

A searchable directory of all systems, sorted by connection count (most connected first). Click any row to enter the graph view for that system.

### Graph View

Entered by clicking a system in the list (or via deep-link from another page). The selected system becomes the focal node (orange). All other systems in the subgraph are blue.

Three panels:

- **Left sidebar** — Controls for degree expansion, simulation lock/unlock, and a "Back to List" button. Displays node/edge counts and the current degree.
- **Center canvas** — D3 force-directed graph. Nodes are draggable; edges are curved arcs with directional arrowheads.
- **Right sidebar** (conditional) — Edge detail panel, shown when an edge is clicked.

A **Data Object filter** dropdown sits in the top-left corner of the canvas. Selecting a data object highlights only the edges and nodes involved in carrying that data object.

---

## Getting There

The page can be reached three ways:

1. **Direct navigation** — Click "System Network Map" in the main nav. Starts in list view.
2. **From the Capability Group view** — Clicking "View Network" on a system in the capability bubble chart navigates here with `location.state = { systemUri, systemLabel, returnGroup }`. The page auto-selects that system and shows a back arrow that returns to the capability view with the group restored.
3. **From the Removal Impact page** — The sidebar can navigate here with a pre-selected system via the same `location.state` pattern.

---

## Data Source

| Reactor | When Called | Purpose |
|---|---|---|
| `GetSystemNetwork` | Once on mount | Full tripartite graph (System, Interface, DataObject nodes + edges) |

The raw network is fetched once and held in state. All subgraph computations happen client-side from this data — no additional network requests when changing degree or selecting a different system.

---

## Tripartite Graph Model

The raw data from `GetSystemNetworkReactor` is a three-node-type graph:

```
System --[Provide]--> Interface --[Consume]--> System
Interface --[carries]--> DataObject
```

Interfaces are structural intermediaries — they encode which system sends data to which other system, and what data objects are carried. The frontend resolves interfaces away to produce a direct system-to-system graph.

---

## Subgraph Computation (`computeSubgraph`)

`client/src/lib/systemSubgraph.ts`

When a system is selected, `computeSubgraph(rawData, systemUri, degree)` runs (client-side, memoized):

1. **Build system graph** — Parse the tripartite data into direct system-to-system `AggregatedEdge` entries, grouping all data flows by (fromUri, toUri) pair.
2. **BFS** — Starting from the selected system, expand outward `degree` hops through the undirected adjacency map.
3. **Build canonical edges** — For each system pair in the BFS result, produce one `ProcessedEdge` with two `DirectionBucket`s (forward and reverse). Each bucket lists the data objects and per-interface breakdowns for that direction.
4. **Build per-data-object edges** — Also produces a `perDataObjectEdges` map (one edge per unique direction + data object combination) used for visual fanning when a pair is expanded.

Returns a `SubgraphResult`:
```typescript
{
  nodes: ProcessedNode[],
  edges: ProcessedEdge[],        // one per system pair
  legend: LegendEntry[],
  maxDegree: number,             // max BFS depth reachable from this system
  perDataObjectEdges: Map<string, ProcessedEdge[]>
}
```

Recomputes automatically whenever `selectedSystem` or `degree` changes.

---

## Degree Expansion

**Degree** is the number of system-hops away from the focal system included in the graph.

- **Degree 1** — Only systems with a direct connection to the focal system.
- **Degree 2** — Those systems plus their direct neighbors, and so on.
- The sidebar shows the current degree and the maximum reachable degree (`maxDegree`).
- The slider and "Expand" button adjust degree. Each change triggers a full subgraph recompute (fast, client-side).
- Changing degree clears any selected edge and active data object filter.

---

## Data Object Filter

A dropdown in the top-left corner of the graph canvas lists every data object present in the current subgraph, with a count of how many edges carry each one. Selecting one:

- Highlights all edges where that data object appears in either the forward or reverse `DirectionBucket`.
- Dims all other edges and nodes (600ms transition).
- Shows a "Reset Graph" button to clear the filter.

The available list updates whenever the subgraph changes (degree change or new system selection).

---

## Edge Interaction

Clicking an edge opens the **Edge Detail Sidebar** on the right. It shows:

- **Forward direction** (`System A → System B`): data objects and per-interface breakdowns carried in this direction, or "No data flow" if `hasFlow = false`.
- **Reverse direction** (`System B → System A`): same, for the opposite direction.

Clicking the same edge again, or the close button, dismisses the sidebar. Changing degree or selecting a filter also clears the selected edge.

The clicked edge is highlighted with a blue stroke on the canvas.

---

## Graph Simulation Controls

The sidebar provides **Lock** and **Unlock** buttons:

- **Unlock (default)** — D3 physics forces are active. Nodes repel, edges pull, the graph settles naturally. Nodes remain draggable.
- **Lock** — Simulation is stopped; all nodes freeze in place. Useful for inspecting a settled layout without accidental movement.

Selecting a new system or changing degree automatically unlocks the graph.

---

## Key Types

```typescript
// client/src/types/graph.ts

ProcessedNode = {
  id, label, type,
  color, fullName,
  connectionCount,   // direct neighbor count
}

ProcessedEdge = {
  id,                // canonical pair key: "uriA||uriB"
  sourceId, targetId,
  forward?: DirectionBucket,   // sourceId → targetId flows
  reverse?: DirectionBucket,   // targetId → sourceId flows
  bidirectional: boolean,
  curveIndex: number,
  noMerge?: boolean,
}

DirectionBucket = {
  fromUri, toUri,
  dataObjects: string[],       // unique sorted labels
  interfaces: InterfaceRecord[], // per-interface breakdown
  hasFlow: boolean
}

InterfaceRecord = { label: string, dataObjects: string[] }
```

---

# 3. Data Flow Impact Analyzer — System Removal Impact Page

## Purpose

The **Data Flow Impact Analyzer** answers one question:
> *If this system were removed from the enterprise, what data flows would break, and which other systems would lose access to critical data?*

It is a simulation tool. No changes are made to the real system landscape — the analysis models hypothetical removal and traces its consequences through recorded interface connections.

---

## What the Page Shows

### System Selection View

When you first open the page, you see a searchable directory of every **active system** in the enterprise. Each card shows three badge scores:

| Badge | Label | Meaning |
|---|---|---|
| **SP** (red) | Sole Provider Count | Number of data objects for which this system is the *only* originator |
| **CR** (amber) | Critical Relay Count | Number of data objects for which removing this system would isolate at least one other system |
| **NP** (gray) | Non-Critical Provider Count | Number of data objects this system participates in without causing isolation |

Systems are ranked by criticality: highest Sole Provider count first, then Critical Relay, then Non-Critical Provider. Rankings are computed automatically in the background after the page loads — while they calculate, all systems are visible and selectable immediately.

Use the **search bar** to filter systems by name.

### Analysis View

After clicking a system, the page runs a simulated removal analysis and displays a report in three sections:

#### Summary Banner

Shows aggregate counts of:
- How many data objects this system is a Sole Provider for
- How many data objects it acts as a Critical Relay for
- How many data objects it participates in non-critically
- Total unique systems that would be **isolated** across all data flow paths

#### Sole Provider — All Downstream Loses Access *(red border)*

Each card represents a **data object** for which the selected system is the **only originating source**. If this system is removed, no alternative provider exists and any downstream system loses access with no fallback.

Each card shows:
- The data object name and the system's role (Provider / Relay)
- The list of **isolated systems** — systems that can no longer reach a data source for this data object
- How many total systems participate in this data object's flow graph

#### Critical Relay — Removal Isolates Systems *(amber border)*

Each card represents a data object where **alternative providers exist**, but the selected system is an **essential bridge** in the data flow path. Removing it cuts the graph, disconnecting one or more systems from all remaining providers. Alternative provider names are shown when present.

#### Non-Critical Participation *(collapsed by default)*

Data objects where the selected system participates but its removal would **not** isolate any other system. Click the section header to expand.

### In-Page Term Guide

A **"What These Terms Mean"** button toggles a reference card in both views:

| Term | Definition |
|---|---|
| **Provider** | The removed system is a source provider for that data object |
| **Relay** | The removed system acts as a bridge, passing data between systems |
| **Sole Provider** | No other provider remains for that data object after removal |
| **Critical Relay** | Other providers may exist, but removing this system isolates one or more systems |
| **Non-Critical** | Removal does not isolate any other system for that data object |
| **Isolated Systems** | Systems that can no longer be reached from remaining providers |
| **Alternative Providers** | Other systems that can originate the same data object |
| **Systems in Flow Graph** | Total systems participating in that data object's directed network |

---

## Frontend Architecture

### Data Loading Sequence

**Phase 1 — On mount (once):**
```
GetSystemNetwork(database=[...])
```
Returns the full tripartite graph (Systems, Interfaces, DataObjects). Only System nodes are used here to populate the directory list. This keeps initial loading fast without running removal analyses upfront.

**Phase 2 — Background ranking:**

Immediately after the system list loads, `GetDataFlowImpact` is called for **every system** in batches of 8 (parallel within each batch, sequential across batches). Results are used only to compute SP / CR / NP badge scores for sorting. This runs entirely in the background; the user can click any system immediately.

**Phase 3 — On system selection:**

When the user clicks a system, a dedicated `GetDataFlowImpact` call is made for that system. The full reactor response drives the impact report.

### Key Frontend Files

| File | Role |
|---|---|
| `src/pages/RemovalImpactPage.tsx` | Page component: layout, state, data fetching, rendering |
| `src/lib/dataFlowImpact.ts` | Groups reactor response into the three classification buckets; computes summary stats |
| `src/types/dataFlowImpact.ts` | TypeScript types: `DataFlowEntry`, `DataFlowImpactReactorResponse`, `DataFlowImpactResult` |

### State Summary

| State variable | What it holds |
|---|---|
| `rawData` | Full network graph from `GetSystemNetwork` |
| `systems` | Flat list of active system entries (uri + label), alphabetically sorted |
| `systemRanks` | Per-system SP / CR / NP scores from background ranking |
| `selectedSystem` | The system the user clicked |
| `impactResult` | Computed `DataFlowImpactResult` for the selected system |
| `isRankingSystems` | True while background ranking batch calls are in progress |
| `isAnalyzing` | True while the per-selection analysis call is running |

### Frontend Computation (`computeDataFlowImpact`)

After the reactor responds, `computeDataFlowImpact()` in `src/lib/dataFlowImpact.ts`:
1. Splits `dataFlowImpacts[]` into three arrays by `classification`
2. Sorts Sole Provider and Critical Relay entries by descending isolated system count; Non-Critical alphabetically by data object label
3. Computes a `summary`: total data objects impacted, total unique isolated systems (deduplicated across all entries), and critical path count (Sole Provider + Critical Relay)

---

## Backend: `GetDataFlowImpactReactor`

**File:** `src/reactors/networkOfSystems/GetDataFlowImpactReactor.java`

**Pixel call syntax:**
```
GetDataFlowImpact(
  database=["<DatabaseEngineID>"],
  system=["http://health.mil/ontologies/Concept/System/<SystemName>"]
);
```

The reactor runs five sequential SPARQL query phases, followed by one in-memory analysis phase (BFS graph traversal).

---

### Ontology Background

The reactor operates on the TAP Core RDF graph. Three structural relationships define data flow:

```
ActiveSystem  --[Provide]-->  SystemInterface  --[Consume]-->  ActiveSystem
                                    |
                               [Payload]
                                    |
                               DataObject
```

| Relation | Meaning |
|---|---|
| **Provide** | A system exposes a SystemInterface (it sends data outward) |
| **Consume** | A system receives data from a SystemInterface |
| **Payload** | A SystemInterface carries a DataObject |
| **ActiveSystem** | A system that is currently operational (RDF subclass of System) |
| **CRM property** | Metadata on a Provide edge: `C` = Creator, `M` = Modifier, `R` = Reference. Only C and M are treated as authoritative data originators |
| **Phase / LifeCycle** | A `SystemInterface` may have a `Phase` relation pointing to a `LifeCycle` node. Only interfaces with lifecycle `Supported` are included in analysis. Interfaces with `Retired_(Not_Supported)` are excluded. |

---

### Q1 — Data Objects This System Provides (Direct)

**Purpose:** Find every DataObject for which the selected system is a direct originator with CRM role Creator (`C`) or Modifier (`M`).

**Pattern:**
```sparql
SELECT DISTINCT ?Data WHERE {
  ?Data       rdf:type           DataObject .
  ?Provide    rdfs:subPropertyOf Provide .
  <systemUri> ?Provide           ?Data .
  ?Provide    Contains/CRM       ?crm .
  FILTER(?crm = 'C' || ?crm = 'M')
}
```

**Result:** Set of DataObject URIs the system directly creates or modifies.

---

### Q2 — Data Objects This System Consumes (via ICD)

**Purpose:** Find DataObjects that flow *into* this system through a SystemInterface.

**Pattern:**
```sparql
SELECT DISTINCT ?Data WHERE {
  ?icd        rdf:type           SystemInterface .
  ?icd        Phase              LifeCycle/Supported .
  ?downstream rdfs:subPropertyOf Consume .
  ?carries    rdfs:subPropertyOf Payload .
  ?icd        ?downstream        <systemUri> .
  ?icd        ?carries           ?Data .
  ?Data       rdf:type           DataObject .
}
```

**Result:** Set of DataObject URIs arriving at this system from upstream providers via supported interfaces only.

---

### Q2.5 — Data Objects Provided via ICD Interface

**Purpose:** Find DataObjects this system originates *through* a SystemInterface it provides (rather than via a direct Provide-to-DataObject edge).

**Pattern:**
```sparql
SELECT DISTINCT ?Data WHERE {
  ?icd        rdf:type           SystemInterface .
  ?icd        Phase              LifeCycle/Supported .
  ?upstream   rdfs:subPropertyOf Provide .
  ?carries    rdfs:subPropertyOf Payload .
  <systemUri> ?upstream          ?icd .
  ?icd        ?carries           ?Data .
  ?Data       rdf:type           DataObject .
}
```

**Result:** Merged into Q1. After all three queries:
- `providedDataObjects = Q1 ∪ Q2.5` — everything this system originates
- `consumedDataObjects = Q2` — everything this system receives
- `allDataObjects = providedDataObjects ∪ consumedDataObjects` — full scope of the analysis

---

### Q3 — CRM Providers per DataObject

**Purpose:** For every DataObject in `allDataObjects`, find which active systems are authoritative originators (CRM = C or M). These become the **seed nodes** for the BFS isolation analysis.

**Pattern (batched):**
```sparql
SELECT DISTINCT ?Data ?System WHERE {
  ?System  rdf:type           ActiveSystem .
  ?provide rdfs:subPropertyOf Provide .
  ?System  ?provide           ?Data .
  ?provide Contains/CRM       ?crm .
  FILTER(?crm = 'C' || ?crm = 'M')
  FILTER(?Data IN (<uri1>, <uri2>, ...))
}
```

**Result:** Map of `DataObjectUri → Set<SystemUri>`. If the target system is the sole entry for a given DataObject, it qualifies as Sole Provider.

---

### Q4 — Directed ICD Flow Graph (Batched)

**Purpose:** For every DataObject in `allDataObjects`, build the complete directed system-to-system flow graph using the ICD pattern. Only **supported** interfaces form edges in this graph — retired interfaces are excluded and do not create traversal paths.

**Pattern (batched):**
```sparql
SELECT DISTINCT ?System2 ?System3 ?Data WHERE {
  ?System2    rdf:type           ActiveSystem .
  ?System3    rdf:type           ActiveSystem .
  ?icd        rdf:type           SystemInterface .
  ?icd        Phase              LifeCycle/Supported .
  ?upstream   rdfs:subPropertyOf Provide .
  ?downstream rdfs:subPropertyOf Consume .
  ?carries    rdfs:subPropertyOf Payload .
  ?System2    ?upstream          ?icd .
  ?icd        ?downstream        ?System3 .
  ?icd        ?carries           ?Data .
  FILTER(?Data IN (<uri1>, <uri2>, ...))
}
```

Each result row `(System2, System3, Data)` means: *System2 sends Data to System3 through a supported SystemInterface.*

**Result:** Map of `DataObjectUri → List<[System2Uri, System3Uri]>`. Both endpoints must be ActiveSystems.

---

### Q5 — Isolation Analysis (In-Memory BFS)

**Purpose:** Simulate removing the selected system from each DataObject's flow graph and identify which remaining systems become unreachable from any data source.

**Algorithm, per DataObject:**

1. **Build the full node set:** All systems from Q4 edges + all CRM providers from Q3.

2. **Assign the target system's role:**
   - `provider` — it is in the Q3 CRM provider set for this DataObject
   - `relay` — it participates in the Q4 flow graph but is not a CRM provider
   - `consumer` — it appears only as a downstream endpoint

3. **Simulate removal:**
   - Remove the target system from the node set
   - Remove all directed edges where the target system is source or target

4. **BFS from remaining CRM providers:**
   - Seed the BFS queue with all CRM providers that remain after removal
   - Walk the remaining directed adjacency list, marking every reachable system

5. **Identify isolated systems:**
   - Any system in the remaining node set not reached by BFS is **isolated** — it can no longer receive this DataObject from any provider through any path

6. **Classify the DataObject entry:**

| Classification | Condition |
|---|---|
| `soleProvider` | Target was the only CRM provider AND no alternatives remain |
| `criticalRelay` | At least one system is isolated after removal (regardless of provider count) |
| `nonCritical` | No systems are isolated after removal |

**Output fields per DataObject entry:**

| Field | Value |
|---|---|
| `role` | `provider`, `consumer`, or `relay` |
| `classification` | `soleProvider`, `criticalRelay`, or `nonCritical` |
| `isolatedSystems` | List of `{uri, label}` for systems cut off from data access |
| `alternativeProviders` | Remaining CRM providers after removal |
| `totalSystemsInGraph` | Total systems in this DataObject's full flow network |
| `flowEdges` | All directed edges in the DataObject's flow graph |

Entries are sorted: Sole Provider first, then Critical Relay, then Non-Critical. Within each group, entries with more isolated systems appear first.

---

### Reactor Response Structure

```json
{
  "systemUri": "http://health.mil/ontologies/Concept/System/Epic_Systems",
  "systemName": "Epic Systems",
  "dataFlowImpacts": [
    {
      "dataObjectUri": "http://health.mil/ontologies/Concept/DataObject/Laboratory",
      "dataObjectLabel": "Laboratory",
      "role": "relay",
      "classification": "criticalRelay",
      "isolatedSystems": [
        { "uri": "http://health.mil/.../Valant_EHR", "label": "Valant EHR" }
      ],
      "totalSystemsInGraph": 12,
      "alternativeProviders": [
        { "uri": "http://health.mil/.../McKesson", "label": "McKesson" }
      ],
      "flowEdges": [
        { "source": "http://health.mil/.../Epic_Systems", "target": "http://health.mil/.../Valant_EHR" }
      ]
    }
  ]
}
```

---

## End-to-End Flow Summary

```
User opens page
    │
    ├── GetSystemNetwork() ─────────────────► Build active system directory list
    │
    └── (background) GetDataFlowImpact()
         for each system in batches of 8 ──► Compute SP / CR / NP badge scores
                                              for ranking the directory

User clicks a system
    │
    └── GetDataFlowImpact(system=[...])
              │
              ├── Q1:   Direct Provide DataObjects     (CRM = C or M)
              ├── Q2:   Consumed DataObjects            (supported ICD Consume only)
              ├── Q2.5: Interface-Provided DataObjects  (supported ICD Provide only)
              ├── Q3:   CRM providers per DataObject    (batched, ActiveSystem only)
              ├── Q4:   Full ICD flow graph             (batched, ActiveSystem + Supported interfaces only)
              └── Q5:   BFS isolation simulation        (in-memory, per DataObject)
                        │
                        └── JSON response
                                  │
                                  └── computeDataFlowImpact() [frontend]
                                            │
                                            ├── soleProvider[]   (isolated count desc)
                                            ├── criticalRelay[]  (isolated count desc)
                                            ├── nonCritical[]    (alphabetical)
                                            └── summary {}
                                                      │
                                                      └── Rendered in RemovalImpactPage
```

---

## Key Constraints and Assumptions

| Constraint | Detail |
|---|---|
| **ActiveSystem only** | All SPARQL queries constrain to `rdf:type ActiveSystem`. Inactive or decommissioned systems are excluded entirely. |
| **CRM filter** | Only `C` (Creator) and `M` (Modifier) Provide edges count as authoritative origins. `R` (Reference) Provide edges do not make a system a provider for isolation purposes. |
| **ICD pattern required** | System-to-system data flow is recognized only when mediated by a `SystemInterface` node with a `Payload` edge to a `DataObject`. |
| **Directed graph** | BFS in Q5 follows directed edges only. A system downstream of the removed system with no alternative upstream path becomes isolated. |
| **Supported interfaces only** | Q2, Q2.5, and Q4 filter `SystemInterface` nodes to those with `Phase → LifeCycle/Supported`. Retired interfaces (`Retired_(Not_Supported)`) are excluded from all graph traversals — they do not contribute edges, consumed data objects, or flow paths. |

