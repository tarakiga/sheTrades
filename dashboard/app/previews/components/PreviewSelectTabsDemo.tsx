"use client";

import { useState } from "react";
import { Select, Tabs } from "../../../components/ui";

type PreviewSelectTabsDemoProps = {
  selectLabel: string;
  selectHint: string;
  selectOptions: Array<{
    label: string;
    value: string;
  }>;
  tabs: Array<{
    id: string;
    label: string;
    content: string;
  }>;
};

export function PreviewSelectTabsDemo({
  selectLabel,
  selectHint,
  selectOptions,
  tabs
}: PreviewSelectTabsDemoProps) {
  const [selectedLanguage, setSelectedLanguage] = useState(selectOptions[0]?.value ?? "");

  return (
    <div className="preview-card-content">
      <Select
        id="language"
        label={selectLabel}
        hint={selectHint}
        value={selectedLanguage}
        options={selectOptions}
        onChange={setSelectedLanguage}
      />
      <Tabs activeId={tabs[0]?.id ?? ""} items={tabs} />
    </div>
  );
}
