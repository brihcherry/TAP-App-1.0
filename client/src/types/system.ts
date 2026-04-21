// Type definitions for the System Inspector feature.

/** A system option in the picker dropdown. */
export interface SystemOption {
  uri: string;
  label: string;
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
}
