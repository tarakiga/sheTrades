# Content Type Labeling And Category Mapping

## Goal

Remove confusing raw backend type labels like `ui_copy` from the `/settings` content workspace and make new content creation choose the correct backend document type automatically from the guided category selection.

## Approved Direction

- Keep backend document types unchanged.
- Hide raw technical type names from admins.
- Auto-map content categories to backend content types during create.
- Show friendly content kind labels everywhere the admin can inspect an item.
- Keep the change scoped to the settings workspace and current content categories.

## Why This Change

The current content tab has two separate concepts that are not obvious to non-technical admins:

- the internal name, such as `content.message.welcome`
- the backend document type, such as `ui_copy`

Today the create flow always sends `ui_copy` for content items, even when the internal name category suggests a different content kind. That creates two product problems:

- admins see a raw technical label that does not help them make decisions
- lesson-oriented items are not automatically created as `lesson_content`

This design keeps the backend model intact while making the admin experience clearer, safer, and more aligned with the guided naming workflow.

## Scope

This design covers:

- content-tab create behavior in `/settings`
- human-readable display labels for content document types
- category-to-type mapping for new content items
- preview and table surfaces that show content kind information

This design does not cover:

- backend schema changes
- changing option-set or legal document behavior
- introducing a separate content-kind management system
- changing the existing internal-name format rules

## Source Of Truth

The existing backend type contract remains the source of truth for persisted document types:

- `lesson_content`
- `ui_copy`

The existing managed content category option set remains the source of truth for category selection:

- `options.settings.content_categories`

This design only adds a deterministic UI mapping layer between the selected content category and the backend type sent on create.

## Mapping Rules

When an admin creates a new item in the `Content` tab, the selected guided category determines the backend type:

- `lesson` -> `lesson_content`
- `message` -> `ui_copy`
- `ui` -> `ui_copy`

If a future category does not have an explicit mapping, the create flow should safely fall back to the current content default type rather than failing.

This keeps the system resilient if admins later add new categories before a broader taxonomy enhancement exists.

## Admin-Facing Labels

Admins should never see raw backend type strings in the settings UI.

Friendly labels should be used instead:

- `lesson_content` -> `Lesson Content`
- `ui_copy` -> `Message Content`
- `option_set` -> `Option Set`
- `legal_block` -> `Legal Block`

For content rows specifically, the label should be understood as content kind rather than a technical storage type.

If a future or unknown type appears, the UI should use a safe fallback label such as `Saved Item` rather than exposing an implementation detail.

## Create Flow Behavior

The guided internal-name builder remains the primary creation model:

- namespace is read-only
- category is selected from managed data
- slug is typed manually
- full internal name preview updates live

The only behavioral change is how the content type is chosen:

- the `Content` tab no longer blindly uses the tab default type for every new item
- it resolves the backend type from the selected category before sending the create request

The admin does not need to choose or understand the backend type directly.

## Existing Item Presentation

Existing content items should display a human-readable content kind wherever item details are shown.

This should apply to:

- table metadata if content kind is shown
- preview drawer details
- any other current settings surfaces that render `document.type`

This must work for both newly created items and older items already stored in the system.

## Error Handling And Fallbacks

The mapping layer should be intentionally forgiving.

- if the selected category is empty, the existing create validation should continue blocking save
- if the selected category is known, the mapped backend type should be used
- if the selected category is unknown, the flow should fall back to the current content default type
- if a stored type is unknown when rendering, the UI should show a neutral fallback label

The goal is to improve clarity without making the workflow brittle.

## Implementation Shape

The change should stay small and local:

- add friendly type-label helpers in the settings UI layer
- add content-category-to-type resolution for create requests
- update preview details to use friendly labels instead of raw type strings
- keep backend contracts and allowed namespaces unchanged

This avoids unnecessary schema or API churn while solving the actual admin experience problem.

## Testing And Verification

Verification should confirm:

- creating `content.lesson.onboarding` sends `lesson_content`
- creating `content.message.welcome` sends `ui_copy`
- creating `content.ui.banner` sends `ui_copy`
- preview drawers show friendly labels instead of raw type strings
- existing option and legal behavior remains unchanged
- no TypeScript or lint issues are introduced in edited files

## Risks

The main risk is overfitting the mapping to the current seed categories.

That risk is acceptable for this step because:

- the current categories are intentionally seeded and admin-managed
- the mapping includes a safe fallback
- a future taxonomy expansion can extend the mapping cleanly without breaking existing items

## Result

After this change, the content workspace stays non-technical for admins:

- naming stays guided
- content kind is chosen automatically
- raw labels like `ui_copy` disappear from the UI
- lessons and messages align more naturally with the data model already supported by the backend
