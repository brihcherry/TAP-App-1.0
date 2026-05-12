# Capability Group Overview Page

`client/src/pages/SystemInspectionPage.tsx` (rendered via `HomePage.tsx`)

The default landing page. Answers the question: *"For each capability group, which systems have the most overlap with other systems?"*

It shows all capability groups as an interactive bubble chart, lets users zoom into a group to analyze system redundancy, and allows clicking any system bubble to inspect its full attribute profile.

---

## Layout

Three layers that stack on top of each other as the user drills in:

1. **Bubble graph** (always present) — fills the available canvas
2. **Capability Group Sidebar** (right panel, slides in) — when a group bubble is zoomed into
3. **System Inspection Panel** (right panel, replaces or co-exists with sidebar) — when a system bubble is clicked

When a system is selected, the bubble graph shrinks to half-width to make room for the inspection panel.

---

## Data Sources

| Reactor | When Called | Purpose |
|---|---|---|
| `GetCapabilityGroups` | Once on mount | All capability groups and their member systems |
| `GetSystemDetails` | On system click | Full attribute profile of the selected system (7 data categories) |
| `GetSystemDetails` (×N) | When a group bubble is zoomed into | Details for every system in that group, for overlap analysis |
| `GetSystemsByConcept` | On concept click in the inspection panel | Other systems that share the same business process or activity |

---

## Bubble Graph (`CapabilityBubbleGraph`)

`client/src/components/CapabilityBubbleGraph.tsx`

A D3 zoomable circle-packing layout with two levels:

- **Level 0 (zoomed out)** — Each capability group is a large labeled circle. System circles are packed inside their group bubble. Groups are colored distinctly (15-color rotating palette).
- **Level 1 (zoomed in)** — Click a group bubble to zoom in on it. The selected group fills the canvas; individual system circles become large enough to interact with.

### Interactions

| Action | Result |
|---|---|
| Click a group bubble | Zoom into that group; opens the Capability Group Sidebar |
| Click the background (while zoomed in) | Zoom back out; closes the sidebar |
| Click a system circle | Selects the system; opens the System Inspection Panel |
| Hover a system circle | Shows a tooltip with the system name |

The graph re-renders on container resize (ResizeObserver). After a resize, the previously zoomed group is restored via the `focusedGroupUri` prop so the user's context is not lost.

---

## Capability Group Sidebar

`client/src/components/CapabilityGroupSidebar.tsx`

Opens on the right when a group bubble is zoomed into. Answers: *"Which systems in this group are most redundant with each other?"*

### What it shows

- **Stats bar** — count of systems, business processes, activities, and data objects across the whole group
- **Per-system overlap cards** — sorted descending by overlap score, one card per system

### Overlap Score

Computed by `computeOverlap()` in `client/src/lib/groupOverlap.ts`:

1. Fetch `GetSystemDetails` for every system in the group in parallel.
2. For each business process, activity, and data object, track which systems in the group cover it.
3. For each system system, partition its items into:
   - **Shared** — covered by ≥2 systems in the group
   - **Unique** — only this system covers it within the group
4. **Score** = `sharedItems.length / totalItems` (0–1). Higher score = more redundant with peers.

Systems are sorted descending by score. A score of 1.0 means every item this system covers is also covered by at least one other group member.

### Per-system card

Collapsed by default; click to expand. Shows:
- Overlap score
- **Shared items** (with colored kind badges: BP / Activity / Data Object)
- **Unique items** (same badge types)

### Navigation

Each system card has a "View Network" button that navigates to the [System Network Map](system-network-map.md) with `location.state = { systemUri, systemLabel, returnGroup }`. The `returnGroup` carries the current group so pressing Back returns here with the same group still zoomed in.


## System Inspection Panel

`client/src/components/SystemInspectionPanel.tsx`

Opens when a system circle is clicked anywhere on the bubble graph. Displays all known attributes of the selected system across 7 tabs:

| Tab | Contents |
|---|---|
| **Data Objects** | Data objects this system provides |
| **Interfaces** | Interfaces (with provider/consumer role) |
| **Business Processes** | Business processes the system supports |
| **Activities** | Activities the system supports |
| **User Types** | Personnel/user types assigned to this system |
| **Environment** | Deployment environment (e.g. Theater / Garrison / Both) |
| **Transactional** | Whether the system is transactional |


