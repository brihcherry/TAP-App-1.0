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
import prerna.sablecc2.om.ReactorKeysEnum;
import prerna.sablecc2.om.nounmeta.NounMetadata;
import reactors.AbstractProjectReactor;
import util.QueryExecutor;

/**
 * Returns the full tripartite system network from the TAP_Core_Data RDF database:
 * System nodes, Interface nodes, and DataObject nodes, connected by their actual
 * RDF relations (Provide, Consume, Contains/Data).
 *
 * <p>This allows the frontend to render and color each node type distinctly and
 * run graph analysis (loops, islands, connection tracing) on the full data flow graph.
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

  private static final String DATABASE_KEY = ReactorKeysEnum.DATABASE.getKey();

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String BASE =
      "http://semoss.org/ontologies";

  public GetSystemNetworkReactor() {
    this.keysToGet = new String[] { DATABASE_KEY };
    this.keyRequired = new int[] { 1 };
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = this.keyValue.get(DATABASE_KEY);
    LOGGER.info("GetSystemNetwork: engine=" + engineId);

    QueryExecutor executor = new QueryExecutor(engineId);

    // Ordered node map: uri → {label, type} — insertion order preserved, deduplicates URIs
    Map<String, String[]> nodeMap = new LinkedHashMap<>();
    List<Map<String, String>> edgeList = new ArrayList<>();
    Set<String> edgeSeen = new HashSet<>();

    // ── Query 1: System --[Provide]--> Interface ──────────────────────────────
    String provideQuery =
        "SELECT DISTINCT ?System ?Interface WHERE {"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
        + "{?Interface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface>}"
        + "{?System <" + BASE + "/Relation/Provide> ?Interface}"
        + "} ORDER BY ?System";

    for (Map<String, String> row : executor.executeSelect(provideQuery)) {
      String sys = row.get("System");
      String ifc = row.get("Interface");
      if (sys == null || ifc == null) continue;

      nodeMap.putIfAbsent(sys, new String[] { extractLabel(sys), "System" });
      nodeMap.putIfAbsent(ifc, new String[] { extractLabel(ifc), "Interface" });

      addEdge(edgeList, edgeSeen, sys, ifc, "provide");
    }

    // ── Query 2: Interface --[Consume]--> System ──────────────────────────────
    String consumeQuery =
        "SELECT DISTINCT ?Interface ?System WHERE {"
        + "{?Interface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface>}"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
        + "{?Interface <" + BASE + "/Relation/Consume> ?System}"
        + "} ORDER BY ?Interface";

    for (Map<String, String> row : executor.executeSelect(consumeQuery)) {
      String ifc = row.get("Interface");
      String sys = row.get("System");
      if (ifc == null || sys == null) continue;

      nodeMap.putIfAbsent(ifc, new String[] { extractLabel(ifc), "Interface" });
      nodeMap.putIfAbsent(sys, new String[] { extractLabel(sys), "System" });

      addEdge(edgeList, edgeSeen, ifc, sys, "consume");
    }

    // ── Query 3: Interface --[Contains/Data]--> DataObject ────────────────────
    String dataQuery =
        "SELECT DISTINCT ?Interface ?Data WHERE {"
        + "{?Interface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface>}"
        + "{?Interface <" + BASE + "/Relation/Contains/Data> ?Data}"
        + "} ORDER BY ?Interface";

    for (Map<String, String> row : executor.executeSelect(dataQuery)) {
      String ifc = row.get("Interface");
      String data = row.get("Data");
      if (ifc == null || data == null) continue;

      // Only include data objects that are connected to known interfaces
      if (!nodeMap.containsKey(ifc)) continue;

      nodeMap.putIfAbsent(data, new String[] { extractLabel(data), "DataObject" });
      addEdge(edgeList, edgeSeen, ifc, data, "carries");
    }

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
    return "Returns the full tripartite system network (Systems, Interfaces, DataObjects) "
        + "with all Provide, Consume, and Contains/Data edges. Used by the System Network Map.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (DATABASE_KEY.equals(key)) {
      return "The UUID of the RDF database engine to query.";
    }
    return null;
  }
}

