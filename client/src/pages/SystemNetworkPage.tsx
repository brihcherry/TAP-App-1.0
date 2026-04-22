// SystemNetworkPage.tsx — System Network Map: directory of all Systems and Interfaces
// with their connection counts. Each entry is a button; clicking will eventually
// populate a 1-degree subgraph view. Data comes from GetSystemNetworkReactor.

import { useState, useEffect, useMemo } from "react";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";

const DATABASE_ID = "133db94b-4371-4763-bff9-edf7e5ed021b";

const TYPE_COLORS: Record<string, string> = {
  System: "rgb(31, 119, 180)",
  Interface: "rgb(148, 103, 189)",
};

// ── Raw reactor response types ────────────────────────────────────────────────

interface RawNode {
  uri: string;
  label: string;
  type: string;
}

interface RawEdge {
  sourceUri: string;
  targetUri: string;
}

interface RawNetworkData {
  nodes: RawNode[];
  edges: RawEdge[];
}

// ── Processed entry for the list ──────────────────────────────────────────────

interface NetworkEntry {
  uri: string;
  label: string;
  type: "System" | "Interface";
  connectionCount: number;
}

function buildEntries(raw: RawNetworkData): NetworkEntry[] {
  const counts = new Map<string, number>();
  for (const e of raw.edges) {
    counts.set(e.sourceUri, (counts.get(e.sourceUri) ?? 0) + 1);
    counts.set(e.targetUri, (counts.get(e.targetUri) ?? 0) + 1);
  }

  return raw.nodes
    .filter((n): n is RawNode & { type: "System" | "Interface" } =>
      n.type === "System" || n.type === "Interface",
    )
    .map((n) => ({
      uri: n.uri,
      label: n.label,
      type: n.type,
      connectionCount: counts.get(n.uri) ?? 0,
    }))
    .sort((a, b) => b.connectionCount - a.connectionCount);
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ActiveTab = "System" | "Interface";

export const SystemNetworkPage = () => {
  const { insightId } = useInsight();

  const [entries, setEntries] = useState<NetworkEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("System");
  const [search, setSearch] = useState("");

  // ── Fetch ─────────────────────────────────────────────────────────────────
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
    return entries.filter(
      (e) => e.type === activeTab && (q === "" || e.label.toLowerCase().includes(q)),
    );
  }, [entries, activeTab, search]);

  const systemCount = entries?.filter((e) => e.type === "System").length ?? 0;
  const ifcCount = entries?.filter((e) => e.type === "Interface").length ?? 0;

  const tabs: { id: ActiveTab; label: string; count: number }[] = [
    { id: "System", label: "Systems", count: systemCount },
    { id: "Interface", label: "Interfaces", count: ifcCount },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">System Network Map</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          All systems and interfaces with their connection counts
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
          {/* Tabs + search bar */}
          <div className="shrink-0 border-b border-gray-200 bg-white px-6">
            <div className="flex items-end justify-between gap-4">
              {/* Tabs */}
              <div className="flex gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setActiveTab(tab.id); setSearch(""); }}
                    className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                        activeTab === tab.id
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="pb-2">
                <input
                  type="search"
                  placeholder={`Search ${activeTab === "System" ? "systems" : "interfaces"}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-56 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Entry list */}
          <div className="flex-1 overflow-y-auto p-6">
            {filtered.length === 0 ? (
              <p className="text-sm italic text-gray-400">
                {search ? `No results for "${search}"` : `No ${activeTab === "System" ? "systems" : "interfaces"} found.`}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((entry) => (
                  <li key={entry.uri}>
                    <button
                      type="button"
                      title={entry.uri}
                      className="group flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
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
                Showing {filtered.length} {activeTab === "System" ? "system" : "interface"}
                {filtered.length !== 1 ? "s" : ""}
                {search ? ` matching "${search}"` : ""} · sorted by connections (highest first)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
