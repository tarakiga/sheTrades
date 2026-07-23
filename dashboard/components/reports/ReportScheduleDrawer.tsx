"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Select, SideDrawer } from "../ui";
import {
  createReportSchedule,
  getAdminTeamDirectory,
  type ScheduleRecipient
} from "../../lib/admin/api";
import { fetchPublicOptionSet } from "../../lib/config/options";
import type { GeneratablePreset } from "./GenerateReportDrawer";

export type CadenceOption = { value: string; label: string };

export type ReportScheduleDrawerProps = {
  open: boolean;
  onClose: () => void;
  presets: GeneratablePreset[];
  /** Called after a schedule is created so the page can refresh its list. */
  onCreated: () => void;
};

type Feedback = { tone: "success" | "danger" | "warning"; text: string };

type PickerEntry = ScheduleRecipient & { source: "team" | "directory" };

// Client-side sanity check only; the backend re-validates with zod.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Safe defaults mirroring the seeded reports.cadence_options baseline, used
// when nothing is published yet (same pattern as report presets).
const FALLBACK_CADENCES: CadenceOption[] = [
  { value: "daily_0800utc", label: "Daily at 09:00 (WAT)" },
  { value: "weekly_mon_0800utc", label: "Weekly on Mondays at 09:00 (WAT)" },
  { value: "monthly_1st_0800utc", label: "Monthly on the 1st at 09:00 (WAT)" }
];

/**
 * Create a standing report schedule: preset + cadence + recipients. Recipients
 * are picked from two config-governed sources - the admin team (Settings →
 * Admins) and the reports.recipient_directory option set for external
 * stakeholders - plus a validated one-off address for anything else.
 */
export function ReportScheduleDrawer({ open, onClose, presets, onCreated }: ReportScheduleDrawerProps) {
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const [cadences, setCadences] = useState<CadenceOption[]>(FALLBACK_CADENCES);
  const [cadenceKey, setCadenceKey] = useState(FALLBACK_CADENCES[0]?.value ?? "");
  const [pickerEntries, setPickerEntries] = useState<PickerEntry[]>([]);
  const [selected, setSelected] = useState<ScheduleRecipient[]>([]);
  const [customEmail, setCustomEmail] = useState("");
  const [customError, setCustomError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFeedback(null);
    setSelected([]);
    setCustomEmail("");
    setCustomError("");

    fetchPublicOptionSet("reports.cadence_options")
      .then((items) => {
        if (cancelled || items.length === 0) return;
        const options = items.map((item) => ({ value: item.value, label: item.label }));
        setCadences(options);
        setCadenceKey((current) =>
          options.some((option) => option.value === current) ? current : (options[0]?.value ?? "")
        );
      })
      .catch(() => {
        /* keep fallback cadences */
      });

    Promise.all([
      getAdminTeamDirectory().then((result) => result.data.admins).catch(() => []),
      fetchPublicOptionSet("reports.recipient_directory").catch(() => [])
    ]).then(([admins, directory]) => {
      if (cancelled) return;
      const entries: PickerEntry[] = [
        ...admins
          .filter((admin) => admin.status === "active" && EMAIL_PATTERN.test(admin.email))
          .map((admin) => ({
            email: admin.email.toLowerCase(),
            label: admin.fullName || admin.email,
            source: "team" as const
          })),
        ...directory
          .filter((item) => EMAIL_PATTERN.test(item.value))
          .map((item) => ({
            email: item.value.toLowerCase(),
            label: item.label || item.value,
            source: "directory" as const
          }))
      ];
      // First occurrence wins when a team member is also in the directory.
      const byEmail = new Map<string, PickerEntry>();
      for (const entry of entries) {
        if (!byEmail.has(entry.email)) byEmail.set(entry.email, entry);
      }
      setPickerEntries(Array.from(byEmail.values()));
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedEmails = useMemo(() => new Set(selected.map((entry) => entry.email)), [selected]);
  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? presets[0] ?? null;

  function toggleRecipient(entry: ScheduleRecipient) {
    setSelected((current) =>
      current.some((item) => item.email === entry.email)
        ? current.filter((item) => item.email !== entry.email)
        : [...current, { email: entry.email, ...(entry.label ? { label: entry.label } : {}) }]
    );
  }

  function handleAddCustom() {
    const email = customEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      setCustomError("Enter a valid email address.");
      return;
    }
    setCustomError("");
    setCustomEmail("");
    if (!selectedEmails.has(email)) {
      setSelected((current) => [...current, { email }]);
    }
  }

  async function handleCreate() {
    if (!selectedPreset || !cadenceKey || selected.length === 0) return;
    setSaving(true);
    setFeedback(null);
    try {
      await createReportSchedule({ presetId: selectedPreset.id, cadenceKey, recipients: selected });
      setFeedback({ tone: "success", text: "Schedule created." });
      setSelected([]);
      onCreated();
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : "Create schedule failed."
      });
    } finally {
      setSaving(false);
    }
  }

  const createDisabled = saving || !selectedPreset || !cadenceKey || selected.length === 0;

  return (
    <SideDrawer
      open={open}
      title="Create Schedule"
      description="Generates the selected report on a cadence and emails it to the chosen recipients automatically."
      onClose={onClose}
      footerActions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button loading={saving} disabled={createDisabled} onClick={() => void handleCreate()}>
            Create Schedule
          </Button>
        </>
      }
    >
      <div className="report-schedule">
        {feedback ? (
          <div className="report-schedule__feedback">
            <Badge variant={feedback.tone}>{feedback.text}</Badge>
          </div>
        ) : null}

        {presets.length === 0 ? (
          <p className="report-schedule__note">
            No generatable presets are configured. Add report presets (with a reportType) under
            Settings → Options (reports.presets).
          </p>
        ) : (
          <>
            <Select
              id="report-schedule-preset"
              label="Report Preset"
              value={selectedPreset?.id ?? ""}
              options={presets.map((preset) => ({ value: preset.id, label: preset.label }))}
              onChange={setPresetId}
            />
            {selectedPreset ? (
              <p className="report-schedule__note">{selectedPreset.content}</p>
            ) : null}

            <Select
              id="report-schedule-cadence"
              label="Cadence"
              value={cadenceKey}
              options={cadences.map((cadence) => ({ value: cadence.value, label: cadence.label }))}
              onChange={setCadenceKey}
              hint="Cadences are managed under Settings → Options (reports.cadence_options)."
            />

            <div className="report-schedule__recipients">
              <p className="report-schedule__group-label" id="report-schedule-recipients-label">
                Recipients
              </p>
              {pickerEntries.length === 0 ? (
                <p className="report-schedule__note">
                  No known recipients yet. Team members appear here automatically; external
                  stakeholders are managed under Settings → Options (reports.recipient_directory).
                </p>
              ) : (
                <ul
                  className="report-schedule__picker"
                  aria-labelledby="report-schedule-recipients-label"
                >
                  {pickerEntries.map((entry) => {
                    const isSelected = selectedEmails.has(entry.email);
                    return (
                      <li key={entry.email}>
                        <button
                          type="button"
                          className="report-schedule__pick"
                          aria-pressed={isSelected}
                          onClick={() => toggleRecipient(entry)}
                        >
                          <span className="report-schedule__pick-label">{entry.label}</span>
                          <span className="report-schedule__pick-email">{entry.email}</span>
                          <Badge variant={entry.source === "team" ? "info" : "neutral"}>
                            {entry.source === "team" ? "Team" : "Directory"}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="report-schedule__custom">
                <Input
                  id="report-schedule-custom-email"
                  label="Add another email"
                  type="email"
                  value={customEmail}
                  placeholder="name@example.org"
                  onChange={(event) => setCustomEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddCustom();
                    }
                  }}
                  {...(customError ? { error: customError } : {})}
                  hint="One-off recipients. Save recurring external contacts to the directory instead."
                />
                <Button variant="secondary" onClick={handleAddCustom} disabled={!customEmail.trim()}>
                  Add
                </Button>
              </div>

              {selected.length > 0 ? (
                <div className="report-schedule__chosen" aria-label="Selected recipients">
                  {selected.map((entry) => (
                    <button
                      key={entry.email}
                      type="button"
                      className="report-schedule__chip"
                      onClick={() => toggleRecipient(entry)}
                      aria-label={`Remove ${entry.email}`}
                    >
                      {entry.label ?? entry.email}
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="report-schedule__note">Pick at least one recipient.</p>
              )}
            </div>
          </>
        )}
      </div>
    </SideDrawer>
  );
}
