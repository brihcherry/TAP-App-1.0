// EdgeDetailSidebar.tsx — Right sidebar displaying full connection details
// when a graph edge is clicked in the System Network Map.
//
// Shows every data object and interface (no truncation) for both the forward
// and reverse direction between the two connected systems.

import { X } from "lucide-react";
import type { ProcessedEdge, DirectionBucket } from "@/types/graph";

interface EdgeDetailSidebarProps {
	edge: ProcessedEdge;
	sourceLabel: string;
	targetLabel: string;
	onClose: () => void;
}

// ── Direction Section ─────────────────────────────────────────────────────────

function DirectionSection({
	bucket,
	fromLabel,
	toLabel,
}: {
	bucket: DirectionBucket;
	fromLabel: string;
	toLabel: string;
}) {
	return (
		<div className="border-t border-gray-100 px-4 py-3">
			<div
				className={`text-xs font-semibold mb-2 ${
					bucket.hasFlow ? "text-blue-700" : "text-gray-400"
				}`}
			>
				{fromLabel} → {toLabel}
			</div>

			{!bucket.hasFlow ? (
				<p className="text-xs text-gray-400 italic">No data flow in this direction.</p>
			) : (
				<>
					{/* Data objects */}
					{bucket.dataObjects.length === 0 ? (
						<p className="text-xs text-gray-400 italic mb-2">No data objects recorded.</p>
					) : (
						<div className="mb-3">
							<p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
								Data Objects ({bucket.dataObjects.length})
							</p>
							<ul className="space-y-0.5">
								{bucket.dataObjects.map((obj) => (
									<li key={obj} className="flex items-start gap-1.5 text-xs text-amber-700">
										<span className="shrink-0 mt-0.5">•</span>
										<span>{obj}</span>
									</li>
								))}
							</ul>
						</div>
					)}
				</>
			)}
		</div>
	);
}

// ── Component ─────────────────────────────────────────────────────────────────

export const EdgeDetailSidebar = ({
	edge,
	sourceLabel,
	targetLabel,
	onClose,
}: EdgeDetailSidebarProps) => {
	return (
		<aside className="w-72 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 shrink-0">
				<button
					type="button"
					onClick={onClose}
					className="flex items-center justify-center rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
					aria-label="Close"
				>
					<X className="h-4 w-4" />
				</button>
				<div className="h-4 w-px bg-gray-200" />
				<div className="flex-1 min-w-0">
					<h2 className="text-sm font-semibold text-gray-900">Connection Details</h2>
					<p
						className="text-[11px] text-gray-500 truncate"
						title={`${sourceLabel} ↔ ${targetLabel}`}
					>
						{sourceLabel} ↔ {targetLabel}
					</p>
				</div>
			</div>

			{/* Body */}
			<div className="flex-1 overflow-y-auto">
				{edge.forward ? (
					<>
						<DirectionSection
							bucket={edge.forward}
							fromLabel={sourceLabel}
							toLabel={targetLabel}
						/>
						{edge.reverse && (
							<DirectionSection
								bucket={edge.reverse}
								fromLabel={targetLabel}
								toLabel={sourceLabel}
							/>
						)}
					</>
				) : (
					// Legacy edge path — no DirectionBuckets
					<div className="px-4 py-3">
						{edge.dataObjects && edge.dataObjects.length > 0 ? (
							<div>
								<p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
									Data Objects ({edge.dataObjects.length})
								</p>
								<ul className="space-y-0.5">
									{edge.dataObjects.map((obj) => (
										<li key={obj} className="flex items-start gap-1.5 text-xs text-amber-700">
											<span className="shrink-0 mt-0.5">•</span>
											<span>{obj}</span>
										</li>
									))}
								</ul>
							</div>
						) : (
							<p className="text-xs text-gray-400 italic">No data object details available.</p>
						)}
					</div>
				)}
			</div>
		</aside>
	);
};
