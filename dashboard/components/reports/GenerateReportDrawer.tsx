"use client";

import { useState } from "react";
import { Badge, Button, Select, SideDrawer } from "../ui";
import {
  downloadAdminCsv,
  generateReport,
  reportDownloadEndpoint,
  type ReportJobRow
} from "../../lib/admin/api";

export type GeneratablePreset = {
  id: string;
  label: string;
  content: string;
  reportType: string;
};

export type GenerateReportDrawerProps = {
  open: boolean;
  onClose: () => void;
  presets: GeneratablePreset[];
  /** Called after a successful generation so the page can refresh its history. */
  onGenerated: () => void;
};

type Feedback = { tone: "success" | "danger"; text: string };

/**
 * On-demand report generation. Presets are config-driven (reports.presets
 * option set; metadata.reportType names the dataset). Generation is synchronous
 * on the backend, so a successful run immediately offers the download.
 */
export function GenerateReportDrawer({ open, onClose, presets, onGenerated }: GenerateReportDrawerProps) {
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastJob, setLastJob] = useState<ReportJobRow | null>(null);

  const selected = presets.find((preset) => preset.id === presetId) ?? presets[0] ?? null;

  async function handleGenerate() {
    if (!selected) return;
    setGenerating(true);
    setFeedback(null);
    setLastJob(null);
    try {
      const result = await generateReport(selected.reportType);
      setLastJob(result.job);
      setFeedback({ tone: "success", text: `${selected.label} report is ready.` });
      onGenerated();
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : "Report generation failed."
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <SideDrawer
      open={open}
      title="Generate Report"
      description="Builds a CSV from live data for the selected preset. The export lands in the history table below and can be downloaded immediately."
      onClose={onClose}
      footerActions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button loading={generating} disabled={!selected || generating} onClick={() => void handleGenerate()}>
            Generate
          </Button>
        </>
      }
    >
      <div className="generate-report">
        {feedback ? (
          <div className="generate-report__feedback">
            <Badge variant={feedback.tone}>{feedback.text}</Badge>
          </div>
        ) : null}

        {presets.length === 0 ? (
          <p className="generate-report__note">
            No generatable presets are configured. Add report presets (with a reportType) under
            Settings → Options (reports.presets).
          </p>
        ) : (
          <>
            <Select
              id="generate-report-preset"
              label="Report Preset"
              value={selected?.id ?? ""}
              options={presets.map((preset) => ({ value: preset.id, label: preset.label }))}
              onChange={setPresetId}
              hint="Presets are managed under Settings → Options (reports.presets)."
            />
            {selected ? <p className="generate-report__note">{selected.content}</p> : null}
          </>
        )}

        {lastJob && lastJob.status === "Ready" ? (
          <div className="generate-report__result">
            <span className="generate-report__result-name">{lastJob.fileName}</span>
            <Button
              variant="secondary"
              onClick={() => {
                void downloadAdminCsv(
                  reportDownloadEndpoint(lastJob.exportId),
                  lastJob.fileName ?? "report.csv"
                );
              }}
            >
              Download
            </Button>
          </div>
        ) : null}
      </div>
    </SideDrawer>
  );
}
