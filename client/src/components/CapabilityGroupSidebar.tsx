// CapabilityGroupSidebar.tsx — Diagnostic sidebar shown when a capability
// group bubble is zoomed into on the System Inspection page.
//
// Analysis logic lives in @/lib/groupOverlap.
// Kind badge UI lives in ./KindBadge.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CapabilityGroup, SystemDetails } from "@/types/system";
import { computeOverlap } from "@/lib/groupOverlap";
import { KindBadge } from "./KindBadge";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_WIDTH = 240;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 288; // w-72

// ── Props ─────────────────────────────────────────────────────────────────────

interface CapabilityGroupSidebarProps {
	group: CapabilityGroup;
	onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CapabilityGroupSidebar = ({ group, onClose }: CapabilityGroupSidebarProps) => {
	const { insightId } = useInsight();
	const navigate = useNavigate();

	const [allDetails, setAllDetails] = useState<SystemDetails[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	// Set of system URIs whose detail rows are expanded (empty = all collapsed)
	const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());

	const toggleSystem = useCallback((uri: string) => {
		setExpandedSystems((prev) => {
			const next = new Set(prev);
			if (next.has(uri)) next.delete(uri);
			else next.add(uri);
			return next;
		});
	}, []);

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
		setExpandedSystems(new Set());

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
						<span>
							<strong className="text-gray-800">{analysis.totalDataObjects}</strong> data objects
						</span>
					</div>

					{/* Badge key */}
				<div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
					<span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Key:</span>
					{(["BP", "Activity", "DataObject"] as const).map((k) => (
						<span key={k} className="flex items-center gap-1">
							<KindBadge kind={k} />
							<span>{k === "BP" ? "Business Process" : k === "Activity" ? "Activity" : "Data Object"}</span>
						</span>
					))}
				</div>

				{/* ── Systems by Overlap Ranking ──────────────────────── */}
				<p className="px-4 py-3 text-[11px] leading-relaxed text-gray-400">
					This list ranks each system in the capability group by <span className="font-semibold text-gray-500">Overlap Score</span>, defined as the percent of Business Processes, Activities, and Data Objects that are also supported by another system in the capability group.
				</p>
				<ul className="divide-y divide-gray-100">
					{analysis.overlapRanking.map((sys, idx) => {
						const pct = Math.round(sys.score * 100);
						const open = expandedSystems.has(sys.systemUri);
						const barColor = pct >= 66 ? "bg-emerald-400" : pct >= 33 ? "bg-amber-400" : "bg-red-400";
						const pctColor = pct >= 66 ? "text-emerald-600" : pct >= 33 ? "text-amber-600" : "text-red-500";
						return (
							<li key={sys.systemUri}>
								{/* Row header */}
								<button
									type="button"
									onClick={() => toggleSystem(sys.systemUri)}
									className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
								>
									{open ? (
										<ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
									) : (
										<ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
									)}
									<span className="w-4 shrink-0 text-right text-[10px] text-gray-400">{idx + 1}</span>
									<span className="flex-1 truncate text-xs font-medium text-gray-800" title={sys.systemLabel}>
										{sys.systemLabel}
									</span>
									<span className={`shrink-0 text-xs font-semibold ${pctColor}`}>{pct}%</span>
								</button>
								{/* Progress bar — always visible */}
								<div className="mx-4 mb-1 h-1 overflow-hidden rounded-full bg-gray-100">
									<div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
								</div>							{/* Examine removal impact button */}
							<div className="mx-4 mb-2 flex justify-end">
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										navigate("/removal-impact", {
											state: {
												systemUri: sys.systemUri,
												systemLabel: sys.systemLabel,
												returnGroup: { uri: group.uri, label: group.label },
											},
										});
									}}
									className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800"
								>
									Data Object Impact →
								</button>
							</div>								{/* Expanded detail */}
								{open && (
									<div className="space-y-3 border-t border-gray-50 px-4 pb-3 pt-2">
										{/* Unique items — removal impact */}
									{sys.uniqueItems.length > 0 && (
											<div>
												<p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
													Unique Contributions ({sys.uniqueItems.length})
												</p>
												<ul className="space-y-1">
													{sys.uniqueItems.map((item) => (
														<li key={item.uri} className="flex items-start gap-1.5 text-xs text-gray-600">
															<KindBadge kind={item.kind} />
															<span>{item.label}</span>
														</li>
													))}
												</ul>
											</div>
										)}
										{/* Shared items */}
										{sys.sharedItems.length > 0 && (
											<div>
												<p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
													Shared with others ({sys.sharedItems.length})
												</p>
												<ul className="space-y-1">
													{sys.sharedItems.map((item) => (
														<li key={item.uri} className="flex items-start gap-1.5 text-xs text-gray-500">
															<KindBadge kind={item.kind} />
															<span>{item.label}</span>
														</li>
													))}
												</ul>
											</div>
										)}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			</div>
		)}
		</aside>
	);
};
