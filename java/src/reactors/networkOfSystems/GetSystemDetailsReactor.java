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

  private static final String SYSTEM_KEY = "system";

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String RDFS_SUBPROP =
      "http://www.w3.org/2000/01/rdf-schema#subPropertyOf";
  private static final String BASE =
      "http://semoss.org/ontologies";

  public GetSystemDetailsReactor() {
    this.keysToGet = new String[] { SYSTEM_KEY };
    this.keyRequired = new int[] { 1 };
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = ProjectProperties.getInstance().getDatabaseId();
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
    result.put("description", fetchScalar(executor, systemUri,
        BASE + "/Relation/Contains/Description", "Description"));
    result.put("disposition", fetchScalar(executor, systemUri,
        BASE + "/Relation/Contains/Disposition", "Disposition"));
    result.put("owner", fetchOwner(executor, systemUri));

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
   * Filters match GetDataFlowImpactReactor: interface must not be retired,
   * must carry a DataObject payload, connected system must be an ActiveSystem,
   * and self-connections are excluded.
   * Runs two queries to distinguish outgoing (provider) from incoming (consumer).
   */
  private List<Map<String, Object>> fetchInterfaces(QueryExecutor executor, String sysUri) {
    // Outbound: this system → Provide → interface → Consume → target ActiveSystem
    String outQuery =
        "SELECT DISTINCT ?Interface ?connectedSystem ?dataObject WHERE {"
        + " ?Interface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface> ."
        + " <" + sysUri + "> <" + BASE + "/Relation/Provide> ?Interface ."
        + " FILTER NOT EXISTS { ?Interface <" + BASE + "/Relation/Phase> <http://health.mil/ontologies/Concept/LifeCycle/Retired_(Not_Supported)> }"
        + " ?Interface <" + BASE + "/Relation/Consume> ?connectedSystem ."
        + " ?connectedSystem <" + RDF_TYPE + "> <" + BASE + "/Concept/ActiveSystem> ."
        + " FILTER(?connectedSystem != <" + sysUri + ">)"
        + " ?Interface <" + BASE + "/Relation/Payload> ?dataObject ."
        + " ?dataObject <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject> ."
        + "}";

    // Inbound: source ActiveSystem → Provide → interface → Consume → this system
    String inQuery =
        "SELECT DISTINCT ?Interface ?connectedSystem ?dataObject WHERE {"
        + " ?Interface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface> ."
        + " ?connectedSystem <" + BASE + "/Relation/Provide> ?Interface ."
        + " ?Interface <" + BASE + "/Relation/Consume> <" + sysUri + "> ."
        + " FILTER NOT EXISTS { ?Interface <" + BASE + "/Relation/Phase> <http://health.mil/ontologies/Concept/LifeCycle/Retired_(Not_Supported)> }"
        + " ?connectedSystem <" + RDF_TYPE + "> <" + BASE + "/Concept/ActiveSystem> ."
        + " FILTER(?connectedSystem != <" + sysUri + ">)"
        + " ?Interface <" + BASE + "/Relation/Payload> ?dataObject ."
        + " ?dataObject <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject> ."
        + "}";

    List<Map<String, Object>> interfaces = new ArrayList<>();
    interfaces.addAll(groupInterfaceRows(executor.executeSelect(outQuery), "provider"));
    interfaces.addAll(groupInterfaceRows(executor.executeSelect(inQuery), "consumer"));
    return interfaces;
  }

  /**
   * Groups flat interface query rows (Interface, connectedSystem, dataObject) into
   * enriched interface entries keyed by Interface URI + connected system URI,
   * deduplicating data objects within each entry.
   * An interface that fans out to multiple connected systems produces separate entries.
   */
  private List<Map<String, Object>> groupInterfaceRows(
      List<Map<String, String>> rows, String role) {
    // Key: "interfaceUri::connectedSystemUri" → enriched entry
    Map<String, Map<String, Object>> grouped = new LinkedHashMap<>();
    for (Map<String, String> row : rows) {
      String ifcUri = row.get("Interface");
      String connSysUri = row.get("connectedSystem");
      String doUri = row.get("dataObject");
      if (ifcUri == null || connSysUri == null || doUri == null) continue;

      String groupKey = ifcUri + "::" + connSysUri;
      Map<String, Object> entry = grouped.computeIfAbsent(groupKey, k -> {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("uri", ifcUri);
        e.put("label", extractLabel(ifcUri));
        e.put("role", role);
        e.put("connectedSystem", extractLabel(connSysUri));
        e.put("connectedSystemUri", connSysUri);
        e.put("dataObjects", new ArrayList<Map<String, String>>());
        return e;
      });

      @SuppressWarnings("unchecked")
      List<Map<String, String>> dataObjects = (List<Map<String, String>>) entry.get("dataObjects");
      boolean alreadyPresent = dataObjects.stream().anyMatch(d -> doUri.equals(d.get("uri")));
      if (!alreadyPresent) {
        Map<String, String> doEntry = new HashMap<>();
        doEntry.put("uri", doUri);
        doEntry.put("label", extractLabel(doUri));
        dataObjects.add(doEntry);
      }
    }
    List<Map<String, Object>> result = new ArrayList<>(grouped.values());
    result.sort((a, b) -> ((String) a.get("connectedSystem")).compareTo((String) b.get("connectedSystem")));
    return result;
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
      return val != null ? formatLiteralText(val) : "";
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

  /**
   * Formats RDF literal text for display by removing wrapping quotes,
   * replacing underscores with spaces, and collapsing repeated whitespace.
   */
  private static String formatLiteralText(String value) {
    if (value == null) return "";
    String formatted = value.trim();
    if (formatted.length() >= 2 && formatted.startsWith("\"") && formatted.endsWith("\"")) {
      formatted = formatted.substring(1, formatted.length() - 1);
    }
    formatted = formatted.replace('_', ' ');
    return formatted.replaceAll("\\s+", " ").trim();
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

  /**
   * Fetches the system owner via the OwnedBy relation to SystemOwner concept.
   */
  private String fetchOwner(QueryExecutor executor, String sysUri) {
    String query = "SELECT DISTINCT ?Owner WHERE {"
        + "{<" + sysUri + "> <" + BASE + "/Relation/OwnedBy> ?Owner}"
        + "{?Owner <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemOwner>}"
        + "}";
    List<Map<String, String>> rows = executor.executeSelect(query);
    if (!rows.isEmpty()) {
      String ownerUri = rows.get(0).get("Owner");
      if (ownerUri != null) return extractLabel(ownerUri);
    }
    return "";
  }

  // ── MCP metadata ─────────────────────────────────────────────────────────

  @Override
  public String getReactorDescription() {
    return "Retrieves all attribute details for a single system: data objects, interfaces, "
        + "environment, transactional status, business processes, activities, and user types.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (SYSTEM_KEY.equals(key)) {
      return "The full URI of the system to inspect, e.g. "
          + "http://health.mil/ontologies/Concept/System/AHLTA";
    }
    return null;
  }
}
