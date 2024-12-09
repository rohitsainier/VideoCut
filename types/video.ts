// In your VideoFile type definition
export interface CreateVideoFile {
  file: File;
  type: string;
  name: string;
  dimension: DimensionType;
  url: string;
}

export interface EditVideoFile {
  file: File;
  url: string;
}

export type DimensionType = "16:9" | "9:16" | "1:1";