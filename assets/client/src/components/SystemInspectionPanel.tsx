// SystemInspectionPanel.tsx — Tabbed panel displaying all attributes of a selected system.

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { SystemDetails, LabeledItem, InterfaceItem } from "@/types/system";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface SystemInspectionPanelProps {
  details: SystemDetails;
}

export const SystemInspectionPanel = ({ details }: SystemInspectionPanelProps) => {
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
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
          <ItemList
            items={details.businessProcesses}
            emptyMessage="No business processes found for this system."
          />
        )}
        {activeTab === "activities" && (
          <ItemList
            items={details.activities}
            emptyMessage="No activities found for this system."
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
