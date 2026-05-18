export type ConfigNamespace = "content" | "options" | "legal";

export type PublicConfigDocument = {
  namespace: ConfigNamespace;
  key: string;
  versionTag: string;
  data: Record<string, unknown>;
  updatedAt: string;
};

export type PublicConfigBundle = {
  versionTag: string;
  documents: Array<PublicConfigDocument>;
};

export type ConfigApiResult<T> = {
  data: T;
  source: "live" | "empty";
  message?: string;
};
