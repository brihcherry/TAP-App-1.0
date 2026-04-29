// CapabilityGroupSidebar.tsx — Diagnostic sidebar shown when a capability
// group bubble is zoomed into on the System Inspection page.

import type { CapabilityGroup } from "@/types/system";

interface CapabilityGroupSidebarProps {
	group: CapabilityGroup;
	onClose: () => void;
}

export const CapabilityGroupSidebar = ({
	group,
	onClose,
}: CapabilityGroupSidebarProps) => {
	return (
		<aside className="w-72 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
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
				<h2 className="text-sm font-semibold text-gray-900 truncate flex-1" title={group.label}>
					{group.label}
				</h2>
			</div>

			{/* ── Body ────────────────────────────────────────────────────── */}
			<div className="flex-1 overflow-y-auto p-4 space-y-5">
				{/* Overview card */}
				<div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
					<p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">Overview</p>
					<div className="flex items-baseline gap-1">
						<span className="text-2xl font-bold text-gray-900">{group.systems.length}</span>
						<span className="text-sm text-gray-500">
							{group.systems.length === 1 ? "system" : "systems"}
						</span>
					</div>
				</div>

				{/* Diagnostic info placeholder */}
				<div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3">
					<p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">Diagnostics</p>
					<p className="text-xs text-gray-400 italic">
						Diagnostic data will appear here.
					</p>
				</div>

				{/* Systems list */}
				<div>
					<p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">Systems</p>
					<ul className="space-y-1.5">
						{group.systems.map((sys) => (
							<li
								key={sys.uri}
								className="flex items-center gap-2 rounded-md border border-gray-100 bg-white px-3 py-2 text-sm text-gray-700"
							>
								<span className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
								<span className="truncate" title={sys.label}>{sys.label}</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</aside>
	);
};
