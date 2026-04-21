// SystemInspectionPage.tsx — Main page with two phases:
//   Phase 1: full-screen system picker (list fetched from ListSystems reactor)
//   Phase 2: tabbed inspection panel showing all attributes of the selected system

import { useState, useEffect } from "react";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { SystemInspectionPanel } from "@/components/SystemInspectionPanel";
import type { SystemOption, SystemDetails } from "@/types/system";

const DATABASE_ID = "133db94b-4371-4763-bff9-edf7e5ed021b";

export const SystemInspectionPage = () => {
  const { insightId } = useInsight();

  // ── Phase 1 state ─────────────────────────────────────────────────────────
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<SystemOption | null>(null);

  // ── Phase 2 state ─────────────────────────────────────────────────────────
  const [details, setDetails] = useState<SystemDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // ── Phase 1: Fetch system list on mount ───────────────────────────────────
  useEffect(() => {
    if (!insightId) return;
    let cancelled = false;

    setIsLoadingOptions(true);
    setLoadError(null);

    runPixel(`ListSystems(database=["${DATABASE_ID}"]);`, insightId)
      .then((response) => {
        if (cancelled) return;
        if (response.errors.length > 0) {
          setLoadError(response.errors.join(", "));
          return;
        }
        const output = response.pixelReturn[0]?.output;
        if (Array.isArray(output)) {
          setSystems(output as SystemOption[]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load systems");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [insightId]);

  // ── Phase 2: Fetch system details on selection ────────────────────────────
  useEffect(() => {
    if (!insightId || !selectedSystem) return;
    let cancelled = false;

    setIsLoadingDetails(true);
    setDetailsError(null);
    setDetails(null);

    const pixel = `GetSystemDetails(database=["${DATABASE_ID}"], system=["${selectedSystem.uri}"]);`;

    runPixel(pixel, insightId)
      .then((response) => {
        if (cancelled) return;
        if (response.errors.length > 0) {
          setDetailsError(response.errors.join(", "));
          return;
        }
        const output = response.pixelReturn[0]?.output;
        if (output) {
          setDetails(output as SystemDetails);
        } else {
          setDetailsError("No data returned for this system.");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailsError(err instanceof Error ? err.message : "Failed to load system details");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetails(false);
      });

    return () => {
      cancelled = true;
    };
  }, [insightId, selectedSystem]);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const uri = e.target.value;
    const system = systems.find((s) => s.uri === uri) ?? null;
    setSelectedSystem(system);
  };

  const handleBack = () => {
    setSelectedSystem(null);
    setDetails(null);
    setDetailsError(null);
  };

  // ── Phase 1: System selection screen ─────────────────────────────────────
  if (!selectedSystem) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">System Inspector</h1>
          <p className="mb-6 text-sm text-gray-500">
            Select a system to inspect its data objects, interfaces, activities, and more.
          </p>

          {isLoadingOptions && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Loading systems…
            </div>
          )}

          {loadError && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              Error: {loadError}
            </div>
          )}

          {!isLoadingOptions && !loadError && (
            <div className="space-y-3">
              <label htmlFor="system-select" className="block text-sm font-medium text-gray-700">
                System
              </label>
              <select
                id="system-select"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                defaultValue=""
                onChange={handleSelect}
              >
                <option value="" disabled>
                  Choose a system…
                </option>
                {systems.map((s) => (
                  <option key={s.uri} value={s.uri}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400">{systems.length} systems available</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Phase 2: System inspection view ──────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-gray-200 bg-white px-6 py-3 flex-shrink-0">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          ← Back
        </button>
        <div className="h-5 w-px bg-gray-200" />
        <h1 className="text-lg font-semibold text-gray-900">{selectedSystem.label}</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoadingDetails && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            Loading system details…
          </div>
        )}

        {detailsError && !isLoadingDetails && (
          <div className="m-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            Error: {detailsError}
          </div>
        )}

        {details && !isLoadingDetails && <SystemInspectionPanel details={details} />}
      </div>
    </div>
  );
};
