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
//   - Edges  = ONE canonical edge per system pair, with two DirectionBuckets
//              (forward: sourceId→targetId, reverse: targetId→sourceId)
//   - Edge metadata = data objects from raw "carries" edges — NOT label parsing
//
// BFS from a selected system bounds the graph by "degree" (system-hop count).

import type { ProcessedNode, ProcessedEdge, LegendEntry, InterfaceRecord, DirectionBucket } from "@/types/graph";

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

/**
 * One data flow contribution from a single interface.
 * dataObjectLabel comes from raw "carries" edges in the tripartite graph —
 * NOT from parsing the interface label string.
 */
interface DataFlow {
	dataObjectLabel: string;
	interfaceUri: string;
	interfaceLabel: string;
}

/** Aggregated directional edge between two systems (may span multiple interfaces). */
interface AggregatedEdge {
	fromUri: string;
	toUri: string;
	flows: DataFlow[];
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
 * Build an InterfaceRecord[] from a directional AggregatedEdge by grouping
 * DataFlow entries by interface URI.
 */
function buildInterfaceRecords(agg: AggregatedEdge): InterfaceRecord[] {
	const byUri = new Map<string, InterfaceRecord>();
	for (const flow of agg.flows) {
		if (!byUri.has(flow.interfaceUri)) {
			byUri.set(flow.interfaceUri, { label: flow.interfaceLabel, dataObjects: [] });
		}
		const rec = byUri.get(flow.interfaceUri)!;
		if (!rec.dataObjects.includes(flow.dataObjectLabel)) {
			rec.dataObjects.push(flow.dataObjectLabel);
		}
	}
	return [...byUri.values()];
}

// ── Step 1: Resolve interfaces into system-to-system flows ────────────────────
//
// For each Interface node, determine:
//   - Provider system    (System --[Provide]--> Interface)
//   - Consumer systems   (Interface --[Consume]--> System)
//   - Data objects       (Interface --[carries]--> DataObject)  ← from raw edges
// Then create direct flows: provider → each consumer, carrying those data objects.

function buildSystemGraph(raw: RawNetworkData): SystemGraph {
	const nodesByUri = new Map(raw.nodes.map((n) => [n.uri, n]));
	const interfaceUris = new Set(
		raw.nodes.filter((n) => n.type === "Interface").map((n) => n.uri),
	);

	// ── Build interface → data object labels map from raw "carries" edges ────
	// This is the authoritative source: Interface --[carries]--> DataObject.
	// Each DataObject node's label is the human-readable name (already extracted
	// by GetSystemNetworkReactor via extractLabel()).
	const ifcToDataObjects = new Map<string, string[]>(); // ifcUri → sorted labels
	for (const edge of raw.edges) {
		if (edge.edgeType !== "carries") continue;
		const ifcUri = edge.sourceUri;
		const dataNode = nodesByUri.get(edge.targetUri);
		if (!dataNode || !interfaceUris.has(ifcUri)) continue;
		if (!ifcToDataObjects.has(ifcUri)) ifcToDataObjects.set(ifcUri, []);
		const labels = ifcToDataObjects.get(ifcUri)!;
		if (!labels.includes(dataNode.label)) labels.push(dataNode.label);
	}

	// ── Classify provider/consumer relationships ──────────────────────────────
	const providerOf  = new Map<string, string>();    // ifcUri → providing system URI
	const consumersOf = new Map<string, string[]>();  // ifcUri → consuming system URIs

	for (const edge of raw.edges) {
		if (edge.edgeType === "provide" && interfaceUris.has(edge.targetUri)) {
			providerOf.set(edge.targetUri, edge.sourceUri);
		} else if (edge.edgeType === "consume" && interfaceUris.has(edge.sourceUri)) {
			if (!consumersOf.has(edge.sourceUri)) consumersOf.set(edge.sourceUri, []);
			consumersOf.get(edge.sourceUri)!.push(edge.targetUri);
		}
	}

	// ── Aggregate directional system-to-system flows ──────────────────────────
	const edges    = new Map<string, AggregatedEdge>();
	const adjacency = new Map<string, Set<string>>();

	for (const ifcUri of interfaceUris) {
		const provider  = providerOf.get(ifcUri);
		const consumers = consumersOf.get(ifcUri) ?? [];
		const ifcNode   = nodesByUri.get(ifcUri);
		if (!provider || consumers.length === 0) continue;

		const dataObjectLabels = ifcToDataObjects.get(ifcUri) ?? [];

		// Skip interfaces with no data objects — the reactor now filters these
		// out via the Payload existence check, but defend in depth here too.
		if (dataObjectLabels.length === 0) continue;

		for (const consumer of consumers) {
			if (provider === consumer) continue; // skip self-loops

			const key = `${provider}||${consumer}`;
			if (!edges.has(key)) {
				edges.set(key, { fromUri: provider, toUri: consumer, flows: [] });
			}
			const agg = edges.get(key)!;

			for (const doLabel of dataObjectLabels) {
				agg.flows.push({
					dataObjectLabel: doLabel,
					interfaceUri: ifcUri,
					interfaceLabel: ifcNode?.label ?? "",
				});
			}

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
 * Returns a map of system URI → number of directly connected system neighbors.
 * This is what the list-view connection count badge should display.
 */
export function computeDirectNeighborCounts(raw: RawNetworkData): Map<string, number> {
	const { adjacency } = buildSystemGraph(raw);
	return new Map([...adjacency.entries()].map(([uri, neighbors]) => [uri, neighbors.size]));
}

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
 * system. Interfaces are resolved into direct edges. Each edge is a canonical
 * pair (one per system pair, not one per direction) with two DirectionBuckets
 * whose data objects come from raw "carries" edges — not label parsing.
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

	// ── Build canonical connection edges (one per system pair) ────────────────
	//
	// Collect the canonical pair keys for all directional edges whose both
	// endpoints are in the visited set, then build one ProcessedEdge per pair
	// with explicit forward (sourceId→targetId) and reverse (targetId→sourceId)
	// DirectionBuckets populated from raw carries data.

	const connectionCounts = new Map<string, number>();
	const edges: ProcessedEdge[] = [];
	const perDataObjectEdges = new Map<string, ProcessedEdge[]>();

	const canonicalPairs = new Set<string>();
	for (const [, agg] of graph.edges) {
		if (!visited.has(agg.fromUri) || !visited.has(agg.toUri)) continue;
		canonicalPairs.add(canonicalPairKey(agg.fromUri, agg.toUri));
	}

	for (const cpk of canonicalPairs) {
		const [a, b] = cpk.split("||");
		const fwd = graph.edges.get(`${a}||${b}`); // a → b
		const rev = graph.edges.get(`${b}||${a}`); // b → a

		// sourceId/targetId: if a forward (a→b) flow exists use that as primary
		// direction; otherwise the only flow is b→a so flip.
		const sourceUri = fwd ? a : b;
		const targetUri = fwd ? b : a;
		const forwardAgg = (fwd ?? rev)!;
		const reverseAgg = fwd ? rev : undefined;

		const forwardDataObjects = [
			...new Set(
				forwardAgg.flows
					.map((f) => f.dataObjectLabel)
					.filter((l) => l.length > 0),
			),
		].sort();
		const reverseDataObjects = reverseAgg
			? [
					...new Set(
						reverseAgg.flows
							.map((f) => f.dataObjectLabel)
							.filter((l) => l.length > 0),
					),
				].sort()
			: [];

		const forwardInterfaces = buildInterfaceRecords(forwardAgg);
		const reverseInterfaces = reverseAgg ? buildInterfaceRecords(reverseAgg) : [];
		const isBidirectional   = reverseAgg !== undefined;

		const forwardBucket: DirectionBucket = {
			fromUri: sourceUri,
			toUri: targetUri,
			dataObjects: forwardDataObjects,
			interfaces: forwardInterfaces,
			hasFlow: true,
		};
		const reverseBucket: DirectionBucket = {
			fromUri: targetUri,
			toUri: sourceUri,
			dataObjects: reverseDataObjects,
			interfaces: reverseInterfaces,
			hasFlow: isBidirectional,
		};

		const displayLabel = forwardDataObjects.length > 0
			? forwardDataObjects.join(", ")
			: "N/A";

		edges.push({
			id: cpk,
			source: sourceUri,
			target: targetUri,
			sourceId: sourceUri,
			targetId: targetUri,
			edgeType: "Data Flow",
			edgeName: displayLabel,
			data: displayLabel,
			format: "",
			protocol: "",
			frequency: "",
			interfaceName: "",
			dataObjects: forwardDataObjects.length > 0 ? forwardDataObjects : undefined,
			bidirectional: isBidirectional,
			forward: forwardBucket,
			reverse: reverseBucket,
		});

		connectionCounts.set(sourceUri, (connectionCounts.get(sourceUri) ?? 0) + 1);
		connectionCounts.set(targetUri, (connectionCounts.get(targetUri) ?? 0) + 1);
	}

	// ── Build per-data-object exploded edges for the "click-to-expand" view ───
	//
	// Groups all directional flows in visited set by canonical pair, then creates
	// one ProcessedEdge per unique (direction, dataObject) combination with
	// symmetric curveIndex offsets for visual fanning.

	const pairFlows = new Map<
		string,
		{ fromUri: string; toUri: string; dataObject: string }[]
	>();

	for (const [, agg] of graph.edges) {
		if (!visited.has(agg.fromUri) || !visited.has(agg.toUri)) continue;
		const cpk = canonicalPairKey(agg.fromUri, agg.toUri);
		if (!pairFlows.has(cpk)) pairFlows.set(cpk, []);
		for (const flow of agg.flows) {
			if (!flow.dataObjectLabel) continue;
			pairFlows.get(cpk)!.push({
				fromUri: agg.fromUri,
				toUri: agg.toUri,
				dataObject: flow.dataObjectLabel,
			});
		}
	}

	for (const [cpk, flows] of pairFlows) {
		// Deduplicate: one exploded edge per unique (direction + dataObject) pair
		const uniqueFlows = [
			...new Map(
				flows.map((f) => [`${f.fromUri}||${f.toUri}||${f.dataObject}`, f]),
			).values(),
		];
		const n = uniqueFlows.length;
		const exploded: ProcessedEdge[] = [];

		for (let i = 0; i < n; i++) {
			const f = uniqueFlows[i];
			// Symmetric curve indices: -(n-1)/2, …, 0, …, (n-1)/2
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
