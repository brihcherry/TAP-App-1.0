// SystemNetworkPage.tsx — System Network Map with two views:
//   1. Directory listing of all Systems with connection counts
//   2. Click-to-graph: D3 force-directed subgraph centered on a selected system
//      with degree-based expansion (BFS through System↔Interface↔DataObject)
//
// Data comes from GetSystemNetworkReactor (fetched once on mount).

import { useState, useEffect, useMemo, useCallback } from "react";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { NetworkGraph } from "@/components/NetworkGraph";
import { GraphTooltip } from "@/components/GraphTooltip";
import { GraphLegend } from "@/components/GraphLegend";
import { SystemGraphSidebar } from "@/components/SystemGraphSidebar";
import { computeSubgraph, canonicalPairKey, type RawNetworkData } from "@/lib/systemSubgraph";
import type { TooltipData } from "@/types/graph";

const DATABASE_ID = "133db94b-4371-4763-bff9-edf7e5ed021b";

const TYPE_COLORS: Record<string, string> = {
  System: "rgb(31, 119, 180)",
};

// ── Processed entry for the list ──────────────────────────────────────────────

interface NetworkEntry {
  uri: string;
  label: string;
  type: "System";
  connectionCount: number;
}

function buildEntries(raw: RawNetworkData): NetworkEntry[] {
  const counts = new Map<string, number>();
  for (const e of raw.edges) {
    counts.set(e.sourceUri, (counts.get(e.sourceUri) ?? 0) + 1);
    counts.set(e.targetUri, (counts.get(e.targetUri) ?? 0) + 1);
  }

  return raw.nodes
    .filter((n) => n.type === "System")
    .map((n) => ({
      uri: n.uri,
      label: n.label,
      type: "System" as const,
      connectionCount: counts.get(n.uri) ?? 0,
    }))
    .sort((a, b) => b.connectionCount - a.connectionCount);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const SystemNetworkPage = () => {
  const { insightId } = useInsight();

  // Shared data: raw response preserved for graph extraction
  const [rawData, setRawData] = useState<RawNetworkData | null>(null);
  const [entries, setEntries] = useState<NetworkEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // List view state
  const [search, setSearch] = useState("");

  // Graph view state
  const [selectedSystem, setSelectedSystem] = useState<NetworkEntry | null>(null);
  const [degree, setDegree] = useState(1);
  const [isGraphLocked, setIsGraphLocked] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [expandedPairKey, setExpandedPairKey] = useState<string | null>(null);

  // ── Fetch (once on mount) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!insightId) return;
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    runPixel(`GetSystemNetwork(database=["${DATABASE_ID}"]);`, insightId)
      .then((response) => {
        if (cancelled) return;
        if (response.errors.length > 0) {
          setError(response.errors.join(", "));
          return;
        }
        const output = response.pixelReturn[0]?.output as RawNetworkData;
        if (output?.nodes && output?.edges) {
          setRawData(output);
          setEntries(buildEntries(output));
        } else {
          setError("Unexpected response format from server.");
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load network.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [insightId]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = search.trim().toLowerCase();
    return entries.filter((e) => q === "" || e.label.toLowerCase().includes(q));
  }, [entries, search]);

  // ── Subgraph computation (only when a system is selected) ─────────────────
  const subgraph = useMemo(() => {
    if (!rawData || !selectedSystem) return null;
    return computeSubgraph(rawData, selectedSystem.uri, degree);
  }, [rawData, selectedSystem, degree]);

  const canExpand = useMemo(() => {
    if (!subgraph) return false;
    return degree < subgraph.maxDegree;
  }, [degree, subgraph]);

  // Swap aggregated edge for per-data-object edges when a pair is expanded
  const displayEdges = useMemo(() => {
    if (!subgraph) return [];
    if (!expandedPairKey) return subgraph.edges;
    const exploded = subgraph.perDataObjectEdges.get(expandedPairKey);
    if (!exploded?.length) return subgraph.edges;
    return [
      ...subgraph.edges.filter(
        (e) => canonicalPairKey(e.sourceId, e.targetId) !== expandedPairKey,
      ),
      ...exploded,
    ];
  }, [subgraph, expandedPairKey]);

  // Label for the sidebar's Edge Detail View section
  const expandedPairLabel = useMemo(() => {
    if (!expandedPairKey || !subgraph) return null;
    const [a, b] = expandedPairKey.split("||");
    const la = subgraph.nodes.find((n) => n.id === a)?.label ?? "";
    const lb = subgraph.nodes.find((n) => n.id === b)?.label ?? "";
    return `${la} ↔ ${lb}`;
  }, [expandedPairKey, subgraph]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSystemClick = useCallback((entry: NetworkEntry) => {
    setSelectedSystem(entry);
    setDegree(1);
    setIsGraphLocked(false);
    setTooltip(null);
    setExpandedPairKey(null);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedSystem(null);
    setDegree(1);
    setIsGraphLocked(false);
    setTooltip(null);
    setExpandedPairKey(null);
  }, []);

  const handleExpand = useCallback(() => {
    setDegree((prev) => prev + 1);
    setExpandedPairKey(null);
  }, []);

  const handleDegreeChange = useCallback((newDegree: number) => {
    setDegree(newDegree);
    setExpandedPairKey(null);
  }, []);

  const handleEdgeClick = useCallback((sourceId: string, targetId: string) => {
    const key = canonicalPairKey(sourceId, targetId);
    setExpandedPairKey((prev) => (prev === key ? null : key));
  }, []);

  const handleCollapsePair = useCallback(() => {
    setExpandedPairKey(null);
  }, []);

  // ── Render: Graph view ────────────────────────────────────────────────────
  if (selectedSystem && subgraph) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {selectedSystem.label}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              System Network Graph &middot; {subgraph.nodes.length} nodes &middot; {subgraph.edges.length} edges
              &middot; Degree {degree}{subgraph.maxDegree > 0 ? ` of ${subgraph.maxDegree}` : ""}
            </p>
          </div>
        </header>

        {/* Sidebar + Graph */}
        <div className="flex flex-1 overflow-hidden">
          <SystemGraphSidebar
            systemLabel={selectedSystem.label}
            degree={degree}
            maxDegree={subgraph.maxDegree}
            onDegreeChange={handleDegreeChange}
            onExpand={handleExpand}
            canExpand={canExpand}
            nodeCount={subgraph.nodes.length}
            edgeCount={subgraph.edges.length}
            isGraphLocked={isGraphLocked}
            onLockGraph={() => setIsGraphLocked(true)}
            onUnlockGraph={() => setIsGraphLocked(false)}
            onBack={handleBack}
            expandedPairLabel={expandedPairLabel}
            onCollapsePair={handleCollapsePair}
          />

          <main className="flex-1 relative overflow-hidden">
            {subgraph.nodes.length === 0 ? (
              <div className="flex h-full items-center justify-center bg-gray-50">
                <div className="text-center">
                  <p className="text-sm text-gray-500">
                    No connections found for <span className="font-medium">{selectedSystem.label}</span>.
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    This system has no interfaces or data objects in the network.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <NetworkGraph
                  nodes={subgraph.nodes}
                  edges={displayEdges}
                  onTooltipChange={setTooltip}
                  onEdgeClick={handleEdgeClick}
                  isInteractionLocked={isGraphLocked}
                  curveOffset={0}
                />
                <GraphLegend entries={subgraph.legend} />
                <GraphTooltip tooltip={tooltip} />
              </>
            )}
          </main>
        </div>
      </div>
    );
  }

  // ── Render: List view ─────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">System Network Map</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Click into each system to view the network of data flow between other systems. 
        </p>
      </header>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-50">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">Loading network data…</p>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex flex-1 items-center justify-center bg-gray-50">
          <div className="max-w-sm rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-800">Failed to load network</p>
            <p className="mt-1 text-xs text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Content */}
      {entries && !isLoading && (
        <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
          {/* Search bar */}
          <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
            <input
              type="search"
              placeholder="Search systems…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Entry list */}
          <div className="flex-1 overflow-y-auto p-6">
            {filtered.length === 0 ? (
              <p className="text-sm italic text-gray-400">
                {search ? `No results for "${search}"` : "No systems found."}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((entry) => (
                  <li key={entry.uri}>
                    <button
                      type="button"
                      title={entry.uri}
                      onClick={() => entry.type === "System" && handleSystemClick(entry)}
                      className={`group flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-colors ${
                        entry.type === "System"
                          ? "hover:border-blue-300 hover:bg-blue-50 cursor-pointer"
                          : "cursor-default"
                      }`}
                    >
                      {/* Color dot */}
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: TYPE_COLORS[entry.type] }}
                      />

                      {/* Name */}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 group-hover:text-blue-800">
                        {entry.label}
                      </span>

                      {/* Connection count badge */}
                      <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                        {entry.connectionCount}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Result count footer */}
            {filtered.length > 0 && (
              <p className="mt-4 text-xs text-gray-400">
                Showing {filtered.length} system{filtered.length !== 1 ? "s" : ""}
                {search ? ` matching "${search}"` : ""} · sorted by connections (highest first)
                {" · click a system to view its network graph"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
