// Type definitions for the Data Flow Impact Analyzer (redesigned Removal Impact).

import type { LabeledItem } from "./system";

/** Classification of a DataObject's impact when the target system is removed. */
export type FlowImpactClassification = "soleProvider" | "criticalRelay" | "nonCritical";

/** The role the target system plays for a given DataObject. */
export type SystemFlowRole = "provider" | "consumer" | "relay";

/** A directed edge in a DataObject's flow graph. */
export interface FlowEdge {
  source: string;
  target: string;
}

// ── Reactor response types ──────────────────────────────────────────────────

/** Per-DataObject impact entry returned by GetDataFlowImpact reactor. */
export interface DataFlowEntry {
  dataObjectUri: string;
  dataObjectLabel: string;
  role: SystemFlowRole;
  classification: FlowImpactClassification;
  isolatedSystems: LabeledItem[];
  totalSystemsInGraph: number;
  alternativeProviders: LabeledItem[];
  flowEdges: FlowEdge[];
}

/** Raw response from GetDataFlowImpact reactor. */
export interface DataFlowImpactReactorResponse {
  systemUri: string;
  systemName: string;
  dataFlowImpacts: DataFlowEntry[];
}

// ── Computed result for the page ────────────────────────────────────────────

/** Grouped and summarized result ready for UI rendering. */
export interface DataFlowImpactResult {
  targetSystem: LabeledItem;
  soleProvider: DataFlowEntry[];
  criticalRelay: DataFlowEntry[];
  nonCritical: DataFlowEntry[];
  summary: {
    totalDataObjects: number;
    totalIsolatedSystems: number;
    criticalPaths: number;
  };
}
