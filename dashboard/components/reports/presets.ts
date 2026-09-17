/**
 * A report preset as the Reports page and the schedule drawer see it. Presets
 * are config-driven (the reports.presets option set); metadata.reportType
 * names the dataset the backend generates, and metadata.audience says who
 * the file is for so the page can label it before anyone downloads it.
 */
export type PresetAudience = "donor" | "internal";

export type GeneratablePreset = {
  id: string;
  label: string;
  content: string;
  reportType: string;
  audience?: PresetAudience;
  /** True when the file carries names or phone numbers. */
  personalData?: boolean;
};
