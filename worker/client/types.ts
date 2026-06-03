export interface BuildInfo {
  repository: string;
  commit: string;
  commitShort: string;
  branch: string;
  builtAt: string;
  commitUrl: string;
  treeUrl: string;
  dataAuditPath: string;
}

export interface CellFeature {
  properties: {
    count: number;
    countBand: string;
  };
}

export interface CellsGeoJson {
  type: string;
  features: CellFeature[];
  meta: {
    bbox: [number, number, number, number];
    k: number;
    h3Resolution: number;
    publishedCells?: number | string;
    totalPoints?: number | string;
    coordinateJitterMetres?: number;
  };
}

export interface AggregationMeta {
  k?: number;
  coordinateJitterMetres?: number;
  h3Resolution?: number;
  publishedCells?: number | string;
  totalPoints?: number | string;
}

export interface Manifest {
  aggregation?: AggregationMeta;
  filter?: { positiveCommentsOnly?: boolean };
}

/** MapLibre GL paint expression (nested arrays). */
export type MapLibreColorExpression = string | Array<string | number | MapLibreColorExpression>;
