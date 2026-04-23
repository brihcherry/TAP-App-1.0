// CapabilityBubbleGraph.tsx — D3 zoomable circle-packing visualization.
// Level 0: Capability groups as large bubbles containing system circles.
// Click a group bubble to zoom in. Click a system circle to select it.
// Click the background to zoom back out.

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import type { CapabilityGroup } from "@/types/system";

// ── Color palette ─────────────────────────────────────────────────────────────

const GROUP_COLORS = [
	"#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
	"#ef4444", "#ec4899", "#6366f1", "#14b8a6", "#f97316",
	"#84cc16", "#a855f7", "#0ea5e9", "#22c55e", "#eab308",
];

const PACK_SCALE = 0.84;
const ROOT_PADDING = 56;
const GROUP_PADDING = 26;
const SYSTEM_TITLE_OFFSET = 12;
const GROUP_TITLE_OFFSET = 0.92;

function getGroupColor(index: number): string {
	return GROUP_COLORS[index % GROUP_COLORS.length];
}

// ── Hierarchy data shape ──────────────────────────────────────────────────────

interface HierarchyDatum {
	name: string;
	uri?: string;
	type: "root" | "group" | "system";
	groupIndex?: number;
	children?: HierarchyDatum[];
	value?: number;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CapabilityBubbleGraphProps {
	capabilityGroups: CapabilityGroup[];
	onSystemClick: (systemUri: string, systemLabel: string) => void;
	selectedSystemUri?: string | null;
}

export const CapabilityBubbleGraph = ({
	capabilityGroups,
	onSystemClick,
	selectedSystemUri,
}: CapabilityBubbleGraphProps) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const selectedUriRef = useRef(selectedSystemUri);
	selectedUriRef.current = selectedSystemUri;

	// Track container dimensions so D3 re-renders on resize
	const [dims, setDims] = useState({ w: 0, h: 0 });

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const { width, height } = entries[0].contentRect;
			setDims((prev) => {
				const w = Math.round(width);
				const h = Math.round(height);
				if (prev.w === w && prev.h === h) return prev;
				return { w, h };
			});
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const buildHierarchy = useCallback((): HierarchyDatum => ({
		name: "Capability Groups",
		type: "root",
		children: capabilityGroups.map((cg, i) => ({
			name: cg.label,
			uri: cg.uri,
			type: "group" as const,
			groupIndex: i,
			children: cg.systems.map((sys) => ({
				name: sys.label,
				uri: sys.uri,
				type: "system" as const,
				groupIndex: i,
				value: 1,
			})),
		})),
	}), [capabilityGroups]);

	// ── Main D3 effect (layout + interaction) ─────────────────────────────────
	useEffect(() => {
		const svgEl = svgRef.current;
		if (!svgEl || capabilityGroups.length === 0) return;
		const { w: width, h: height } = dims;
		if (width < 10 || height < 10) return;

		const size = Math.min(width, height);
		const svg = d3.select(svgEl);
		svg.interrupt();
		svg.selectAll("*").remove();
		svg.attr("width", width).attr("height", height)
			.attr("viewBox", `${-width / 2} ${-height / 2} ${width} ${height}`)
			.style("cursor", "pointer");

		// ── Defs: shadow filter + radial gradients ───────────────────────────
		const defs = svg.append("defs");

		const shadowFilter = defs.append("filter")
			.attr("id", "bubble-shadow")
			.attr("x", "-25%").attr("y", "-25%")
			.attr("width", "150%").attr("height", "150%");
		shadowFilter.append("feDropShadow")
			.attr("dx", 0).attr("dy", 1.5)
			.attr("stdDeviation", 2.5)
			.attr("flood-color", "rgba(0,0,0,0.12)");

		// Float keyframes (CSS animation on circles positioned via cx/cy)
		svg.append("style").text(`
			@keyframes bubbleFloat {
				0%, 100% { transform: translateY(0); }
				50% { transform: translateY(-3.5px); }
			}
		`);

		// ── Hierarchy + pack ─────────────────────────────────────────────────
		const root = d3.hierarchy<HierarchyDatum>(buildHierarchy())
			.sum((d) => d.value ?? 0)
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

		const packSize = size * PACK_SCALE;
		const pack = d3.pack<HierarchyDatum>()
			.size([packSize, packSize])
			.padding((d) => {
				if (d.depth === 0) return ROOT_PADDING;
				if (d.depth === 1) return GROUP_PADDING;
				return 14;
			});

		const packedRoot = pack(root);
		const ox = -packSize / 2;
		const oy = -packSize / 2 + size * 0.03;

		let focus = packedRoot;
		let view: [number, number, number] = [focus.x, focus.y, focus.r * 2];
		const nodes = packedRoot.descendants();
		const groupNodes = nodes.filter((d) => d.depth === 1);

		// Radial gradient per group
		groupNodes.forEach((d, i) => {
			const c = getGroupColor(d.data.groupIndex ?? 0);
			const grad = defs.append("radialGradient")
				.attr("id", `grd-${i}`).attr("cx", "40%").attr("cy", "30%");
			grad.append("stop").attr("offset", "0%")
				.attr("stop-color", d3.color(c)!.copy({ opacity: 0.18 }).formatRgb());
			grad.append("stop").attr("offset", "100%")
				.attr("stop-color", d3.color(c)!.copy({ opacity: 0.06 }).formatRgb());
		});

		const g = svg.append("g");

		function canSelectSystem(node: d3.HierarchyCircularNode<HierarchyDatum>) {
			return node.depth === 2 && focus.depth === 1 && node.parent === focus;
		}

		// ── Circles ──────────────────────────────────────────────────────────
		const circle = g.selectAll<SVGCircleElement, d3.HierarchyCircularNode<HierarchyDatum>>("circle")
			.data(nodes)
			.join("circle")
			.attr("fill", (d) => {
				if (d.depth === 0) return "transparent";
				if (d.depth === 1) {
					return `url(#grd-${groupNodes.indexOf(d)})`;
				}
				const c = getGroupColor(d.data.groupIndex ?? 0);
				const sel = d.data.uri === selectedUriRef.current;
				return d3.color(c)!.copy({ opacity: sel ? 1 : 0.75 }).formatRgb();
			})
			.attr("stroke", (d) => {
				if (d.depth === 0) return "none";
				if (d.depth === 1) {
					return d3.color(getGroupColor(d.data.groupIndex ?? 0))!
						.copy({ opacity: 0.35 }).formatRgb();
				}
				return "rgba(255,255,255,0.8)";
			})
			.attr("stroke-width", (d) => {
				if (d.depth === 2 && d.data.uri === selectedUriRef.current) return 3;
				return 1.5;
			})
			.attr("filter", (d) => d.depth === 2 ? "url(#bubble-shadow)" : "none")
			.attr("pointer-events", (d) => d.depth === 0 ? "none" : "all")
			.on("click", (event, d) => {
				event.stopPropagation();
				if (d.data.type === "system") {
					if (canSelectSystem(d)) {
						onSystemClick(d.data.uri!, d.data.name);
					}
				} else if (d.data.type === "group" && focus !== d) {
					zoomTo(d);
				}
			})
			.on("mouseenter", function (_, d) {
				if (d.depth === 1) {
					d3.select(this).transition("hover").duration(120)
						.attr("stroke-width", 2.5);
				} else if (canSelectSystem(d)) {
					d3.select(this).transition("hover").duration(120)
						.attr("stroke-width", 2.5)
						.attr("stroke", "#fff");
				}
			})
			.on("mouseleave", function (_, d) {
				if (d.depth === 1) {
					d3.select(this).transition("hover").duration(120)
						.attr("stroke-width", 1.5);
				} else if (d.depth === 2) {
					const sel = d.data.uri === selectedUriRef.current;
					d3.select(this).transition("hover").duration(120)
						.attr("stroke-width", sel ? 3 : 1.5)
						.attr("stroke", "rgba(255,255,255,0.8)");
				}
			});

		// Float animation — staggered per system circle
		circle.filter((d) => d.depth === 2).each(function (_, i) {
			const dur = (3 + (i % 7) * 0.5).toFixed(1);
			const delay = ((i * 0.37) % 3).toFixed(2);
			d3.select(this)
				.style("transform-box", "fill-box")
				.style("transform-origin", "center")
				.style("animation", `bubbleFloat ${dur}s ease-in-out ${delay}s infinite`);
		});

		// ── Group labels — positioned at TOP of group circle ─────────────────
		const groupLabel = g.selectAll<SVGTextElement, d3.HierarchyCircularNode<HierarchyDatum>>(".group-label")
			.data(groupNodes)
			.join("text")
			.attr("class", "group-label")
			.attr("text-anchor", "middle")
			.attr("dominant-baseline", "hanging")
			.attr("pointer-events", "none")
			.attr("fill", (d) => getGroupColor(d.data.groupIndex ?? 0))
			.attr("font-weight", "600")
			.attr("paint-order", "stroke")
			.attr("stroke", "rgba(255,255,255,0.9)")
			.attr("stroke-width", 4)
			.attr("stroke-linejoin", "round")
			.attr("letter-spacing", "0.02em")
			.text((d) => d.data.name);

		// Count badge — just below group label
		const countLabel = g.selectAll<SVGTextElement, d3.HierarchyCircularNode<HierarchyDatum>>(".count-label")
			.data(groupNodes)
			.join("text")
			.attr("class", "count-label")
			.attr("text-anchor", "middle")
			.attr("dominant-baseline", "hanging")
			.attr("pointer-events", "none")
			.attr("fill", (d) => d3.color(getGroupColor(d.data.groupIndex ?? 0))!.copy({ opacity: 0.5 }).formatRgb())
			.attr("font-weight", "400")
			.attr("paint-order", "stroke")
			.attr("stroke", "rgba(255,255,255,0.7)")
			.attr("stroke-width", 2)
			.attr("stroke-linejoin", "round")
			.text((d) => `${d.children?.length ?? 0} systems`);

		// System labels (depth 2) — above system circles
		const sysLabel = g.selectAll<SVGTextElement, d3.HierarchyCircularNode<HierarchyDatum>>(".sys-label")
			.data(nodes.filter((d) => d.depth === 2))
			.join("text")
			.attr("class", "sys-label")
			.attr("text-anchor", "middle")
			.attr("dominant-baseline", "auto")
			.attr("pointer-events", "none")
			.attr("fill", "#1f2937")
			.attr("font-weight", "500")
			.attr("paint-order", "stroke")
			.attr("stroke", "rgba(255,255,255,0.92)")
			.attr("stroke-width", 3)
			.attr("stroke-linejoin", "round")
			.text((d) => d.data.name);

		// Click background → zoom out
		svg.on("click", () => zoomTo(packedRoot));

		// ── Zoom helpers ─────────────────────────────────────────────────────
		function zoomView(v: [number, number, number]) {
			const k = size / v[2];
			view = v;

			// Position circles via cx/cy (leaves CSS transform free for float)
			circle
				.attr("cx", (d) => (d.x - v[0]) * k + ox + packSize / 2)
				.attr("cy", (d) => (d.y - v[1]) * k + oy + packSize / 2)
				.attr("r", (d) => d.r * k)
				.style("cursor", (d) => {
					if (d.depth === 1) {
						return focus === packedRoot ? "zoom-in" : "pointer";
					}
					return canSelectSystem(d) ? "pointer" : "default";
				});

			// Group labels at top of circle
			groupLabel
				.attr("x", (d) => (d.x - v[0]) * k + ox + packSize / 2)
				.attr("y", (d) => (d.y - v[1]) * k + oy + packSize / 2 - d.r * k * GROUP_TITLE_OFFSET)
				.attr("font-size", (d) => `${Math.max(Math.min(d.r * k / 4.8, 14), 9)}px`)
				.attr("opacity", () => focus === packedRoot ? 1 : 0)
				.attr("display", (d) => d.r * k > 26 ? null : "none");

			// Count label just below group label
			countLabel
				.attr("x", (d) => (d.x - v[0]) * k + ox + packSize / 2)
				.attr("y", (d) => {
					const cy = (d.y - v[1]) * k + oy + packSize / 2;
					const fs = Math.min(d.r * k / 4.6, 14);
					return cy - d.r * k * GROUP_TITLE_OFFSET + fs + 4;
				})
				.attr("font-size", (d) => `${Math.max(Math.min(d.r * k / 6, 10), 8)}px`)
				.attr("opacity", () => focus === packedRoot ? 1 : 0)
				.attr("display", (d) => d.r * k > 32 ? null : "none");

			// System labels
			sysLabel
				.attr("x", (d) => (d.x - v[0]) * k + ox + packSize / 2)
				.attr("y", (d) => (d.y - v[1]) * k + oy + packSize / 2 - d.r * k - SYSTEM_TITLE_OFFSET)
				.attr("font-size", (d) => `${Math.min(d.r * k / 3.2, 11)}px`)
				.attr("display", (d) => {
					if (focus.depth !== 1 || d.parent !== focus) return "none";
					return d.r * k > 14 ? null : "none";
				});
		}

		function zoomTo(target: d3.HierarchyCircularNode<HierarchyDatum>) {
			focus = target;
			const targetView: [number, number, number] = [target.x, target.y, target.r * 2];

			svg.transition()
				.duration(600)
				.tween("zoom", () => {
					const interp = d3.interpolateZoom(view, targetView);
					return (t: number) => zoomView(interp(t));
				});
		}

		// Initial render
		zoomView([packedRoot.x, packedRoot.y, packedRoot.r * 2]);

		return () => { svg.interrupt(); };
	}, [capabilityGroups, buildHierarchy, onSystemClick, dims]);

	// ── Selection highlighting (separate — avoids full D3 rebuild) ────────────
	useEffect(() => {
		const svgEl = svgRef.current;
		if (!svgEl) return;

		d3.select(svgEl)
			.selectAll<SVGCircleElement, d3.HierarchyCircularNode<HierarchyDatum>>("circle")
			.filter((d) => d.depth === 2)
			.transition("selection").duration(200)
			.attr("fill", (d) => {
				const c = getGroupColor(d.data.groupIndex ?? 0);
				const sel = d.data.uri === selectedSystemUri;
				return d3.color(c)!.copy({ opacity: sel ? 1 : 0.75 }).formatRgb();
			})
			.attr("stroke-width", (d) => d.data.uri === selectedSystemUri ? 3 : 1.5);
	}, [selectedSystemUri]);

	return (
		<div ref={containerRef} className="w-full h-full relative">
			<svg ref={svgRef} className="w-full h-full" />
		</div>
	);
};
