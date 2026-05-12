package reactors.networkOfSystems;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import prerna.sablecc2.om.PixelDataType;
import prerna.sablecc2.om.ReactorKeysEnum;
import prerna.sablecc2.om.nounmeta.NounMetadata;
import reactors.AbstractProjectReactor;
import util.QueryExecutor;

/**
 * Computes data flow impact of removing a system from the enterprise.
 *
 * <p>For a given system URI, this reactor:
 * <ol>
 *   <li>Finds all DataObjects the system provides (via Provide relation)</li>
 *   <li>Finds all DataObjects the system consumes (via ICD Consume pattern)</li>
 *   <li>For each DataObject, builds the directed system-to-system flow graph
 *       using the ICD pattern (System→Interface→System where Interface carries DataObject)</li>
 *   <li>Simulates removal: removes the target system and its edges, then performs
 *       BFS from remaining CRM providers to identify isolated systems</li>
 * </ol>
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

    // Q1: DataObjects this system provides
    Set<String> providedDataObjects = fetchProvidedDataObjects(executor, systemUri);
    LOGGER.info("GetDataFlowImpact: system provides {} data objects", providedDataObjects.size());

    // Q2: DataObjects this system consumes (via ICD pattern)
    Set<String> consumedDataObjects = fetchConsumedDataObjects(executor, systemUri);
    LOGGER.info("GetDataFlowImpact: system consumes {} data objects", consumedDataObjects.size());

    // Q2.5: DataObjects this system provides via ICD (i.e., it provides an ICD interface that carries the DataObject)
    Set<String> providedViaInterfaceDataObjects = fetchProvidedViaInterfaceDataObjects(executor, systemUri);
    LOGGER.info("GetDataFlowImpact: system provides {} data objects via ICD interfaces", providedViaInterfaceDataObjects.size());

    // Merge interface-provided into direct provided
    providedDataObjects.addAll(providedViaInterfaceDataObjects);


    // Union of all DataObjects this system participates in
    Set<String> allDataObjects = new HashSet<>();
    allDataObjects.addAll(providedDataObjects);
    allDataObjects.addAll(consumedDataObjects);
    LOGGER.info("GetDataFlowImpact: total {} unique data objects", allDataObjects.size());

    if (allDataObjects.isEmpty()) {
      Map<String, Object> result = new HashMap<>();
      result.put("systemUri", systemUri);
      result.put("systemName", extractLabel(systemUri));
      result.put("dataFlowImpacts", new ArrayList<>());
      return new NounMetadata(result, PixelDataType.MAP);
    }

    // Q3: CRM providers per DataObject (systems that originate the data)
    Map<String, Set<String>> crmProviders = fetchCrmProviders(executor, allDataObjects);

    // Q4: Build ICD directed flow graph for all DataObjects (batched)
    // Returns: dataObjectUri -> list of directed edges {source, target}
    Map<String, List<String[]>> flowGraphs = fetchIcdFlowGraphs(executor, allDataObjects);

    // Q5: Isolation analysis — simulate removal
    List<Map<String, Object>> dataFlowImpacts =
        analyzeIsolation(systemUri, allDataObjects, providedDataObjects, consumedDataObjects,
            crmProviders, flowGraphs);

    Map<String, Object> result = new HashMap<>();
    result.put("systemUri", systemUri);
    result.put("systemName", extractLabel(systemUri));
    result.put("dataFlowImpacts", dataFlowImpacts);

    return new NounMetadata(result, PixelDataType.MAP);
  }

  // ── Q1: DataObjects this system provides ──────────────────────────────────

  private Set<String> fetchProvidedDataObjects(QueryExecutor executor, String systemUri) {
    String query =
        "SELECT DISTINCT ?Data WHERE {"
        + " {?Data <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject>}"
        + " {?Provide <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Provide>}"
        + " {<" + systemUri + "> ?Provide ?Data}"
        + "{?Provide <http://semoss.org/ontologies/Relation/Contains/CRM> ?crm}" 
        + " FILTER(?crm = 'C' || ?crm = 'M')"
        + "}";

    List<Map<String, String>> rows = executor.executeSelect(query);
    Set<String> result = new HashSet<>();
    for (Map<String, String> row : rows) {
      String uri = row.get("Data");
      if (uri != null) result.add(uri);
    }
    return result;
  }

  // ── Q2: DataObjects this system consumes (via ICD Consume pattern) ────────

  private Set<String> fetchConsumedDataObjects(QueryExecutor executor, String systemUri) {
    String query =
        "SELECT DISTINCT ?Data WHERE {"
        + " ?icd <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface> ."
        + " ?icd <" + BASE + "/Relation/Phase> <" + LIFECYCLE_SUPPORTED + "> ."
        + " ?downstream <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Consume> ."
        + " ?carries <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Payload> ."
        + " ?icd ?downstream <" + systemUri + "> ."
        + " ?icd ?carries ?Data ."
        + " ?Data <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject> ."
        + "}";

    List<Map<String, String>> rows = executor.executeSelect(query);
    Set<String> result = new HashSet<>();
    for (Map<String, String> row : rows) {
      String uri = row.get("Data");
      if (uri != null) result.add(uri);
    }
    return result;
  }

  // -- Q2.5 - DataObjects this system provides via ICD (i.e., it provides an ICD interface that carries the DataObject) -- 

private Set<String> fetchProvidedViaInterfaceDataObjects(QueryExecutor executor, String systemUri) {
    String query =
        "SELECT DISTINCT ?Data WHERE {"
        + " ?icd <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface> ."
        + " ?icd <" + BASE + "/Relation/Phase> <" + LIFECYCLE_SUPPORTED + "> ."
        + " ?upstream <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Provide> ."
        + " ?carries <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Payload> ."
        + " <" + systemUri + "> ?upstream ?icd ."
        + " ?icd ?carries ?Data ."
        + " ?Data <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject> ."
        + "}";

    List<Map<String, String>> rows = executor.executeSelect(query);
    Set<String> result = new HashSet<>();
    for (Map<String, String> row : rows) {
      String uri = row.get("Data");
      if (uri != null) result.add(uri);
    }
    return result;
}
  // ── Q3: CRM providers (data originators) per DataObject ───────────────────

  private Map<String, Set<String>> fetchCrmProviders(
      QueryExecutor executor, Set<String> dataObjectUris) {

    StringBuilder filterValues = new StringBuilder();
    for (String uri : dataObjectUris) {
      if (filterValues.length() > 0) filterValues.append(", ");
      filterValues.append("<").append(uri).append(">");
    }

    String query =
        "SELECT DISTINCT ?Data ?System WHERE {"
        + " ?System <" + RDF_TYPE + "> <" + BASE + "/Concept/ActiveSystem> ."
        + " ?provide <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Provide> ."
        + " ?System ?provide ?Data ."
        + " ?provide <" + BASE + "/Relation/Contains/CRM> ?crm ."
        + " FILTER(?crm = 'C' || ?crm = 'M')"
        + " FILTER(?Data IN (" + filterValues + "))"
        + "}";

    List<Map<String, String>> rows = executor.executeSelect(query);
    Map<String, Set<String>> result = new HashMap<>();
    for (String doUri : dataObjectUris) {
      result.put(doUri, new HashSet<>());
    }
    for (Map<String, String> row : rows) {
      String dataUri = row.get("Data");
      String sysUri = row.get("System");
      if (dataUri != null && sysUri != null) {
        Set<String> providers = result.get(dataUri);
        if (providers != null) {
          providers.add(sysUri);
        }
      }
    }
    return result;
  }

  // ── Q4: Build ICD directed flow graphs (batched) ──────────────────────────

  private Map<String, List<String[]>> fetchIcdFlowGraphs(
      QueryExecutor executor, Set<String> dataObjectUris) {

    StringBuilder filterValues = new StringBuilder();
    for (String uri : dataObjectUris) {
      if (filterValues.length() > 0) filterValues.append(", ");
      filterValues.append("<").append(uri).append(">");
    }

    // ICD pattern: System2 --Provide--> ICD --Consume--> System3
    // where ICD --Payload--> DataObject
    String query =
        "SELECT DISTINCT ?System2 ?System3 ?Data WHERE {"
        + " ?System2 <" + RDF_TYPE + "> <" + BASE + "/Concept/ActiveSystem> ."
        + " ?System3 <" + RDF_TYPE + "> <" + BASE + "/Concept/ActiveSystem> ."
        + " ?icd <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface> ."
        + " ?icd <" + BASE + "/Relation/Phase> <" + LIFECYCLE_SUPPORTED + "> ."
        + " ?upstream <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Provide> ."
        + " ?downstream <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Consume> ."
        + " ?carries <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Payload> ."
        + " ?System2 ?upstream ?icd ."
        + " ?icd ?downstream ?System3 ."
        + " ?icd ?carries ?Data ."
        + " FILTER(?Data IN (" + filterValues + "))"
        + "}";

    List<Map<String, String>> rows = executor.executeSelect(query);
    LOGGER.info("GetDataFlowImpact: ICD query returned {} rows", rows.size());

    Map<String, List<String[]>> result = new HashMap<>();
    for (String doUri : dataObjectUris) {
      result.put(doUri, new ArrayList<>());
    }
    for (Map<String, String> row : rows) {
      String sys2 = row.get("System2");
      String sys3 = row.get("System3");
      String data = row.get("Data");
      if (sys2 != null && sys3 != null && data != null) {
        List<String[]> edges = result.get(data);
        if (edges != null) {
          edges.add(new String[] { sys2, sys3 });
        }
      }
    }
    return result;
  }

  // ── Q5: Isolation analysis ────────────────────────────────────────────────

  private List<Map<String, Object>> analyzeIsolation(
      String systemUri,
      Set<String> allDataObjects,
      Set<String> providedDataObjects,
      Set<String> consumedDataObjects,
      Map<String, Set<String>> crmProviders,
      Map<String, List<String[]>> flowGraphs) {

    List<Map<String, Object>> impacts = new ArrayList<>();

    for (String doUri : allDataObjects) {
      List<String[]> edges = flowGraphs.getOrDefault(doUri, new ArrayList<>());
      Set<String> providers = crmProviders.getOrDefault(doUri, new HashSet<>());

      // Determine role
      String role;
      boolean isProvider = providedDataObjects.contains(doUri);
      boolean isConsumer = consumedDataObjects.contains(doUri);
      boolean isCrmProvider = providers.contains(systemUri);

      if (isCrmProvider) {
        role = "provider";
      } else if (isProvider && isConsumer) {
        role = "relay";
      } else if (isConsumer) {
        role = "consumer";
      } else {
        // Provides but not CRM — relay role
        role = "relay";
      }

      // Collect all systems in this DataObject's flow graph
      Set<String> allSystems = new HashSet<>();
      for (String[] edge : edges) {
        allSystems.add(edge[0]);
        allSystems.add(edge[1]);
      }
      allSystems.addAll(providers);

      // Build adjacency for BFS (directed: source → targets)
      Map<String, Set<String>> adjacency = new HashMap<>();
      for (String[] edge : edges) {
        adjacency.computeIfAbsent(edge[0], k -> new HashSet<>()).add(edge[1]);
      }

      // Simulate removal: remove target system
      Set<String> remainingSystems = new HashSet<>(allSystems);
      remainingSystems.remove(systemUri);

      // Build remaining adjacency (exclude edges involving target)
      Map<String, Set<String>> remainingAdj = new HashMap<>();
      for (String[] edge : edges) {
        if (edge[0].equals(systemUri) || edge[1].equals(systemUri)) continue;
        remainingAdj.computeIfAbsent(edge[0], k -> new HashSet<>()).add(edge[1]);
      }

      // Remaining CRM providers (source nodes for BFS)
      Set<String> remainingProviders = new HashSet<>(providers);
      remainingProviders.remove(systemUri);

      // BFS from remaining providers to find reachable systems
      Set<String> reachable = new HashSet<>(remainingProviders);
      Queue<String> queue = new LinkedList<>(remainingProviders);
      while (!queue.isEmpty()) {
        String current = queue.poll();
        Set<String> neighbors = remainingAdj.getOrDefault(current, new HashSet<>());
        for (String neighbor : neighbors) {
          if (!reachable.contains(neighbor)) {
            reachable.add(neighbor);
            queue.add(neighbor);
          }
        }
      }

      // Isolated systems = systems in graph that are NOT reachable and NOT providers
      Set<String> isolated = new HashSet<>();
      for (String sys : remainingSystems) {
        if (!reachable.contains(sys)) {
          isolated.add(sys);
        }
      }

      // Determine classification
      String classification;
      if (isCrmProvider && remainingProviders.isEmpty()) {
        classification = "soleProvider";
      } else if (!isolated.isEmpty()) {
        classification = "criticalRelay";
      } else {
        classification = "nonCritical";
      }

      // Build flow edges list for response
      List<Map<String, String>> flowEdgeList = new ArrayList<>();
      for (String[] edge : edges) {
        Map<String, String> edgeMap = new HashMap<>();
        edgeMap.put("source", edge[0]);
        edgeMap.put("target", edge[1]);
        flowEdgeList.add(edgeMap);
      }

      // Build alternative providers list
      List<Map<String, String>> alternativeProvidersList = new ArrayList<>();
      for (String provUri : remainingProviders) {
        Map<String, String> entry = new HashMap<>();
        entry.put("uri", provUri);
        entry.put("label", extractLabel(provUri));
        alternativeProvidersList.add(entry);
      }

      // Build isolated systems list
      List<Map<String, String>> isolatedList = new ArrayList<>();
      for (String isoUri : isolated) {
        Map<String, String> entry = new HashMap<>();
        entry.put("uri", isoUri);
        entry.put("label", extractLabel(isoUri));
        isolatedList.add(entry);
      }

      Map<String, Object> impact = new LinkedHashMap<>();
      impact.put("dataObjectUri", doUri);
      impact.put("dataObjectLabel", extractLabel(doUri));
      impact.put("role", role);
      impact.put("classification", classification);
      impact.put("isolatedSystems", isolatedList);
      impact.put("totalSystemsInGraph", allSystems.size());
      impact.put("alternativeProviders", alternativeProvidersList);
      impact.put("flowEdges", flowEdgeList);

      impacts.add(impact);
    }

    // Sort: soleProvider first, then criticalRelay, then nonCritical
    impacts.sort((a, b) -> {
      int orderA = classificationOrder((String) a.get("classification"));
      int orderB = classificationOrder((String) b.get("classification"));
      if (orderA != orderB) return orderA - orderB;
      // Within same classification, sort by isolated count descending
      @SuppressWarnings("unchecked")
      List<Map<String, String>> isoA = (List<Map<String, String>>) a.get("isolatedSystems");
      @SuppressWarnings("unchecked")
      List<Map<String, String>> isoB = (List<Map<String, String>>) b.get("isolatedSystems");
      return isoB.size() - isoA.size();
    });

    return impacts;
  }

  private static int classificationOrder(String classification) {
    switch (classification) {
      case "soleProvider": return 0;
      case "criticalRelay": return 1;
      case "nonCritical": return 2;
      default: return 3;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static String extractLabel(String uri) {
    if (uri == null) return "";
    String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
    return label.replace('_', ' ');
  }

  @Override
  public String getReactorDescription() {
    return "Computes data flow impact of removing a system — identifies isolated systems per DataObject.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (DATABASE_KEY.equals(key)) {
      return "The UUID of the RDF database engine to query.";
    }
    if (SYSTEM_KEY.equals(key)) {
      return "The full URI of the system to simulate removing.";
    }
    return null;
  }
}
