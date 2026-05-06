// SystemInspectionPage.tsx — Capability-group-centric system inspector.
//   Level 0: Zoomable circle-packing bubble graph of capability groups + systems
//   Level 1: Click a system → slide-over inspection panel with 7-tab details
//
// Data comes from GetCapabilityGroups (grouping) and GetSystemDetails (details).

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { CapabilityBubbleGraph } from "@/components/CapabilityBubbleGraph";
import { CapabilityGroupSidebar } from "@/components/CapabilityGroupSidebar";
import { SystemInspectionPanel } from "@/components/SystemInspectionPanel";
import type { CapabilityGroup, CapabilityGroupsResponse, SystemDetails } from "@/types/system";

export const SystemInspectionPage = () => {
  const { insightId } = useInsight();
  const location = useLocation();

  // URI of the group to restore after navigating back from removal impact
  const restoreGroupUriRef = useRef<string | null>(
    (location.state as { restoreGroup?: { uri: string } } | null)?.restoreGroup?.uri ?? null
  );

  // ── Capability groups data ────────────────────────────────────────────────
  const [capabilityGroups, setCapabilityGroups] = useState<CapabilityGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Selected capability group state (zoomed in) ─────────────────────────
  const [selectedGroup, setSelectedGroup] = useState<CapabilityGroup | null>(null);

  // ── Selected system state ─────────────────────────────────────────────────
  const [selectedSystem, setSelectedSystem] = useState<{ uri: string; label: string } | null>(null);
  const [details, setDetails] = useState<SystemDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // ── Fetch capability groups on mount ──────────────────────────────────────
  useEffect(() => {
    if (!insightId) return;
    let cancelled = false;

    setIsLoading(true);
    setLoadError(null);

    runPixel(`GetCapabilityGroups();`, insightId)
      .then((response) => {
        if (cancelled) return;
        if (response.errors.length > 0) {
          setLoadError(response.errors.join(", "));
          return;
        }
        const output = response.pixelReturn[0]?.output as CapabilityGroupsResponse | undefined;
        if (output?.capabilityGroups) {
          setCapabilityGroups(output.capabilityGroups);
          // Restore zoomed group if navigating back from removal impact
          if (restoreGroupUriRef.current) {
            const groupToRestore = output.capabilityGroups.find(
              (cg) => cg.uri === restoreGroupUriRef.current
            );
            if (groupToRestore) setSelectedGroup(groupToRestore);
            restoreGroupUriRef.current = null;
          }
        } else {
          setLoadError("Unexpected response format from server.");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load capability groups");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [insightId]);

  // ── Fetch system details on selection ─────────────────────────────────────
  useEffect(() => {
    if (!insightId || !selectedSystem) return;
    let cancelled = false;

    setIsLoadingDetails(true);
    setDetailsError(null);
    setDetails(null);

    const pixel = `GetSystemDetails(system=["${selectedSystem.uri}"]);`;

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

    return () => { cancelled = true; };
  }, [insightId, selectedSystem]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSystemClick = useCallback((systemUri: string, systemLabel: string) => {
    setSelectedSystem({ uri: systemUri, label: systemLabel });
  }, []);

  const handleGroupFocus = useCallback((focused: { uri: string; label: string } | null) => {
    if (!focused) {
      setSelectedGroup(null);
      return;
    }
    const group = capabilityGroups.find((cg) => cg.uri === focused.uri) ?? null;
    setSelectedGroup(group);
  }, [capabilityGroups]);

  const handleCloseGroupSidebar = useCallback(() => {
    setSelectedGroup(null);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedSystem(null);
    setDetails(null);
    setDetailsError(null);
  }, []);

  // ── Computed stats ────────────────────────────────────────────────────────

  const totalSystems = capabilityGroups.reduce((sum, cg) => sum + cg.systems.length, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Capability Group Overview: For each capability group, which systems have the most overlap with other systems?</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {isLoading
                ? "Loading capability groups…"
                : `${capabilityGroups.length} capability groups · ${totalSystems} system mappings`}
            </p>
          </div>
          {selectedSystem && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="text-gray-300">|</span>
              <span className="font-medium text-blue-600">{selectedSystem.label}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-1 items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
              <p className="text-sm text-gray-500">Loading capability groups…</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {loadError && !isLoading && (
          <div className="flex flex-1 items-center justify-center bg-gray-50">
            <div className="max-w-sm rounded-lg border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm font-medium text-red-800">Failed to load data</p>
              <p className="mt-1 text-xs text-red-600">{loadError}</p>
            </div>
          </div>
        )}

        {/* Bubble graph */}
        {!isLoading && !loadError && capabilityGroups.length > 0 && (
          <div className={`relative bg-gray-50 overflow-hidden ${
            selectedSystem ? "w-1/2" : "flex-1"
          }`}>
            {/* Instruction overlay */}
            {!selectedSystem && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-lg bg-white/90 backdrop-blur-sm border border-gray-200 px-4 py-2 shadow-sm">
                <p className="text-xs text-gray-500">
                  Click a <span className="font-medium text-gray-700">capability group</span> to zoom in · Click a <span className="font-medium text-gray-700">system</span> to inspect
                </p>
              </div>
            )}
            <CapabilityBubbleGraph
              capabilityGroups={capabilityGroups}
              onSystemClick={handleSystemClick}
              selectedSystemUri={selectedSystem?.uri}
              onGroupFocus={handleGroupFocus}
              focusedGroupUri={selectedGroup?.uri ?? null}
            />
          </div>
        )}

        {/* Capability group sidebar — shown when a group is zoomed in and no system is selected */}
        {selectedGroup && !selectedSystem && (
          <CapabilityGroupSidebar
            group={selectedGroup}
            onClose={handleCloseGroupSidebar}
          />
        )}

        {/* System inspection slide-over panel */}
        {selectedSystem && (
          <div className="w-1/2 border-l border-gray-200 flex flex-col overflow-hidden bg-white">
            {/* Panel header */}
            <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 shrink-0">
              <button
                type="button"
                onClick={handleClosePanel}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                ✕ Close
              </button>
              <div className="h-5 w-px bg-gray-200" />
              <h2 className="text-base font-semibold text-gray-900 truncate">
                {selectedSystem.label}
              </h2>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden">
              {isLoadingDetails && (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  Loading system details…
                </div>
              )}

              {detailsError && !isLoadingDetails && (
                <div className="m-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                  Error: {detailsError}
                </div>
              )}

              {details && !isLoadingDetails && (
                <SystemInspectionPanel details={details} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
