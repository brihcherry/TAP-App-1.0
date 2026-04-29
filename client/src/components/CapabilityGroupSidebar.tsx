// CapabilityGroupSidebar.tsx — Diagnostic sidebar shown when a capability
// group bubble is zoomed into on the System Inspection page.
//
// Fetches SystemDetails for every system in the group in parallel, then
// computes a coverage analysis:
//   - Zone 1 (Unique Contributions): BPs/Activities owned by exactly 1 system
//   - Zone 2 (Shared Capabilities): BPs/Activities covered by 2+ systems
//
// Both zones are collapsible. The sidebar width is draggable via a left-edge handle.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CapabilityGroup, SystemDetails } from "@/types/system";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_WIDTH = 240;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 288; // w-72

// ── Analysis types ────────────────────────────────────────────────────────────

interface ConceptEntry {
	uri: string;
	label: string;
	kind: "BP" | "Activity";
	supportingSystemUris: string[];
}

interface UniqueContribution {
	systemUri: string;
	systemLabel: string;
	items: { uri: string; label: string; kind: "BP" | "Activity" }[];
}

interface OverlapAnalysis {
	totalBPs: number;
	totalActivities: number;
	uniqueContributions: UniqueContribution[];
	sharedItems: (ConceptEntry & { coverageCount: number })[];
}

// ── Pure analysis function ────────────────────────────────────────────────────

function computeOverlap(allDetails: SystemDetails[]): OverlapAnalysis {
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
	}

	const allConcepts = Array.from(conceptMap.values());
	const totalBPs = allConcepts.filter((c) => c.kind === "BP").length;
	const totalActivities = allConcepts.filter((c) => c.kind === "Activity").length;

	// Unique: covered by exactly one system — group by that system
	const bySystem = new Map<string, UniqueContribution>();
	for (const concept of allConcepts.filter((c) => c.supportingSystemUris.length === 1)) {
		const sysUri = concept.supportingSystemUris[0];
		const sysDetails = allDetails.find((d) => d.systemUri === sysUri);
		if (!sysDetails) continue;
		const entry = bySystem.get(sysUri);
		if (entry) {
			entry.items.push({ uri: concept.uri, label: concept.label, kind: concept.kind });
		} else {
			bySystem.set(sysUri, {
				systemUri: sysUri,
				systemLabel: sysDetails.systemName,
				items: [{ uri: concept.uri, label: concept.label, kind: concept.kind }],
			});
		}
	}

	const uniqueContributions = Array.from(bySystem.values()).sort((a, b) =>
		a.systemLabel.localeCompare(b.systemLabel)
	);

	// Shared: covered by 2+ systems, sorted by coverage count ascending so the
	// "most unique" shared items (covered by fewest systems) appear first.
	const sharedItems = allConcepts
		.filter((c) => c.supportingSystemUris.length > 1)
		.map((c) => ({ ...c, coverageCount: c.supportingSystemUris.length }))
		.sort(
			(a, b) =>
				a.coverageCount - b.coverageCount || a.label.localeCompare(b.label)
		);

	return { totalBPs, totalActivities, uniqueContributions, sharedItems };
}

// ── Kind badge ────────────────────────────────────────────────────────────────

const KindBadge = ({ kind }: { kind: "BP" | "Activity" }) => (
	<span
		className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-bold leading-none uppercase ${
			kind === "BP"
				? "bg-blue-100 text-blue-700"
				: "bg-purple-100 text-purple-700"
		}`}
	>
		{kind === "BP" ? "BP" : "Act"}
	</span>
);

// ── Collapsible section header ────────────────────────────────────────────────

interface SectionHeaderProps {
	label: string;
	count?: number;
	expanded: boolean;
	onToggle: () => void;
	className?: string;
}

const SectionHeader = ({ label, count, expanded, onToggle, className = "" }: SectionHeaderProps) => (
	<button
		type="button"
		onClick={onToggle}
		className={`flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:brightness-95 ${className}`}
	>
		{expanded ? (
			<ChevronDown className="h-3.5 w-3.5 shrink-0 text-current opacity-60" />
		) : (
			<ChevronRight className="h-3.5 w-3.5 shrink-0 text-current opacity-60" />
		)}
		<span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
		{count !== undefined && (
			<span className="ml-auto text-xs opacity-60">{count}</span>
		)}
	</button>
);

// ── Props ─────────────────────────────────────────────────────────────────────

interface CapabilityGroupSidebarProps {
	group: CapabilityGroup;
	onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CapabilityGroupSidebar = ({ group, onClose }: CapabilityGroupSidebarProps) => {
	const { insightId } = useInsight();

	const [allDetails, setAllDetails] = useState<SystemDetails[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [uniqueExpanded, setUniqueExpanded] = useState(true);
	const [sharedExpanded, setSharedExpanded] = useState(false);

	// ── Drag-to-resize ────────────────────────────────────────────────────────
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const dragStartX = useRef<number | null>(null);
	const dragStartWidth = useRef<number>(DEFAULT_WIDTH);

	const onDragMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		dragStartX.current = e.clientX;
		dragStartWidth.current = width;
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
	}, [width]);

	useEffect(() => {
		const onMouseMove = (e: MouseEvent) => {
			if (dragStartX.current === null) return;
			// Sidebar is on the right; dragging left (smaller clientX) widens it
			const delta = dragStartX.current - e.clientX;
			const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta));
			setWidth(next);
		};
		const onMouseUp = () => {
			if (dragStartX.current === null) return;
			dragStartX.current = null;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, []);

	// ── Data fetching ─────────────────────────────────────────────────────────

	useEffect(() => {
		if (!insightId || group.systems.length === 0) return;
		let cancelled = false;

		setIsLoading(true);
		setLoadError(null);
		setAllDetails([]);
		setSharedExpanded(false);
		setUniqueExpanded(true);

		const fetches = group.systems.map((sys) =>
			runPixel(`GetSystemDetails(system=["${sys.uri}"]);`, insightId).then(
				(response) => {
					if (response.errors.length > 0) return null;
					const output = response.pixelReturn[0]?.output;
					return output ? (output as SystemDetails) : null;
				}
			)
		);

		Promise.all(fetches)
			.then((results) => {
				if (cancelled) return;
				setAllDetails(results.filter((r): r is SystemDetails => r !== null));
			})
			.catch((err) => {
				if (!cancelled)
					setLoadError(err instanceof Error ? err.message : "Failed to load details");
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [insightId, group]);

	const analysis = useMemo(
		() => (allDetails.length > 0 ? computeOverlap(allDetails) : null),
		[allDetails]
	);

	return (
		<aside
			className="relative shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden"
			style={{ width }}
		>
			{/* ── Drag handle (left edge) ──────────────────────────────────── */}
			<div
				onMouseDown={onDragMouseDown}
				className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize hover:bg-blue-400/40 transition-colors"
				title="Drag to resize"
			/>

			{/* ── Header ──────────────────────────────────────────────────── */}
			<div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 shrink-0">
				<button
					type="button"
					onClick={onClose}
					className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
				>
					✕
				</button>
				<div className="h-5 w-px bg-gray-200" />
				<h2
					className="text-sm font-semibold text-gray-900 truncate flex-1"
					title={group.label}
				>
					{group.label}
				</h2>
			</div>

			{/* ── Loading ──────────────────────────────────────────────────── */}
			{isLoading && (
				<div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-500">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
					Analyzing capability group…
				</div>
			)}

			{/* ── Error ────────────────────────────────────────────────────── */}
			{loadError && !isLoading && (
				<div className="m-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
					{loadError}
				</div>
			)}

			{/* ── Body ─────────────────────────────────────────────────────── */}
			{!isLoading && !loadError && analysis && (
				<div className="flex-1 overflow-y-auto">
					{/* Stats bar */}
					<div className="flex items-center gap-4 border-b border-gray-100 px-4 py-2.5 text-xs text-gray-500">
						<span>
							<strong className="text-gray-800">{group.systems.length}</strong> systems
						</span>
						<span>
							<strong className="text-gray-800">{analysis.totalBPs}</strong> BPs
						</span>
						<span>
							<strong className="text-gray-800">{analysis.totalActivities}</strong> activities
						</span>
					</div>

					{/* ── Zone 1: Unique Contributions ────────────────────── */}
					<div className="border-b border-gray-100">
						<SectionHeader
							label="Unique Contributions"
							count={analysis.uniqueContributions.length}
							expanded={uniqueExpanded}
							onToggle={() => setUniqueExpanded((v) => !v)}
							className="bg-amber-50 text-amber-700"
						/>

						{uniqueExpanded && (
							analysis.uniqueContributions.length === 0 ? (
								<div className="flex items-center gap-2 bg-emerald-50/60 px-4 py-4 text-xs text-emerald-700">
									<span className="text-emerald-500">✓</span>
									No uniquely owned capabilities — good coverage
								</div>
							) : (
								<ul className="divide-y divide-gray-50">
									{analysis.uniqueContributions.map((contrib) => (
										<li key={contrib.systemUri} className="px-4 py-3">
											<p className="mb-1.5 text-xs font-semibold text-gray-800">
												{contrib.systemLabel}
											</p>
											<ul className="space-y-1.5">
												{contrib.items.map((item) => (
													<li
														key={item.uri}
														className="flex items-start gap-2 text-xs text-gray-600"
													>
														<KindBadge kind={item.kind} />
														<span>{item.label}</span>
													</li>
												))}
											</ul>
										</li>
									))}
								</ul>
							)
						)}
					</div>

					{/* ── Zone 2: Shared Capabilities ─────────────────────── */}
					<div>
						<SectionHeader
							label="Shared Capabilities"
							count={analysis.sharedItems.length}
							expanded={sharedExpanded}
							onToggle={() => setSharedExpanded((v) => !v)}
							className="hover:bg-gray-50 text-gray-600"
						/>

						{sharedExpanded && (
							<ul className="divide-y divide-gray-50 border-t border-gray-100">
								{analysis.sharedItems.length === 0 ? (
									<li className="px-4 py-3 text-xs italic text-gray-400">
										None
									</li>
								) : (
									analysis.sharedItems.map((item) => (
										<li
											key={item.uri}
											className="flex items-start gap-2 px-4 py-2.5 text-xs text-gray-600"
										>
											<KindBadge kind={item.kind} />
											<span className="flex-1">{item.label}</span>
											<span className="shrink-0 text-gray-400">
												{item.coverageCount}/{group.systems.length}
											</span>
										</li>
									))
								)}
							</ul>
						)}
					</div>
				</div>
			)}
		</aside>
	);
};
