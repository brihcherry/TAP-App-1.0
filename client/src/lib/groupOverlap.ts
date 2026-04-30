// groupOverlap.ts — Pure analysis logic for capability-group overlap scoring.
//
// Given the full SystemDetails for every system in a capability group, computes
// per-system overlap scores: which BPs / Activities / DataObjects are unique to
// that system within the group vs. shared with at least one other member.
//
// Exported types are also used by RemovalImpactPage when displaying within-group
// context alongside the enterprise-wide data-flow impact analysis.

import type { SystemDetails } from "@/types/system";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ItemKind = "BP" | "Activity" | "DataObject";

export interface ConceptItem {
	uri: string;
	label: string;
	kind: ItemKind;
}

/** Internal: tracks which systems in the group cover a given concept. */
export interface ConceptEntry extends ConceptItem {
	supportingSystemUris: string[];
}

export interface OverlapAnalysis {
	totalBPs: number;
	totalActivities: number;
	totalDataObjects: number;
	/** Every system ranked by overlap score descending. */
	overlapRanking: SystemOverlapScore[];
}

export interface SystemOverlapScore {
	systemUri: string;
	systemLabel: string;
	/** Items this system shares with ≥1 other system in the group. */
	sharedItems: ConceptItem[];
	/** Items only this system has in the group. */
	uniqueItems: ConceptItem[];
	/** sharedItems.length / total, 0–1. */
	score: number;
}

// ── Analysis function ─────────────────────────────────────────────────────────

export function computeOverlap(allDetails: SystemDetails[]): OverlapAnalysis {
	const conceptMap = new Map<string, ConceptEntry>();

	for (const details of allDetails) {
		for (const bp of details.businessProcesses) {
			const existing = conceptMap.get(bp.uri);
			if (existing) {
				existing.supportingSystemUris.push(details.systemUri);
			} else {
				conceptMap.set(bp.uri, {
					uri: bp.uri,
					label: bp.label,
					kind: "BP",
					supportingSystemUris: [details.systemUri],
				});
			}
		}
		for (const act of details.activities) {
			const existing = conceptMap.get(act.uri);
			if (existing) {
				existing.supportingSystemUris.push(details.systemUri);
			} else {
				conceptMap.set(act.uri, {
					uri: act.uri,
					label: act.label,
					kind: "Activity",
					supportingSystemUris: [details.systemUri],
				});
			}
		}
		for (const dobj of details.dataObjects) {
			const existing = conceptMap.get(dobj.uri);
			if (existing) {
				existing.supportingSystemUris.push(details.systemUri);
			} else {
				conceptMap.set(dobj.uri, {
					uri: dobj.uri,
					label: dobj.label,
					kind: "DataObject",
					supportingSystemUris: [details.systemUri],
				});
			}
		}
	}

	const allConcepts = Array.from(conceptMap.values());
	const totalBPs = allConcepts.filter((c) => c.kind === "BP").length;
	const totalActivities = allConcepts.filter((c) => c.kind === "Activity").length;
	const totalDataObjects = allConcepts.filter((c) => c.kind === "DataObject").length;

	// Per-system: partition each system's items into shared (≥2 systems) and unique (only this one)
	const overlapRanking: SystemOverlapScore[] = allDetails
		.map((details) => {
			const allSystemItems: ConceptItem[] = [
				...details.businessProcesses.map((x) => ({ uri: x.uri, label: x.label, kind: "BP" as ItemKind })),
				...details.activities.map((x) => ({ uri: x.uri, label: x.label, kind: "Activity" as ItemKind })),
				...details.dataObjects.map((x) => ({ uri: x.uri, label: x.label, kind: "DataObject" as ItemKind })),
			];
			const sharedItems: ConceptItem[] = [];
			const uniqueItems: ConceptItem[] = [];
			for (const item of allSystemItems) {
				const entry = conceptMap.get(item.uri);
				if (entry && entry.supportingSystemUris.length > 1) {
					sharedItems.push(item);
				} else {
					uniqueItems.push(item);
				}
			}
			const total = allSystemItems.length;
			return {
				systemUri: details.systemUri,
				systemLabel: details.systemName,
				sharedItems,
				uniqueItems,
				score: total === 0 ? 0 : sharedItems.length / total,
			};
		})
		.sort((a, b) => b.score - a.score || a.systemLabel.localeCompare(b.systemLabel));

	return { totalBPs, totalActivities, totalDataObjects, overlapRanking };
}
