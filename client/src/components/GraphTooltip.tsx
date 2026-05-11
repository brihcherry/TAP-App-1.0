// GraphTooltip.tsx — Floating tooltip that follows the cursor when hovering
// over a node or edge in the network graph.
//
// Edge tooltip layout (when edge.forward is present — System Network Map path):
//   ┌─────────────────────────────────────┐
//   │ Connection: System A ↔ System B     │
//   ├─────────────────────────────────────┤
//   │ ▸ System A → System B               │
//   │   • DataObject 1                    │
//   │   • DataObject 2   (+N more)        │
//   │   (only data objects shown)         │
//   ├─────────────────────────────────────┤
//   │ ▸ System B → System A               │
//   │   No data flow   (if one-way)       │
//   └─────────────────────────────────────┘
//
// Truncation: show at most MAX_DATA_OBJECTS data objects per direction section,
// with "+N more" indicators.

import type { TooltipData, DirectionBucket } from "@/types/graph";

interface GraphTooltipProps {
	tooltip: TooltipData | null;
}

const MAX_DATA_OBJECTS = 4;

/** Renders one direction lane (either forward or reverse). */
function DirectionSection({
	bucket,
	fromLabel,
	toLabel,
}: {
	bucket: DirectionBucket;
	fromLabel: string;
	toLabel: string;
}) {
	const visibleDOs   = bucket.dataObjects.slice(0, MAX_DATA_OBJECTS);
	const hiddenDOs    = bucket.dataObjects.length - visibleDOs.length;

	return (
		<div className="mt-2 pt-2 border-t border-gray-700">
			{/* Direction label */}
			<div
				className={`text-[10px] font-semibold uppercase tracking-wide ${
					bucket.hasFlow ? "text-blue-300" : "text-gray-500"
				}`}
			>
				{fromLabel} → {toLabel}
			</div>

			{!bucket.hasFlow ? (
				<div className="text-gray-500 text-[10px] italic mt-1">No data flow</div>
			) : (
				<>
					{/* Data objects */}
					{bucket.dataObjects.length === 0 ? (
						<div className="text-gray-500 text-[10px] italic mt-1">
							No data objects recorded
						</div>
					) : (
						<div className="mt-1">
							<div className="text-gray-400 text-[10px] uppercase tracking-wide">
								Data Objects
							</div>
							{visibleDOs.map((obj) => (
								<div key={obj} className="text-yellow-300 ml-1 truncate max-w-[200px]">
									• {obj}
								</div>
							))}
							{hiddenDOs > 0 && (
								<div className="text-gray-400 ml-1 text-[10px]">
									+{hiddenDOs} more
								</div>
							)}
						</div>
					)}

				</>
			)}
		</div>
	);
}

export const GraphTooltip = ({ tooltip }: GraphTooltipProps) => {
	if (!tooltip) return null;

	return (
		<div
			className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded-md px-3 py-2 shadow-xl leading-relaxed max-w-xs"
			style={{ left: tooltip.x, top: tooltip.y }}
		>
			{/* ── Node tooltip ──────────────────────────────────────────── */}
			{tooltip.type === "node" && tooltip.node && (
				<>
					<div className="font-semibold text-sm">{tooltip.node.label}</div>
					<div className="text-gray-400 text-[10px] uppercase tracking-wide mt-0.5">
						{tooltip.node.type}
					</div>
					{tooltip.node.fullName && (
						<div className="text-gray-300 mt-1">{tooltip.node.fullName}</div>
					)}
					{tooltip.node.description && (
						<div className="text-gray-400 mt-1 italic">{tooltip.node.description}</div>
					)}
					{tooltip.node.connectionCount > 0 && (
						<div className="text-blue-300 mt-1 font-mono">
							Connections: {tooltip.node.connectionCount}
						</div>
					)}
				</>
			)}

			{/* ── Edge tooltip ──────────────────────────────────────────── */}
			{tooltip.type === "edge" && tooltip.edge && (
				<>
					{tooltip.edge.forward ? (
						// ── New canonical connection-edge path (System Network Map) ──
						<>
							<div className="font-semibold text-sm text-gray-200">Connection</div>
							<div className="text-gray-400 text-[10px] mt-0.5">
								{tooltip.sourceLabel} ↔ {tooltip.targetLabel}
							</div>

							<DirectionSection
								bucket={tooltip.edge.forward}
								fromLabel={tooltip.sourceLabel ?? ""}
								toLabel={tooltip.targetLabel ?? ""}
							/>

							{tooltip.edge.reverse && (
								<DirectionSection
									bucket={tooltip.edge.reverse}
									fromLabel={tooltip.targetLabel ?? ""}
									toLabel={tooltip.sourceLabel ?? ""}
								/>
							)}
						</>
					) : (
						// ── Legacy path (DataObject graph, NetworkPage) ─────────────
						<>
							<div className="font-semibold">{tooltip.sourceLabel}</div>
							<div className="text-gray-300">→ {tooltip.targetLabel}</div>
							<div className="text-gray-400 text-[10px] uppercase tracking-wide mt-1">
								{tooltip.edge.edgeType}
							</div>
							{tooltip.edge.dataObjects && tooltip.edge.dataObjects.length > 0 ? (
								<div className="mt-1">
									<div className="text-gray-400 text-[10px] uppercase tracking-wide">
										Data Objects
									</div>
									{tooltip.edge.dataObjects.map((obj, i) => (
										<div key={i} className="text-yellow-300 ml-1">• {obj}</div>
									))}
								</div>
							) : (
								<div className="mt-1">
									<span className="text-gray-400">Data:</span>{" "}
									<span className="text-yellow-300">{tooltip.edge.data || "N/A"}</span>
								</div>
							)}
							<div>
								<span className="text-gray-400">Format:</span>{" "}
								{tooltip.edge.format || "N/A"}
							</div>
							<div>
								<span className="text-gray-400">Protocol:</span>{" "}
								{tooltip.edge.protocol || "N/A"}
							</div>
							<div>
								<span className="text-gray-400">Frequency:</span>{" "}
								{tooltip.edge.frequency || "N/A"}
							</div>
							<div className="text-gray-400 mt-1 italic text-[10px]">
								{tooltip.edge.interfaceName || "N/A"}
							</div>

							{/* Reverse section for legacy merge path */}
							{tooltip.edge.reverse?.hasFlow && (
								<DirectionSection
									bucket={tooltip.edge.reverse}
									fromLabel={tooltip.targetLabel ?? ""}
									toLabel={tooltip.sourceLabel ?? ""}
								/>
							)}
						</>
					)}
				</>
			)}
		</div>
	);
};
