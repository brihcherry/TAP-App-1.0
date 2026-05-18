// Type definitions for the System Inspector feature.

/** A system option in the picker dropdown. */
export interface SystemOption {
  uri: string;
  label: string;
}

/** A capability group with its associated systems. */
export interface CapabilityGroup {
  uri: string;
  label: string;
  description?: string;
  systems: SystemOption[];
}

/** Response from GetCapabilityGroups reactor. */
export interface CapabilityGroupsResponse {
  capabilityGroups: CapabilityGroup[];
}

/** A labeled URI item: data object, business process, activity, or user type. */
export interface LabeledItem {
  uri: string;
  label: string;
}

/** A SystemInterface with its relationship role relative to the inspected system. */
export interface InterfaceItem extends LabeledItem {
  /** "provider" = this system pushes data out to the interface (outgoing).
   *  "consumer" = the interface feeds data into this system (incoming). */
  role: "provider" | "consumer";
  /** The system on the other end of this interface. */
  connectedSystem?: string;
  /** URI of the connected system. */
  connectedSystemUri?: string;
  /** Data objects carried by this interface. */
  dataObjects?: LabeledItem[];
}

/** Full attribute details for a selected system, returned by GetSystemDetails. */
export interface SystemDetails {
  systemUri: string;
  systemName: string;
  /** DataObjects the system provides. */
  dataObjects: LabeledItem[];
  /** SystemInterfaces this system is connected to, with direction. */
  interfaces: InterfaceItem[];
  /** Deployment environment: "Theater", "Garrison", "Both", or "" if unknown. */
  environment: string;
  /** Transactional status: "Yes", "No", "Both", or "" if unknown. */
  transactional: string;
  /** BusinessProcesses the system supports. */
  businessProcesses: LabeledItem[];
  /** Activities the system supports. */
  activities: LabeledItem[];
  /** Personnel / user types assigned to the system. */
  userTypes: LabeledItem[];
  /** System description from RDF. */
  description: string;
  /** System disposition (e.g. "Sustain", "Decommission"). */
  disposition: string;
  /** System owner (extracted from SystemOwner concept). */
  owner: string;
}
