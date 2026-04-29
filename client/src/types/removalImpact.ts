// Type definitions for the System Removal Impact Analyzer.

import type { LabeledItem } from "./system";

/** Severity tier for an impact finding. */
export type ImpactTier = "critical" | "high" | "medium";

// ── Reactor response types ──────────────────────────────────────────────────

/** A DataObject with the full list of systems that provide it enterprise-wide. */
export interface DataObjectProviderEntry {
  uri: string;
  label: string;
  allProviders: LabeledItem[];
}

/** A CapabilityGroup with total supporter count and the list of supporting systems. */
export interface CapabilityGroupCoverageEntry {
  uri: string;
  label: string;
  totalSupporters: number;
  systems: LabeledItem[];
}

/** Raw response from GetSystemRemovalImpact reactor. */
export interface RemovalImpactReactorResponse {
  systemUri: string;
  systemName: string;
  dataObjectProviders: DataObjectProviderEntry[];
  capabilityGroupCoverage: CapabilityGroupCoverageEntry[];
}

// ── Computed impact types ───────────────────────────────────────────────────

/** A DataObject that becomes orphaned (sole provider removed) or loses one provider. */
export interface DataObjectImpact {
  uri: string;
  label: string;
  tier: ImpactTier;
  /** True when the target system is the ONLY provider — removing it orphans this object. */
  isOrphaned: boolean;
  /** All systems that provide this DataObject (including the target). */
  allProviders: LabeledItem[];
}

/** A CapabilityGroup that loses coverage when the target system is removed. */
export interface CapabilityGroupImpact {
  uri: string;
  label: string;
  tier: ImpactTier;
  /** Supporters remaining AFTER removing the target system. */
  remainingSupporters: number;
  /** Total supporters BEFORE removal. */
  totalSupporters: number;
  /** All supporting systems (including the target, for display). */
  systems: LabeledItem[];
}

/** A downstream system that loses at least one inbound data feed from the removed system. */
export interface AffectedSystemImpact {
  uri: string;
  label: string;
  tier: "medium";
  /** DataObject labels the system was receiving from the removed system. */
  lostDataObjects: string[];
  /** True if at least one of the lost DataObjects has an alternative provider. */
  hasAlternatives: boolean;
}

/** Complete result of the removal impact computation. */
export interface RemovalImpactResult {
  targetSystem: LabeledItem;
  dataObjectImpacts: DataObjectImpact[];
  capabilityGroupImpacts: CapabilityGroupImpact[];
  affectedSystemImpacts: AffectedSystemImpact[];
  summary: {
    critical: number;
    high: number;
    medium: number;
  };
}
