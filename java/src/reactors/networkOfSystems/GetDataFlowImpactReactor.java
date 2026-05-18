package reactors.networkOfSystems;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
 * Returns a system's authoritative data source status, data objects it creates or modifies,
 * and its first-order outbound interface connections (supported interfaces only).
 *
 * <p>Pixel call:
 * <pre>
 *   GetDataFlowImpact(
 *     database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
 *     system=["http://health.mil/ontologies/Concept/System/AHLTA"]
 *   );
 * </pre>
 */
public class GetDataFlowImpactReactor extends AbstractProjectReactor {

  private static final Logger LOGGER =
      LogManager.getLogger(GetDataFlowImpactReactor.class);

  private static final String DATABASE_KEY = ReactorKeysEnum.DATABASE.getKey();
  private static final String SYSTEM_KEY = "system";

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String RDFS_SUBPROP =
      "http://www.w3.org/2000/01/rdf-schema#subPropertyOf";
  private static final String BASE =
      "http://semoss.org/ontologies";
  private static final String LIFECYCLE_SUPPORTED =
      "http://health.mil/ontologies/Concept/LifeCycle/Supported";

  public GetDataFlowImpactReactor() {
    this.keysToGet = new String[] { DATABASE_KEY, SYSTEM_KEY };
    this.keyRequired = new int[] { 1, 1 };
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = this.keyValue.get(DATABASE_KEY);
    String systemUri = this.keyValue.get(SYSTEM_KEY);
    LOGGER.info("GetDataFlowImpact: engine={} system={}", engineId, systemUri);

    QueryExecutor executor = new QueryExecutor(engineId);

    // Q1: ADS status — check if system is an Authoritative Data Source
    List<Map<String, String>> adsRows = fetchAdsStatus(executor, systemUri);
    boolean isAds = !adsRows.isEmpty();
    Set<String> seenAreas = new HashSet<>();
    List<Map<String, String>> dataSubjectAreas = new ArrayList<>();
    for (Map<String, String> row : adsRows) {
      String areaUri = row.get("area");
      if (areaUri != null && seenAreas.add(areaUri)) {
        Map<String, String> areaEntry = new HashMap<>();
        areaEntry.put("uri", areaUri);
        areaEntry.put("label", extractLabel(areaUri));
        dataSubjectAreas.add(areaEntry);
      }
    }
    LOGGER.info("GetDataFlowImpact: isAds={} dataSubjectAreas={}", isAds, dataSubjectAreas.size());

    // Q2: Creator/Modifier data objects (CRM = C or M on Provide edge)
    List<Map<String, String>> crmDataObjects = fetchCrmDataObjects(executor, systemUri);
    LOGGER.info("GetDataFlowImpact: crmDataObjects={}", crmDataObjects.size());

    // Q3: First-order outbound connections (System → Provide → Interface → Consume → ActiveSystem)
    List<Map<String, Object>> outboundConnections = fetchOutboundConnections(executor, systemUri);
    LOGGER.info("GetDataFlowImpact: outboundConnections={}", outboundConnections.size());

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("systemUri", systemUri);
    result.put("systemName", extractLabel(systemUri));
    result.put("isAuthoritativeDataSource", isAds);
    result.put("dataSubjectAreas", dataSubjectAreas);
    result.put("crmDataObjects", crmDataObjects);
    result.put("outboundConnections", outboundConnections);

    return new NounMetadata(result, PixelDataType.MAP);
  }

  // ── Q1: ADS Status ────────────────────────────────────────────────────────
  // Uses UNION to cover ADS_Indicator stored on the Has edge predicate OR on the
  // Data_Subject_Area node directly.

  private List<Map<String, String>> fetchAdsStatus(QueryExecutor executor, String systemUri) {
    String query =
        "SELECT DISTINCT ?area WHERE {"
        + " ?has <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Has> ."
        + " <" + systemUri + "> ?has ?area ."
        + " ?area <" + RDF_TYPE + "> <" + BASE + "/Concept/Data_Subject_Area> ."
        + " {"
        + "   ?has <" + BASE + "/Relation/Contains/ADS_Indicator> ?adsIndicator ."
        + " } UNION {"
        + "   ?area <" + BASE + "/Relation/Contains/ADS_Indicator> ?adsIndicator ."
        + " }"
        + " FILTER(?adsIndicator = 'Yes')"
        + "}";

    return executor.executeSelect(query);
  }

  // ── Q2: Creator / Modifier DataObjects ───────────────────────────────────

  private List<Map<String, String>> fetchCrmDataObjects(QueryExecutor executor, String systemUri) {
    String query =
        "SELECT DISTINCT ?Data ?crm WHERE {"
        + " ?provide <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Provide> ."
        + " <" + systemUri + "> ?provide ?Data ."
        + " ?Data <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject> ."
        + " ?provide <" + BASE + "/Relation/Contains/CRM> ?crm ."
        + " FILTER(?crm = 'C' || ?crm = 'M')"
        + "}";

    List<Map<String, String>> rows = executor.executeSelect(query);
    List<Map<String, String>> result = new ArrayList<>();
    for (Map<String, String> row : rows) {
      String dataUri = row.get("Data");
      String crm = normalizeCrm(row.get("crm"));
      if (dataUri == null || crm == null) continue;

      Map<String, String> entry = new HashMap<>();
      entry.put("uri", dataUri);
      entry.put("label", extractLabel(dataUri));
      entry.put("crm", crm);
      result.add(entry);
    }
    result.sort((a, b) -> a.get("label").compareTo(b.get("label")));
    return result;
  }

  // ── Q3: Outbound Interface Connections ──────────────────────────────────────
  // <selectedSystem> → Provide → ?icd → Consume → ?targetSystem (ActiveSystem)
  // Conditions:
  //   - Interface must NOT have Phase = Retired_(Not_Supported)
  //   - Interface must carry a DataObject payload
  //   - Target system must be an ActiveSystem and not the selected system itself

  private List<Map<String, Object>> fetchOutboundConnections(QueryExecutor executor, String systemUri) {
    String query =
        "SELECT DISTINCT ?icd ?targetSystem ?dataObject WHERE {"
        + " ?icd <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface> ."
        + " <" + systemUri + "> <" + BASE + "/Relation/Provide> ?icd ."
        + " FILTER NOT EXISTS { ?icd <" + BASE + "/Relation/Phase> <http://health.mil/ontologies/Concept/LifeCycle/Retired_(Not_Supported)> }"
        + " ?icd <" + BASE + "/Relation/Consume> ?targetSystem ."
        + " ?targetSystem <" + RDF_TYPE + "> <" + BASE + "/Concept/ActiveSystem> ."
        + " FILTER(?targetSystem != <" + systemUri + ">)"
        + " ?icd <" + BASE + "/Relation/Payload> ?dataObject ."
        + " ?dataObject <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject> ."
        + "}";

    List<Map<String, String>> rows = executor.executeSelect(query);

    // Group by targetSystem → list of dataObjects (merged across interfaces)
    Map<String, Map<String, Object>> groupedMap = new LinkedHashMap<>();
    for (Map<String, String> row : rows) {
      String targetUri = row.get("targetSystem");
      String dataObjUri = row.get("dataObject");
      if (targetUri == null || dataObjUri == null) continue;

      Map<String, Object> group = groupedMap.computeIfAbsent(targetUri, k -> {
        Map<String, Object> g = new LinkedHashMap<>();
        g.put("targetSystemUri", targetUri);
        g.put("targetSystemLabel", extractLabel(targetUri));
        g.put("dataObjects", new ArrayList<Map<String, String>>());
        return g;
      });

      @SuppressWarnings("unchecked")
      List<Map<String, String>> dataObjects = (List<Map<String, String>>) group.get("dataObjects");
      // Deduplicate data objects within same target system
      boolean alreadyPresent = dataObjects.stream().anyMatch(d -> dataObjUri.equals(d.get("uri")));
      if (!alreadyPresent) {
        Map<String, String> doEntry = new HashMap<>();
        doEntry.put("uri", dataObjUri);
        doEntry.put("label", extractLabel(dataObjUri));
        dataObjects.add(doEntry);
      }
    }

    // Sort by target system label
    List<Map<String, Object>> result = new ArrayList<>(groupedMap.values());
    result.sort((a, b) -> ((String) a.get("targetSystemLabel")).compareTo((String) b.get("targetSystemLabel")));
    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static String extractLabel(String uri) {
    if (uri == null) return "";
    String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
    return label.replace('_', ' ');
  }

  private static String normalizeCrm(String rawCrm) {
    if (rawCrm == null) return null;
    String normalized = rawCrm.replaceAll("^['\"`]+|['\"`]+$", "").trim().toUpperCase();
    if (normalized.startsWith("C")) return "C";
    if (normalized.startsWith("M")) return "M";
    return null;
  }

  @Override
  public String getReactorDescription() {
    return "Returns ADS status, creator/modifier data objects, and first-order outbound interface connections for a system.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (DATABASE_KEY.equals(key)) {
      return "The UUID of the RDF database engine to query.";
    }
    if (SYSTEM_KEY.equals(key)) {
      return "The full URI of the system to analyze.";
    }
    return null;
  }
}
