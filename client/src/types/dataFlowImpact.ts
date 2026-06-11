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
  targetSystemUri: string;
  targetSystemLabel: string;
  dataObjects: OutboundDataObject[];
}

// ── Inbound Connection ────────────────────────────────────────────────────────

export interface InboundDataObject {
  uri: string;
  label: string;
}

export interface InboundConnection {
  sourceSystemUri: string;
  sourceSystemLabel: string;
  dataObjects: InboundDataObject[];
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
  inboundConnections?: InboundConnection[];
}
