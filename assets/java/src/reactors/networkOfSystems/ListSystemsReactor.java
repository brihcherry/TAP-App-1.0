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
 * Returns the list of distinct System entries from the TAP_Core_Data RDF database,
 * filtered to systems used by Army, Navy, Air Force, or Central.
 *
 * <p>Pixel call:
 * <pre>
 *   ListSystems(database=["133db94b-4371-4763-bff9-edf7e5ed021b"]);
 * </pre>
 *
 * <p>Output: List of {uri, label} maps, e.g.:
 * <pre>
 *   [
 *     {"uri": "http://health.mil/ontologies/Concept/System/AHLTA", "label": "AHLTA"},
 *     ...
 *   ]
 * </pre>
 */
public class ListSystemsReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(ListSystemsReactor.class);

  private static final String DATABASE_KEY = ReactorKeysEnum.DATABASE.getKey();

  // ORDER BY must come before the BINDINGS block in this SPARQL engine.
  // Each triple pattern is wrapped in its own {} group, matching the convention
  // used by the working System Similarity queries on this engine.
  private static final String LIST_SYSTEMS_QUERY =
      "SELECT DISTINCT ?System WHERE {"
      + "{?System <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>"
      + " <http://semoss.org/ontologies/Concept/System>}"
      + "{?System ?UsedBy ?SystemUser}"
      + "} ORDER BY ?System"
      + " BINDINGS ?SystemUser {"
      + "(<http://health.mil/ontologies/Concept/SystemOwner/Central>)"
      + "(<http://health.mil/ontologies/Concept/SystemUser/Army>)"
      + "(<http://health.mil/ontologies/Concept/SystemUser/Navy>)"
      + "(<http://health.mil/ontologies/Concept/SystemUser/Air_Force>)"
      + "}";

  public ListSystemsReactor() {
    this.keysToGet = new String[] { DATABASE_KEY };
    this.keyRequired = new int[] { 1 };
  }

  @Override
  protected NounMetadata doExecute() {
    organizeKeys();
    String engineId = this.keyValue.get(DATABASE_KEY);
    LOGGER.info("ListSystems: querying engine " + engineId);

    QueryExecutor executor = new QueryExecutor(engineId);
    List<Map<String, String>> rows = executor.executeSelect(LIST_SYSTEMS_QUERY);

    List<Map<String, String>> systems = new ArrayList<>();
    for (Map<String, String> row : rows) {
      String uri = row.get("System");
      if (uri != null) {
        String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
        label = label.replace('_', ' ');

        Map<String, String> entry = new HashMap<>();
        entry.put("uri", uri);
        entry.put("label", label);
        systems.add(entry);
      }
    }

    LOGGER.info("ListSystems: found " + systems.size() + " systems");
    return new NounMetadata(systems, PixelDataType.CUSTOM_DATA_STRUCTURE);
  }

  @Override
  public String getReactorDescription() {
    return "Returns the list of systems (Army, Navy, Air Force, Central) from the RDF database.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (DATABASE_KEY.equals(key)) {
      return "The UUID of the RDF database engine to query.";
    }
    return null;
  }
}
