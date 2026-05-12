# System Network Map Page

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
