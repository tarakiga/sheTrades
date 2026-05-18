"use client";

import { useState } from "react";
import { Badge, Button, EmptyState, IconActionButton, Table } from "../../../components/ui";
import { CategoryManagementDrawer } from "../../../components/config/CategoryManagementDrawer";
import { ConfigEditorDrawer } from "../../../components/config/ConfigEditorDrawer";
import { ConfigPreviewDrawer } from "../../../components/config/ConfigPreviewDrawer";
import { GuidedInternalNameBuilder } from "../../../components/config/GuidedInternalNameBuilder";
import { SettingsWorkspaceHeader } from "../../../components/config/SettingsWorkspaceHeader";
import { SettingsWorkspaceToolbar } from "../../../components/config/SettingsWorkspaceToolbar";

type DemoRow = {
  key: string;
  title: string;
  draft: string;
  published: string;
  active: boolean;
  actions: string;
};

function PreviewIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path
        d="M2 10C3.8 6.8 6.6 5.2 10 5.2C13.4 5.2 16.2 6.8 18 10C16.2 13.2 13.4 14.8 10 14.8C6.6 14.8 3.8 13.2 2 10Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path
        d="M4.2 13.8L13.8 4.2L15.8 6.2L6.2 15.8L3.5 16.5L4.2 13.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11.8 6.2L13.8 8.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path d="M4.5 6H15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M7.5 6V4.6C7.5 4.27 7.77 4 8.1 4H11.9C12.23 4 12.5 4.27 12.5 4.6V6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M6.2 6L6.8 14.4C6.84 14.97 7.31 15.4 7.88 15.4H12.12C12.69 15.4 13.16 14.97 13.2 14.4L13.8 6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function GuidedSettingsWorkspacePreview() {
  const [searchValue, setSearchValue] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState("");
  const [createSlug, setCreateSlug] = useState("");

  const rows: Array<DemoRow> = [
    {
      key: "content.welcome.message",
      title: "Welcome Message",
      draft: "v4",
      published: "v3",
      active: true,
      actions: "content.welcome.message"
    },
    {
      key: "content.lesson.pricing",
      title: "Pricing Basics Lesson",
      draft: "-",
      published: "v2",
      active: true,
      actions: "content.lesson.pricing"
    }
  ];

  const filteredRows = rows.filter((row) => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return row.title.toLowerCase().includes(query) || row.key.toLowerCase().includes(query);
  });

  return (
    <div className="preview-card-content">
      <SettingsWorkspaceHeader
        title="Content Workspace"
        description="Review, update, and publish your content from one guided table."
        summary={[
          { label: "Items Loaded", value: "12" },
          { label: "Access Level", value: "admin" }
        ]}
      />
      <SettingsWorkspaceToolbar
        actionLabel="Add New"
        actionHint="Add learning and message content without leaving the table."
        onAction={() => setCreateOpen(true)}
        secondaryActionLabel="Manage Categories"
        onSecondaryAction={() => setCategoryDrawerOpen(true)}
        searchLabel="Search Items"
        searchPlaceholder="Search by title or internal name"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filters={[
          { id: "all", label: "All", count: 12 },
          { id: "draft", label: "Draft", count: 4 },
          { id: "live", label: "Live", count: 7 },
          { id: "trash", label: "Trash", count: 1 }
        ]}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        filterAriaLabel="Workspace filters"
      />
      <div className="settings-workspace__feedback">
        <Badge variant="success">Draft saved successfully.</Badge>
      </div>
      <section className="settings-workspace__table-shell">
        <div className="settings-workspace__table-header">
          <div>
            <h3 className="settings-workspace__table-title">Review And Publish Changes</h3>
            <p className="settings-workspace__table-description">
              Open any item to preview it, update the draft, or publish changes.
            </p>
          </div>
        </div>
        <Table
          wrapperClassName="config-table-wrap"
          tableClassName="config-table"
          rowClassName={(row) =>
            row.key === "content.welcome.message"
              ? "config-table__row config-table__row--selected"
              : "config-table__row"
          }
          columns={[
            {
              key: "title",
              header: "Item",
              render: (value, row) => (
                <div className="config-table__item">
                  <div className="config-table__title">
                    <span className="config-table__title-text">{String(value)}</span>
                    <span className="config-table__title-key">{String(row.key)}</span>
                  </div>
                </div>
              )
            },
            {
              key: "status",
              header: "Status",
              render: (value, row) => (
                <div className="config-table__status">
                  <Badge variant={row.active ? "success" : "warning"}>{String(value)}</Badge>
                </div>
              )
            },
            {
              key: "draft",
              header: "Draft",
              render: (value) => <span className="config-table__version">{String(value)}</span>
            },
            {
              key: "published",
              header: "Live",
              render: (value) => <span className="config-table__version">{String(value)}</span>
            },
            {
              key: "actions",
              header: "Actions",
              render: () => (
                <div className="config-table__action-rail">
                  <IconActionButton
                    icon={<PreviewIcon />}
                    label="Preview"
                    onClick={() => setPreviewOpen(true)}
                  />
                  <IconActionButton
                    icon={<EditIcon />}
                    label="Edit"
                    tone="primary"
                    onClick={() => setEditOpen(true)}
                  />
                  <IconActionButton icon={<TrashIcon />} label="Move To Trash" tone="danger" />
                </div>
              )
            }
          ]}
          rows={filteredRows.map((row) => ({
            ...row,
            status: row.active ? "Visible" : "In Trash"
          }))}
        />
      </section>
      <EmptyState
        title="No matching items"
        description="Change your search or filter to see more results."
        action={
          <Button variant="secondary" onClick={() => setSearchValue("")}>
            Clear Search
          </Button>
        }
      />

      <ConfigEditorDrawer
        open={createOpen}
        mode="create"
        namespaceLabel="Content Workspace"
        title="Add New Content"
        description="Add a new item without leaving the table."
        keyLabel="Internal Name"
        keyValue={`content.${createCategory}.${createSlug}`.replace(/\.+$/g, "")}
        keyPlaceholder="content.lesson.onboarding"
        onKeyChange={() => undefined}
        keyField={
          <GuidedInternalNameBuilder
            label="Internal Name"
            namespace="content"
            categoryLabel="Category"
            categoryValue={createCategory}
            categoryOptions={[
              { value: "lesson", label: "lesson" },
              { value: "message", label: "message" },
              { value: "ui", label: "ui" }
            ]}
            categoryPlaceholder="Choose a category"
            slugLabel="Name"
            slugValue={createSlug}
            slugPlaceholder="onboarding"
            onCategoryChange={setCreateCategory}
            onSlugChange={(value) =>
              setCreateSlug(
                value
                  .trim()
                  .toLowerCase()
                  .replace(/\s+/g, "_")
                  .replace(/[^a-z0-9_.-]/g, "")
              )
            }
            helperNote="This is the system name used to organize this item. We build most of it for you to keep it consistent."
            examples={[
              "Content example: content.lesson.onboarding",
              "Content example: content.message.welcome"
            ]}
            previewLabel="Full internal name"
            previewValue={`content.${createCategory}.${createSlug}`.replace(/\.+$/g, "")}
            notice={
              !createCategory
                ? {
                    tone: "info",
                    text: "Choose a category to finish building the internal name."
                  }
                : null
            }
            slugHint="Use lowercase letters, numbers, dots, dashes, or underscores."
          />
        }
        titleLabel="Display Title"
        titleValue="New Guided Workspace Item"
        titlePlaceholder="Title people will recognize"
        onTitleChange={() => undefined}
        payloadLabel="Content Details (JSON)"
        payloadValue='{"en":"Welcome content"}'
        payloadPlaceholder='{"en":"Welcome content"}'
        payloadHint="Use a starter option if you want a safe structure to begin with."
        onPayloadChange={() => undefined}
        templates={[{ id: "welcome", label: "Starter: Welcome Message" }]}
        onTemplateSelect={() => undefined}
        saving={false}
        primaryActionLabel="Save New Item"
        primaryActionDisabled={!createCategory || !createSlug}
        onPrimaryAction={() => setCreateOpen(false)}
        onClose={() => setCreateOpen(false)}
      />

      <CategoryManagementDrawer
        open={categoryDrawerOpen}
        namespaceLabel="Content Workspace"
        title="Manage Content Categories"
        description="Update the category list used to build internal names in this tab."
        helperText="Keep this list clean and consistent. People will choose from these categories instead of typing them manually."
        items={[
          { id: "lesson", value: "lesson", label: "Lesson", enabled: true, sortOrder: 1 },
          { id: "message", value: "message", label: "Message", enabled: true, sortOrder: 2 },
          { id: "ui", value: "ui", label: "UI", enabled: false, sortOrder: 3 }
        ]}
        feedback={{ tone: "success", text: "Category changes are now live." }}
        onAddCategory={() => undefined}
        onLabelChange={() => undefined}
        onValueChange={() => undefined}
        onToggleEnabled={() => undefined}
        onReorder={() => undefined}
        onClose={() => setCategoryDrawerOpen(false)}
        onSaveDraft={() => setCategoryDrawerOpen(false)}
        onPublish={() => setCategoryDrawerOpen(false)}
        savingDraft={false}
        publishing={false}
      />

      <ConfigEditorDrawer
        open={editOpen}
        mode="edit"
        namespaceLabel="Content Workspace"
        title="Edit Draft"
        description="Update the selected item and publish when you are ready."
        keyLabel="Selected Item"
        keyValue="content.welcome.message"
        keyPlaceholder="content.lesson.onboarding"
        onKeyChange={() => undefined}
        keyReadOnly
        payloadLabel="Draft Details (JSON)"
        payloadValue='{"en":"Welcome to SheTrades"}'
        payloadPlaceholder='{"en":"Welcome content"}'
        payloadHint="Save your draft whenever you want to keep work in progress before publishing."
        onPayloadChange={() => undefined}
        feedback={{ tone: "info", text: "Publishing your changes live..." }}
        templates={[{ id: "welcome", label: "Starter: Welcome Message" }]}
        onTemplateSelect={() => undefined}
        saving={false}
        primaryActionLabel="Save Draft"
        secondaryActions={
          <>
            <Button variant="secondary">Publish Live</Button>
            <Button variant="secondary">View History</Button>
            <Button variant="ghost">Move To Trash</Button>
          </>
        }
        onPrimaryAction={() => setEditOpen(false)}
        onClose={() => setEditOpen(false)}
      />

      <ConfigPreviewDrawer
        open={previewOpen}
        loading={false}
        error=""
        title="Welcome Message"
        description="Review the current item details before editing or moving it to trash."
        closeLabel="Close"
        historyLabel="View History"
        editLabel="Edit"
        trashLabel="Move To Trash"
        restoreLabel="Restore"
        onClose={() => setPreviewOpen(false)}
        onHistory={() => undefined}
        onEdit={() => {
          setPreviewOpen(false);
          setEditOpen(true);
        }}
        onTrashOrRestore={() => undefined}
        formatPayload={(payload) => JSON.stringify(payload ?? {}, null, 2)}
        getStatusLabel={() => "Draft Ready"}
        getTypeFieldLabel={() => "Content Kind"}
        getTypeLabel={() => "Message Content"}
        detail={{
          document: {
            id: "demo-content-welcome",
            key: "content.welcome.message",
            type: "ui_copy",
            title: "Welcome Message",
            updatedAt: "2026-05-17T10:00:00.000Z",
            isActive: true
          },
          draft: {
            id: "v4",
            versionNumber: 4,
            payload: { en: "Welcome to SheTrades" }
          },
          published: {
            id: "v3",
            versionNumber: 3,
            payload: { en: "Welcome to SheTrades" }
          }
        }}
        history={[
          { id: "v4", versionNumber: 4, state: "draft" },
          { id: "v3", versionNumber: 3, state: "published" },
          { id: "v2", versionNumber: 2, state: "archived" }
        ]}
      />
    </div>
  );
}
