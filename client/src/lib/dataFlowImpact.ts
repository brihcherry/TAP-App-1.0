// dataFlowImpact.ts — Computes the grouped/summarized data flow impact result
// from the GetDataFlowImpact reactor response.

import type {
  DataFlowImpactReactorResponse,
  DataFlowImpactResult,
  DataFlowEntry,
} from "@/types/dataFlowImpact";

/**
 * Group and summarize reactor response into a UI-ready result.
 */
export function computeDataFlowImpact(
  response: DataFlowImpactReactorResponse,
): DataFlowImpactResult {
  const soleProvider: DataFlowEntry[] = [];
  const criticalRelay: DataFlowEntry[] = [];
  const nonCritical: DataFlowEntry[] = [];

  for (const entry of response.dataFlowImpacts) {
    switch (entry.classification) {
      case "soleProvider":
        soleProvider.push(entry);
        break;
      case "criticalRelay":
        criticalRelay.push(entry);
        break;
      case "nonCritical":
        nonCritical.push(entry);
        break;
    }
  }

  // Sort within groups: most isolated systems first
  soleProvider.sort((a, b) => b.isolatedSystems.length - a.isolatedSystems.length);
  criticalRelay.sort((a, b) => b.isolatedSystems.length - a.isolatedSystems.length);
  nonCritical.sort((a, b) => a.dataObjectLabel.localeCompare(b.dataObjectLabel));

  // Compute unique isolated systems across all entries
  const isolatedSet = new Set<string>();
  for (const entry of response.dataFlowImpacts) {
    for (const sys of entry.isolatedSystems) {
      isolatedSet.add(sys.uri);
    }
  }

  return {
    targetSystem: { uri: response.systemUri, label: response.systemName },
    soleProvider,
    criticalRelay,
    nonCritical,
    summary: {
      totalDataObjects: response.dataFlowImpacts.length,
      totalIsolatedSystems: isolatedSet.size,
      criticalPaths: soleProvider.length + criticalRelay.length,
    },
  };
}
