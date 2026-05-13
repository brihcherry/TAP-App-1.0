// SystemNetworkPage.tsx — System Network Map with two views:
//   1. Directory listing of all Systems with connection counts
//   2. Click-to-graph: D3 force-directed subgraph centered on a selected system
//      with degree-based expansion (BFS through System↔Interface↔DataObject)
//
// Data comes from GetSystemNetworkReactor (fetched once on mount).

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { ArrowLeft, ChevronDown, Search, X } from "lucide-react";
import { NetworkGraph } from "@/components/NetworkGraph";
import { GraphTooltip } from "@/components/GraphTooltip";
import { GraphLegend } from "@/components/GraphLegend";
import { SystemGraphSidebar } from "@/components/SystemGraphSidebar";
import { EdgeDetailSidebar } from "@/components/EdgeDetailSidebar";
import { computeSubgraph, computeDirectNeighborCounts, canonicalPairKey, type RawNetworkData } from "@/lib/systemSubgraph";
import type { TooltipData, ProcessedEdge } from "@/types/graph";
import type { HighlightSet } from "@/lib/graphAnalysis";

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

interface ActiveSystemEntry {
  uri: string;
  label: string;
}

function buildEntries(
  activeSystems: ActiveSystemEntry[],
  raw: RawNetworkData | null,
): NetworkEntry[] {
  const counts = raw ? computeDirectNeighborCounts(raw) : new Map<string, number>();

  return activeSystems
    .map((s) => ({
      uri: s.uri,
      label: s.label,
      type: "System" as const,
      connectionCount: counts.get(s.uri) ?? 0,
    }))
    .sort((a, b) => b.connectionCount - a.connectionCount);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const SystemNetworkPage = () => {
  const { insightId } = useInsight();
  const location = useLocation();
  const navigate = useNavigate();

  // When navigated here from the capability group sidebar, location.state carries
  // { systemUri, systemLabel, returnGroup }. Auto-select the system once data loads.
  const fromSidebar = useRef<{ systemUri: string; systemLabel: string; returnGroup?: { uri: string; label: string } } | null>(
    (location.state as { systemUri?: string; systemLabel?: string; returnGroup?: { uri: string; label: string } } | null)
      ?.systemUri
      ? (location.state as { systemUri: string; systemLabel: string; returnGroup?: { uri: string; label: string } })
      : null
  );

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
  const [selectedEdge, setSelectedEdge] = useState<ProcessedEdge | null>(null);

  // Data object filter state
  const [dataObjectFilter, setDataObjectFilter] = useState<string | null>(null);
  const [doDropdownOpen, setDoDropdownOpen] = useState(false);
  const [doSearch, setDoSearch] = useState("");
  const doDropdownRef = useRef<HTMLDivElement>(null);

  // ── Fetch (once on mount) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!insightId) return;
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    Promise.all([
      runPixel(`GetActiveSystems();`, insightId),
      runPixel(`GetSystemNetwork();`, insightId),
    ])
      .then(([activeRes, networkRes]) => {
        if (cancelled) return;

        // Parse active systems list
        if (activeRes.errors.length > 0) {
          setError(activeRes.errors.join(", "));
          return;
        }
        const activeOutput = activeRes.pixelReturn[0]?.output as { systems?: ActiveSystemEntry[] };
        if (!activeOutput?.systems) {
          setError("Unexpected response format from GetActiveSystems.");
          return;
        }

        // Parse network graph data
        let networkData: RawNetworkData | null = null;
        if (networkRes.errors.length === 0) {
          const netOutput = networkRes.pixelReturn[0]?.output as RawNetworkData;
          if (netOutput?.nodes && netOutput?.edges) {
            networkData = netOutput;
          }
        }

        setRawData(networkData);
        const built = buildEntries(activeOutput.systems, networkData);
        setEntries(built);

        // Auto-select system if navigated here from the capability group sidebar
        if (fromSidebar.current) {
          const { systemUri, systemLabel } = fromSidebar.current;
          const match = built.find((e) => e.uri === systemUri);
          setSelectedSystem(match ?? { uri: systemUri, label: systemLabel, type: "System", connectionCount: 0 });
          fromSidebar.current = null;
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load data.");
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
    if (!selectedSystem) return null;
    if (!rawData) {
      // No network data yet — show isolated node
      return computeSubgraph(
        { nodes: [], edges: [] },
        selectedSystem.uri,
        degree,
        selectedSystem.label,
      );
    }
    return computeSubgraph(rawData, selectedSystem.uri, degree, selectedSystem.label);
  }, [rawData, selectedSystem, degree]);

  const canExpand = useMemo(() => {
    if (!subgraph) return false;
    return degree < subgraph.maxDegree;
  }, [degree, subgraph]);

  // Swap aggregated edge for per-data-object edges when a pair is expanded
  const displayEdges = useMemo(() => {
    if (!subgraph) return [];
    return subgraph.edges;
  }, [subgraph]);

  // ── Data object filter ────────────────────────────────────────────────────
  // Sorted unique data objects present in the current subgraph, with the count
  // of edges (connections) that carry each one.
  const availableDataObjects = useMemo(() => {
    if (!subgraph) return [];
    const counts = new Map<string, number>();
    for (const edge of subgraph.edges) {
      const labels = new Set<string>([
        ...(edge.forward?.dataObjects ?? []),
        ...(edge.reverse?.dataObjects ?? []),
      ]);
      for (const label of labels) {
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([label, edgeCount]) => ({ label, edgeCount }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [subgraph]);

  // Subset of availableDataObjects filtered by the dropdown search input.
  const filteredDataObjects = useMemo(() => {
    const q = doSearch.trim().toLowerCase();
    return q === ""
      ? availableDataObjects
      : availableDataObjects.filter((d) => d.label.toLowerCase().includes(q));
  }, [availableDataObjects, doSearch]);

  // HighlightSet for the selected data object: all edges and their endpoints
  // that carry it in either the forward or reverse direction.
  const dataObjectHighlightSet = useMemo((): HighlightSet | null => {
    if (!dataObjectFilter || !subgraph) return null;
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    for (const edge of subgraph.edges) {
      const inForward = edge.forward?.dataObjects.includes(dataObjectFilter) ?? false;
      const inReverse = edge.reverse?.dataObjects.includes(dataObjectFilter) ?? false;
      if (inForward || inReverse) {
        edgeIds.add(edge.id);
        nodeIds.add(edge.sourceId);
        nodeIds.add(edge.targetId);
      }
    }
    return { nodeIds, edgeIds };
  }, [dataObjectFilter, subgraph]);

  // Close the data object dropdown on outside click.
  useEffect(() => {
    if (!doDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (doDropdownRef.current && !doDropdownRef.current.contains(e.target as Node)) {
        setDoDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [doDropdownOpen]);

  // Canonical pair key for the selected edge (drives NetworkGraph highlight)
  const selectedEdgePairKey = useMemo(() => {
    if (!selectedEdge) return null;
    return canonicalPairKey(selectedEdge.sourceId, selectedEdge.targetId);
  }, [selectedEdge]);

  // Labels for the selected edge's two endpoints
  const selectedEdgeSourceLabel = useMemo(() => {
    if (!selectedEdge || !subgraph) return "";
    return subgraph.nodes.find((n) => n.id === selectedEdge.sourceId)?.label ?? "";
  }, [selectedEdge, subgraph]);

  const selectedEdgeTargetLabel = useMemo(() => {
    if (!selectedEdge || !subgraph) return "";
    return subgraph.nodes.find((n) => n.id === selectedEdge.targetId)?.label ?? "";
  }, [selectedEdge, subgraph]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSystemClick = useCallback((entry: NetworkEntry) => {
    setSelectedSystem(entry);
    setDegree(1);
    setIsGraphLocked(false);
    setTooltip(null);
    setSelectedEdge(null);
    setDataObjectFilter(null);
    setDoDropdownOpen(false);
    setDoSearch("");
  }, []);

  const handleBack = useCallback(() => {
    // If we came from the capability group sidebar, return to the bubble graph with the group restored
    if (location.state && (location.state as { systemUri?: string }).systemUri) {
      const returnGroup = (location.state as { returnGroup?: { uri: string; label: string } }).returnGroup;
      const viewMode = (location.state as { viewMode?: string }).viewMode;
      navigate("/", { state: { ...(returnGroup ? { restoreGroup: returnGroup } : {}), ...(viewMode ? { viewMode } : {}) } });
      return;
    }
    setSelectedSystem(null);
    setDegree(1);
    setIsGraphLocked(false);
    setTooltip(null);
    setSelectedEdge(null);
    setDataObjectFilter(null);
    setDoDropdownOpen(false);
    setDoSearch("");
  }, [location.state, navigate]);

  const handleExpand = useCallback(() => {
    setDegree((prev) => prev + 1);
    setSelectedEdge(null);
    setDataObjectFilter(null);
    setDoDropdownOpen(false);
    setDoSearch("");
  }, []);

  const handleDegreeChange = useCallback((newDegree: number) => {
    setDegree(newDegree);
    setSelectedEdge(null);
    setDataObjectFilter(null);
    setDoDropdownOpen(false);
    setDoSearch("");
  }, []);

  const handleEdgeClick = useCallback((sourceId: string, targetId: string) => {
    if (!subgraph) return;
    const key = canonicalPairKey(sourceId, targetId);
    const edge = subgraph.edges.find(
      (e) => canonicalPairKey(e.sourceId, e.targetId) === key,
    ) ?? null;
    setSelectedEdge((prev) => (prev && canonicalPairKey(prev.sourceId, prev.targetId) === key ? null : edge));
  }, [subgraph]);

  // ── Render: Graph view ────────────────────────────────────────────────────
  if (selectedSystem && subgraph) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-4">
          {location.state && (location.state as { systemUri?: string }).systemUri && (
            <button
              type="button"
              onClick={handleBack}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {selectedSystem.label}: What is the network of systems that pass data objects to/from this system?
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
            hideBackButton={!!(location.state && (location.state as { systemUri?: string }).systemUri)}
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
                  selectedEdgePairKey={selectedEdgePairKey}
                  highlightSet={dataObjectHighlightSet}
                />
                <GraphLegend entries={subgraph.legend} />
                <GraphTooltip tooltip={tooltip} />
                {/* ── Data Object Filter dropdown ─────────────────────────────── */}
                <div ref={doDropdownRef} className="absolute top-3 left-3 z-20 flex flex-col gap-2">
                  {/* Trigger row: dropdown toggle + conditional Reset Graph button */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDoDropdownOpen((prev) => !prev)}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-md hover:bg-gray-50 focus:outline-none"
                    >
                      <span className="max-w-[200px] truncate text-gray-700">
                        {dataObjectFilter ?? "Filter by Data Object"}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-gray-400 transition-transform ${doDropdownOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {dataObjectFilter && (
                      <button
                        type="button"
                        onClick={() => {
                          setDataObjectFilter(null);
                          setDoDropdownOpen(false);
                          setDoSearch("");
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-md hover:border-red-200 hover:bg-red-50 hover:text-red-700 text-gray-600 focus:outline-none"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reset Graph
                      </button>
                    )}
                  </div>

                  {/* Dropdown panel */}
                  {doDropdownOpen && (
                    <div className="w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                      {/* Search input */}
                      <div className="border-b border-gray-100 p-2">
                        <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
                          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search data objects…"
                            value={doSearch}
                            onChange={(e) => setDoSearch(e.target.value)}
                            className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
                            autoFocus
                          />
                          {doSearch && (
                            <button type="button" onClick={() => setDoSearch("")}>
                              <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Data object list */}
                      <div className="max-h-60 overflow-y-auto">
                        {filteredDataObjects.length === 0 ? (
                          <div className="p-3 text-center text-xs text-gray-400">
                            {availableDataObjects.length === 0
                              ? "No data objects in current graph."
                              : `No results for "${doSearch}"`}
                          </div>
                        ) : (
                          filteredDataObjects.map(({ label, edgeCount }) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => {
                                setDataObjectFilter((prev) => (prev === label ? null : label));
                                setDoDropdownOpen(false);
                                setDoSearch("");
                              }}
                              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 ${
                                dataObjectFilter === label
                                  ? "bg-blue-50 font-medium text-blue-700"
                                  : "text-gray-700"
                              }`}
                            >
                              <span className="truncate">{label}</span>
                              <span
                                className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                  dataObjectFilter === label
                                    ? "bg-blue-100 text-blue-600"
                                    : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                {edgeCount}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </main>

          {selectedEdge && (
            <EdgeDetailSidebar
              edge={selectedEdge}
              sourceLabel={selectedEdgeSourceLabel}
              targetLabel={selectedEdgeTargetLabel}
              onClose={() => setSelectedEdge(null)}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Render: List view ─────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">System Network Map: What is the network of systems that pass data objects to/from this system?</h1>
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
                      <span
                        title={`${entry.connectionCount} direct system connection${entry.connectionCount !== 1 ? "s" : ""}`}
                        className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-700"
                      >
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
