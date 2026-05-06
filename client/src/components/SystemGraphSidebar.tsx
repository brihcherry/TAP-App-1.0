// SystemGraphSidebar.tsx — Sidebar for the system-centric graph view in the
// System Network Map. Provides degree-based expansion controls and canvas
// lock/unlock. Designed for the click-to-graph feature on SystemNetworkPage.

import { Lock, Unlock, ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SystemGraphSidebarProps {
	/** Display name of the selected system */
	systemLabel: string;
	/** Current expansion degree (≥1) */
	degree: number;
	/** Maximum possible degree for this system */
	maxDegree: number;
	/** Called when the slider or controls change the degree */
	onDegreeChange: (degree: number) => void;
	/** Called when the Expand button is clicked (increments degree by 1) */
	onExpand: () => void;
	/** Whether further expansion is possible */
	canExpand: boolean;
	/** Total node count in current subgraph */
	nodeCount: number;
	/** Total edge count in current subgraph */
	edgeCount: number;
	/** Whether the D3 simulation is locked */
	isGraphLocked: boolean;
	onLockGraph: () => void;
	onUnlockGraph: () => void;
	/** Navigate back to the system list */
	onBack: () => void;
}

export const SystemGraphSidebar = ({
	systemLabel,
	degree,
	maxDegree,
	onDegreeChange,
	onExpand,
	canExpand,
	nodeCount,
	edgeCount,
	isGraphLocked,
	onLockGraph,
	onUnlockGraph,
	onBack,
}: SystemGraphSidebarProps) => {
	return (
		<aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 p-4 flex flex-col gap-4 overflow-y-auto">
			{/* ── Back button ─────────────────────────────────────────────── */}
			<Button
				variant="outline"
				className="w-full justify-start gap-2"
				onClick={onBack}
			>
				<ArrowLeft className="h-4 w-4" />
				Back to List
			</Button>

			{/* ── System info ─────────────────────────────────────────────── */}
			<div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
				<div className="text-[10px] uppercase tracking-wide text-blue-500 font-semibold">
					Selected System
				</div>
				<div className="mt-1 text-sm font-semibold text-blue-900 break-words">
					{systemLabel}
				</div>
				<div className="mt-2 flex gap-3 text-xs text-blue-700">
					<span>{nodeCount} nodes</span>
					<span className="text-blue-300">·</span>
					<span>{edgeCount} edges</span>
				</div>
			</div>

			<hr className="border-gray-200" />

			{/* ── Degree controls ─────────────────────────────────────────── */}
			<div className="flex flex-col gap-3">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
					Connection Depth
				</h3>

				{maxDegree <= 0 ? (
					<div className="rounded bg-gray-100 border border-gray-200 p-2 text-xs text-gray-500 text-center">
						No connections found for this system.
					</div>
				) : (
					<>
						{/* Degree label */}
						<div className="flex items-baseline justify-between">
							<span className="text-sm font-medium text-gray-800">
								Degree {degree}
							</span>
							<span className="text-xs text-gray-400">
								of {maxDegree}
							</span>
						</div>

						{/* Slider */}
						<input
							type="range"
							min={1}
							max={maxDegree}
							step={1}
							value={degree}
							onChange={(e) => onDegreeChange(Number(e.target.value))}
							className="w-full"
							disabled={maxDegree <= 1}
						/>

						{/* Degree tick marks */}
						{maxDegree > 1 && (
							<div className="flex justify-between px-0.5">
								{Array.from({ length: maxDegree }, (_, i) => (
									<button
										key={i + 1}
										type="button"
										onClick={() => onDegreeChange(i + 1)}
										className={`text-[10px] w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
											i + 1 === degree
												? "bg-blue-600 text-white font-bold"
												: i + 1 < degree
													? "bg-blue-100 text-blue-600"
													: "bg-gray-100 text-gray-400 hover:bg-gray-200"
										}`}
									>
										{i + 1}
									</button>
								))}
							</div>
						)}

						{/* Expand button */}
						<Button
							variant="default"
							className="w-full gap-2"
							onClick={onExpand}
							disabled={!canExpand}
						>
							<ChevronRight className="h-4 w-4" />
							{canExpand
								? `Expand to Degree ${degree + 1}`
								: "Fully Expanded"}
						</Button>

						{/* Stats at current degree */}
						<div className="text-xs text-gray-500 px-1">
							Showing all systems, interfaces, and data objects
							within {degree} system-hop{degree !== 1 ? "s" : ""} of{" "}
							<span className="font-medium text-gray-700">{systemLabel}</span>.
						</div>
					</>
				)}
			</div>

			<hr className="border-gray-200" />

			{/* ── Canvas controls ─────────────────────────────────────────── */}
			<div className="flex flex-col gap-2">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
					Canvas Controls
				</h3>
				<div className="grid grid-cols-2 gap-2">
					<Button
						variant={isGraphLocked ? "default" : "outline"}
						className="h-auto px-3 py-2"
						onClick={onLockGraph}
						disabled={isGraphLocked}
					>
						<Lock className="h-4 w-4" />
						<span>Lock</span>
					</Button>
					<Button
						variant={!isGraphLocked ? "default" : "outline"}
						className="h-auto px-3 py-2"
						onClick={onUnlockGraph}
						disabled={!isGraphLocked}
					>
						<Unlock className="h-4 w-4" />
						<span>Unlock</span>
					</Button>
				</div>
				<div className="text-xs text-gray-500 px-1">
					{isGraphLocked
						? "Nodes are locked in place. You can still pan and zoom."
						: "Nodes are unlocked. Drag nodes to rearrange."}
				</div>
			</div>
		</aside>
	);
};
