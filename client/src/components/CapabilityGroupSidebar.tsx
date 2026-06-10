// CapabilityGroupSidebar.tsx — Diagnostic sidebar shown when a capability
// group bubble is zoomed into on the System Inspection page.
//
// Analysis logic lives in @/lib/groupOverlap.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import type { CapabilityGroup, SystemDetails } from "@/types/system";
import { computeOverlap } from "@/lib/groupOverlap";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_WIDTH = 360;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 360;
const TAP_CORE_DATABASE_ID = "133db94b-4371-4763-bff9-edf7e5ed021b";

type SimilarityBucketKey =
	| "Business_Processes_Supported"
	| "Activities_Supported"
	| "Data_Subject_Area"
	| "Environment"
	| "User_Types"
	| "Interfaces";

interface SimilarityCategoryScore {
	bucket: SimilarityBucketKey;
	label: string;
	score: number | null;
}

interface PairSimilarityResult {
	summaryScore: number | null;
	hasScore: boolean;
	categories: SimilarityCategoryScore[];
	direction?: string;
}

const SIMILARITY_BUCKET_LABELS: Record<SimilarityBucketKey, string> = {
	Business_Processes_Supported: "Business Processes",
	Activities_Supported: "Activities",
	Data_Subject_Area: "Data Subject Areas",
	Environment: "Environment",
	User_Types: "User Types",
	Interfaces: "Interfaces",
};

const SIMILARITY_BUCKETS = Object.keys(SIMILARITY_BUCKET_LABELS) as SimilarityBucketKey[];

function makePairKey(system1: string, system2: string): string {
	return system1 + "::" + system2;
}

function normalizeScore(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.max(0, Math.min(100, value));
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return Math.max(0, Math.min(100, parsed));
		}
	}
	return null;
}

function getFieldByName(entry: Record<string, unknown>, name: string): unknown {
	if (name in entry) return entry[name];
	const key = Object.keys(entry).find((k) => k.toLowerCase() === name.toLowerCase());
	return key ? entry[key] : undefined;
}

function parseSimilarityData(output: unknown): Map<string, PairSimilarityResult> {
	const result = new Map<string, PairSimilarityResult>();
	if (!output || typeof output !== "object") return result;

	const pairs = (output as { pairs?: unknown }).pairs;
	if (!Array.isArray(pairs)) return result;

	for (const pairEntry of pairs) {
		if (!pairEntry || typeof pairEntry !== "object") continue;
		const pair = pairEntry as Record<string, unknown>;
		const system1 = getFieldByName(pair, "system1Uri");
		const system2 = getFieldByName(pair, "system2Uri");
		if (typeof system1 !== "string" || typeof system2 !== "string") continue;

		const categoryScores = getFieldByName(pair, "categoryScores");
		const categories = SIMILARITY_BUCKETS.map((bucket) => {
			let score: number | null = null;
			if (categoryScores && typeof categoryScores === "object") {
				score = normalizeScore((categoryScores as Record<string, unknown>)[bucket]);
			}
			return {
				bucket,
				label: SIMILARITY_BUCKET_LABELS[bucket],
				score,
			};
		});

		const directionalKey = makePairKey(system1, system2);
		result.set(directionalKey, {
			summaryScore: normalizeScore(getFieldByName(pair, "summaryScore")),
			hasScore: getFieldByName(pair, "hasScore") === true,
			categories,
			direction: getFieldByName(pair, "direction") as string | undefined,
		});
	}

	return result;
}

function normalizeUriList(uris: string[]): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const uri of uris) {
		const trimmed = uri.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		normalized.push(trimmed);
	}
	return normalized;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CapabilityGroupSidebarProps {
	group: CapabilityGroup;
	onClose: () => void;
	/** Current view mode so navigation back restores the correct toggle state. */
	viewMode?: "capabilityGroup" | "capability";
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CapabilityGroupSidebar = ({ group, onClose, viewMode }: CapabilityGroupSidebarProps) => {
	const { insightId } = useInsight();
	const navigate = useNavigate();

	const [allDetails, setAllDetails] = useState<SystemDetails[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [pairSimilarity, setPairSimilarity] = useState<Map<string, PairSimilarityResult>>(new Map());
	const [isLoadingSimilarity, setIsLoadingSimilarity] = useState(false);
	const [similarityLoadError, setSimilarityLoadError] = useState<string | null>(null);
	const [selectedPairBySystem, setSelectedPairBySystem] = useState<Record<string, string>>({});

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
		setPairSimilarity(new Map());
		setSimilarityLoadError(null);
		setSelectedPairBySystem({});

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

	const requestedSystemUris = useMemo(
		() => normalizeUriList(group.systems.map((sys) => sys.uri)),
		[group]
	);

	const groupUriByLabel = useMemo(() => {
		const map = new Map<string, string>();
		for (const sys of group.systems) {
			map.set(sys.label.toLowerCase(), sys.uri.trim());
		}
		return map;
	}, [group]);

	const resolveSimilarityUri = useCallback(
		(systemUri: string, systemLabel: string) => {
			if (requestedSystemUris.includes(systemUri)) return systemUri;
			return groupUriByLabel.get(systemLabel.toLowerCase()) ?? systemUri;
		},
		[groupUriByLabel, requestedSystemUris]
	);

	useEffect(() => {
		if (!insightId || requestedSystemUris.length < 2) {
			setPairSimilarity(new Map());
			setSimilarityLoadError(null);
			setIsLoadingSimilarity(false);
			return;
		}

		let cancelled = false;
		setIsLoadingSimilarity(true);
		setSimilarityLoadError(null);

		const systemUris = requestedSystemUris.map((uri) => `"${uri}"`).join(",");
		const pixel = `GetCapabilityGroupSimilarity(database=["${TAP_CORE_DATABASE_ID}"], systemList=[${systemUris}]);`;

		runPixel(pixel, insightId)
			.then((response) => {
				if (cancelled) return;
				if (response.errors.length > 0) {
					setSimilarityLoadError(response.errors.join(", "));
					setPairSimilarity(new Map());
					return;
				}

				const output = response.pixelReturn[0]?.output;
				setPairSimilarity(parseSimilarityData(output));
			})
			.catch((err) => {
				if (!cancelled) {
					setSimilarityLoadError(err instanceof Error ? err.message : "Failed to load similarity scores");
					setPairSimilarity(new Map());
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoadingSimilarity(false);
			});

		return () => {
			cancelled = true;
		};
	}, [insightId, requestedSystemUris]);

	const analysis = useMemo(
		() => (allDetails.length > 0 ? computeOverlap(allDetails) : null),
		[allDetails]
	);

	const systemSimilarityRanking = useMemo(() => {
		const totalComparisons = group.systems.length > 1 ? group.systems.length - 1 : 0;
		return group.systems
			.map((sys) => {
				const uri = resolveSimilarityUri(sys.uri, sys.label);
				const scores: number[] = [];
				for (const peer of group.systems) {
					if (peer.uri === sys.uri) continue;
					const peerUri = resolveSimilarityUri(peer.uri, peer.label);
					const pair = pairSimilarity.get(makePairKey(uri, peerUri));
					if (pair?.summaryScore !== null && pair?.summaryScore !== undefined) {
						scores.push(pair.summaryScore);
					}
				}
				const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
				return {
					systemUri: sys.uri,
					systemLabel: sys.label,
					avgSimilarityScore: avgScore,
					availableComparisons: scores.length,
					totalComparisons,
				};
			})
			.sort((a, b) => {
				if (a.avgSimilarityScore !== null && b.avgSimilarityScore !== null) {
					if (b.avgSimilarityScore !== a.avgSimilarityScore) return b.avgSimilarityScore - a.avgSimilarityScore;
				}
				if (a.avgSimilarityScore !== null && b.avgSimilarityScore === null) return -1;
				if (a.avgSimilarityScore === null && b.avgSimilarityScore !== null) return 1;
				if (b.availableComparisons !== a.availableComparisons) return b.availableComparisons - a.availableComparisons;
				return a.systemLabel.localeCompare(b.systemLabel);
			});
	}, [group.systems, pairSimilarity, resolveSimilarityUri]);

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
							<strong className="text-gray-800">{group.systems.length}</strong> Systems
						</span>
						<span>
							<strong className="text-gray-800">{analysis.totalBPs}</strong> BPs
						</span>
						<span>
							<strong className="text-gray-800">{analysis.totalActivities}</strong> Activities
						</span>
						<span>
							<strong className="text-gray-800">{analysis.totalDataObjects}</strong> Data Subject Areas
						</span>
					</div>

				{/* Group/Capability description */}
				<div className="border-b border-gray-100 px-4 py-3">
					<p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Description:</p>
					<p className="mt-1 text-xs text-gray-500 leading-relaxed">
						{group.description?.trim() ? group.description : "Not available"}
					</p>
				</div>

				{/* ── Systems by Similarity Ranking ──────────────────────── */}
				<p className="px-4 py-3 text-[11px] leading-relaxed text-gray-400">
					This list ranks each system in the capability group by <span className="font-semibold text-gray-500">Mean Pairwise Similarity Score</span>, the average of all available backend similarity summary scores against other systems in the group.
				</p>
				{similarityLoadError && (
					<p className="px-4 pb-2 text-[11px] text-amber-600">
						Similarity details are unavailable right now. Cards will show "Similarity score not available." ({similarityLoadError})
					</p>
				)}
				<ul className="divide-y divide-gray-100">
					{systemSimilarityRanking.map((sys, idx) => {
						const scoreDisplay = sys.avgSimilarityScore !== null ? `${Math.round(sys.avgSimilarityScore)}` : "—";
						const completenessNote = sys.totalComparisons > 0 ? `(${sys.availableComparisons}/${sys.totalComparisons} pairs)` : "";
						const similarityUri = resolveSimilarityUri(sys.systemUri, sys.systemLabel);
						const peerEntries = systemSimilarityRanking.filter((peer) => peer.systemUri !== sys.systemUri);
						// Sort peer cards by pairwise summary score descending, null last, then alphabetical
						const peerSystems = [...peerEntries].sort((a, b) => {
							const pairA = pairSimilarity.get(makePairKey(similarityUri, resolveSimilarityUri(a.systemUri, a.systemLabel)));
							const pairB = pairSimilarity.get(makePairKey(similarityUri, resolveSimilarityUri(b.systemUri, b.systemLabel)));
							const scoreA = pairA?.summaryScore ?? null;
							const scoreB = pairB?.summaryScore ?? null;
							if (scoreA !== null && scoreB !== null) return scoreB - scoreA;
							if (scoreA !== null && scoreB === null) return -1;
							if (scoreA === null && scoreB !== null) return 1;
							return a.systemLabel.localeCompare(b.systemLabel);
						});
						const selectedPeerUri = selectedPairBySystem[sys.systemUri] ?? peerSystems[0]?.systemUri;
						const selectedPeer = peerSystems.find((peer) => peer.systemUri === selectedPeerUri);
						const selectedPair = selectedPeerUri
							? pairSimilarity.get(
									makePairKey(
										similarityUri,
										resolveSimilarityUri(selectedPeerUri, selectedPeer?.systemLabel ?? "")
									)
							  )
							: undefined;
						return (
							<li key={sys.systemUri}>
								{/* Row header */}
								<div className="flex w-full items-center gap-2 px-4 py-2.5">
									<span className="w-4 shrink-0 text-right text-[10px] text-gray-400">{idx + 1}</span>
									<span className="flex-1 truncate text-xs font-medium text-gray-800" title={sys.systemLabel}>
										{sys.systemLabel}
									</span>
									<span className="shrink-0 text-xs font-semibold text-gray-700">{scoreDisplay}</span>
									{completenessNote && (
										<span className="shrink-0 text-[10px] text-gray-400">{completenessNote}</span>
									)}
								</div>
								{/* Pairwise similarity cards */}
								<div className="mx-4 mb-2 rounded-md border border-gray-100 bg-gray-50/70 p-2">
									<div className="mb-1 flex items-center justify-between">
										<p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
											Similarity to systems in group
										</p>
										{isLoadingSimilarity && <span className="text-[10px] text-gray-400">Loading...</span>}
									</div>
									{peerSystems.length === 0 ? (
										<p className="text-[11px] text-gray-400">No other systems in this group.</p>
									) : (
										<div className="flex gap-2 overflow-x-auto pb-1">
											{peerSystems.map((peer) => {
												const pair = pairSimilarity.get(
													makePairKey(similarityUri, resolveSimilarityUri(peer.systemUri, peer.systemLabel))
												);
												const scoreText =
													pair?.summaryScore !== null && pair?.summaryScore !== undefined
														? `${Math.round(pair.summaryScore)}`
														: "Not available";
												const isSelected = selectedPeerUri === peer.systemUri;
												return (
													<button
														key={peer.systemUri}
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															setSelectedPairBySystem((prev) => ({
																...prev,
																[sys.systemUri]: peer.systemUri,
															}));
														}}
														className={`min-w-[104px] rounded-md border px-2 py-1.5 text-left transition-colors ${
															isSelected
																? "border-blue-300 bg-blue-50"
																: "border-gray-200 bg-white hover:border-gray-300"
														}`}
													>
														<p className="truncate text-[10px] text-gray-500" title={peer.systemLabel}>
															{peer.systemLabel}
														</p>
														<p className="text-xs font-semibold text-gray-700">{scoreText}</p>
													</button>
												);
											})}
										</div>
									)}
									{selectedPeerUri && (
										<div className="mt-2 rounded-md border border-gray-200 bg-white px-2.5 py-2">
											<p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
												Similarity breakdown
											</p>
											{selectedPair ? (
												<>
													{selectedPair.summaryScore !== null ? (
														<div className="mb-2 rounded-md bg-blue-50 px-2 py-1.5">
															<p className="text-[10px] text-gray-600">Summary Score:</p>
															<p className="text-sm font-bold text-blue-900">{Math.round(selectedPair.summaryScore)}</p>
														</div>
													) : (
														<div className="mb-2 rounded-md bg-amber-50 px-2 py-1.5">
															<p className="text-[10px] italic text-amber-800">
																Summary score cannot be computed due to incomplete data.
															</p>
														</div>
													)}
													<ul className="space-y-1">
														{selectedPair.categories.map((category) => (
															<li key={`${sys.systemUri}-${selectedPeerUri}-${category.bucket}`} className="flex items-center justify-between text-[11px]">
																<span className="text-gray-600">{category.label}</span>
																<span className="font-medium text-gray-700">
																	{category.score === null ? "Not available" : `${Math.round(category.score)}`}
																</span>
															</li>
														))}
													</ul>
												</>
											) : (
												<p className="text-[11px] italic text-gray-500">Similarity data not available.</p>
											)}
										</div>
									)}
								</div>
								{/* Action buttons */}
							<div className="mx-4 mb-2 flex justify-end gap-2">
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
											navigate("/system-network", {
											state: {
												systemUri: sys.systemUri,
												systemLabel: sys.systemLabel,
													returnGroup: { uri: group.uri, label: group.label },
													viewMode,
												},
										});
									}}
									className="inline-flex items-center gap-1 rounded-md bg-gray-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-gray-700 active:bg-gray-800"
								>
									View System Network Graph
								</button>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
											navigate("/removal-impact", {
											state: {
												systemUri: sys.systemUri,
												systemLabel: sys.systemLabel,
													returnGroup: { uri: group.uri, label: group.label },
													viewMode,
												},
										});
									}}
									className="inline-flex items-center gap-1 rounded-md bg-blue-400 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800"
								>
									View Removal Impact
								</button>
							</div>
							</li>
						);
					})}
				</ul>
			</div>
		)}
		</aside>
	);
};
