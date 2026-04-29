package reactors.networkOfSystems;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import prerna.sablecc2.om.PixelDataType;
import prerna.sablecc2.om.nounmeta.NounMetadata;
import reactors.AbstractProjectReactor;
import util.QueryExecutor;

/**
 * Returns all capability groups from the TAP_Core_Data RDF database, each with the
 * list of systems that support them.
 *
 * <p>Used to populate the zoomable bubble chart on the System Inspection page, where
 * each bubble cluster represents a capability group and each inner bubble is a system.
 *
 * <p>Pixel call:
 * <pre>
 *   GetCapabilityGroups(database=["133db94b-4371-4763-bff9-edf7e5ed021b"]);
 * </pre>
 *
 * <p>Output:
 * <pre>
 *   {
 *     "capabilityGroups": [
 *       {
 *         "uri": "http://semoss.org/ontologies/Concept/CapabilityGroup/Personnel_Services",
 *         "label": "Personnel Services",
 *         "systems": [
 *           {"uri": "http://health.mil/ontologies/Concept/System/AHLTA", "label": "AHLTA"},
 *           ...
 *         ]
 *       },
 *       ...
 *     ]
 *   }
 * </pre>
 */
public class GetCapabilityGroupsReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(GetCapabilityGroupsReactor.class);

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String BASE =
      "http://semoss.org/ontologies";

  public GetCapabilityGroupsReactor() {
    this.keysToGet = new String[] {};
    this.keyRequired = new int[] {};
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = ProjectProperties.getInstance().getDatabaseId();
    LOGGER.info("GetCapabilityGroups: engine=" + engineId);

    QueryExecutor executor = new QueryExecutor(engineId);

    // Fetch all (CapabilityGroup, System) pairs where the system supports the group.
    // Each triple pattern is wrapped in its own {} group to match the SPARQL conventions
    // used by the other working queries on this engine.
    String query =
        "SELECT DISTINCT ?CapabilityGroup ?System WHERE {"
        + "{?CapabilityGroup <" + RDF_TYPE + "> <" + BASE + "/Concept/CapabilityGroup>}"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
        + "{?System <" + BASE + "/Relation/Supports> ?CapabilityGroup}"
        + "} ORDER BY ?CapabilityGroup ?System";

    List<Map<String, String>> rows = executor.executeSelect(query);

    // Group systems under their capability group URI; LinkedHashMap preserves ORDER BY order.
    Map<String, Map<String, Object>> groupMap = new LinkedHashMap<>();
    for (Map<String, String> row : rows) {
      String cgUri = row.get("CapabilityGroup");
      String sysUri = row.get("System");
      if (cgUri == null || sysUri == null) continue;

      groupMap.computeIfAbsent(cgUri, uri -> {
        Map<String, Object> group = new HashMap<>();
        group.put("uri", uri);
        group.put("label", extractLabel(uri));
        group.put("systems", new ArrayList<Map<String, String>>());
        return group;
      });

      @SuppressWarnings("unchecked")
      List<Map<String, String>> systems =
          (List<Map<String, String>>) groupMap.get(cgUri).get("systems");
      Map<String, String> sysEntry = new HashMap<>();
      sysEntry.put("uri", sysUri);
      sysEntry.put("label", extractLabel(sysUri));
      systems.add(sysEntry);
    }

    List<Map<String, Object>> capabilityGroups = new ArrayList<>(groupMap.values());

    Map<String, Object> result = new HashMap<>();
    result.put("capabilityGroups", capabilityGroups);

    LOGGER.info("GetCapabilityGroups: found " + capabilityGroups.size() + " groups");
    return new NounMetadata(result, PixelDataType.MAP);
  }

  private static String extractLabel(String uri) {
    if (uri == null) return "";
    String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
    return label.replace('_', ' ');
  }

  @Override
  public String getReactorDescription() {
    return "Returns all capability groups from the RDF database, each with the systems that "
        + "support them. Used to populate the bubble chart on the System Inspection page.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    return null;
  }
}
