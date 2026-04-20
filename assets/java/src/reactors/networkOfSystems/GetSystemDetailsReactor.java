package reactors.networkOfSystems;

import java.util.ArrayList;
import java.util.HashMap;
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
 * Retrieves all attribute details for a single system from the TAP_Core_Data RDF database.
 *
 * <p>Runs 7 queries covering:
 * <ol>
 *   <li>Data Objects the system provides</li>
 *   <li>Interfaces the system is connected to (outgoing and incoming)</li>
 *   <li>Deployment environment (Theater / Garrison / Both)</li>
 *   <li>Transactional status (Yes / No / Both)</li>
 *   <li>Business Processes the system supports</li>
 *   <li>Activities the system supports</li>
 *   <li>User Types (Personnel) assigned to the system</li>
 * </ol>
 *
 * <p>Pixel call:
 * <pre>
 *   GetSystemDetails(
 *     database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
 *     system=["http://health.mil/ontologies/Concept/System/AHLTA"]
 *   );
 * </pre>
 */
public class GetSystemDetailsReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(GetSystemDetailsReactor.class);

  private static final String DATABASE_KEY = ReactorKeysEnum.DATABASE.getKey();
  private static final String SYSTEM_KEY = "system";

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String RDFS_SUBPROP =
      "http://www.w3.org/2000/01/rdf-schema#subPropertyOf";
  private static final String BASE =
      "http://semoss.org/ontologies";

  public GetSystemDetailsReactor() {
    this.keysToGet = new String[] { DATABASE_KEY, SYSTEM_KEY };
    this.keyRequired = new int[] { 1, 1 };
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = this.keyValue.get(DATABASE_KEY);
    String systemUri = this.keyValue.get(SYSTEM_KEY);
    LOGGER.info("GetSystemDetails: engine=" + engineId + " system=" + systemUri);

    QueryExecutor executor = new QueryExecutor(engineId);

    Map<String, Object> result = new HashMap<>();
    result.put("systemUri", systemUri);
    result.put("systemName", extractLabel(systemUri));
    result.put("dataObjects", fetchDataObjects(executor, systemUri));
    result.put("interfaces", fetchInterfaces(executor, systemUri));
    result.put("environment", fetchScalar(executor, systemUri,
        BASE + "/Relation/Contains/GarrisonTheater", "Theater"));
    result.put("transactional", fetchScalar(executor, systemUri,
        BASE + "/Relation/Contains/Transactional", "Trans"));
    result.put("businessProcesses", fetchByType(executor, systemUri,
        BASE + "/Concept/BusinessProcess", BASE + "/Relation/Supports", "BusinessProcess"));
    result.put("activities", fetchByType(executor, systemUri,
        BASE + "/Concept/Activity", BASE + "/Relation/Supports", "Activity"));
    result.put("userTypes", fetchByType(executor, systemUri,
        BASE + "/Concept/Personnel", BASE + "/Relation/UsedBy", "Personnel"));

    return new NounMetadata(result, PixelDataType.MAP);
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  /**
   * Fetches DataObjects the system provides.
   * Uses the subproperty pattern (?Provide rdfs:subPropertyOf Provide) to capture
   * all specializations of the Provide relation, matching how the RDF graph is modeled.
   */
  private List<Map<String, String>> fetchDataObjects(QueryExecutor executor, String sysUri) {
    String query =
        "SELECT DISTINCT ?Data WHERE {"
        + "{?Data <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject>}"
        + "{?Provide <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Provide>}"
        + "{<" + sysUri + "> ?Provide ?Data}"
        + "}";
    return rowsToLabeledList(executor.executeSelect(query), "Data");
  }

  /**
   * Fetches SystemInterfaces the system is connected to, along with direction.
   * Uses a UNION to capture both outgoing (system Provides interface) and
   * incoming (interface Consumes system) relationships in a single query.
   */
  private List<Map<String, String>> fetchInterfaces(QueryExecutor executor, String sysUri) {
    // Single query with UNION to capture both directions, adding a ?Role literal
    // so we can distinguish provider vs consumer rows.
    String outQuery =
        "SELECT DISTINCT ?Interface WHERE {"
        + "{?Interface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface>}"
        + "{<" + sysUri + "> <" + BASE + "/Relation/Provide> ?Interface}"
        + "}";

    String inQuery =
        "SELECT DISTINCT ?Interface WHERE {"
        + "{?Interface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface>}"
        + "{?Interface <" + BASE + "/Relation/Consume> <" + sysUri + ">}"
        + "}";

    List<Map<String, String>> interfaces = new ArrayList<>();
    for (Map<String, String> row : executor.executeSelect(outQuery)) {
      String uri = row.get("Interface");
      if (uri != null) {
        interfaces.add(makeInterfaceEntry(uri, "provider"));
      }
    }
    for (Map<String, String> row : executor.executeSelect(inQuery)) {
      String uri = row.get("Interface");
      if (uri != null) {
        interfaces.add(makeInterfaceEntry(uri, "consumer"));
      }
    }
    return interfaces;
  }

  /**
   * Fetches a single scalar property value (e.g. environment, transactional status).
   * Returns an empty string if no value is found.
   */
  private String fetchScalar(QueryExecutor executor, String sysUri,
      String predicate, String varName) {
    String query =
        "SELECT DISTINCT ?" + varName + " WHERE {"
        + "{<" + sysUri + "> <" + predicate + "> ?" + varName + "}"
        + "}";
    List<Map<String, String>> rows = executor.executeSelect(query);
    if (!rows.isEmpty()) {
      String val = rows.get(0).get(varName);
      return val != null ? val : "";
    }
    return "";
  }

  /**
   * Fetches items of a given RDF type that the system relates to via a specific predicate.
   * Used for Business Processes, Activities, and User Types.
   */
  private List<Map<String, String>> fetchByType(QueryExecutor executor, String sysUri,
      String typeUri, String predicateUri, String varName) {
    String query =
        "SELECT DISTINCT ?" + varName + " WHERE {"
        + "{?" + varName + " <" + RDF_TYPE + "> <" + typeUri + ">}"
        + "{<" + sysUri + "> <" + predicateUri + "> ?" + varName + "}"
        + "}";
    return rowsToLabeledList(executor.executeSelect(query), varName);
  }

  // ── Utility helpers ───────────────────────────────────────────────────────

  private static String extractLabel(String uri) {
    if (uri == null) return "";
    String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
    return label.replace('_', ' ');
  }

  private static List<Map<String, String>> rowsToLabeledList(
      List<Map<String, String>> rows, String varName) {
    List<Map<String, String>> result = new ArrayList<>();
    for (Map<String, String> row : rows) {
      String uri = row.get(varName);
      if (uri != null) {
        Map<String, String> entry = new HashMap<>();
        entry.put("uri", uri);
        entry.put("label", extractLabel(uri));
        result.add(entry);
      }
    }
    return result;
  }

  private static Map<String, String> makeInterfaceEntry(String uri, String role) {
    Map<String, String> entry = new HashMap<>();
    entry.put("uri", uri);
    entry.put("label", extractLabel(uri));
    entry.put("role", role);
    return entry;
  }

  // ── MCP metadata ─────────────────────────────────────────────────────────

  @Override
  public String getReactorDescription() {
    return "Retrieves all attribute details for a single system: data objects, interfaces, "
        + "environment, transactional status, business processes, activities, and user types.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (DATABASE_KEY.equals(key)) {
      return "The UUID of the RDF database engine to query.";
    }
    if (SYSTEM_KEY.equals(key)) {
      return "The full URI of the system to inspect, e.g. "
          + "http://health.mil/ontologies/Concept/System/AHLTA";
    }
    return null;
  }
}
