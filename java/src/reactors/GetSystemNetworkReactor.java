package reactors.networkOfSystems;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import prerna.sablecc2.om.PixelDataType;
import prerna.sablecc2.om.nounmeta.NounMetadata;
import reactors.AbstractProjectReactor;
import util.ProjectProperties;
import util.QueryExecutor;

/**
 * Returns the data-flow-only tripartite system network from the TAP_Core_Data
 * RDF database: System nodes, Interface nodes, and DataObject nodes.
 *
 * <p>Only interfaces that carry at least one DataObject (via the Payload relation)
 * are included. Systems connected solely through data-less interfaces are excluded.
 * This ensures the graph represents actual data flow between systems.
 *
 * <p>Relations used:
 * <ul>
 *   <li>System --[Provide]--> SystemInterface (from System_SystemInterface_Provide sheet)</li>
 *   <li>SystemInterface --[Consume]--> System (from SystemInterface_System_Consume sheet)</li>
 *   <li>SystemInterface --[Payload]--> DataObject (data object column on those sheets)</li>
 * </ul>
 *
 * <p>Pixel call:
 * <pre>
 *   GetSystemNetwork(database=["133db94b-4371-4763-bff9-edf7e5ed021b"]);
 * </pre>
 *
 * <p>Output:
 * <pre>
 *   {
 *     "nodes": [
 *       {"uri": "...", "label": "AHLTA", "type": "System"},
 *       {"uri": "...", "label": "IFC X", "type": "Interface"},
 *       {"uri": "...", "label": "Admissions", "type": "DataObject"}
 *     ],
 *     "edges": [
 *       {"id": "srcUri||tgtUri", "sourceUri": "...", "targetUri": "...", "edgeType": "provide"},
 *       {"id": "...", "sourceUri": "...", "targetUri": "...", "edgeType": "consume"},
 *       {"id": "...", "sourceUri": "...", "targetUri": "...", "edgeType": "carries"}
 *     ]
 *   }
 * </pre>
 */
public class GetSystemNetworkReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(GetSystemNetworkReactor.class);

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String BASE =
      "http://semoss.org/ontologies";

  public GetSystemNetworkReactor() {
    this.keysToGet = new String[] {};
    this.keyRequired = new int[] {};
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = ProjectProperties.getInstance().getDatabaseId();
    LOGGER.info("GetSystemNetwork: engine=" + engineId);

    QueryExecutor executor = new QueryExecutor(engineId);

    // Ordered node map: uri → {label, type} — insertion order preserved, deduplicates URIs
    Map<String, String[]> nodeMap = new LinkedHashMap<>();
    List<Map<String, String>> edgeList = new ArrayList<>();
    Set<String> edgeSeen = new HashSet<>();

    // ── Query 1: System --[Provide]--> Interface (data-carrying only) ─────────
    // Only include interfaces that have at least one Payload→DataObject triple.
    // This filters out interface-only connections with no recorded data flow.
    String provideQuery =
        "SELECT DISTINCT ?System ?Interface WHERE {"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/ActiveSystem>}"
        + "{?Interface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface>}"
        + "{?System <" + BASE + "/Relation/Provide> ?Interface}"
        + "{?Interface <" + BASE + "/Relation/Payload> ?anyData}"
        + "{?System <" + BASE + "/Relation/Supports> ?anyCapGroup}"
        + "} ORDER BY ?System";

    for (Map<String, String> row : executor.executeSelect(provideQuery)) {
      String sys = row.get("System");
      String ifc = row.get("Interface");
      if (sys == null || ifc == null) continue;

      nodeMap.putIfAbsent(sys, new String[] { extractLabel(sys), "System" });
      nodeMap.putIfAbsent(ifc, new String[] { extractLabel(ifc), "Interface" });

      addEdge(edgeList, edgeSeen, sys, ifc, "provide");
    }
    LOGGER.info("GetSystemNetwork: Query 1 (Provide w/ Payload filter) returned "
        + nodeMap.size() + " nodes so far");

    // ── Query 2: Interface --[Consume]--> System (data-carrying only) ─────────
    // Same Payload filter — only interfaces that carry data objects.
    String consumeQuery =
        "SELECT DISTINCT ?Interface ?System WHERE {"
        + "{?Interface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface>}"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/ActiveSystem>}"
        + "{?Interface <" + BASE + "/Relation/Consume> ?System}"
        + "{?Interface <" + BASE + "/Relation/Payload> ?anyData}"
        + "{?System <" + BASE + "/Relation/Supports> ?anyCapGroup}"
        + "} ORDER BY ?Interface";

    for (Map<String, String> row : executor.executeSelect(consumeQuery)) {
      String ifc = row.get("Interface");
      String sys = row.get("System");
      if (ifc == null || sys == null) continue;

      nodeMap.putIfAbsent(ifc, new String[] { extractLabel(ifc), "Interface" });
      nodeMap.putIfAbsent(sys, new String[] { extractLabel(sys), "System" });

      addEdge(edgeList, edgeSeen, ifc, sys, "consume");
    }
    LOGGER.info("GetSystemNetwork: Query 2 (Consume w/ Payload filter) returned "
        + edgeList.size() + " edges so far");

    // ── Query 3: Interface --[Payload]--> DataObject ──────────────────────────
    // Uses the Payload relation (per OWL: SystemInterface --[Payload]--> DataObject)
    // instead of the old Contains/Data which was a Task property.
    String dataQuery =
        "SELECT DISTINCT ?Interface ?DataObj WHERE {"
        + "{?Interface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface>}"
        + "{?Interface <" + BASE + "/Relation/Payload> ?DataObj}"
        + "} ORDER BY ?Interface";

    for (Map<String, String> row : executor.executeSelect(dataQuery)) {
      String ifc = row.get("Interface");
      String data = row.get("DataObj");
      if (ifc == null || data == null) continue;

      // Only include data objects connected to interfaces that passed the
      // Provide/Consume filter (i.e., they appeared in Query 1 or 2).
      if (!nodeMap.containsKey(ifc)) continue;

      nodeMap.putIfAbsent(data, new String[] { extractLabel(data), "DataObject" });
      addEdge(edgeList, edgeSeen, ifc, data, "carries");
    }
    LOGGER.info("GetSystemNetwork: Query 3 (Payload) — total edges now: " + edgeList.size());

    // ── Build output ──────────────────────────────────────────────────────────
    List<Map<String, String>> nodes = new ArrayList<>();
    for (Map.Entry<String, String[]> entry : nodeMap.entrySet()) {
      Map<String, String> node = new HashMap<>();
      node.put("uri", entry.getKey());
      node.put("label", entry.getValue()[0]);
      node.put("type", entry.getValue()[1]);
      nodes.add(node);
    }

    Map<String, Object> result = new HashMap<>();
    result.put("nodes", nodes);
    result.put("edges", edgeList);

    LOGGER.info("GetSystemNetwork: " + nodes.size() + " nodes, " + edgeList.size() + " edges");
    return new NounMetadata(result, PixelDataType.MAP);
  }

  private static void addEdge(
      List<Map<String, String>> edgeList,
      Set<String> edgeSeen,
      String sourceUri,
      String targetUri,
      String edgeType) {
    String id = sourceUri + "||" + targetUri;
    if (edgeSeen.add(id)) {
      Map<String, String> edge = new HashMap<>();
      edge.put("id", id);
      edge.put("sourceUri", sourceUri);
      edge.put("targetUri", targetUri);
      edge.put("edgeType", edgeType);
      edgeList.add(edge);
    }
  }

  private static String extractLabel(String uri) {
    if (uri == null) return "";
    String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
    return label.replace('_', ' ');
  }

  @Override
  public String getReactorDescription() {
    return "Returns the data-flow-only system network (Systems, Interfaces, DataObjects) "
        + "filtered to interfaces with Payload data. Used by the System Network Map.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    return null;
  }
}

