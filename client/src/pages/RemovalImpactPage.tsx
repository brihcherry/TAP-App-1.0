// RemovalImpactPage.tsx — System Removal Impact Analyzer.
//
// Two-panel layout:
//   Left:  System directory list (click to select a system for analysis)
//   Right: Tiered impact report (Critical / High / Medium)
//
// Data sources:
//   - GetSystemNetwork (once on mount) — raw tripartite graph for downstream detection
//   - GetSystemRemovalImpact (per selection) — provider counts + capability coverage

import { useState, useEffect, useMemo, useCallback } from "react";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { ArrowLeft, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight } from "lucide-react";
import { computeRemovalImpact } from "@/lib/removalImpact";
import type { RawNetworkData } from "@/lib/systemSubgraph";
import type { RemovalImpactReactorResponse, RemovalImpactResult } from "@/types/removalImpact";

const DATABASE_ID = "133db94b-4371-4763-bff9-edf7e5ed021b";

// ── System list entry (reuses SystemNetworkPage pattern) ────────────────────

interface SystemEntry {
  uri: string;
  label: string;
  connectionCount: number;
}

function buildSystemList(raw: RawNetworkData): SystemEntry[] {
  const interfaceUris = new Set(
    raw.nodes.filter((n) => n.type === "Interface").map((n) => n.uri),
  );

  const providerOf = new Map<string, string>();
  const consumersOf = new Map<string, Set<string>>();

  for (const edge of raw.edges) {
    if (edge.edgeType === "provide" && interfaceUris.has(edge.targetUri)) {
      providerOf.set(edge.targetUri, edge.sourceUri);
    } else if (edge.edgeType === "consume" && interfaceUris.has(edge.sourceUri)) {
      if (!consumersOf.has(edge.sourceUri)) consumersOf.set(edge.sourceUri, new Set());
      consumersOf.get(edge.sourceUri)!.add(edge.targetUri);
    }
  }

  const connectionCounts = new Map<string, Set<string>>();
  for (const ifcUri of interfaceUris) {
    const provider = providerOf.get(ifcUri);
    const consumers = consumersOf.get(ifcUri) ?? new Set();
    if (!provider || consumers.size === 0) continue;
    for (const consumer of consumers) {
      if (provider === consumer) continue;
      if (!connectionCounts.has(provider)) connectionCounts.set(provider, new Set());
      if (!connectionCounts.has(consumer)) connectionCounts.set(consumer, new Set());
      connectionCounts.get(provider)!.add(consumer);
      connectionCounts.get(consumer)!.add(provider);
    }
  }

  return raw.nodes
    .filter((n) => n.type === "System")
    .map((n) => ({
      uri: n.uri,
      label: n.label,
      connectionCount: connectionCounts.get(n.uri)?.size ?? 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const RemovalImpactPage = () => {
  const { insightId } = useInsight();

  // ── Network data (loaded once) ────────────────────────────────────────────
  const [rawData, setRawData] = useState<RawNetworkData | null>(null);
  const [systems, setSystems] = useState<SystemEntry[] | null>(null);
  const [isLoadingNetwork, setIsLoadingNetwork] = useState(true);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // ── Selection & analysis state ────────────────────────────────────────────
  const [selectedSystem, setSelectedSystem] = useState<SystemEntry | null>(null);
  const [impactResult, setImpactResult] = useState<RemovalImpactResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // ── List view state ───────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [mediumExpanded, setMediumExpanded] = useState(false);

  // ── Fetch network data on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!insightId) return;
    let cancelled = false;

    setIsLoadingNetwork(true);
    setNetworkError(null);

    runPixel(`GetSystemNetwork(database=["${DATABASE_ID}"]);`, insightId)
      .then((response) => {
        if (cancelled) return;
        if (response.errors.length > 0) {
          setNetworkError(response.errors.join(", "));
          return;
        }
        const output = response.pixelReturn[0]?.output as RawNetworkData;
        if (output?.nodes && output?.edges) {
          setRawData(output);
          setSystems(buildSystemList(output));
        } else {
          setNetworkError("Unexpected response format from server.");
        }
      })
      .catch((err) => {
        if (!cancelled)
          setNetworkError(err instanceof Error ? err.message : "Failed to load network.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingNetwork(false);
      });

    return () => { cancelled = true; };
  }, [insightId]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!systems) return [];
    const q = search.trim().toLowerCase();
    return systems.filter((s) => q === "" || s.label.toLowerCase().includes(q));
  }, [systems, search]);

  // ── Run analysis when a system is selected ────────────────────────────────
  useEffect(() => {
    if (!insightId || !selectedSystem || !rawData) return;
    let cancelled = false;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setImpactResult(null);
    setMediumExpanded(false);

    const pixel = `GetSystemRemovalImpact(database=["${DATABASE_ID}"], system=["${selectedSystem.uri}"]);`;

    runPixel(pixel, insightId)
      .then((response) => {
        if (cancelled) return;
        if (response.errors.length > 0) {
          setAnalysisError(response.errors.join(", "));
          return;
        }
        const output = response.pixelReturn[0]?.output as RemovalImpactReactorResponse;
        if (output?.systemUri) {
          const result = computeRemovalImpact(selectedSystem.uri, output, rawData);
          setImpactResult(result);
        } else {
          setAnalysisError("Unexpected response format from reactor.");
        }
      })
      .catch((err) => {
        if (!cancelled)
          setAnalysisError(err instanceof Error ? err.message : "Analysis failed.");
      })
      .finally(() => {
        if (!cancelled) setIsAnalyzing(false);
      });

    return () => { cancelled = true; };
  }, [insightId, selectedSystem, rawData]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectSystem = useCallback((entry: SystemEntry) => {
    setSelectedSystem(entry);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedSystem(null);
    setImpactResult(null);
    setAnalysisError(null);
    setMediumExpanded(false);
  }, []);

  // ── Render: Analysis view ─────────────────────────────────────────────────
  if (selectedSystem) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Removal Impact: {selectedSystem.label}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Simulated removal analysis &middot; {selectedSystem.connectionCount} connection{selectedSystem.connectionCount !== 1 ? "s" : ""}
            </p>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {/* Loading */}
          {isAnalyzing && (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
              <p className="text-sm text-gray-500">Analyzing removal impact…</p>
            </div>
          )}

          {/* Error */}
          {analysisError && !isAnalyzing && (
            <div className="max-w-lg mx-auto rounded-lg border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm font-medium text-red-800">Analysis failed</p>
              <p className="mt-1 text-xs text-red-600">{analysisError}</p>
            </div>
          )}

          {/* Impact report */}
          {impactResult && !isAnalyzing && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* ── Summary banner ──────────────────────────────────────── */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Impact Summary</h2>
                <div className="flex gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Critical: {impactResult.summary.critical}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    <AlertCircle className="h-3.5 w-3.5" />
                    High: {impactResult.summary.high}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                    <Info className="h-3.5 w-3.5" />
                    Medium: {impactResult.summary.medium}
                  </span>
                </div>
                {impactResult.summary.critical === 0 && impactResult.summary.high === 0 && impactResult.summary.medium === 0 && (
                  <p className="mt-3 text-sm text-gray-500">
                    No significant impact detected. This system has no outbound data flows or capability group memberships recorded in the current dataset.
                  </p>
                )}
              </div>

              {/* ── Critical impacts ────────────────────────────────────── */}
              {impactResult.summary.critical > 0 && (
                <div className="rounded-lg border-2 border-red-300 bg-white p-4">
                  <h2 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Critical Impacts
                  </h2>

                  {/* Orphaned data objects */}
                  {impactResult.dataObjectImpacts
                    .filter((d) => d.isOrphaned)
                    .length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-2">
                        Orphaned Data Objects (No Other Provider)
                      </h3>
                      <ul className="space-y-1.5">
                        {impactResult.dataObjectImpacts
                          .filter((d) => d.isOrphaned)
                          .map((d) => (
                            <li
                              key={d.uri}
                              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-red-900">{d.label}</span>
                              <span className="ml-2 text-xs text-red-600">
                                — sole provider in enterprise
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {/* Capability groups dropping to 0 */}
                  {impactResult.capabilityGroupImpacts
                    .filter((c) => c.tier === "critical")
                    .length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-2">
                        Unsupported Capability Groups (0 Remaining)
                      </h3>
                      <ul className="space-y-1.5">
                        {impactResult.capabilityGroupImpacts
                          .filter((c) => c.tier === "critical")
                          .map((c) => (
                            <li
                              key={c.uri}
                              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-red-900">{c.label}</span>
                              <span className="ml-2 text-xs text-red-600">
                                — was {c.totalSupporters} supporter{c.totalSupporters !== 1 ? "s" : ""}, drops to 0
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ── High impacts ────────────────────────────────────────── */}
              {impactResult.capabilityGroupImpacts.filter((c) => c.tier === "high").length > 0 && (
                <div className="rounded-lg border-2 border-amber-300 bg-white p-4">
                  <h2 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    High Impacts — Single-Point Dependencies
                  </h2>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">
                    Capability Groups Dropping to 1 Supporter
                  </h3>
                  <ul className="space-y-1.5">
                    {impactResult.capabilityGroupImpacts
                      .filter((c) => c.tier === "high")
                      .map((c) => {
                        const remainingSystem = c.systems.find(
                          (s) => s.uri !== selectedSystem.uri,
                        );
                        return (
                          <li
                            key={c.uri}
                            className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                          >
                            <span className="font-medium text-amber-900">{c.label}</span>
                            <span className="ml-2 text-xs text-amber-700">
                              — only{" "}
                              <span className="font-semibold">
                                {remainingSystem?.label ?? "1 system"}
                              </span>{" "}
                              remains (was {c.totalSupporters})
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}

              {/* ── Medium impacts (collapsible) ───────────────────────── */}
              {impactResult.affectedSystemImpacts.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setMediumExpanded((prev) => !prev)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Info className="h-4 w-4 text-gray-500" />
                      Downstream Systems Losing Data Feeds
                      <span className="text-xs font-normal text-gray-400">
                        ({impactResult.affectedSystemImpacts.length} system{impactResult.affectedSystemImpacts.length !== 1 ? "s" : ""})
                      </span>
                    </h2>
                    {mediumExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                  {mediumExpanded && (
                    <div className="border-t border-gray-200 p-4">
                      <ul className="space-y-2">
                        {impactResult.affectedSystemImpacts.map((sys) => (
                          <li
                            key={sys.uri}
                            className="rounded border border-gray-200 bg-gray-50 px-3 py-2"
                          >
                            <div className="flex items-baseline justify-between">
                              <span className="text-sm font-medium text-gray-800">
                                {sys.label}
                              </span>
                              {sys.hasAlternatives && (
                                <span className="text-[10px] uppercase tracking-wide text-green-600 font-semibold">
                                  Has alternatives
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {sys.lostDataObjects.map((doLabel) => (
                                <span
                                  key={doLabel}
                                  className="inline-block rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700"
                                >
                                  {doLabel}
                                </span>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ── Non-orphaned data objects (for context) ────────────── */}
              {impactResult.dataObjectImpacts.filter((d) => !d.isOrphaned).length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">
                    Data Objects With Alternative Providers
                  </h2>
                  <ul className="space-y-1.5">
                    {impactResult.dataObjectImpacts
                      .filter((d) => !d.isOrphaned)
                      .map((d) => (
                        <li
                          key={d.uri}
                          className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm flex items-baseline justify-between"
                        >
                          <span className="font-medium text-gray-800">{d.label}</span>
                          <span className="text-xs text-gray-500">
                            {d.allProviders.length - 1} other provider{d.allProviders.length - 1 !== 1 ? "s" : ""}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: System selection view ─────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">System Removal Impact Analyzer</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Select a system to simulate its removal and assess downstream impact.
        </p>
      </header>

      {/* Loading */}
      {isLoadingNetwork && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-50">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">Loading network data…</p>
        </div>
      )}

      {/* Error */}
      {networkError && !isLoadingNetwork && (
        <div className="flex flex-1 items-center justify-center bg-gray-50">
          <div className="max-w-sm rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-800">Failed to load network</p>
            <p className="mt-1 text-xs text-red-600">{networkError}</p>
          </div>
        </div>
      )}

      {/* System list */}
      {systems && !isLoadingNetwork && (
        <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
          {/* Search */}
          <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
            <input
              type="search"
              placeholder="Search systems…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* List */}
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
                      onClick={() => handleSelectSystem(entry)}
                      className="group flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 cursor-pointer"
                    >
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: "rgb(31, 119, 180)" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 group-hover:text-blue-800">
                        {entry.label}
                      </span>
                      <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                        {entry.connectionCount}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {filtered.length > 0 && (
              <p className="mt-4 text-xs text-gray-400">
                Showing {filtered.length} system{filtered.length !== 1 ? "s" : ""}
                {search ? ` matching "${search}"` : ""} · click a system to analyze removal impact
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
