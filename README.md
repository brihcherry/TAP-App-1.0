# TAP App V1 — Developer Documentation

This README is the **living document** for all page-level documentation in the TAP App V1. Each page has its own section below. As new pages are built or updated, add their documentation here.

> **Contributing:** Add a new `---`-delimited section per page following the same structure (Purpose → What the Page Shows → Frontend Architecture → Backend → Flow Summary → Constraints). Keep the Table of Contents up to date.

---

## Table of Contents

1. [Data Flow Impact Analyzer (System Removal Impact Page)](#1-data-flow-impact-analyzer--system-removal-impact-page)

---

# 1. Data Flow Impact Analyzer — System Removal Impact Page

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
  database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
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

