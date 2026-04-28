package reactors.networkOfSystems;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import prerna.sablecc2.om.PixelDataType;
import prerna.sablecc2.om.ReactorKeysEnum;
import prerna.sablecc2.om.nounmeta.NounMetadata;
import reactors.AbstractProjectReactor;
import util.QueryExecutor;

/**
 * Returns all CapabilityGroups and the Systems that support each one.
 *
 * <p>Uses the {@code System_CapabilityGroup_Supports} relationship in the TAP ontology:
 * {@code System --Supports--> CapabilityGroup}.
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
 *         "uri": "http://health.mil/.../CapabilityGroup/Patient_Administration",
 *         "label": "Patient Administration",
 *         "systems": [
 *           {"uri": "http://health.mil/.../System/AHLTA", "label": "AHLTA"},
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

  private static final String DATABASE_KEY = ReactorKeysEnum.DATABASE.getKey();

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String BASE =
      "http://semoss.org/ontologies";

  public GetCapabilityGroupsReactor() {
    this.keysToGet = new String[] { DATABASE_KEY };
    this.keyRequired = new int[] { 1 };
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = this.keyValue.get(DATABASE_KEY);
    LOGGER.info("GetCapabilityGroups: engine=" + engineId);

    QueryExecutor executor = new QueryExecutor(engineId);

    // Query all System → Supports → CapabilityGroup pairs
    String query =
        "SELECT DISTINCT ?System ?CapabilityGroup WHERE {"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
        + "{?CapabilityGroup <" + RDF_TYPE + "> <" + BASE + "/Concept/CapabilityGroup>}"
        + "{?System <" + BASE + "/Relation/Supports> ?CapabilityGroup}"
        + "} ORDER BY ?CapabilityGroup ?System";

    List<Map<String, String>> rows = executor.executeSelect(query);

    // Group systems by capability group (preserve insertion order)
    Map<String, Map<String, Object>> groupMap = new LinkedHashMap<>();

    for (Map<String, String> row : rows) {
      String sysUri = row.get("System");
      String cgUri = row.get("CapabilityGroup");
      if (sysUri == null || cgUri == null) continue;

      Map<String, Object> group = groupMap.get(cgUri);
      if (group == null) {
        group = new HashMap<>();
        group.put("uri", cgUri);
        group.put("label", extractLabel(cgUri));
        group.put("systems", new ArrayList<Map<String, String>>());
        groupMap.put(cgUri, group);
      }

      @SuppressWarnings("unchecked")
      List<Map<String, String>> systems = (List<Map<String, String>>) group.get("systems");
      Map<String, String> sysEntry = new HashMap<>();
      sysEntry.put("uri", sysUri);
      sysEntry.put("label", extractLabel(sysUri));
      systems.add(sysEntry);
    }

    List<Map<String, Object>> capabilityGroups = new ArrayList<>(groupMap.values());

    Map<String, Object> result = new HashMap<>();
    result.put("capabilityGroups", capabilityGroups);

    LOGGER.info("GetCapabilityGroups: " + capabilityGroups.size() + " groups, "
        + rows.size() + " system-group pairs");
    return new NounMetadata(result, PixelDataType.MAP);
  }

  private static String extractLabel(String uri) {
    if (uri == null) return "";
    String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
    return label.replace('_', ' ');
  }

  @Override
  public String getReactorDescription() {
    return "Returns all CapabilityGroups with their associated Systems. "
        + "Uses the System_CapabilityGroup_Supports relationship.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (DATABASE_KEY.equals(key)) {
      return "The UUID of the RDF database engine to query.";
    }
    return null;
  }
}
