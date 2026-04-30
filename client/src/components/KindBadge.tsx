// KindBadge.tsx — Colored abbreviation badge for BP / Activity / DataObject items.
// Used in CapabilityGroupSidebar and anywhere else that renders concept item lists.

import type { ItemKind } from "@/lib/groupOverlap";

export const KIND_STYLES: Record<ItemKind, { className: string; label: string }> = {
	BP: { className: "bg-blue-100 text-blue-700", label: "BP" },
	Activity: { className: "bg-purple-100 text-purple-700", label: "Act" },
	DataObject: { className: "bg-teal-100 text-teal-700", label: "Data" },
};

export const KindBadge = ({ kind }: { kind: ItemKind }) => (
	<span
		className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-bold leading-none uppercase ${KIND_STYLES[kind].className}`}
	>
		{KIND_STYLES[kind].label}
	</span>
);
