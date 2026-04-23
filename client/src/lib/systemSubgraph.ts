// systemSubgraph.ts — Extract degree-based system-to-system subgraphs from the
// full System Network data for the System Network Map's click-to-graph feature.
//
// The raw data from GetSystemNetworkReactor is a tripartite graph:
//   System --[Provide]--> Interface --[Consume]--> System
//   Interface --[carries]--> DataObject
//
// Interfaces are structural glue — they encode "System A sends data to System B."
// This module resolves them away, producing a direct system-to-system graph where:
//   - Nodes  = Systems only
//   - Edges  = directed data flows between systems
//   - Edge metadata = which data objects are exchanged (+ originating interface names)
//
// BFS from a selected system bounds the graph by "degree" (system-hop count).

import type { ProcessedNode, ProcessedEdge, LegendEntry } from "@/types/graph";

// ── Raw types from GetSystemNetworkReactor ────────────────────────────────────

export interface RawNetworkNode {
	uri: string;
	label: string;
	type: string; // "System" | "Interface" | "DataObject"
}

export interface RawNetworkEdge {
	id: string;
	sourceUri: string;
	targetUri: string;
	edgeType: string; // "provide" | "consume" | "carries"
}

export interface RawNetworkData {
	nodes: RawNetworkNode[];
	edges: RawNetworkEdge[];
}

// ── Color palette ─────────────────────────────────────────────────────────────

const COLOR_SELECTED = "rgb(255, 127, 14)"; // Orange — the focal system
const COLOR_SYSTEM   = "rgb(31, 119, 180)"; // Blue   — connected systems

// ── Result type ───────────────────────────────────────────────────────────────

export interface SubgraphResult {
	nodes: ProcessedNode[];
	edges: ProcessedEdge[];
	legend: LegendEntry[];
	maxDegree: number;
	/** Per-data-object exploded edges keyed by canonical pair key ("uriA||uriB"). */
	perDataObjectEdges: Map<string, ProcessedEdge[]>;
}

// ── Internal types ────────────────────────────────────────────────────────────

/** A single directional data flow through an interface. */
interface DataFlow {
	dataObject: string;
	interfaceLabel: string;
}

/** Aggregated directional edge between two systems (may span multiple interfaces). */
interface AggregatedEdge {
	fromUri: string;
	toUri: string;
	flows: DataFlow[];
	interfaceLabels: Set<string>;
}

/** Pre-computed system-level graph derived from raw tripartite data. */
interface SystemGraph {
	/** Directional aggregated edges keyed by "fromUri||toUri". */
	edges: Map<string, AggregatedEdge>;
	/** Undirected adjacency: system URI → set of neighboring system URIs. */
	adjacency: Map<string, Set<string>>;
	/** Raw node lookup by URI. */
	nodesByUri: Map<string, RawNetworkNode>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Canonical pair key for two system URIs (order-independent). */
export function canonicalPairKey(a: string, b: string): string {
	return a < b ? `${a}||${b}` : `${b}||${a}`;
}

/**
 * Parse the data object name from an interface label.
 * Interface label format: "ProvidingSystem%ConsumingSystem%DataObject"
 */
function parseDataObjectFromLabel(label: string): string | null {
	const parts = label.split("%");
	return parts.length >= 3 ? parts.slice(2).join("%").trim() : null;
}

// ── Step 1: Resolve interfaces into system-to-system flows ────────────────────
//
// For each Interface node, determine:
//   - Provider system  (System --[Provide]--> Interface)
//   - Consumer systems (Interface --[Consume]--> System)
//   - Data objects     (Interface --[carries]--> DataObject)
// Then create direct flows: provider → each consumer, carrying those data objects.

function buildSystemGraph(raw: RawNetworkData): SystemGraph {
	const nodesByUri = new Map(raw.nodes.map((n) => [n.uri, n]));
	const interfaceUris = new Set(
		raw.nodes.filter((n) => n.type === "Interface").map((n) => n.uri),
	);

	// Classify every raw edge by its role relative to interfaces
	const providerOf   = new Map<string, string>();     // ifc URI → providing system URI
	const consumersOf  = new Map<string, string[]>();    // ifc URI → consuming system URIs

	for (const edge of raw.edges) {
		if (edge.edgeType === "provide" && interfaceUris.has(edge.targetUri)) {
			providerOf.set(edge.targetUri, edge.sourceUri);
		} else if (edge.edgeType === "consume" && interfaceUris.has(edge.sourceUri)) {
			if (!consumersOf.has(edge.sourceUri)) consumersOf.set(edge.sourceUri, []);
			consumersOf.get(edge.sourceUri)!.push(edge.targetUri);
		}
	}

	// Aggregate: for each (provider → consumer) direction, collect data flows
	// from all interfaces connecting them. Data object is parsed from the
	// interface label (format: "Provider%Consumer%DataObject").
	const edges = new Map<string, AggregatedEdge>();
	const adjacency = new Map<string, Set<string>>();

	for (const ifcUri of interfaceUris) {
		const provider  = providerOf.get(ifcUri);
		const consumers = consumersOf.get(ifcUri) ?? [];
		const ifcNode   = nodesByUri.get(ifcUri);

		if (!provider || consumers.length === 0) continue;

		// Parse data object from interface label
		const dataObject = ifcNode ? parseDataObjectFromLabel(ifcNode.label) : null;

		for (const consumer of consumers) {
			if (provider === consumer) continue; // skip self-loops

			const key = `${provider}||${consumer}`;
			if (!edges.has(key)) {
				edges.set(key, {
					fromUri: provider,
					toUri: consumer,
					flows: [],
					interfaceLabels: new Set(),
				});
			}

			const agg = edges.get(key)!;
			if (dataObject) {
				agg.flows.push({ dataObject, interfaceLabel: ifcNode!.label });
			}
			if (ifcNode) agg.interfaceLabels.add(ifcNode.label);

			// Undirected adjacency for BFS traversal
			if (!adjacency.has(provider)) adjacency.set(provider, new Set());
			if (!adjacency.has(consumer)) adjacency.set(consumer, new Set());
			adjacency.get(provider)!.add(consumer);
			adjacency.get(consumer)!.add(provider);
		}
	}

	return { edges, adjacency, nodesByUri };
}

// ── Step 2: BFS to find max reachable degree ─────────────────────────────────

function maxDegreeFromAdj(
	adjacency: Map<string, Set<string>>,
	systemUri: string,
): number {
	const neighbors = adjacency.get(systemUri);
	if (!neighbors || neighbors.size === 0) return 0;

	const visited = new Set<string>([systemUri]);
	let frontier = new Set<string>([systemUri]);
	let degree = 0;

	while (frontier.size > 0) {
		const next = new Set<string>();
		for (const sys of frontier) {
			for (const nbr of adjacency.get(sys) ?? []) {
				if (!visited.has(nbr)) {
					visited.add(nbr);
					next.add(nbr);
				}
			}
		}
		if (next.size > 0) degree++;
		frontier = next;
	}

	return degree;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the maximum system-hop degree reachable from a system.
 */
export function computeMaxDegree(raw: RawNetworkData, systemUri: string): number {
	const { adjacency, nodesByUri } = buildSystemGraph(raw);
	const node = nodesByUri.get(systemUri);
	if (!node || node.type !== "System") return 0;
	return maxDegreeFromAdj(adjacency, systemUri);
}

/**
 * Compute a degree-bounded, system-to-system subgraph centered on a selected
 * system. Interfaces are resolved into direct edges whose metadata lists the
 * data objects exchanged.
 *
 * @param raw       Full network data from GetSystemNetworkReactor
 * @param systemUri URI of the selected system (center node)
 * @param degree    Number of system-hops to include (≥1)
 * @returns         Subgraph ready for NetworkGraph + the max possible degree
 */
export function computeSubgraph(
	raw: RawNetworkData,
	systemUri: string,
	degree: number,
): SubgraphResult {
	const graph = buildSystemGraph(raw);
	const rootNode = graph.nodesByUri.get(systemUri);

	if (!rootNode || rootNode.type !== "System") {
		return { nodes: [], edges: [], legend: [], maxDegree: 0, perDataObjectEdges: new Map() };
	}

	// ── BFS: collect systems within `degree` hops ─────────────────────────────

	const visited = new Set<string>([systemUri]);
	let frontier = new Set<string>([systemUri]);

	for (let d = 0; d < degree; d++) {
		const next = new Set<string>();
		for (const sys of frontier) {
			for (const nbr of graph.adjacency.get(sys) ?? []) {
				if (!visited.has(nbr)) {
					visited.add(nbr);
					next.add(nbr);
				}
			}
		}
		if (next.size === 0) break;
		frontier = next;
	}

	// ── Build edges: only those between systems in the visited set ────────────

	const connectionCounts = new Map<string, number>();
	const edges: ProcessedEdge[] = [];
	const perDataObjectEdges = new Map<string, ProcessedEdge[]>();

	for (const [, agg] of graph.edges) {
		if (!visited.has(agg.fromUri) || !visited.has(agg.toUri)) continue;

		// Unique data object labels for this direction
		const dataObjects = [...new Set(agg.flows.map((f) => f.dataObject))].sort();
		const dataStr = dataObjects.length > 0 ? dataObjects.join(", ") : "N/A";
		const ifcStr  = [...agg.interfaceLabels].sort().join(", ") || "";

		edges.push({
			id: `${agg.fromUri}||${agg.toUri}`,
			source: agg.fromUri,
			target: agg.toUri,
			sourceId: agg.fromUri,
			targetId: agg.toUri,
			edgeType: "Data Flow",
			edgeName: dataStr,
			data: dataStr,
			format: "",
			protocol: "",
			frequency: "",
			interfaceName: ifcStr,
			dataObjects: dataObjects.length > 0 ? dataObjects : undefined,
		});

		connectionCounts.set(agg.fromUri, (connectionCounts.get(agg.fromUri) ?? 0) + 1);
		connectionCounts.set(agg.toUri,   (connectionCounts.get(agg.toUri)   ?? 0) + 1);
	}

	// ── Build per-data-object edges for exploded view ─────────────────────────
	// Group all directional flows by canonical pair, then create one edge per
	// data object per direction with curveIndex for visual fanning.

	const pairFlows = new Map<string, { fromUri: string; toUri: string; dataObject: string }[]>();

	for (const [, agg] of graph.edges) {
		if (!visited.has(agg.fromUri) || !visited.has(agg.toUri)) continue;
		const cpk = canonicalPairKey(agg.fromUri, agg.toUri);
		if (!pairFlows.has(cpk)) pairFlows.set(cpk, []);
		for (const flow of agg.flows) {
			pairFlows.get(cpk)!.push({
				fromUri: agg.fromUri,
				toUri: agg.toUri,
				dataObject: flow.dataObject,
			});
		}
	}

	for (const [cpk, flows] of pairFlows) {
		// Deduplicate flows (same direction + dataObject)
		const uniqueFlows = [
			...new Map(flows.map((f) => [`${f.fromUri}||${f.toUri}||${f.dataObject}`, f])).values(),
		];
		const n = uniqueFlows.length;
		const exploded: ProcessedEdge[] = [];

		for (let i = 0; i < n; i++) {
			const f = uniqueFlows[i];
			// Symmetric curve indices: -(n-1)/2, ..., 0, ..., (n-1)/2
			const curveIndex = i - (n - 1) / 2;
			exploded.push({
				id: `${f.fromUri}||${f.toUri}||${f.dataObject}`,
				source: f.fromUri,
				target: f.toUri,
				sourceId: f.fromUri,
				targetId: f.toUri,
				edgeType: f.dataObject,
				edgeName: f.dataObject,
				data: f.dataObject,
				format: "",
				protocol: "",
				frequency: "",
				interfaceName: "",
				noMerge: true,
				curveIndex,
			});
		}

		perDataObjectEdges.set(cpk, exploded);
	}

	// ── Build nodes ───────────────────────────────────────────────────────────

	const nodes: ProcessedNode[] = [];
	let selectedCount = 0;
	let systemCount = 0;

	for (const sysUri of visited) {
		const rawNode = graph.nodesByUri.get(sysUri);
		if (!rawNode) continue;

		const isSelected = sysUri === systemUri;
		if (isSelected) selectedCount++; else systemCount++;

		nodes.push({
			id: sysUri,
			label: rawNode.label,
			type: isSelected ? "Selected System" : "System",
			color: isSelected ? COLOR_SELECTED : COLOR_SYSTEM,
			fullName: rawNode.label,
			description: isSelected ? "Selected system (center)" : "",
			connectionCount: connectionCounts.get(sysUri) ?? 0,
			propHash: {},
		});
	}

	// ── Legend ─────────────────────────────────────────────────────────────────

	const legend: LegendEntry[] = [];
	if (selectedCount > 0) legend.push({ type: "Selected System", color: COLOR_SELECTED, count: selectedCount });
	if (systemCount   > 0) legend.push({ type: "System",          color: COLOR_SYSTEM,   count: systemCount });

	// ── Max degree ────────────────────────────────────────────────────────────

	const maxDegree = maxDegreeFromAdj(graph.adjacency, systemUri);

	return { nodes, edges, legend, maxDegree, perDataObjectEdges };
}
