// SystemInspectionPanel.tsx — Tabbed panel displaying all attributes of a selected system.

import { useState, useCallback } from "react";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { cn } from "@/lib/utils";
import type { SystemDetails, LabeledItem, InterfaceItem } from "@/types/system";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface ConceptSearchResult {
  conceptUri: string;
  conceptLabel: string;
  systems: LabeledItem[];
}

interface SystemInspectionPanelProps {
  details: SystemDetails;
  databaseId: string;
}

export const SystemInspectionPanel = ({ details, databaseId }: SystemInspectionPanelProps) => {
  const { insightId } = useInsight();

  const tabs: Tab[] = [
    { id: "dataObjects", label: "Data Objects", count: details.dataObjects.length },
    { id: "interfaces", label: "Interfaces", count: details.interfaces.length },
    { id: "businessProcesses", label: "Business Processes", count: details.businessProcesses.length },
    { id: "activities", label: "Activities", count: details.activities.length },
    { id: "userTypes", label: "User Types", count: details.userTypes.length },
    { id: "environment", label: "Environment" },
    { id: "transactional", label: "Transactional" },
  ];

  const [activeTab, setActiveTab] = useState<string>("dataObjects");

  // ── Concept detail state (Activities / Business Processes) ────────────────
  const [selectedConcept, setSelectedConcept] = useState<LabeledItem | null>(null);
  const [conceptResult, setConceptResult] = useState<ConceptSearchResult | null>(null);
  const [conceptLoading, setConceptLoading] = useState(false);
  const [conceptError, setConceptError] = useState<string | null>(null);

  const handleConceptClick = useCallback(
    (item: LabeledItem) => {
      if (!insightId) return;
      if (selectedConcept?.uri === item.uri) {
        // Deselect on second click
        setSelectedConcept(null);
        setConceptResult(null);
        setConceptError(null);
        return;
      }
      setSelectedConcept(item);
      setConceptResult(null);
      setConceptError(null);
      setConceptLoading(true);

      runPixel(
        `GetSystemsByConcept(database=["${databaseId}"], concept=["${item.uri}"]);`,
        insightId,
      )
        .then((response) => {
          if (response.errors.length > 0) {
            setConceptError(response.errors.join(", "));
            return;
          }
          const output = response.pixelReturn[0]?.output;
          if (output) {
            setConceptResult(output as ConceptSearchResult);
          } else {
            setConceptError("No data returned.");
          }
        })
        .catch((err) => {
          setConceptError(err instanceof Error ? err.message : "Query failed");
        })
        .finally(() => setConceptLoading(false));
    },
    [insightId, databaseId, selectedConcept],
  );

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSelectedConcept(null);
    setConceptResult(null);
    setConceptError(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-xs font-medium",
                    activeTab === tab.id
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "dataObjects" && (
          <ItemList
            items={details.dataObjects}
            emptyMessage="No data objects found for this system."
          />
        )}
        {activeTab === "interfaces" && <InterfaceList items={details.interfaces} />}
        {activeTab === "businessProcesses" && (
          <ConceptMasterDetail
            items={details.businessProcesses}
            conceptType="Business Process"
            emptyMessage="No business processes found for this system."
            selectedConcept={selectedConcept}
            conceptResult={conceptResult}
            conceptLoading={conceptLoading}
            conceptError={conceptError}
            onConceptClick={handleConceptClick}
            currentSystemUri={details.systemUri}
          />
        )}
        {activeTab === "activities" && (
          <ConceptMasterDetail
            items={details.activities}
            conceptType="Activity"
            emptyMessage="No activities found for this system."
            selectedConcept={selectedConcept}
            conceptResult={conceptResult}
            conceptLoading={conceptLoading}
            conceptError={conceptError}
            onConceptClick={handleConceptClick}
            currentSystemUri={details.systemUri}
          />
        )}
        {activeTab === "userTypes" && (
          <ItemList
            items={details.userTypes}
            emptyMessage="No user types found for this system."
          />
        )}
        {activeTab === "environment" && (
          <ScalarView
            label="Deployment Environment"
            value={details.environment}
            emptyMessage="No environment data available for this system."
          />
        )}
        {activeTab === "transactional" && (
          <ScalarView
            label="Transactional"
            value={details.transactional}
            emptyMessage="No transactional data available for this system."
          />
        )}
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ItemList({ items, emptyMessage }: { items: LabeledItem[]; emptyMessage: string }) {
  if (items.length === 0) {
    return <p className="text-sm italic text-gray-400">{emptyMessage}</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li
          key={item.uri}
          title={item.uri}
          className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm"
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function InterfaceList({ items }: { items: InterfaceItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm italic text-gray-400">No interfaces found for this system.</p>;
  }

  const providers = items.filter((i) => i.role === "provider");
  const consumers = items.filter((i) => i.role === "consumer");

  return (
    <div className="space-y-8">
      {providers.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Outgoing — system provides data to these interfaces ({providers.length})
          </h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((item) => (
              <li
                key={`${item.uri}-provider`}
                title={item.uri}
                className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-gray-800"
              >
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                {item.label}
              </li>
            ))}
          </ul>
        </section>
      )}
      {consumers.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Incoming — these interfaces feed data into this system ({consumers.length})
          </h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {consumers.map((item) => (
              <li
                key={`${item.uri}-consumer`}
                title={item.uri}
                className="flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-gray-800"
              >
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                {item.label}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ScalarView({
  label,
  value,
  emptyMessage,
}: {
  label: string;
  value: string;
  emptyMessage: string;
}) {
  if (!value) {
    return <p className="text-sm italic text-gray-400">{emptyMessage}</p>;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-600">{label}:</span>
      <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-800">
        {value}
      </span>
    </div>
  );
}

// ── ConceptMasterDetail ───────────────────────────────────────────────────────
// Split-pane view for Activities and Business Processes. Left: clickable item
// list. Right: systems that share the selected concept.

interface ConceptMasterDetailProps {
  items: LabeledItem[];
  conceptType: string;
  emptyMessage: string;
  selectedConcept: LabeledItem | null;
  conceptResult: ConceptSearchResult | null;
  conceptLoading: boolean;
  conceptError: string | null;
  onConceptClick: (item: LabeledItem) => void;
  currentSystemUri: string;
}

function ConceptMasterDetail({
  items,
  conceptType,
  emptyMessage,
  selectedConcept,
  conceptResult,
  conceptLoading,
  conceptError,
  onConceptClick,
  currentSystemUri,
}: ConceptMasterDetailProps) {
  if (items.length === 0) {
    return <p className="text-sm italic text-gray-400">{emptyMessage}</p>;
  }

  // Other systems sharing this concept (exclude the current system being inspected)
  const otherSystems =
    conceptResult?.systems.filter((s) => s.uri !== currentSystemUri) ?? [];

  return (
    <div className="flex h-full gap-4">
      {/* Left — item list */}
      <div className="w-64 flex-shrink-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {conceptType}s ({items.length})
        </p>
        <ul className="space-y-1">
          {items.map((item) => {
            const isSelected = selectedConcept?.uri === item.uri;
            return (
              <li key={item.uri}>
                <button
                  type="button"
                  title={item.uri}
                  onClick={() => onConceptClick(item)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    isSelected
                      ? "border-blue-400 bg-blue-50 font-medium text-blue-800"
                      : "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
                  )}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-200" />

      {/* Right — detail pane */}
      <div className="min-w-0 flex-1">
        {!selectedConcept && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm italic text-gray-400">
              Select a {conceptType.toLowerCase()} to see which systems use it.
            </p>
          </div>
        )}

        {selectedConcept && conceptLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            Loading systems…
          </div>
        )}

        {selectedConcept && conceptError && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            Error: {conceptError}
          </div>
        )}

        {selectedConcept && conceptResult && !conceptLoading && (
          <div>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-900">
                {conceptResult.conceptLabel}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {otherSystems.length === 0
                  ? `No other systems support this ${conceptType.toLowerCase()}.`
                  : `${otherSystems.length} other system${otherSystems.length === 1 ? "" : "s"} also support${otherSystems.length === 1 ? "s" : ""} this ${conceptType.toLowerCase()}.`}
              </p>
            </div>

            {otherSystems.length > 0 && (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {otherSystems.map((sys) => (
                  <li
                    key={sys.uri}
                    title={sys.uri}
                    className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-gray-800"
                  >
                    <span className="mr-2 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-purple-500" />
                    {sys.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
