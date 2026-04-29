package reactors.networkOfSystems;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import prerna.sablecc2.om.PixelDataType;
import prerna.sablecc2.om.nounmeta.NounMetadata;
import reactors.AbstractProjectReactor;
import util.QueryExecutor;

/**
 * Returns all systems that support a given Activity or Business Process concept.
 *
 * <p>Used by the System Inspector UI: when a user clicks an Activity or Business Process
 * item, this reactor looks up every other system in the RDF graph that also has a
 * {@code Supports} relation to that same concept URI.
 *
 * <p>Pixel call:
 * <pre>
 *   GetSystemsByConcept(
 *     database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
 *     concept=["http://health.mil/ontologies/Concept/Activity/Scheduling"]
 *   );
 * </pre>
 *
 * <p>Output:
 * <pre>
 *   {
 *     "conceptUri": "http://health.mil/ontologies/Concept/Activity/Scheduling",
 *     "conceptLabel": "Scheduling",
 *     "systems": [
 *       {"uri": "http://health.mil/ontologies/Concept/System/AHLTA", "label": "AHLTA"},
 *       ...
 *     ]
 *   }
 * </pre>
 */
public class GetSystemsByConceptReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(GetSystemsByConceptReactor.class);

  private static final String CONCEPT_KEY = "concept";

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String BASE =
      "http://semoss.org/ontologies";

  public GetSystemsByConceptReactor() {
    this.keysToGet = new String[] { CONCEPT_KEY };
    this.keyRequired = new int[] { 1 };
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = ProjectProperties.getInstance().getDatabaseId();
    String conceptUri = this.keyValue.get(CONCEPT_KEY);
    LOGGER.info("GetSystemsByConcept: engine=" + engineId + " concept=" + conceptUri);

    QueryExecutor executor = new QueryExecutor(engineId);

    String query =
        "SELECT DISTINCT ?System WHERE {"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/System>}"
        + "{?System <" + BASE + "/Relation/Supports> <" + conceptUri + ">}"
        + "} ORDER BY ?System";

    List<Map<String, String>> rows = executor.executeSelect(query);
    List<Map<String, String>> systems = new ArrayList<>();
    for (Map<String, String> row : rows) {
      String uri = row.get("System");
      if (uri != null) {
        Map<String, String> entry = new HashMap<>();
        entry.put("uri", uri);
        entry.put("label", extractLabel(uri));
        systems.add(entry);
      }
    }

    Map<String, Object> result = new HashMap<>();
    result.put("conceptUri", conceptUri);
    result.put("conceptLabel", extractLabel(conceptUri));
    result.put("systems", systems);

    return new NounMetadata(result, PixelDataType.MAP);
  }

  private static String extractLabel(String uri) {
    if (uri == null) return "";
    String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
    return label.replace('_', ' ');
  }

  @Override
  public String getReactorDescription() {
    return "Returns all systems that support a given Activity or Business Process concept URI. "
        + "Used to show cross-system impact when a concept is selected in the System Inspector.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (CONCEPT_KEY.equals(key)) {
      return "The full URI of the Activity or Business Process concept to look up, e.g. "
          + "http://health.mil/ontologies/Concept/Activity/Scheduling";
    }
    return null;
  }
}
