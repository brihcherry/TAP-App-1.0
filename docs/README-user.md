# TAP App V1 — User Guide

This application analyzes your enterprise systems and answers three core questions: **"Which systems have overlapping capabilities?"** **"How are my systems connected through data flows?"** and **"What would happen if I removed a system?"** Select a system or capability group to explore networks of connected systems, analyze redundancy and overlap, and simulate the impact of removing a system from your data flows.

---

## Getting Started

When the application loads, you will see a top navigation bar and the **Capability Group Overview** page. All data is fetched live from the SEMOSS backend.

### Navigation Bar

| Link | Page |
|---|---|
| **Capability Group Overview** | System grouping and overlap analysis (default) |
| **System Network Map** | Data flow connections between systems |
| **Removal Impact** | Simulate system removal and analyze data flow impact |

---

## Capability Group Overview Page

This is the primary landing page. It lets you explore which systems in your enterprise have overlapping capabilities and which ones are unique.

### View Mode Controls (Top Right)

Toggle between two data organization modes:

| Mode | Shows | Purpose |
|---|---|---|
| **Capability Group** | Systems grouped by capability area (default) | See business-aligned groupings |
| **Capability** | Systems grouped by individual capability | Drill deeper into specific capabilities |

The bubble graph automatically updates to show the data in your selected mode.

---

### The Bubble Graph

The center of the page displays an interactive **circle-packing visualization** where:
- **Large circles** represent capability groups (or individual capabilities)
- **Smaller circles inside** represent individual systems
- **Each group has a distinct color** for easy identification

You can:
- **Zoom in** — Click any large group circle to expand it and fill the canvas
- **See system names** — Hover over a system circle to see a tooltip with its name
- **Zoom back out** — Click the background (while zoomed in) to return to the full view
- **Inspect a system** — Click any system circle to open the System Inspection Panel

An instruction overlay appears near the top center, reminding you that you can zoom into groups and inspect systems.

---

### System Inspection Panel (Right Panel)

Opens when you click a system circle. Shows all known attributes of that system across **7 tabs**:

| Tab | What You'll See |
|---|---|
| **Data Subject Areas** | Data this system provides or consumes |
| **Interfaces** | Data transfer connections (marked as Outgoing or Incoming) |
| **Business Processes** | Business processes this system supports |
| **Activities** | Activities the system performs |
| **User Types** | Personnel or user categories assigned to this system |
| **Environment** | Where the system is deployed (Theater, Garrison, Both, etc.) |
| **Transactional** | Whether the system processes transactions |

Each tab is labeled with the number of items it contains. Click any **Business Process** or **Activity** entry to see which other systems in your enterprise support the same business process or activity.

At the top of the panel are three metadata fields:
- **Description** — What this system does
- **Disposition** — Its current status or planned changes
- **Owner** — The organization or group responsible for it

Click the **✕ Close** button to dismiss the panel and return to the bubble graph.

---

### Capability Group Sidebar (Right Panel, When Zoomed In)

When you zoom into a capability group, a sidebar appears on the right showing **system redundancy analysis**:

#### Stats Bar

At the top, you'll see quick counts:
- Number of systems in this group
- Number of business processes (BPs)
- Number of activities
- Number of data subject areas

#### Per-System Overlap Cards

Below the stats is a list of systems in this group, **ranked by their Overlap Score** — the percentage of their business processes, activities, and data subject areas that are also supported by another system in the group.

| Item | Meaning |
|---|---|
| **Overlap Score** | 0–100%. Higher = more redundant with peers. A score of 100% means every item this system covers is also covered by at least one other system in the group. |
| **Unique Contributions** | (amber label) — Capabilities only this system provides within the group |
| **Shared Items** | (blue label) — Capabilities also provided by other systems in the group |

The sidebar has a **colored progress bar** below each system name:
- **Red (0–33%)** — Low overlap; this system is relatively unique
- **Amber (33–66%)** — Moderate overlap; some shared capabilities
- **Green (66–100%)** — High overlap; mostly redundant with peers

Each system card has two blue buttons at the bottom:
- **View System Network Graph** — Navigate to the System Network Map page with this system pre-selected
- **View Removal Impact** — Navigate to the Removal Impact page with this system pre-selected

Click the arrow (▶) next to a system name to expand and see its unique and shared items. Click the arrow again (▼) to collapse.

You can **drag the left edge** of the sidebar to make it wider or narrower. Click **✕** to close the sidebar and zoom back out.

---

## System Network Map Page

This page shows how your systems exchange data with each other through data flows and interfaces.

### Getting There

The page can be reached three ways:

1. **Direct navigation** — Click "System Network Map" in the main nav. Starts in a searchable list of all systems.
2. **From the Capability Group view** — Click "View System Network Graph" on a system in the capability bubble chart or sidebar. The page auto-selects that system and shows a back arrow to return to the capability view.
3. **From the Removal Impact page** — Use navigation options to jump here with a pre-selected system.

---

### List View (Default)

When you first open this page, you see a searchable directory of all systems, **sorted by number of connections** (most connected first).

| Column | Shows |
|---|---|
| **System Name** | Name of the system |
| **Connection Count** | Number of other systems it exchanges data with |

Use the **search box** to filter systems by name. Click any row to enter the graph view for that system.

---

### Graph View

Clicking a system from the list displays a **D3 force-directed graph**:

- **Orange node** (center) — The selected system (the focal point)
- **Blue nodes** — Other systems connected to the focal system
- **Curved arrows** — Data flows between systems (indicating direction)

You can:
- **Zoom in/out** with your mouse scroll wheel
- **Pan** by clicking and dragging the background
- **Move individual nodes** by clicking and dragging them
- **Hover over a node or edge** to see a detailed tooltip
- **Click an edge** to see what data flows in each direction

#### Left Sidebar Controls

| Control | What It Does |
|---|---|
| **Back to List** button | Return to the system list view |
| **Degree slider** | Expand the graph outward (1 = direct neighbors only; 2+ = include neighbors of neighbors, etc.) |
| **Expand button** | Increase degree by one level |
| **Lock** button | Freeze all nodes in place (useful when examining a settled layout) |
| **Unlock** button | Resume automatic node movement (default) |
| **Node / Edge counts** | Shows current graph size |

Changing the degree automatically resets the graph lock to **Unlock**.

#### Data Object Filter (Top-Left Corner)

A dropdown shows all **data objects** (types of data) flowing through the current graph. Select one to:
- **Highlight** all connections carrying that data object
- **Dim** all other connections and nodes

The dropdown shows a count of how many connections carry each data object. Click **Reset Graph** to clear the filter.

---

### Edge Detail Sidebar (Right Panel)

When you click an edge (connection), a sidebar appears showing **which data flows in each direction**:

| Section | Shows |
|---|---|
| **Forward direction** | Data flowing from the source system → target system (or "No data flow") |
| **Reverse direction** | Data flowing from the target system → source system (or "No data flow") |

Each direction lists:
- The **data objects** carried in that direction
- **Per-interface breakdown** — which interface(s) carry which data objects

Click the same edge again or click **Close** to dismiss the sidebar. Changing the degree, selecting a data object filter, or selecting a different system also closes the sidebar.

---

## Removal Impact Page

This page answers the question: **"If I remove this system, what breaks?"** It is a **simulation tool** — no actual changes are made. It models the hypothetical removal and traces consequences through your recorded data interfaces.

### Getting There

Click **Removal Impact** in the main navigation, or use the "View Removal Impact" button from the Capability Group sidebar.

---

### System Selection View (Initial Load)

When you first open the page, you see a searchable list of all **active systems** in your enterprise. Each system card displays three **impact badges**:

| Badge | Label | Meaning |
|---|---|---|
| **SP** (red) | Sole Provider Count | Number of data objects for which this system is the *only* source |
| **CR** (amber) | Critical Relay Count | Number of data objects for which this system is an essential bridge; removing it would isolate at least one other system |
| **NP** (gray) | Non-Critical Provider Count | Number of data objects this system participates in without being critical |

Systems are ranked by highest **Sole Provider** count first, then **Critical Relay**, then **Non-Critical Provider**. Use the **search bar** to filter systems by name. Click any system to run the removal analysis.

**Note:** The badges are calculated automatically in the background after the page loads. All systems are selectable immediately; higher-ranked systems appear first once calculations complete.

---

### Analysis View

After clicking a system, the page displays a detailed **removal impact report** in three main sections:

#### Summary Banner (Top)

Shows aggregate impact counts:
- Number of data objects this system is a Sole Provider for
- Number of data objects it acts as a Critical Relay for
- Number of data objects it participates in non-critically
- **Total unique systems that would be isolated** if this system were removed

#### Sole Provider — All Downstream Loses Access *(Red Border Section)*

Each card represents a **data object** for which the selected system is the **only originating source**. If this system is removed, no alternative provider exists.

Each card shows:
- The data object name and the system's role (**Provider** or **Relay**)
- The list of **isolated systems** — systems that would lose all access to this data object
- How many **total systems** participate in this data object's flow network

**Impact**: Removing this system would break data access for all downstream systems with no existing fallback.

#### Critical Relay — Removal Isolates Systems *(Amber Border Section)*

Each card represents a data object where **alternative providers exist**, but the selected system is an **essential bridge** in the network. Removing it cuts the graph and isolates one or more downstream systems from all remaining providers. Alternative provider names are shown when available.

Each card shows:
- The data object name and the system's role
- The list of **isolated systems**
- **Alternative providers** (other systems that could provide this data if the network were repaired)
- How many **total systems** participate in this data object's flow network

**Impact**: Removing this system would temporarily isolate other systems, though alternatives exist if network paths are restored.

#### Non-Critical Participation *(Gray Section, Collapsed by Default)*

Data objects where the selected system participates but **its removal would not isolate any other system** — either because no other systems depend on its data for this object, or because alternative paths and providers exist.

Click the section header to expand and see all non-critical participations.

---

### In-Page Term Guide

A **"What These Terms Mean"** button near the top toggles a reference card explaining key concepts:

| Term | Definition |
|---|---|
| **Provider** | The removed system is a source/originator for that data object |
| **Relay** | The removed system acts as a bridge, passing data between other systems |
| **Sole Provider** | No other provider remains for that data object after removal |
| **Critical Relay** | Other providers may exist, but removing this system isolates one or more systems |
| **Non-Critical** | Removal does not isolate any other system for that data object |
| **Isolated Systems** | Systems that can no longer reach a data source through remaining providers |
| **Alternative Providers** | Other systems that originate the same data object |
| **Systems in Flow Graph** | Total systems involved in that data object's directed network |

---

### Navigation Between Pages

From any page, you can navigate to the others using the **top navigation bar**. When you navigate from a sub-page (System Network Map or Removal Impact) back to the Capability Group Overview, your previous zoom state and selected group are automatically restored so you don't lose your place.

---

## Understanding the Data

### What Is a Capability Group?

A **Capability Group** is a collection of systems organized around a common business capability or mission area (e.g., "Medical Records," "Supply Chain," "Financial Management"). Each system can support one or more capabilities. Capability Groups help you understand which systems are responsible for similar functions.

### What Is an Interface?

An **Interface** (or **ICD — Interface Control Document**) is a formalized data connection between two systems. One system acts as a **provider** (sender) and another acts as a **consumer** (receiver). Interfaces carry **data objects** (types of data) between systems.

### What Is a Data Object (Data Subject Area)?

A **Data Object** or **Data Subject Area** is a category or type of data (e.g., "Patient Demographics," "Vital Signs," "Medication Records"). Data objects flow through interfaces from provider systems to consumer systems.

### What Is an Overlap Score?

The **Overlap Score** (shown as a percentage in the Capability Group sidebar) measures how much a system's capabilities are redundant with other systems in the same group:

- **0%** — All of this system's capabilities are unique; no other system in the group has them
- **50%** — Half of this system's capabilities are also supported by at least one other system in the group
- **100%** — Every capability this system supports is also supported by at least one other system in the group

### What Is a Sole Provider?

A system is a **Sole Provider** for a data object if it is the **only system** that originates (creates or modifies) that data object. If a Sole Provider is removed and no backup or mirror system exists, all downstream consumers of that data object lose access.

### What Is a Critical Relay?

A system is a **Critical Relay** for a data object if removing it would **isolate at least one other system** from all remaining providers of that data object — even if alternative providers exist elsewhere in the network. The system acts as an essential bridge or "bottleneck" in the data flow path.

### What Is a Non-Critical Provider?

A system is a **Non-Critical Provider** for a data object if its removal would **not** isolate any other system — either because no other systems depend on it for that data, or because alternative paths exist through other providers or relays.

---

## Common Workflows

### Workflow 1 — Understand Redundancy in a Capability Area

1. Open the **Capability Group Overview** page
2. Click a capability group bubble to zoom in
3. Look at the **Capability Group Sidebar** on the right
4. Examine the **Overlap Scores** of systems in this group
5. Click a system name and look at its **Unique Contributions** to see what only it does
6. Use the **View Removal Impact** button to simulate what would break if that system were removed

### Workflow 2 — Analyze Data Flow Connections

1. Navigate to **System Network Map**
2. Click a system from the list to open its graph view
3. Examine the **blue nodes** (connected systems) and **arrows** (data flows)
4. Use the **Degree slider** to expand outward and see secondary and tertiary connections
5. Select a **Data Object** from the filter dropdown to highlight specific data flows
6. Click an **edge** (arrow) to see detailed flow information in the right sidebar

### Workflow 3 — Assess Risk of System Removal

1. Navigate to **Removal Impact**
2. Search for or click a system of concern
3. Review the **Summary Banner** to see the scope of impact
4. Read the **Sole Provider** section (red) — these are the highest-risk data objects
5. Read the **Critical Relay** section (amber) — these require attention but have fallbacks
6. Optionally check the **Non-Critical Participation** section to see safe areas

---

## System Inspection Details

When you open the **System Inspection Panel** (by clicking a system), you see tabs with detailed attributes:

- **Data Subject Areas** — All data this system participates in (provides or consumes). Shown as cards.
- **Interfaces** — All data connections, separated into **Outgoing** (this system sends) and **Incoming** (this system receives). Each interface shows which systems it connects to and what data objects flow.
- **Business Processes** — Business activities this system supports. Click any entry to see which other systems also support it.
- **Activities** — Operational activities the system performs. Click any entry to see which other systems also support it.
- **User Types** — Categories of personnel using this system (e.g., "Administrator," "Clinician," "End User").
- **Environment** — Where this system runs (Theater, Garrison, Both, etc.).
- **Transactional** — Whether this system processes individual transactions (yes/no).

Each tab shows a count of items. Browse tabs by clicking the tab name.
