// removalImpact.ts — Computes the impact of removing a system from the enterprise.
//
// Combines:
//   1. GetSystemRemovalImpact reactor response (DataObject providers + CapabilityGroup coverage)
//   2. GetSystemNetwork raw tripartite graph (for downstream system detection via edge-walking)
//
// Produces a tiered impact report: Critical / High / Medium.

import type { RawNetworkData } from "./systemSubgraph";
import type {
  RemovalImpactReactorResponse,
  DataObjectImpact,
  CapabilityGroupImpact,
  AffectedSystemImpact,
  RemovalImpactResult,
} from "@/types/removalImpact";

/**
 * Compute the full removal impact for a given system.
 *
 * @param systemUri      URI of the system to simulate removing
 * @param reactorResult  Response from GetSystemRemovalImpact reactor
 * @param rawNetwork     Full tripartite graph from GetSystemNetwork
 */
export function computeRemovalImpact(
  systemUri: string,
  reactorResult: RemovalImpactReactorResponse,
  rawNetwork: RawNetworkData,
): RemovalImpactResult {
  const dataObjectImpacts = classifyDataObjects(reactorResult);
  const capabilityGroupImpacts = classifyCapabilityGroups(systemUri, reactorResult);
  const affectedSystemImpacts = findAffectedSystems(systemUri, rawNetwork, reactorResult);

  let critical = 0;
  let high = 0;
  let medium = 0;

  for (const d of dataObjectImpacts) {
    if (d.tier === "critical") critical++;
  }
  for (const c of capabilityGroupImpacts) {
    if (c.tier === "critical") critical++;
    else if (c.tier === "high") high++;
  }
  medium = affectedSystemImpacts.length;

  return {
    targetSystem: { uri: systemUri, label: reactorResult.systemName },
    dataObjectImpacts,
    capabilityGroupImpacts,
    affectedSystemImpacts,
    summary: { critical, high, medium },
  };
}

// ── DataObject classification ───────────────────────────────────────────────

function classifyDataObjects(
  reactorResult: RemovalImpactReactorResponse,
): DataObjectImpact[] {
  return reactorResult.dataObjectProviders.map((entry) => {
    const isOrphaned = entry.allProviders.length <= 1;
    return {
      uri: entry.uri,
      label: entry.label,
      tier: isOrphaned ? "critical" as const : "medium" as const,
      isOrphaned,
      allProviders: entry.allProviders,
    };
  });
}

// ── CapabilityGroup classification ──────────────────────────────────────────

function classifyCapabilityGroups(
  systemUri: string,
  reactorResult: RemovalImpactReactorResponse,
): CapabilityGroupImpact[] {
  return reactorResult.capabilityGroupCoverage.map((entry) => {
    // Remaining = total minus the removed system (if it's in the list)
    const isInList = entry.systems.some((s) => s.uri === systemUri);
    const remaining = isInList
      ? entry.totalSupporters - 1
      : entry.totalSupporters;

    let tier: "critical" | "high" | "medium";
    if (remaining === 0) {
      tier = "critical";
    } else if (remaining === 1) {
      tier = "high";
    } else {
      tier = "medium";
    }

    return {
      uri: entry.uri,
      label: entry.label,
      tier,
      remainingSupporters: remaining,
      totalSupporters: entry.totalSupporters,
      systems: entry.systems,
    };
  });
}

// ── Downstream system detection ─────────────────────────────────────────────
//
// Walk the raw tripartite graph to find systems that receive data FROM the
// target system:
//   Target --[Provide]--> Interface --[Consume]--> DownstreamSystem
//   Interface --[carries]--> DataObject (labels for what they lose)

function findAffectedSystems(
  systemUri: string,
  rawNetwork: RawNetworkData,
  reactorResult: RemovalImpactReactorResponse,
): AffectedSystemImpact[] {
  const nodesByUri = new Map(rawNetwork.nodes.map((n) => [n.uri, n]));
  const interfaceUris = new Set(
    rawNetwork.nodes.filter((n) => n.type === "Interface").map((n) => n.uri),
  );

  // Interfaces this system provides into
  const providedInterfaces = new Set<string>();
  for (const edge of rawNetwork.edges) {
    if (
      edge.edgeType === "provide" &&
      edge.sourceUri === systemUri &&
      interfaceUris.has(edge.targetUri)
    ) {
      providedInterfaces.add(edge.targetUri);
    }
  }

  // DataObjects carried by each of those interfaces
  const ifcToDataLabels = new Map<string, string[]>();
  for (const edge of rawNetwork.edges) {
    if (edge.edgeType !== "carries") continue;
    if (!providedInterfaces.has(edge.sourceUri)) continue;
    const doNode = nodesByUri.get(edge.targetUri);
    if (!doNode) continue;
    if (!ifcToDataLabels.has(edge.sourceUri)) ifcToDataLabels.set(edge.sourceUri, []);
    const labels = ifcToDataLabels.get(edge.sourceUri)!;
    if (!labels.includes(doNode.label)) labels.push(doNode.label);
  }

  // Systems that consume from those interfaces
  const downstreamMap = new Map<string, Set<string>>(); // sysUri → set of DO labels
  for (const edge of rawNetwork.edges) {
    if (edge.edgeType !== "consume") continue;
    if (!providedInterfaces.has(edge.sourceUri)) continue;
    const consumerUri = edge.targetUri;
    if (consumerUri === systemUri) continue; // skip self

    const doLabels = ifcToDataLabels.get(edge.sourceUri) ?? [];
    if (!downstreamMap.has(consumerUri)) downstreamMap.set(consumerUri, new Set());
    for (const label of doLabels) {
      downstreamMap.get(consumerUri)!.add(label);
    }
  }

  // Build a set of DataObject URIs that have multiple providers (from reactor data)
  const redundantDataObjectLabels = new Set<string>();
  for (const entry of reactorResult.dataObjectProviders) {
    if (entry.allProviders.length > 1) {
      redundantDataObjectLabels.add(entry.label);
    }
  }

  // Convert to impact entries
  const results: AffectedSystemImpact[] = [];
  for (const [sysUri, doLabelSet] of downstreamMap) {
    const lostDataObjects = [...doLabelSet].sort();
    const hasAlternatives = lostDataObjects.some((label) =>
      redundantDataObjectLabels.has(label),
    );

    const node = nodesByUri.get(sysUri);
    results.push({
      uri: sysUri,
      label: node?.label ?? sysUri,
      tier: "medium",
      lostDataObjects,
      hasAlternatives,
    });
  }

  return results.sort((a, b) => b.lostDataObjects.length - a.lostDataObjects.length);
}
