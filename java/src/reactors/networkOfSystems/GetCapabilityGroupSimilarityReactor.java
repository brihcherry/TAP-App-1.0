package reactors.networkOfSystems;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import prerna.sablecc2.om.GenRowStruct;
import prerna.sablecc2.om.PixelDataType;
import prerna.sablecc2.om.ReactorKeysEnum;
import prerna.sablecc2.om.nounmeta.NounMetadata;
import reactors.AbstractProjectReactor;
import util.ProjectProperties;
import util.SimilarityChartingUtils;
import util.SimilarityFunctions;

/**
 * Computes pairwise system similarity for a provided subset of systems (typically
 * a capability group/capability from System Inspection).
 *
 * <p>Pixel call:
 * <pre>
 *   GetCapabilityGroupSimilarity(
 *     systemList=["http://.../System/A","http://.../System/B"],
 *     database=["133db94b-4371-4763-bff9-edf7e5ed021b"] // optional
 *   );
 * </pre>
 */
public class GetCapabilityGroupSimilarityReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(GetCapabilityGroupSimilarityReactor.class);

  private static final String SYSTEM_LIST_KEY = "systemList";
  private static final String DATABASE_KEY = ReactorKeysEnum.DATABASE.getKey();

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String RDFS_SUBPROP =
      "http://www.w3.org/2000/01/rdf-schema#subPropertyOf";
  private static final String BASE =
      "http://semoss.org/ontologies";

  private static final String BUCKET_BP = "Business_Processes_Supported";
  private static final String BUCKET_ACT = "Activities_Supported";
  private static final String BUCKET_DATA_OBJ = "Data_Subject_Area";
  private static final String BUCKET_ENV = "Environment";
  private static final String BUCKET_USERS = "User_Types";
  private static final String BUCKET_INTERFACE = "Interfaces";
  private static final Pattern ABSOLUTE_URI_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*://.+$");

  public GetCapabilityGroupSimilarityReactor() {
    this.keysToGet = new String[] {DATABASE_KEY, SYSTEM_LIST_KEY};
    this.keyRequired = new int[] {0, 1};
  }

  @Override
  protected NounMetadata doExecute() {
    String engineId = this.keyValue.get(DATABASE_KEY);
    if (engineId == null || engineId.trim().isEmpty()) {
      engineId = ProjectProperties.getInstance().getDatabaseId();
    }

    List<String> systemUris = normalizeSystemUris(getListParam(SYSTEM_LIST_KEY));
    if (systemUris.size() < 2) {
      return new NounMetadata("systemList must include at least 2 system URIs", PixelDataType.CONST_STRING);
    }

    SimilarityFunctions similarityFunctions = new SimilarityFunctions();
    similarityFunctions.setComparisonObjectList(systemUris);
    String bindingsClause = buildBindingsClause(systemUris);

    String businessProcessQuery = appendBindings(
        "SELECT DISTINCT ?System ?BusinessProcess WHERE {"
          + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
          + "{?BusinessProcess <" + RDF_TYPE + "> <" + BASE + "/Concept/BusinessProcess>}"
          + "{?System <" + BASE + "/Relation/Supports> ?BusinessProcess}"
          + "{?System ?UsedBy ?SystemUser}"
          + "}",
        bindingsClause);

    String activityQuery = appendBindings(
        "SELECT DISTINCT ?System ?Activity WHERE {"
          + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
          + "{?Activity <" + RDF_TYPE + "> <" + BASE + "/Concept/Activity>}"
          + "{?System <" + BASE + "/Relation/Supports> ?Activity}"
          + "{?System ?UsedBy ?SystemUser}"
          + "}",
        bindingsClause);

    String dataObjectQuery = appendBindings(
        "SELECT DISTINCT ?System ?Data WHERE {"
          + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
          + "{?Data <" + RDF_TYPE + "> <" + BASE + "/Concept/DataObject>}"
          + "{?Provide <" + RDFS_SUBPROP + "> <" + BASE + "/Relation/Provide>}"
          + "{?System ?Provide ?Data}"
          + "{?System ?UsedBy ?SystemUser}"
          + "}",
        bindingsClause);

    String environmentQuery = appendBindings(
        "SELECT DISTINCT ?System ?Theater WHERE {"
          + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
          + "{?System <" + BASE + "/Relation/Contains/GarrisonTheater> ?Theater}"
          + "{?System ?UsedBy ?SystemUser}"
          + "}",
        bindingsClause);

    String userTypeQuery = appendBindings(
        "SELECT DISTINCT ?System ?Personnel WHERE {"
          + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
          + "{?Personnel <" + RDF_TYPE + "> <" + BASE + "/Concept/Personnel>}"
          + "{?System <" + BASE + "/Relation/UsedBy> ?Personnel}"
          + "{?System ?UsedBy ?SystemUser}"
          + "}",
        bindingsClause);

    String interfaceQuery = appendBindings(
        "SELECT DISTINCT ?System ?SystemInterface WHERE {"
          + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
          + "{?SystemInterface <" + RDF_TYPE + "> <" + BASE + "/Concept/SystemInterface>}"
          + "{{?System <" + BASE + "/Relation/Provide> ?SystemInterface}"
          + " UNION "
          + "{?SystemInterface <" + BASE + "/Relation/Consume> ?System}}"
          + "{?System ?UsedBy ?SystemUser}"
          + "}",
        bindingsClause);

    Map<String, String> identityLabelMap = buildIdentityLabelMap(systemUris);
    Map<String, Map<String, Object>> keyHash = new HashMap<>();

    Map<String, Map<String, Double>> businessProcessRaw = similarityFunctions.compareObjectParameterScore(
        engineId,
        businessProcessQuery,
        SimilarityFunctions.VALUE);
    Map<String, Map<String, Double>> activityRaw = similarityFunctions.compareObjectParameterScore(
        engineId,
        activityQuery,
        SimilarityFunctions.VALUE);
    Map<String, Map<String, Double>> dataObjectRaw = similarityFunctions.compareObjectParameterScore(
        engineId,
        dataObjectQuery,
        SimilarityFunctions.VALUE);
    Map<String, Map<String, Double>> environmentRaw = similarityFunctions.stringCompareBinaryResultGetter(
        engineId,
        environmentQuery,
        "Theater",
        "Garrison",
        "Both");
    Map<String, Map<String, Double>> userTypeRaw = similarityFunctions.compareObjectParameterScore(
        engineId,
        userTypeQuery,
        SimilarityFunctions.VALUE);
    Map<String, Map<String, Double>> interfaceRaw = similarityFunctions.compareObjectParameterScore(
        engineId,
        interfaceQuery,
        SimilarityFunctions.VALUE);

    Map<String, Map<String, Map<String, Object>>> bucketChartData = new LinkedHashMap<>();
    bucketChartData.put(BUCKET_BP, SimilarityChartingUtils.processHashForCharting(
        businessProcessRaw,
        keyHash,
        "System1",
        "System2",
        identityLabelMap));
    bucketChartData.put(BUCKET_ACT, SimilarityChartingUtils.processHashForCharting(
        activityRaw,
        keyHash,
        "System1",
        "System2",
        identityLabelMap));
    bucketChartData.put(BUCKET_DATA_OBJ, SimilarityChartingUtils.processHashForCharting(
        dataObjectRaw,
        keyHash,
        "System1",
        "System2",
        identityLabelMap));
    bucketChartData.put(BUCKET_ENV, SimilarityChartingUtils.processHashForCharting(
        environmentRaw,
        keyHash,
        "System1",
        "System2",
        identityLabelMap));
    bucketChartData.put(BUCKET_USERS, SimilarityChartingUtils.processHashForCharting(
        userTypeRaw,
        keyHash,
        "System1",
        "System2",
        identityLabelMap));
    bucketChartData.put(BUCKET_INTERFACE, SimilarityChartingUtils.processHashForCharting(
        interfaceRaw,
        keyHash,
        "System1",
        "System2",
        identityLabelMap));

    List<Map<String, Double>> bucketDataList = new ArrayList<>();
    for (String bucket : bucketChartData.keySet()) {
      bucketDataList.add(extractDirectionalScores(bucketChartData.get(bucket), keyHash));
    }

    Set<String> masterKeys = new HashSet<>();
    if (!bucketDataList.isEmpty()) {
      masterKeys.addAll(bucketDataList.get(0).keySet());
    }

    List<Map<String, Object>> pairs = new ArrayList<>();
    List<String> bucketNames = new ArrayList<>(bucketChartData.keySet());

    for (int i = 0; i < systemUris.size(); i++) {
      for (int j = 0; j < systemUris.size(); j++) {
        if (i == j) continue;
        String system1 = systemUris.get(i);
        String system2 = systemUris.get(j);
        String pairKey = makeDirectionalPairKey(system1, system2);

        Map<String, Double> categoryScores = new LinkedHashMap<>();
        boolean allBucketsPresent = true;
        double summaryScore = 0.0;

        int bucketIndex = 0;
        for (String bucket : bucketNames) {
          Double score = bucketDataList.get(bucketIndex).get(pairKey);
          categoryScores.put(bucket, score);
          if (score == null) {
            allBucketsPresent = false;
          } else {
            summaryScore += score;
          }
          bucketIndex++;
        }

        int totalBuckets = bucketChartData.size();
        Double finalSummaryScore = allBucketsPresent ? summaryScore / totalBuckets : null;

        Map<String, Object> pair = new LinkedHashMap<>();
        pair.put("system1Uri", system1);
        pair.put("system2Uri", system2);
        pair.put("direction", "forward");
        pair.put("summaryScore", finalSummaryScore);
        pair.put("categoryScores", categoryScores);
        pair.put("hasScore", allBucketsPresent);
        pairs.add(pair);
      }
    }

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("systems", systemUris);
    result.put("pairs", pairs);

    LOGGER.info("GetCapabilityGroupSimilarity: systems={} pairs={}", systemUris.size(), pairs.size());
    return new NounMetadata(result, PixelDataType.MAP);
  }

  private String buildBindingsClause(List<String> systemUris) {
    StringBuilder sb = new StringBuilder("BINDINGS ?System {");
    for (String uri : systemUris) {
      sb.append("(<").append(uri).append(">)");
    }
    sb.append("}");
    return sb.toString();
  }

  private String appendBindings(String query, String bindingsClause) {
    if (bindingsClause == null || bindingsClause.isEmpty()) {
      return query;
    }
    return query + " " + bindingsClause;
  }

  private Map<String, Double> collapseChartScores(
      Map<String, Map<String, Object>> chartData,
      Map<String, Map<String, Object>> keyHash) {
    Map<String, Double> sums = new HashMap<>();
    Map<String, Integer> counts = new HashMap<>();

    for (Map.Entry<String, Map<String, Object>> entry : chartData.entrySet()) {
      String chartKey = entry.getKey();
      Map<String, Object> keyEntry = keyHash.get(chartKey);
      if (keyEntry == null) {
        continue;
      }

      Object leftObj = keyEntry.get("System1");
      Object rightObj = keyEntry.get("System2");
      if (leftObj == null || rightObj == null) {
        continue;
      }

      Object scoreObj = entry.getValue().get(SimilarityChartingUtils.SCORE_KEY);
      if (!(scoreObj instanceof Number)) {
        continue;
      }

      String pairKey = makePairKey(leftObj.toString(), rightObj.toString());
      double score = ((Number) scoreObj).doubleValue();
      sums.put(pairKey, sums.getOrDefault(pairKey, 0.0) + score);
      counts.put(pairKey, counts.getOrDefault(pairKey, 0) + 1);
    }

    Map<String, Double> collapsed = new HashMap<>();
    for (Map.Entry<String, Double> entry : sums.entrySet()) {
      int count = counts.getOrDefault(entry.getKey(), 0);
      if (count > 0) {
        collapsed.put(entry.getKey(), entry.getValue() / count);
      }
    }

    return collapsed;
  }

  private Map<String, Double> extractDirectionalScores(
      Map<String, Map<String, Object>> chartData,
      Map<String, Map<String, Object>> keyHash) {
    Map<String, Double> directionalScores = new HashMap<>();

    for (Map.Entry<String, Map<String, Object>> entry : chartData.entrySet()) {
      String chartKey = entry.getKey();
      Map<String, Object> keyEntry = keyHash.get(chartKey);
      if (keyEntry == null) {
        continue;
      }

      Object system1Obj = keyEntry.get("System1");
      Object system2Obj = keyEntry.get("System2");
      if (system1Obj == null || system2Obj == null) {
        continue;
      }

      Map<String, Object> chartEntry = entry.getValue();
      Object scoreObj = chartEntry.get(SimilarityChartingUtils.SCORE_KEY);
      if (scoreObj instanceof Number) {
        double score = ((Number) scoreObj).doubleValue();
        String directionalKey = makeDirectionalPairKey(system1Obj.toString(), system2Obj.toString());
        directionalScores.put(directionalKey, score);
      }
    }

    return directionalScores;
  }

  private Map<String, String> buildIdentityLabelMap(List<String> systemUris) {
    Map<String, String> identity = new HashMap<>();
    for (String systemUri : systemUris) {
      if (systemUri != null) {
        identity.put(systemUri, systemUri);
      }
    }
    return identity;
  }

  private String makePairKey(String left, String right) {
    return left.compareTo(right) <= 0 ? left + "::" + right : right + "::" + left;
  }

  private String makeDirectionalPairKey(String system1, String system2) {
    return system1 + "::" + system2;
  }

  private List<String> normalizeSystemUris(List<String> rawUris) {
    List<String> normalized = new ArrayList<>();
    if (rawUris == null) return normalized;

    Set<String> seen = new HashSet<>();
    for (String rawUri : rawUris) {
      if (rawUri == null) continue;
      String uri = rawUri.trim();
      if (uri.isEmpty() || seen.contains(uri)) continue;

      if (!isValidAbsoluteUri(uri)) {
        throw new IllegalArgumentException("Invalid system URI in systemList: " + uri);
      }

      seen.add(uri);
      normalized.add(uri);
    }

    return normalized;
  }

  private boolean isValidAbsoluteUri(String uri) {
    if (uri.contains(" ") || uri.contains("<") || uri.contains(">") || uri.contains("\"") || uri.contains("'")) {
      return false;
    }
    return ABSOLUTE_URI_PATTERN.matcher(uri).matches();
  }

  @SuppressWarnings("unchecked")
  private List<String> getListParam(String paramName) {
    GenRowStruct grs = this.store.getGenRowStruct(paramName);
    if (grs == null || grs.isEmpty()) return null;

    List<String> strValues = grs.getAllStrValues();
    if (strValues != null && !strValues.isEmpty()) {
      return strValues;
    }

    NounMetadata firstNoun = grs.getNoun(0);
    if (firstNoun != null && firstNoun.getValue() instanceof List) {
      return (List<String>) firstNoun.getValue();
    }

    return null;
  }

  @Override
  public String getReactorDescription() {
    return "Returns backend-computed pairwise similarity scores for a provided subset of systems, including summary and per-category breakdowns.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (DATABASE_KEY.equals(key)) {
      return "Optional RDF database engine UUID; defaults to the project database when omitted.";
    }
    if (SYSTEM_LIST_KEY.equals(key)) {
      return "Required list of system URIs (typically all systems in a selected capability group/capability).";
    }
    return null;
  }
}
