# TAP App V1 — Developer Guide

This document covers the SPARQL queries, data model, Pixel API, and internal logic for the Java reactors powering this application. The backend provides comprehensive system network analysis and data flow impact modeling across the enterprise. All data access is pure SPARQL over a single configured RDF database engine. There are no external HTTP calls, no file I/O beyond config loading.

---

## Reactor Summaries

| Reactor | Pixel Command | Purpose |
|---|---|---|
| `GetActiveSystemsReactor` | `GetActiveSystems` | Returns all `ActiveSystem` instances for system-selector dropdowns and directory views. Queries TAP_Core_Data engine. |
| `GetCapabilityGroupsReactor` | `GetCapabilityGroups` | Returns all capability groups (or capabilities) and their member systems for the zoomable bubble chart. Supports both `capabilityGroup` and `capability` grouping modes. |
| `GetDataFlowImpactReactor` | `GetDataFlowImpact` | Given a focal system URI, determines its Authoritative Data Source (ADS) status, data objects it creates/modifies, and first-order outbound interface connections. Powers the Removal Impact page. |
| `GetSystemDetailsReactor` | `GetSystemDetails` | Returns all attribute details for a single system across 7 categories: data objects, interfaces, environment, transactional status, business processes, activities, and user types. |
| `GetSystemNetworkReactor` | `GetSystemNetwork` | Returns the full data-flow tripartite network (System, SystemInterface, DataObject nodes + edges) filtered to interfaces with recorded data payloads. Powers the System Network Map. |
| `GetSystemsByConceptReactor` | `GetSystemsByConcept` | Given an Activity or Business Process URI, returns all systems that support that concept. Used for cross-system impact analysis in the System Inspector. |

---

## Project Structure

```
java/
├── project.properties              RDF engine UUID (TAP_Core_Data)
└── src/
    ├── reactors/
    │   ├── AbstractProjectReactor.java         Base class for all reactors
    │   └── networkOfSystems/
    │       ├── GetActiveSystemsReactor.java
    │       ├── GetCapabilityGroupsReactor.java
    │       ├── GetDataFlowImpactReactor.java
    │       ├── GetSystemDetailsReactor.java
    │       ├── GetSystemNetworkReactor.java
    │       └── GetSystemsByConceptReactor.java
    └── util/
        ├── Constants.java          Placeholder (currently empty)
        ├── HelperMethods.java      Placeholder (currently empty)
        ├── ProjectProperties.java  Config singleton
        └── QueryExecutor.java      SPARQL SELECT wrapper
```

---

## Configuration — `project.properties`

One RDF engine UUID must be configured:

| Property Key | Engine | Role |
|---|---|---|
| `databaseId` | `TAP_Core_Data` | Base SPARQL graph for all system, interface, data object, and capability queries |

**Current value:**
```properties
databaseId=133db94b-4371-4763-bff9-edf7e5ed021b
```

> **Note:** `ProjectProperties` is a **process-scoped singleton** — it is loaded once via `ProjectProperties.getInstance(projectId)` in `AbstractProjectReactor.preExecute()` and never invalidated. If the engine ID changes in `project.properties`, the SEMOSS process must be restarted.

---

## Utility Classes

### `ProjectProperties`

Singleton that loads `project.properties` from disk on first access.

**Initialization:** Called in `AbstractProjectReactor.preExecute()` via `ProjectProperties.getInstance(projectId)`. Path is resolved using `AssetUtility.getProjectAssetsFolder(projectId) + "/java/project.properties"`.

**Exposes:**
- `getDatabaseId()` — Returns the TAP_Core_Data engine UUID

**Error behavior:** If the file is missing, `INSTANCE` stays `null` and calling `getInstance()` (no-arg) throws `RuntimeException`.

---

### `QueryExecutor`

Thin wrapper around SEMOSS's `WrapperManager.getRawWrapper()` for executing SPARQL SELECT queries.

**Construction:**
```java
new QueryExecutor(engineId)
```
Resolves the engine UUID via `MasterDatabaseUtility.testDatabaseIdIfAlias()` then fetches it via `Utility.getDatabase()`. Throws `IllegalArgumentException` if the engine cannot be resolved.

**Primary method:**
```java
List<Map<String, String>> executeSelect(String query)
```
Each map in the list represents one result row, keyed by SPARQL variable name (e.g., `"System"`, `"Interface"`, `"DataObject"`). Returns an empty list if the query produces no results.

**Value resolution:** Values are returned as-is from the SPARQL engine — URIs are verbatim (e.g., `http://health.mil/ontologies/Concept/System/AHLTA`), and literals include any datatype or language annotations.

**Also exposes:**
- `getEngine()` — Returns the underlying `IDatabaseEngine`
- `getEngineId()` — Returns the resolved engine UUID

---

### `Constants` and `HelperMethods` (Placeholders)

Both classes are currently **empty scaffolding**. All constants (RDF type URIs, predicate URIs, base namespace) and helpers are currently defined as `private static final` fields or private methods within each reactor class. If any become shared across reactors, they should be moved here.

Prime candidates for `HelperMethods`:
- `extractLabel(String uri)` — extracts substring after last `/`
- `formatLiteralText(String value)` — removes wrapping quotes, replaces underscores with spaces, collapses whitespace
- `normalizeCrm(String rawCrm)` — normalizes Creator/Modifier indicators to canonical form

---

## Reactor: `GetActiveSystemsReactor`

**Pixel call:** `GetActiveSystems()`
**Parameters:** None
**Engine:** `databaseId` (TAP_Core_Data)

Returns all `ActiveSystem` instances for populating system-selector dropdowns and directory views. Unlike `GetSystemNetwork`, which filters to systems with active data flows, this reactor returns every system typed as `ActiveSystem`, making all systems visible regardless of connectivity.

**SPARQL:**
```sparql
SELECT DISTINCT ?System WHERE {
  ?System <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <http://semoss.org/ontologies/Concept/ActiveSystem>
} ORDER BY ?System
```

**Return shape** (`MAP`):
```json
{
  "systems": [
    { "uri": "http://health.mil/ontologies/Concept/System/AHLTA", "label": "AHLTA" },
    { "uri": "http://health.mil/ontologies/Concept/System/CHCS", "label": "CHCS" },
    { "uri": "http://health.mil/ontologies/Concept/System/MHS_GENESIS", "label": "MHS GENESIS" }
  ]
}
```

**Label extraction:** URI local name (substring after last `/`) with underscores replaced by spaces. Results sorted alphabetically by label.

---

## Reactor: `GetCapabilityGroupsReactor`

**Pixel call:**
```
GetCapabilityGroups()
GetCapabilityGroups(mode=["capabilityGroup"])
GetCapabilityGroups(mode=["capability"])
```

**Parameters:**

| Key | Required | Default | Description |
|---|---|---|---|
| `mode` | No | `"capabilityGroup"` | Grouping mode: `"capabilityGroup"` or `"capability"` |

**Purpose:** Returns capability groups (or capabilities) and their member systems for the zoomable bubble chart on the System Inspection page. Each group includes the systems that support it.

### Execution Flow (2 Stages)

**Stage 1: Query groups and systems**

In `capabilityGroup` mode:
```sparql
SELECT DISTINCT ?CapabilityGroup ?System WHERE {
  ?CapabilityGroup <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
                   <http://semoss.org/ontologies/Concept/CapabilityGroup> .
  ?System          <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
                   <http://semoss.org/ontologies/Concept/ActiveSystem> .
  ?System          <http://semoss.org/ontologies/Relation/Supports> ?CapabilityGroup .
} ORDER BY ?CapabilityGroup ?System
```

In `capability` mode, `CapabilityGroup` is replaced with the `Capability` concept type.

**Stage 2: Fetch descriptions**

For each group/capability, runs a separate query to fetch the `Contains/Description` property:
```sparql
SELECT DISTINCT ?Description WHERE {
  <groupUri> <http://semoss.org/ontologies/Relation/Contains/Description> ?Description .
}
```

### Return Shape

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
        { "uri": "http://health.mil/ontologies/Concept/System/CHCS", "label": "CHCS" }
      ]
    }
  ]
}
```

### Internal Helpers

| Helper | Purpose |
|---|---|
| `extractLabel(String)` | Substring after last `/`, underscores → spaces |
| `formatLiteralText(String)` | Strips outer quotes, underscores → spaces, collapses whitespace |

---

## Reactor: `GetSystemDetailsReactor`

**Pixel call:**
```
GetSystemDetails(
  system=["http://health.mil/ontologies/Concept/System/AHLTA"]
)
```

**Parameters:**

| Key | Required | Description |
|---|---|---|
| `system` | Yes | Full URI of the focal `ActiveSystem` |

**Purpose:** Returns all known attributes for a single system across 7 categories: data objects provided, interfaces (with direction), environment, transactional status, business processes supported, activities supported, and user types (personnel).

### Execution Flow (11 Queries)

**Q1: Data Objects Provided**

Uses the `rdfs:subPropertyOf` pattern to capture all specializations of Provide:
```sparql
SELECT DISTINCT ?Data WHERE {
  ?Data    <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
           <http://semoss.org/ontologies/Concept/DataObject> .
  ?Provide <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
           <http://semoss.org/ontologies/Relation/Provide> .
  <systemUri> ?Provide ?Data .
}
```

**Q2 & Q3: Interfaces (Provider and Consumer)**

Outgoing (provider) — interfaces this system provides to:
```sparql
SELECT DISTINCT ?Interface WHERE {
  ?Interface <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
             <http://semoss.org/ontologies/Concept/SystemInterface> .
  <systemUri> <http://semoss.org/ontologies/Relation/Provide> ?Interface .
  ?Interface  <http://semoss.org/ontologies/Relation/Phase>
              <http://health.mil/ontologies/Concept/LifeCycle/Supported> .
}
```

Incoming (consumer) — interfaces this system consumes from:
```sparql
SELECT DISTINCT ?Interface WHERE {
  ?Interface <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
             <http://semoss.org/ontologies/Concept/SystemInterface> .
  ?Interface <http://semoss.org/ontologies/Relation/Consume> <systemUri> .
  ?Interface <http://semoss.org/ontologies/Relation/Phase>
             <http://health.mil/ontologies/Concept/LifeCycle/Supported> .
}
```

For each interface, a nested query finds the connected system and all data objects on that interface.

**Q4–Q11: Scalar and multi-valued properties**

| Query | Property | Result |
|---|---|---|
| Q4 | `Contains/GarrisonTheater` | Environment (Theater / Garrison / Both) |
| Q5 | `Contains/Transactional` | Transactional status |
| Q6 | `Supports` → `BusinessProcess` | Business processes |
| Q7 | `Supports` → `Activity` | Activities |
| Q8 | `UsedBy` → `Personnel` | User types |
| Q9 | `Contains/Description` | System description |
| Q10 | `Contains/Disposition` | System disposition |
| Q11 | `OwnedBy` → `SystemOwner` | System owner |

### Return Shape

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

### Internal Helpers

| Helper | Purpose |
|---|---|
| `extractLabel(String)` | Substring after last `/`, underscores → spaces |
| `formatLiteralText(String)` | Removes quotes, underscores → spaces, collapses whitespace |
| `rowsToLabeledList(rows, varName)` | Converts query rows to `[{uri, label}, ...]` |
| `makeEnrichedInterfaceEntry(executor, ifcUri, role, currentSystemUri)` | Builds interface entry with connected system and data objects |

---

## Reactor: `GetSystemNetworkReactor`

**Pixel call:** `GetSystemNetwork()`
**Parameters:** None
**Engine:** `databaseId` (TAP_Core_Data)

Returns the full data-flow tripartite network: System nodes, SystemInterface nodes, and DataObject nodes. Only interfaces carrying at least one DataObject are included, ensuring the graph represents actual data flow. Systems connected solely through data-less interfaces are excluded.

### Execution Flow (3 Stages)

**Stage 1: Systems → Interfaces (Provide, with Payload filter)**

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

The `Payload` triple and `Supports` triple act as existence filters, excluding data-less interfaces and systems with no recorded capabilities.

**Stage 2: Interfaces → Systems (Consume, with Payload filter)**

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

**Stage 3: Interfaces → DataObjects (Payload)**

```sparql
SELECT DISTINCT ?Interface ?DataObj WHERE {
  ?Interface <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
             <http://semoss.org/ontologies/Concept/SystemInterface> .
  ?Interface <http://semoss.org/ontologies/Relation/Payload> ?DataObj .
} ORDER BY ?Interface
```

Only data objects connected to interfaces that passed Stages 1 & 2 are included (client-side deduplication via `nodeMap`).

### Return Shape

```json
{
  "nodes": [
    { "uri": "http://health.mil/ontologies/Concept/System/AHLTA",
      "label": "AHLTA", "type": "System" },
    { "uri": "http://health.mil/ontologies/Concept/SystemInterface/IFC_X",
      "label": "IFC X", "type": "Interface" },
    { "uri": "http://health.mil/ontologies/Concept/DataObject/Admissions",
      "label": "Admissions", "type": "DataObject" }
  ],
  "edges": [
    { "id": "http://.../System/AHLTA||http://.../SystemInterface/IFC_X",
      "sourceUri": "http://health.mil/ontologies/Concept/System/AHLTA",
      "targetUri": "http://health.mil/ontologies/Concept/SystemInterface/IFC_X",
      "edgeType": "provide" },
    { "id": "http://.../SystemInterface/IFC_X||http://.../System/CHCS",
      "sourceUri": "http://health.mil/ontologies/Concept/SystemInterface/IFC_X",
      "targetUri": "http://health.mil/ontologies/Concept/System/CHCS",
      "edgeType": "consume" },
    { "id": "http://.../SystemInterface/IFC_X||http://.../DataObject/Admissions",
      "sourceUri": "http://health.mil/ontologies/Concept/SystemInterface/IFC_X",
      "targetUri": "http://health.mil/ontologies/Concept/DataObject/Admissions",
      "edgeType": "carries" }
  ]
}
```

### Internal Helpers

| Helper | Purpose |
|---|---|
| `addEdge(edgeList, edgeSeen, sourceUri, targetUri, edgeType)` | Deduplicates edges by generated ID (`sourceUri\|\|targetUri`) |
| `extractLabel(String)` | Substring after last `/`, underscores → spaces |

---

## Reactor: `GetDataFlowImpactReactor`

**Pixel call:**
```
GetDataFlowImpact(
  database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
  system=["http://health.mil/ontologies/Concept/System/AHLTA"]
)
```

**Parameters:**

| Key | Required | Description |
|---|---|---|
| `database` | Yes | RDF engine UUID (typically `databaseId` from config) |
| `system` | Yes | Full URI of the focal `ActiveSystem` |

**Purpose:** Determines the data flow impact of a system's removal: whether it is an Authoritative Data Source (ADS), which data objects it creates/modifies (CRM = Creator/Modifier), and its first-order outbound interface connections with other active systems.

### Execution Flow (3 Queries)

**Q1: Authoritative Data Source (ADS) Status**

Checks if this system has ADS designation, and if so, which Data Subject Areas it covers. Uses UNION to handle `ADS_Indicator` stored on either the Has edge or the Data_Subject_Area node directly:

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

**Q2: Creator/Modifier Data Objects**

Identifies data objects for which this system is an authoritative originator (CRM = `'C'` or `'M'`):

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

**Q3: First-Order Outbound Connections**

Identifies all interfaces this system provides, their consumer systems, and the data objects carried. Excludes retired interfaces and self-loops:

```sparql
SELECT DISTINCT ?icd ?targetSystem ?dataObject WHERE {
  ?icd <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
       <http://semoss.org/ontologies/Concept/SystemInterface> .
  <systemUri> <http://semoss.org/ontologies/Relation/Provide> ?icd .
  FILTER NOT EXISTS {
    ?icd <http://semoss.org/ontologies/Relation/Phase>
         <http://health.mil/ontologies/Concept/LifeCycle/Retired_(Not_Supported)>
  }
  ?icd         <http://semoss.org/ontologies/Relation/Consume>  ?targetSystem .
  ?targetSystem <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
                <http://semoss.org/ontologies/Concept/ActiveSystem> .
  FILTER(?targetSystem != <systemUri>)
  ?icd         <http://semoss.org/ontologies/Relation/Payload>  ?dataObject .
  ?dataObject  <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
               <http://semoss.org/ontologies/Concept/DataObject> .
}
```

Results are grouped by `targetSystem`, merging data objects from multiple interfaces into a single connection entry. Data objects are deduplicated within each target system. Final list sorted alphabetically by target system label.

### Return Shape

```json
{
  "systemUri": "http://health.mil/ontologies/Concept/System/AHLTA",
  "systemName": "AHLTA",
  "isAuthoritativeDataSource": true,
  "dataSubjectAreas": [
    { "uri": "http://health.mil/ontologies/Concept/Data_Subject_Area/Clinical",
      "label": "Clinical" }
  ],
  "crmDataObjects": [
    { "uri": "http://health.mil/ontologies/Concept/DataObject/Admissions",
      "label": "Admissions", "crm": "C" },
    { "uri": "http://health.mil/ontologies/Concept/DataObject/Diagnoses",
      "label": "Diagnoses", "crm": "M" }
  ],
  "outboundConnections": [
    {
      "targetSystemUri": "http://health.mil/ontologies/Concept/System/CHCS",
      "targetSystemLabel": "CHCS",
      "dataObjects": [
        { "uri": "http://health.mil/ontologies/Concept/DataObject/Admissions",
          "label": "Admissions" }
      ]
    }
  ]
}
```

### Internal Helpers

| Helper | Purpose |
|---|---|
| `extractLabel(String)` | Substring after last `/`, underscores → spaces |
| `normalizeCrm(String)` | Strips quotes/whitespace, returns canonical `'C'` or `'M'` (or null if unrecognized) |

> **Frontend note:** The `src/lib/dataFlowImpact.ts` client-side library has a comment indicating it was superseded. The reactor now returns a fully-shaped response and no client-side grouping/classification is required. That file is safe to delete if no other imports reference it.

---

## Reactor: `GetSystemsByConceptReactor`

**Pixel call:**
```
GetSystemsByConcept(
  database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
  concept=["http://health.mil/ontologies/Concept/Activity/Scheduling"]
)
```

**Parameters:**

| Key | Required | Description |
|---|---|---|
| `database` | Yes | RDF engine UUID |
| `concept` | Yes | Full URI of an `Activity` or `BusinessProcess` concept |

**Purpose:** Given an Activity or Business Process URI, returns all systems that support that concept. Used by the System Inspection Panel to show cross-system overlap when a user clicks a business process or activity.

**SPARQL:**
```sparql
SELECT DISTINCT ?System WHERE {
  ?System <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
          <http://semoss.org/ontologies/Concept/System> .
  ?System <http://semoss.org/ontologies/Relation/Supports> <conceptUri> .
} ORDER BY ?System
```

### Return Shape

```json
{
  "conceptUri": "http://health.mil/ontologies/Concept/Activity/Scheduling",
  "conceptLabel": "Scheduling",
  "systems": [
    { "uri": "http://health.mil/ontologies/Concept/System/AHLTA", "label": "AHLTA" },
    { "uri": "http://health.mil/ontologies/Concept/System/CHCS", "label": "CHCS" }
  ]
}
```

---

## Semantic Ontology Reference

All queries use the `http://semoss.org/ontologies/` namespace for concept and relation URIs, and `http://health.mil/ontologies/` for health-specific concepts.

### Concept Types

| Concept | Namespace | Purpose |
|---|---|---|
| `ActiveSystem` | SEMOSS | Operationally active system in the enterprise |
| `SystemInterface` | SEMOSS | Conduit through which data flows between systems |
| `DataObject` | SEMOSS | Named entity of data exchanged between systems |
| `CapabilityGroup` | SEMOSS | High-level business capability (e.g., Personnel Services) |
| `Capability` | SEMOSS | Individual business capability |
| `BusinessProcess` | SEMOSS | Business workflow or process |
| `Activity` | SEMOSS | Discrete action within a process |
| `Personnel` | SEMOSS | User type or personnel role |
| `SystemOwner` | SEMOSS | Entity responsible for a system |
| `Data_Subject_Area` | SEMOSS | Categorization of data domains (for ADS designation) |
| `LifeCycle` | Health | Status of a system or interface (Supported, Retired, etc.) |

### Relation Types

| Relation | Purpose | Directionality |
|---|---|---|
| `Provide` | System exposes an interface | System → SystemInterface |
| `Consume` | System receives from an interface | SystemInterface → System |
| `Payload` | Interface carries a data object | SystemInterface → DataObject |
| `Supports` | System supports a capability/activity/business process | System → Concept |
| `UsedBy` | System is used by a personnel type | System → Personnel |
| `Contains` | Sub-property prefix for metadata (CRM, Description, ADS_Indicator, etc.) | Property-dependent |
| `OwnedBy` | System is owned by an entity | System → SystemOwner |
| `Has` | System has a data subject area relation | System → Data_Subject_Area |
| `Phase` | Lifecycle status of a system or interface | System/Interface → LifeCycle |

### Standard RDF URIs

```
http://www.w3.org/1999/02/22-rdf-syntax-ns#type          (rdf:type)
http://www.w3.org/2000/01/rdf-schema#subPropertyOf       (rdfs:subPropertyOf)
```

---

## Frontend Integration Notes

The frontend uses TypeScript types and React components to consume reactor responses:

| Component | Reactors Used | Purpose |
|---|---|---|
| `RemovalImpactPage.tsx` | `GetActiveSystems`, `GetDataFlowImpact` | Removal impact analysis with system selection, ADS status, CRM data objects, and outbound connection display |
| `SystemNetworkPage.tsx` | `GetSystemNetwork` | Force-directed graph with degree expansion, data object filter, and edge detail sidebar |
| `SystemInspectionPage.tsx` / `HomePage.tsx` | `GetCapabilityGroups`, `GetSystemDetails`, `GetSystemsByConcept` | Bubble chart with capability group zoom, system attribute inspection, and cross-system concept lookup |
| `CapabilityGroupSidebar.tsx` | `GetSystemDetails` (batch) | Per-system overlap scoring within a capability group |
| `SystemInspectionPanel.tsx` | `GetSystemDetails` | Multi-tab attribute display for a selected system |

**Client-side computation:**

- `src/lib/systemSubgraph.ts` — BFS-based subgraph expansion for the System Network Map; runs entirely client-side from the `GetSystemNetwork` response
- `src/lib/groupOverlap.ts` — Overlap score computation for the Capability Group Sidebar; batches `GetSystemDetails` calls in parallel for all systems in a group

---

## Common Development Patterns

### Adding a New Reactor

1. Create a new class in `src/reactors/networkOfSystems/` extending `AbstractProjectReactor`
2. Define `keysToGet` (parameter names) and `keyRequired` (0 for optional, 1 for required) in the constructor
3. Implement `doExecute()` and call `organizeKeys()` first to populate `this.keyValue`
4. Use `new QueryExecutor(engineId).executeSelect(query)` to run SPARQL queries
5. Return result as `new NounMetadata(result, PixelDataType.MAP)` (or `.LIST` for arrays)
6. Override `getReactorDescription()` and `getDescriptionForKey(key)` for help text

### Adding a New Property to `project.properties`

1. Add the `key=value` line to `java/project.properties`
2. Add a private field and getter to `ProjectProperties`
3. Read the value in the load method using `projectProperties.getProperty("yourKey")`

### Querying Multiple Engines

If your reactor needs to query multiple engines, add them to `project.properties` and expose getters on `ProjectProperties`. Then instantiate multiple `QueryExecutor` instances:

```java
QueryExecutor base     = new QueryExecutor(ProjectProperties.getInstance().getDatabaseId());
QueryExecutor secondary = new QueryExecutor(ProjectProperties.getInstance().getSecondaryEngineId());
List<Map<String, String>> rows1 = base.executeSelect(query1);
List<Map<String, String>> rows2 = secondary.executeSelect(query2);
```

---

## Logging

All reactors use Apache Log4j2 via `LogManager.getLogger(ClassName.class)`. Logs are output to the SEMOSS process logs.

**Recommended log levels:**
- `LOGGER.info()` — Reactor entry/exit, row counts
- `LOGGER.warn()` — Missing optional fields, non-fatal query failures
- `LOGGER.error()` — Query execution errors, null pointers (caught and returned as error response)
