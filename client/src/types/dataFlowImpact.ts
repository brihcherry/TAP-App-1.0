// Type definitions for the Data Flow Impact Analyzer.

// ── Data Subject Area ────────────────────────────────────────────────────────

export interface DataSubjectArea {
  uri: string;
  label: string;
}

// ── Creator / Modifier Data Objects ──────────────────────────────────────────

export interface CrmDataObject {
  uri: string;
  label: string;
  crm: 'C' | 'M';
}

// ── Outbound Connection ───────────────────────────────────────────────────────

export interface OutboundDataObject {
  uri: string;
  label: string;
}

export interface OutboundConnection {
  interfaceUri: string;
  interfaceLabel: string;
  targetSystemUri: string;
  targetSystemLabel: string;
  dataObjects: OutboundDataObject[];
}

// ── Reactor response ──────────────────────────────────────────────────────────

/** Response from GetDataFlowImpact reactor. */
export interface SystemImpactReactorResponse {
  systemUri: string;
  systemName: string;
  isAuthoritativeDataSource: boolean;
  dataSubjectAreas: DataSubjectArea[];
  crmDataObjects: CrmDataObject[];
  outboundConnections: OutboundConnection[];
}
