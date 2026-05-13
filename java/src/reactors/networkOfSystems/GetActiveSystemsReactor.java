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
import util.ProjectProperties;
import util.QueryExecutor;

/**
 * Returns all active systems from the TAP_Core_Data RDF database.
 *
 * <p>Unlike GetSystemNetwork, this reactor does NOT filter by interface
 * connectivity or payload. It returns every system typed as ActiveSystem,
 * making it suitable for populating directory lists where all systems
 * should be visible regardless of their data-flow connections.
 *
 * <p>Pixel call:
 * <pre>
 *   GetActiveSystems();
 * </pre>
 *
 * <p>Output:
 * <pre>
 *   {
 *     "systems": [
 *       {"uri": "http://health.mil/ontologies/Concept/System/AHLTA", "label": "AHLTA"},
 *       {"uri": "http://health.mil/ontologies/Concept/System/CHCS", "label": "CHCS"},
 *       ...
 *     ]
 *   }
 * </pre>
 */
public class GetActiveSystemsReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(GetActiveSystemsReactor.class);

  private static final String RDF_TYPE =
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  private static final String BASE =
      "http://semoss.org/ontologies";

  public GetActiveSystemsReactor() {
    this.keysToGet = new String[] {};
    this.keyRequired = new int[] {};
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = ProjectProperties.getInstance().getDatabaseId();
    LOGGER.info("GetActiveSystems: engine=" + engineId);

    QueryExecutor executor = new QueryExecutor(engineId);

    String query =
        "SELECT DISTINCT ?System WHERE {"
        + "{?System <" + RDF_TYPE + "> <" + BASE + "/Concept/ActiveSystem>}"
        + "} ORDER BY ?System";

    List<Map<String, String>> rows = executor.executeSelect(query);

    List<Map<String, String>> systems = new ArrayList<>();
    for (Map<String, String> row : rows) {
      String sysUri = row.get("System");
      if (sysUri == null) continue;

      Map<String, String> entry = new HashMap<>();
      entry.put("uri", sysUri);
      entry.put("label", extractLabel(sysUri));
      systems.add(entry);
    }

    Map<String, Object> result = new HashMap<>();
    result.put("systems", systems);

    LOGGER.info("GetActiveSystems: found " + systems.size() + " active systems");
    return new NounMetadata(result, PixelDataType.MAP);
  }

  private static String extractLabel(String uri) {
    if (uri == null) return "";
    String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
    return label.replace('_', ' ');
  }

  @Override
  public String getReactorDescription() {
    return "Returns all active systems from the RDF database. Used to populate system "
        + "directory lists on the System Network Map and Data Object Impact pages.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    return null;
  }
}
