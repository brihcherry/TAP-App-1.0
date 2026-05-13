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
import util.ProjectProperties;
import util.QueryExecutor;

/**
 * Returns all capability groups (or capabilities) from the TAP_Core_Data RDF database,
 * each with the list of systems that support them.
 *
 * <p>Used to populate the zoomable bubble chart on the System Inspection page, where
 * each bubble cluster represents a capability group (or capability) and each inner
 * bubble is a system.
 *
 * <p>Pixel call:
 * <pre>
 *   GetCapabilityGroups();                          // defaults to capabilityGroup mode
 *   GetCapabilityGroups(mode=["capabilityGroup"]);  // explicit capabilityGroup mode
 *   GetCapabilityGroups(mode=["capability"]);       // capability mode
 * </pre>
 *
 * <p>Output:
 * <pre>
 *   {
 *     "mode": "capabilityGroup",
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
    this.keysToGet = new String[] {"mode"};
    this.keyRequired = new int[] {0};
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = ProjectProperties.getInstance().getDatabaseId();

    // Determine mode: "capabilityGroup" (default) or "capability"
    String mode = "capabilityGroup";
    String modeParam = this.keyValue.containsKey("mode")
        ? this.keyValue.get("mode").trim()
        : "";
    if ("capability".equalsIgnoreCase(modeParam)) {
      mode = "capability";
    }

    LOGGER.info("GetCapabilityGroups: engine=" + engineId + " mode=" + mode);

    QueryExecutor executor = new QueryExecutor(engineId);

    // Build the SPARQL query based on mode.
    // capabilityGroup: System Supports CapabilityGroup
    // capability: System Supports Capability
    String conceptType;
    String groupVar;
    if ("capability".equals(mode)) {
      conceptType = BASE + "/Concept/Capability";
      groupVar = "Capability";
    } else {
      conceptType = BASE + "/Concept/CapabilityGroup";
      groupVar = "CapabilityGroup";
    }

    String query =
        "SELECT DISTINCT ?" + groupVar + " ?System WHERE {"
        + "{?" + groupVar + " <" + RDF_TYPE + "> <" + conceptType + ">}"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/ActiveSystem>}"
        + "{?System <" + BASE + "/Relation/Supports> ?" + groupVar + "}"
        + "} ORDER BY ?" + groupVar + " ?System";

    List<Map<String, String>> rows = executor.executeSelect(query);

    // Group systems under their group URI; LinkedHashMap preserves ORDER BY order.
    Map<String, Map<String, Object>> groupMap = new LinkedHashMap<>();
    for (Map<String, String> row : rows) {
      String cgUri = row.get(groupVar);
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
    result.put("mode", mode);
    result.put("capabilityGroups", capabilityGroups);

    LOGGER.info("GetCapabilityGroups: found " + capabilityGroups.size() + " groups (mode=" + mode + ")");
    return new NounMetadata(result, PixelDataType.MAP);
  }

  private static String extractLabel(String uri) {
    if (uri == null) return "";
    String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
    return label.replace('_', ' ');
  }

  @Override
  public String getReactorDescription() {
    return "Returns all capability groups (or capabilities, depending on mode) from the RDF "
        + "database, each with the systems that support them. Used to populate the bubble chart "
        + "on the System Inspection page. Pass mode=[\"capability\"] to group by individual "
        + "capabilities instead of capability groups.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if ("mode".equals(key)) {
      return "Grouping mode: \"capabilityGroup\" (default) or \"capability\".";
    }
    return null;
  }
}
