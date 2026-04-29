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
 * Computes the data needed for a system removal impact analysis.
 *
 * <p>For a given system URI, returns:
 * <ol>
 *   <li>Every DataObject the system provides, along with ALL other systems that
 *       also provide that same DataObject (enterprise-wide provider map). A
 *       DataObject whose only provider is the target system is "orphaned" if
 *       the target is removed.</li>
 *   <li>Every CapabilityGroup the system supports, plus the total number of
 *       supporting systems per group. A group that drops to 0 supporters is a
 *       critical gap; a group that drops to 1 is a single-point dependency.</li>
 * </ol>
 *
 * <p>The frontend combines this with the tripartite graph from
 * {@code GetSystemNetworkReactor} to compute downstream system impacts,
 * which only require edge-walking (no additional SPARQL).
 *
 * <p>Pixel call:
 * <pre>
 *   GetSystemRemovalImpact(
 *     database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
 *     system=["http://health.mil/ontologies/Concept/System/AHLTA"]
 *   );
 * </pre>
 */
public class GetSystemRemovalImpactReactor extends AbstractProjectReactor {

  private static final Logger LOGGER =
      LogManager.getLogger(GetSystemRemovalImpactReactor.class);

  private static final String DATABASE_KEY = ReactorKeysEnum.DATABASE.getKey();
  private static final String SYSTEM_KEY = "system";

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String RDFS_SUBPROP =
      "http://www.w3.org/2000/01/rdf-schema#subPropertyOf";
  private static final String BASE =
      "http://semoss.org/ontologies";

  public GetSystemRemovalImpactReactor() {
    this.keysToGet = new String[] { DATABASE_KEY, SYSTEM_KEY };
    this.keyRequired = new int[] { 1, 1 };
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = this.keyValue.get(DATABASE_KEY);
    String systemUri = this.keyValue.get(SYSTEM_KEY);
    LOGGER.info("GetSystemRemovalImpact: engine={} system={}", engineId, systemUri);

    QueryExecutor executor = new QueryExecutor(engineId);

    Map<String, Object> result = new HashMap<>();
    result.put("systemUri", systemUri);
    result.put("systemName", extractLabel(systemUri));
    result.put("dataObjectProviders", fetchDataObjectProviders(executor, systemUri));
    result.put("capabilityGroupCoverage", fetchCapabilityGroupCoverage(executor, systemUri));

    return new NounMetadata(result, PixelDataType.MAP);
  }

  // ── Q1 + Q2: DataObjects provided by this system + all providers per DO ───

  /**
   * First finds every DataObject the target system provides, then for each one
   * queries all systems that also provide it. Returns a list where each entry
   * contains the DataObject URI/label and the full set of providers.
   */
  private List<Map<String, Object>> fetchDataObjectProviders(
      QueryExecutor executor, String systemUri) {

    // Q1: DataObjects this system provides
    String q1 =
        "SELECT DISTINCT ?Data WHERE {"
        + "{?Data <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject>}"
        + "{?Provide <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Provide>}"
        + "{<" + systemUri + "> ?Provide ?Data}"
        + "}";

    List<Map<String, String>> dataObjectRows = executor.executeSelect(q1);
    LOGGER.info("GetSystemRemovalImpact: Q1 found {} data objects for {}",
        dataObjectRows.size(), extractLabel(systemUri));

    // Q2: For ALL DataObjects from Q1, find every provider system enterprise-wide.
    // Single query with FILTER IN(...) for efficiency.
    if (dataObjectRows.isEmpty()) {
      return new ArrayList<>();
    }

    // Build a URI set for the filter clause
    StringBuilder filterValues = new StringBuilder();
    List<String> dataObjectUris = new ArrayList<>();
    for (Map<String, String> row : dataObjectRows) {
      String uri = row.get("Data");
      if (uri == null) continue;
      dataObjectUris.add(uri);
      if (filterValues.length() > 0) filterValues.append(", ");
      filterValues.append("<").append(uri).append(">");
    }

    String q2 =
        "SELECT DISTINCT ?Data ?System WHERE {"
        + "{?Data <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject>}"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
        + "{?Provide <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Provide>}"
        + "{?System ?Provide ?Data}"
        + " FILTER(?Data IN (" + filterValues + "))"
        + "} ORDER BY ?Data ?System";

    List<Map<String, String>> providerRows = executor.executeSelect(q2);
    LOGGER.info("GetSystemRemovalImpact: Q2 found {} provider rows", providerRows.size());

    // Group providers by DataObject URI
    Map<String, List<Map<String, String>>> providersByData = new LinkedHashMap<>();
    for (String doUri : dataObjectUris) {
      providersByData.put(doUri, new ArrayList<>());
    }
    for (Map<String, String> row : providerRows) {
      String dataUri = row.get("Data");
      String sysUri = row.get("System");
      if (dataUri == null || sysUri == null) continue;
      List<Map<String, String>> providers = providersByData.get(dataUri);
      if (providers != null) {
        Map<String, String> entry = new HashMap<>();
        entry.put("uri", sysUri);
        entry.put("label", extractLabel(sysUri));
        providers.add(entry);
      }
    }

    // Build result list
    List<Map<String, Object>> result = new ArrayList<>();
    for (String doUri : dataObjectUris) {
      Map<String, Object> entry = new HashMap<>();
      entry.put("uri", doUri);
      entry.put("label", extractLabel(doUri));
      entry.put("allProviders", providersByData.getOrDefault(doUri, new ArrayList<>()));
      result.add(entry);
    }

    return result;
  }

  // ── Q3: Capability groups the system supports + total supporters per group ─

  /**
   * Finds every CapabilityGroup the target system supports, then for each group
   * counts all supporting systems (including the target). This lets the frontend
   * compute how many supporters remain after simulated removal.
   */
  private List<Map<String, Object>> fetchCapabilityGroupCoverage(
      QueryExecutor executor, String systemUri) {

    // Q3a: Capability groups this system supports
    String q3a =
        "SELECT DISTINCT ?CG WHERE {"
        + "{?CG <" + RDF_TYPE + "> <" + BASE + "/Concept/CapabilityGroup>}"
        + "{<" + systemUri + "> <" + BASE + "/Relation/Supports> ?CG}"
        + "}";

    List<Map<String, String>> cgRows = executor.executeSelect(q3a);
    LOGGER.info("GetSystemRemovalImpact: Q3a found {} capability groups for {}",
        cgRows.size(), extractLabel(systemUri));

    if (cgRows.isEmpty()) {
      return new ArrayList<>();
    }

    // Build filter for capability groups
    StringBuilder filterValues = new StringBuilder();
    List<String> cgUris = new ArrayList<>();
    for (Map<String, String> row : cgRows) {
      String uri = row.get("CG");
      if (uri == null) continue;
      cgUris.add(uri);
      if (filterValues.length() > 0) filterValues.append(", ");
      filterValues.append("<").append(uri).append(">");
    }

    // Q3b: All systems supporting those capability groups
    String q3b =
        "SELECT DISTINCT ?CG ?System WHERE {"
        + "{?CG <" + RDF_TYPE + "> <" + BASE + "/Concept/CapabilityGroup>}"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
        + "{?System <" + BASE + "/Relation/Supports> ?CG}"
        + " FILTER(?CG IN (" + filterValues + "))"
        + "} ORDER BY ?CG ?System";

    List<Map<String, String>> supporterRows = executor.executeSelect(q3b);
    LOGGER.info("GetSystemRemovalImpact: Q3b found {} supporter rows", supporterRows.size());

    // Group by capability group URI
    Map<String, List<Map<String, String>>> systemsByCG = new LinkedHashMap<>();
    for (String cgUri : cgUris) {
      systemsByCG.put(cgUri, new ArrayList<>());
    }
    for (Map<String, String> row : supporterRows) {
      String cgUri = row.get("CG");
      String sysUri = row.get("System");
      if (cgUri == null || sysUri == null) continue;
      List<Map<String, String>> systems = systemsByCG.get(cgUri);
      if (systems != null) {
        Map<String, String> entry = new HashMap<>();
        entry.put("uri", sysUri);
        entry.put("label", extractLabel(sysUri));
        systems.add(entry);
      }
    }

    // Build result
    List<Map<String, Object>> result = new ArrayList<>();
    for (String cgUri : cgUris) {
      List<Map<String, String>> systems = systemsByCG.getOrDefault(cgUri, new ArrayList<>());
      Map<String, Object> entry = new HashMap<>();
      entry.put("uri", cgUri);
      entry.put("label", extractLabel(cgUri));
      entry.put("totalSupporters", systems.size());
      entry.put("systems", systems);
      result.add(entry);
    }

    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static String extractLabel(String uri) {
    if (uri == null) return "";
    String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
    return label.replace('_', ' ');
  }

  @Override
  public String getReactorDescription() {
    return "Computes data needed for system removal impact analysis: enterprise-wide "
        + "DataObject provider maps and CapabilityGroup coverage counts.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (DATABASE_KEY.equals(key)) {
      return "The UUID of the RDF database engine to query.";
    }
    if (SYSTEM_KEY.equals(key)) {
      return "The full URI of the system to analyze for removal impact.";
    }
    return null;
  }
}
