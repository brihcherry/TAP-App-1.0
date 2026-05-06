// RemovalImpactPage.tsx — Data Flow Impact Analyzer.
//
// Two-panel layout:
//   Left:  System directory list (click to select a system for analysis)
//   Right: Data flow impact report (Sole Provider / Critical Relay / Non-Critical)
//
// Data sources:
//   - GetSystemNetwork (once on mount) — raw tripartite graph for system list building
//   - GetDataFlowImpact (per selection) — per-DataObject ICD flow graph + isolation analysis

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { ArrowLeft, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight } from "lucide-react";
import { computeDataFlowImpact } from "@/lib/dataFlowImpact";
import type { RawNetworkData } from "@/lib/systemSubgraph";
import type { DataFlowImpactReactorResponse, DataFlowImpactResult, DataFlowEntry } from "@/types/dataFlowImpact";

const DATABASE_ID = "133db94b-4371-4763-bff9-edf7e5ed021b";

// ── System list entry (reuses SystemNetworkPage pattern) ────────────────────

interface SystemEntry {
  uri: string;
  label: string;
}

interface SystemImpactRank {
  soleProviderCount: number;
  criticalRelayCount: number;
  nonCriticalProviderCount: number;
  totalIsolatedCount: number;
}

const EMPTY_RANK: SystemImpactRank = {
  soleProviderCount: 0,
  criticalRelayCount: 0,
  nonCriticalProviderCount: 0,
  totalIsolatedCount: 0,
};

function rankFromImpactResponse(output: DataFlowImpactReactorResponse | undefined): SystemImpactRank {
  if (!output?.dataFlowImpacts) return EMPTY_RANK;

  let soleProviderCount = 0;
  let criticalRelayCount = 0;
  let nonCriticalProviderCount = 0;
  let totalIsolatedCount = 0;

  for (const entry of output.dataFlowImpacts) {
    if (entry.classification === "soleProvider") soleProviderCount += 1;
    if (entry.classification === "criticalRelay") criticalRelayCount += 1;
    if (entry.classification === "nonCritical" && entry.role === "provider") {
      nonCriticalProviderCount += 1;
    }
    totalIsolatedCount += entry.isolatedSystems.length;
  }

  return {
    soleProviderCount,
    criticalRelayCount,
    nonCriticalProviderCount,
    totalIsolatedCount,
  };
}

function compareByCriticality(a: SystemEntry & SystemImpactRank, b: SystemEntry & SystemImpactRank): number {
  if (b.soleProviderCount !== a.soleProviderCount) {
    return b.soleProviderCount - a.soleProviderCount;
  }
  if (b.criticalRelayCount !== a.criticalRelayCount) {
    return b.criticalRelayCount - a.criticalRelayCount;
  }
  if (b.nonCriticalProviderCount !== a.nonCriticalProviderCount) {
    return b.nonCriticalProviderCount - a.nonCriticalProviderCount;
  }
  if (b.totalIsolatedCount !== a.totalIsolatedCount) {
    return b.totalIsolatedCount - a.totalIsolatedCount;
  }
  return a.label.localeCompare(b.label);
}

function buildSystemList(raw: RawNetworkData): SystemEntry[] {
  return raw.nodes
    .filter((n) => n.type === "System")
    .map((n) => ({
      uri: n.uri,
      label: n.label,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const RemovalImpactPage = () => {
  const { insightId } = useInsight();
  const navigate = useNavigate();
  const location = useLocation();
  // When navigated here from the sidebar, location.state carries { systemUri, systemLabel }
  const fromSidebar = useRef<{ systemUri: string; systemLabel: string } | null>(
    (location.state as { systemUri?: string; systemLabel?: string } | null)
      ?.systemUri
      ? (location.state as { systemUri: string; systemLabel: string })
      : null
  );

  // ── Network data (loaded once) ────────────────────────────────────────────
  const [rawData, setRawData] = useState<RawNetworkData | null>(null);
  const [systems, setSystems] = useState<SystemEntry[] | null>(null);
  const [isLoadingNetwork, setIsLoadingNetwork] = useState(true);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [systemRanks, setSystemRanks] = useState<Record<string, SystemImpactRank>>({});
  const [isRankingSystems, setIsRankingSystems] = useState(false);

  // ── Selection & analysis state ────────────────────────────────────────────
  const [selectedSystem, setSelectedSystem] = useState<SystemEntry | null>(null);
  const [impactResult, setImpactResult] = useState<DataFlowImpactResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // ── List view state ───────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [nonCriticalExpanded, setNonCriticalExpanded] = useState(false);
  const [showTermGuide, setShowTermGuide] = useState(false);

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
          const list = buildSystemList(output);
          setSystems(list);
          // Auto-select if we arrived here from the sidebar
          if (fromSidebar.current) {
            const { systemUri, systemLabel } = fromSidebar.current;
            const match = list.find((s) => s.uri === systemUri);
            setSelectedSystem(match ?? { uri: systemUri, label: systemLabel });
            fromSidebar.current = null;
          }
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

    return systems
      .map((s) => ({
        ...s,
        ...(systemRanks[s.uri] ?? EMPTY_RANK),
      }))
      .filter((s) => q === "" || s.label.toLowerCase().includes(q))
      .sort(compareByCriticality);
  }, [systems, search, systemRanks]);

  // ── Rank systems by criticality (SP > CR > NP) ──────────────────────────
  useEffect(() => {
    if (!insightId || !systems || systems.length === 0) return;
    let cancelled = false;

    setIsRankingSystems(true);

    const runRanking = async () => {
      const ranks: Record<string, SystemImpactRank> = {};
      const batchSize = 8;

      for (let i = 0; i < systems.length; i += batchSize) {
        if (cancelled) return;

        const batch = systems.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (sys) => {
            try {
              const pixel = `GetDataFlowImpact(database=["${DATABASE_ID}"], system=["${sys.uri}"]);`;
              const response = await runPixel(pixel, insightId);
              if (response.errors.length > 0) {
                return { uri: sys.uri, rank: EMPTY_RANK };
              }
              const output = response.pixelReturn[0]?.output as DataFlowImpactReactorResponse | undefined;
              return { uri: sys.uri, rank: rankFromImpactResponse(output) };
            } catch {
              return { uri: sys.uri, rank: EMPTY_RANK };
            }
          }),
        );

        for (const item of batchResults) {
          ranks[item.uri] = item.rank;
        }
      }

      if (!cancelled) {
        setSystemRanks(ranks);
        setIsRankingSystems(false);
      }
    };

    runRanking().catch(() => {
      if (!cancelled) setIsRankingSystems(false);
    });

    return () => {
      cancelled = true;
    };
  }, [insightId, systems]);

  // ── Run analysis when a system is selected ────────────────────────────────
  useEffect(() => {
    if (!insightId || !selectedSystem) return;
    let cancelled = false;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setImpactResult(null);
    setNonCriticalExpanded(false);

    const pixel = `GetDataFlowImpact(database=["${DATABASE_ID}"], system=["${selectedSystem.uri}"]);`;

    runPixel(pixel, insightId)
      .then((response) => {
        if (cancelled) return;
        if (response.errors.length > 0) {
          setAnalysisError(response.errors.join(", "));
          return;
        }
        const output = response.pixelReturn[0]?.output as DataFlowImpactReactorResponse;
        if (output?.systemUri) {
          const result = computeDataFlowImpact(output);
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
  }, [insightId, selectedSystem]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectSystem = useCallback((entry: SystemEntry) => {
    setSelectedSystem(entry);
  }, []);

  const handleBack = useCallback(() => {
    // If we came from the sidebar, go back in history so the bubble graph is restored
    if (location.state && (location.state as { systemUri?: string }).systemUri) {
      navigate(-1);
      return;
    }
    setSelectedSystem(null);
    setImpactResult(null);
    setAnalysisError(null);
    setNonCriticalExpanded(false);
    setShowTermGuide(false);
  }, [location.state, navigate]);

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
              Data Flow Impact: {selectedSystem.label}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Simulated removal analysis
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTermGuide((prev) => !prev)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-300 hover:text-blue-700"
            aria-expanded={showTermGuide}
            aria-label="Toggle impact term definitions"
          >
            <Info className="h-3.5 w-3.5" />
            What These Terms Mean
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {showTermGuide && (
            <div className="max-w-4xl mx-auto mb-4">
              <TermGuideCard />
            </div>
          )}

          {/* Loading */}
          {isAnalyzing && (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
              <p className="text-sm text-gray-500">Analyzing data flow impact…</p>
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
                    Sole Provider: {impactResult.soleProvider.length}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Critical Relay: {impactResult.criticalRelay.length}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                    <Info className="h-3.5 w-3.5" />
                    Non-Critical: {impactResult.nonCritical.length}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-500">
                  {impactResult.summary.totalDataObjects} data object{impactResult.summary.totalDataObjects !== 1 ? "s" : ""} impacted
                  {impactResult.summary.totalIsolatedSystems > 0 && (
                    <> &middot; <span className="font-medium text-red-700">{impactResult.summary.totalIsolatedSystems} system{impactResult.summary.totalIsolatedSystems !== 1 ? "s" : ""} would be isolated</span></>
                  )}
                </p>
                {impactResult.summary.totalDataObjects === 0 && (
                  <p className="mt-3 text-sm text-gray-500">
                    No data flow participation detected. This system has no recorded ICD connections in the current dataset.
                  </p>
                )}
              </div>

              {/* ── Sole Provider section ───────────────────────────────── */}
              {impactResult.soleProvider.length > 0 && (
                <div className="rounded-lg border-2 border-red-300 bg-white p-4">
                  <h2 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Sole Provider — All Downstream Loses Access
                  </h2>
                  <ul className="space-y-3">
                    {impactResult.soleProvider.map((entry) => (
                      <DataFlowImpactCard key={entry.dataObjectUri} entry={entry} variant="critical" />
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Critical Relay section ──────────────────────────────── */}
              {impactResult.criticalRelay.length > 0 && (
                <div className="rounded-lg border-2 border-amber-300 bg-white p-4">
                  <h2 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Critical Relay — Removal Isolates Systems
                  </h2>
                  <ul className="space-y-3">
                    {impactResult.criticalRelay.map((entry) => (
                      <DataFlowImpactCard key={entry.dataObjectUri} entry={entry} variant="warning" />
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Non-Critical section (collapsible) ─────────────────── */}
              {impactResult.nonCritical.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setNonCriticalExpanded((prev) => !prev)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Info className="h-4 w-4 text-gray-500" />
                      Non-Critical Participation
                      <span className="text-xs font-normal text-gray-400">
                        ({impactResult.nonCritical.length} data object{impactResult.nonCritical.length !== 1 ? "s" : ""})
                      </span>
                    </h2>
                    {nonCriticalExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                  {nonCriticalExpanded && (
                    <div className="border-t border-gray-200 p-4">
                      <ul className="space-y-2">
                        {impactResult.nonCritical.map((entry) => (
                          <li
                            key={entry.dataObjectUri}
                            className="rounded border border-gray-200 bg-gray-50 px-3 py-2"
                          >
                            <div className="flex items-baseline justify-between">
                              <span className="text-sm font-medium text-gray-800">
                                {entry.dataObjectLabel}
                              </span>
                              <div className="flex items-center gap-2">
                                <RoleBadge role={entry.role} />
                                <span className="text-xs text-gray-500">
                                  {entry.totalSystemsInGraph} system{entry.totalSystemsInGraph !== 1 ? "s" : ""} in graph
                                </span>
                              </div>
                            </div>
                            {entry.alternativeProviders.length > 0 && (
                              <p className="mt-1 text-xs text-gray-500">
                                Alternative providers: {entry.alternativeProviders.map((p) => p.label).join(", ")}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
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
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Data Flow Impact Analyzer</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Select a system to simulate its removal and assess data flow impact.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTermGuide((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-300 hover:text-blue-700"
          aria-expanded={showTermGuide}
          aria-label="Toggle impact term definitions"
        >
          <Info className="h-3.5 w-3.5" />
          What These Terms Mean
        </button>
      </header>

      {showTermGuide && (
        <div className="shrink-0 bg-gray-50 px-6 pt-4">
          <TermGuideCard />
        </div>
      )}

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
            <p className="mt-2 text-xs text-gray-500">
              Ordered by criticality: highest sole provider, then critical relay, then non-critical provider counts.
              {isRankingSystems && " Calculating rankings..."}
            </p>
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
                      <div className="flex flex-col items-end gap-1">
                        <span className="flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          SP {entry.soleProviderCount}
                        </span>
                        <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          CR {entry.criticalRelayCount}
                        </span>
                        <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                          NP {entry.nonCriticalProviderCount}
                        </span>
                      </div>
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

// ── Helper components ─────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    provider: "bg-blue-100 text-blue-700",
    consumer: "bg-green-100 text-green-700",
    relay: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[role] ?? "bg-gray-100 text-gray-600"}`}>
      {role}
    </span>
  );
}

function TermGuideCard() {
  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <h2 className="text-sm font-semibold text-blue-900">Removal Impact Terms</h2>
      <div className="mt-2 space-y-2 text-xs text-blue-900">
        <p>
          <span className="font-semibold">Provider:</span> The removed system is a source provider for that data object.
        </p>
        <p>
          <span className="font-semibold">Relay:</span> The removed system acts as a bridge in the path, passing data between systems.
        </p>
        <p>
          <span className="font-semibold">Sole Provider:</span> No other provider remains for that data object after removal.
        </p>
        <p>
          <span className="font-semibold">Critical Relay:</span> Other providers may exist, but removing this system breaks path connectivity and isolates systems.
        </p>
        <p>
          <span className="font-semibold">Non-Critical:</span> Removing this system does not isolate any other system for that data object.
        </p>
        <p>
          <span className="font-semibold">Isolated Systems:</span> Systems that can no longer be reached from remaining providers in the flow graph.
        </p>
        <p>
          <span className="font-semibold">Alternative Providers:</span> Other systems that can originate the same data object.
        </p>
        <p>
          <span className="font-semibold">Systems in Flow Graph:</span> Total systems participating in that data object's directed network.
        </p>
      </div>
    </section>
  );
}

function DataFlowImpactCard({ entry, variant }: { entry: DataFlowEntry; variant: "critical" | "warning" }) {
  const borderColor = variant === "critical" ? "border-red-200" : "border-amber-200";
  const bgColor = variant === "critical" ? "bg-red-50" : "bg-amber-50";
  const textColor = variant === "critical" ? "text-red-900" : "text-amber-900";
  const subTextColor = variant === "critical" ? "text-red-600" : "text-amber-700";

  return (
    <li className={`rounded border ${borderColor} ${bgColor} px-3 py-2.5`}>
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-medium ${textColor}`}>{entry.dataObjectLabel}</span>
        <RoleBadge role={entry.role} />
      </div>
      {entry.isolatedSystems.length > 0 && (
        <div className="mt-1.5">
          <span className={`text-xs font-medium ${subTextColor}`}>
            Isolated systems ({entry.isolatedSystems.length}):
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {entry.isolatedSystems.map((sys) => (
              <span
                key={sys.uri}
                className={`inline-block rounded px-1.5 py-0.5 text-xs ${variant === "critical" ? "bg-red-200 text-red-800" : "bg-amber-200 text-amber-800"}`}
              >
                {sys.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {entry.alternativeProviders.length > 0 && (
        <p className="mt-1 text-xs text-gray-500">
          Alternative providers: {entry.alternativeProviders.map((p) => p.label).join(", ")}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-400">
        {entry.totalSystemsInGraph} system{entry.totalSystemsInGraph !== 1 ? "s" : ""} in flow graph
      </p>
    </li>
  );
}
