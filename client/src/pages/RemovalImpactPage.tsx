// RemovalImpactPage.tsx — Data Flow Impact Analyzer.
//
// Two-panel layout:
//   Left:  System directory list (alphabetical, click to select)
//   Right: 3-section analysis: ADS status, creator/modifier data objects, outbound connections
//
// Data sources:
//   - GetActiveSystems (once on mount) — list of active systems
//   - GetDataFlowImpact (per selection) — ADS status, CRM data objects, outbound connections

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { ArrowLeft, CheckCircle, XCircle, Database, Share2 } from "lucide-react";
import type { SystemImpactReactorResponse } from "@/types/dataFlowImpact";

const DATABASE_ID = "133db94b-4371-4763-bff9-edf7e5ed021b";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemEntry {
  uri: string;
  label: string;
}

interface ActiveSystemEntry {
  uri: string;
  label: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const RemovalImpactPage = () => {
  const { insightId } = useInsight();
  const navigate = useNavigate();
  const location = useLocation();
  const fromSidebar = useRef<{ systemUri: string; systemLabel: string } | null>(
    (location.state as { systemUri?: string; systemLabel?: string } | null)
      ?.systemUri
      ? (location.state as { systemUri: string; systemLabel: string })
      : null
  );

  // ── Systems list state ────────────────────────────────────────────────────
  const [systems, setSystems] = useState<SystemEntry[] | null>(null);
  const [isLoadingNetwork, setIsLoadingNetwork] = useState(true);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // ── Selection & analysis state ────────────────────────────────────────────
  const [selectedSystem, setSelectedSystem] = useState<SystemEntry | null>(null);
  const [systemImpact, setSystemImpact] = useState<SystemImpactReactorResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // ── List view state ───────────────────────────────────────────────────────
  const [search, setSearch] = useState("");

  // ── Fetch active systems on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!insightId) return;
    let cancelled = false;

    setIsLoadingNetwork(true);
    setNetworkError(null);

    runPixel(`GetActiveSystems();`, insightId)
      .then((activeRes) => {
        if (cancelled) return;

        if (activeRes.errors.length > 0) {
          setNetworkError(activeRes.errors.join(", "));
          return;
        }
        const activeOutput = activeRes.pixelReturn[0]?.output as { systems?: ActiveSystemEntry[] };
        if (!activeOutput?.systems) {
          setNetworkError("Unexpected response format from GetActiveSystems.");
          return;
        }

        const list: SystemEntry[] = activeOutput.systems
          .map((s) => ({ uri: s.uri, label: s.label }))
          .sort((a, b) => a.label.localeCompare(b.label));

        setSystems(list);

        if (fromSidebar.current) {
          const { systemUri, systemLabel } = fromSidebar.current;
          const match = list.find((s) => s.uri === systemUri);
          setSelectedSystem(match ?? { uri: systemUri, label: systemLabel });
          fromSidebar.current = null;
        }
      })
      .catch((err) => {
        if (!cancelled)
          setNetworkError(err instanceof Error ? err.message : "Failed to load systems.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingNetwork(false);
      });

    return () => { cancelled = true; };
  }, [insightId]);

  // ── Filtered list (alphabetical, search only) ─────────────────────────────
  const filtered = useMemo(() => {
    if (!systems) return [];
    const q = search.trim().toLowerCase();
    return q === "" ? systems : systems.filter((s) => s.label.toLowerCase().includes(q));
  }, [systems, search]);

  // ── Run analysis when a system is selected ────────────────────────────────
  useEffect(() => {
    if (!insightId || !selectedSystem) return;
    let cancelled = false;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setSystemImpact(null);

    const pixel = `GetDataFlowImpact(database=["${DATABASE_ID}"], system=["${selectedSystem.uri}"]);`;

    runPixel(pixel, insightId)
      .then((response) => {
        if (cancelled) return;
        if (response.errors.length > 0) {
          setAnalysisError(response.errors.join(", "));
          return;
        }
        const output = response.pixelReturn[0]?.output as SystemImpactReactorResponse;
        if (output?.systemUri) {
          setSystemImpact(output);
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
    if (location.state && (location.state as { systemUri?: string }).systemUri) {
      const returnGroup = (location.state as { returnGroup?: { uri: string; label: string } }).returnGroup;
      const viewMode = (location.state as { viewMode?: string }).viewMode;
      navigate("/", { state: { ...(returnGroup ? { restoreGroup: returnGroup } : {}), ...(viewMode ? { viewMode } : {}) } });
      return;
    }
    setSelectedSystem(null);
    setSystemImpact(null);
    setAnalysisError(null);
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
            <h1 className="text-lg font-semibold text-gray-900">{selectedSystem.label}</h1>
            <p className="text-sm text-gray-500 mt-0.5">System connection analysis</p>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {/* Loading */}
          {isAnalyzing && (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
              <p className="text-sm text-gray-500">Loading system analysis…</p>
            </div>
          )}

          {/* Error */}
          {analysisError && !isAnalyzing && (
            <div className="max-w-lg mx-auto rounded-lg border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm font-medium text-red-800">Analysis failed</p>
              <p className="mt-1 text-xs text-red-600">{analysisError}</p>
            </div>
          )}

          {/* Analysis sections */}
          {systemImpact && !isAnalyzing && (
            <div className="max-w-4xl mx-auto space-y-6">

              {/* ── Section 1: Authoritative Data Source ────────────────── */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-gray-500" />
                  Authoritative Data Source
                </h2>
                {systemImpact.isAuthoritativeDataSource ? (
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
                      <CheckCircle className="h-4 w-4" />
                      Authoritative Data Source
                    </span>
                    {systemImpact.dataSubjectAreas.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {systemImpact.dataSubjectAreas.map((area) => (
                          <span
                            key={area.uri}
                            className="inline-block rounded-md bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-medium text-green-800"
                          >
                            {area.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
                    <XCircle className="h-4 w-4" />
                    Not an Authoritative Data Source
                  </span>
                )}
              </div>

              {/* ── Section 2: Creator / Modifier Data Objects ───────────── */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-gray-500" />
                  Data Objects Created or Modified
                </h2>
                {systemImpact.crmDataObjects.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">
                    This system does not create or modify any data objects.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {systemImpact.crmDataObjects.map((obj) => (
                      <li
                        key={obj.uri}
                        className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <span className="text-sm font-medium text-gray-800">{obj.label}</span>
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                            obj.crm === "C"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {obj.crm === "C" ? "Creator" : "Modifier"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Section 3: Outbound Data Connections ────────────────── */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-gray-500" />
                  Outbound Data Connections
                </h2>
                {systemImpact.outboundConnections.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">
                    No outbound interfaces found for this system.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {systemImpact.outboundConnections.map((conn) => (
                      <div
                        key={`${conn.interfaceUri}|${conn.targetSystemUri}`}
                        className="rounded border border-gray-200 bg-gray-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-sm font-semibold text-gray-800">
                            → {conn.targetSystemLabel}
                          </span>
                          <span className="text-xs text-gray-400 shrink-0">
                            via {conn.interfaceLabel}
                          </span>
                        </div>
                        {conn.dataObjects.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {conn.dataObjects.map((obj) => (
                              <span
                                key={obj.uri}
                                className="inline-block rounded-full bg-white border border-gray-300 px-2.5 py-0.5 text-xs text-gray-700"
                              >
                                {obj.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
        <h1 className="text-lg font-semibold text-gray-900">Data Flow Impact Analyzer</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Select a system to view its authoritative data status, data objects created or modified, and outbound connections.
        </p>
      </header>

      {/* Loading */}
      {isLoadingNetwork && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-50">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">Loading systems…</p>
        </div>
      )}

      {/* Error */}
      {networkError && !isLoadingNetwork && (
        <div className="flex flex-1 items-center justify-center bg-gray-50">
          <div className="max-w-sm rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-800">Failed to load systems</p>
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
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {filtered.length > 0 && (
              <p className="mt-4 text-xs text-gray-400">
                {filtered.length} system{filtered.length !== 1 ? "s" : ""}
                {search ? ` matching "${search}"` : ""}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

