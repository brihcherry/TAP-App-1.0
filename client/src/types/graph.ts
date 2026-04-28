// Type definitions for the Network of Systems graph data.
// Mirrors the shape of admissions_data.json (InterfaceGraphPlaySheet / GraphDataModel).

/** Raw node from the JSON "nodes" object (keyed by URI). */
export interface RawGraphNode {
	uri: string;
	propHash: Record<string, unknown>;
}

/** Raw edge from the JSON "edges" array. */
export interface RawGraphEdge {
	uri: string;
	source: string;
	target: string;
	propHash: Record<string, unknown>;
}

/** Top-level shape of admissions_data.json. */
export interface RawGraphData {
	layout: string;
	nodes: Record<string, RawGraphNode>;
	edges: RawGraphEdge[];
	title: string;
	insightID: string;
	dataMakerName: string;
}

/** Processed node ready for D3 force simulation. */
export interface ProcessedNode extends d3.SimulationNodeDatum {
	id: string;
	label: string;
	type: string;
	color: string;
	fullName: string;
	description: string;
	connectionCount: number;
	propHash: Record<string, unknown>;
}

/**
 * One interface node and the data objects it carries in a given direction.
 * Populated from raw "carries" edges in the tripartite graph — not label parsing.
 */
export interface InterfaceRecord {
	label: string;
	dataObjects: string[];
}

/**
 * All data flows in one direction between a pair of systems.
 * Aggregates every interface that connects them in that direction.
 */
export interface DirectionBucket {
	fromUri: string;
	toUri: string;
	/** Unique, sorted data object labels crossing in this direction. */
	dataObjects: string[];
	/** Per-interface breakdown: one record per distinct interface in this direction. */
	interfaces: InterfaceRecord[];
	/** False when no interfaces carry data in this direction. */
	hasFlow: boolean;
}

/** Processed edge ready for D3 force simulation. */
export interface ProcessedEdge extends d3.SimulationLinkDatum<ProcessedNode> {
	id: string;
	sourceId: string;
	targetId: string;
	edgeType: string;
	edgeName: string;
	data: string;
	format: string;
	protocol: string;
	frequency: string;
	interfaceName: string;
	/** Per-data-object labels for rich tooltip display on aggregated edges. */
	dataObjects?: string[];
	/** Per-edge curve offset index for parallel edge spreading. 0 = center/straight. */
	curveIndex?: number;
	/** Prevent bidirectional merging for this edge (used by per-data-object edges). */
	noMerge?: boolean;
	/**
	 * True when data flows in both directions between this pair.
	 * Set by systemSubgraph (canonical connection edges) or by NetworkGraph merge loop
	 * (legacy DataObject graph path).
	 */
	bidirectional?: boolean;
	/**
	 * Forward direction bucket: sourceId → targetId flows.
	 * Present on connection edges produced by systemSubgraph; absent on legacy edges.
	 */
	forward?: DirectionBucket;
	/**
	 * Reverse direction bucket: targetId → sourceId flows.
	 * Present on connection edges produced by systemSubgraph; absent on legacy edges.
	 * Check reverse.hasFlow before rendering — it may be empty for one-directional edges.
	 */
	reverse?: DirectionBucket;
	/**
	 * @deprecated Use reverse DirectionBucket instead.
	 * Retained for the legacy DataObject graph (NetworkPage) merge path only.
	 */
	reverseEdgeData?: {
		edgeType: string;
		data: string;
		format: string;
		protocol: string;
		frequency: string;
		interfaceName: string;
		dataObjects?: string[];
	};
}

/** Tooltip data for hover display. */
export interface TooltipData {
	x: number;
	y: number;
	type: "node" | "edge";
	node?: ProcessedNode;
	edge?: ProcessedEdge;
	sourceLabel?: string;
	targetLabel?: string;
}

/** Legend entry for a node type. */
export interface LegendEntry {
	type: string;
	color: string;
	count: number;
}
