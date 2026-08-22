# Onboarding Privacy Notice and Consent Gate

**Goal:** put a privacy notice in front of data collection, in the participant's
own language, and record her answer.

**Requested flow:** Language → Privacy Notice → Continue/Exit → Name → Location →
Learning Programme.

**Current flow (verified in `handler.ts`):** Name → Language → Location → Main
menu. States are `awaiting_name` → `awaiting_language` → `awaiting_state` →
`main_menu`.

So this is two structural changes and one addition the client's specification
does not mention.

---

## The addition: consent has to be recorded

There is **no consent field anywhere in the database**. Nothing records that a
participant agreed, when, or to which wording.

A consent flow that leaves no record is decoration. The NDPA obligation is not
"show a notice", it is "be able to demonstrate that this person consented" — and
if a participant or the NDPC asks in eighteen months what she agreed to and when,
the honest answer today would be that we cannot say.

The notice is also a config document that admins can edit. Without a version
recorded against each consent, "she accepted the privacy notice" means nothing,
because the notice has changed since.

This is the part of the work that carries the compliance value. The buttons are
the easy half.

## What the client's ordering gets right

Putting the notice immediately after language selection means **the only data
held at the moment of the decision is her phone number and her language choice**.
Name and location have not been asked yet. So EXIT is clean: there is almost
nothing to delete, and what remains is what was strictly needed to deliver the
notice itself in a language she can read.

That property is worth protecting. Nothing else should be collected before the
gate.

---

## Decisions needed before implementation

1. **What does EXIT do?** Recommendation: record the decline, reply with a short
   message saying she can begin any time by sending another message, and keep
   only her number and language. Not a permanent block — messaging again shows
   the notice again. A one-way door would be worse for her and harder to defend
   than a reversible choice.

2. ~~**Existing participants.**~~ **Settled:** there is no real participant data
   on the platform yet, so there is nobody to grandfather. The gate applies to
   everyone, and Task 5 is dropped. Any test records still present should be
   cleared with `npm run ops:reset-learner-data` before launch rather than
   carried across.

3. **Re-consent when the notice changes.** Recommendation for this phase: record
   the version, and give admins a deliberate "require everyone to accept again"
   action for material changes. Do not re-prompt automatically on every edit, or
   a typo fix interrupts every learner mid-lesson.

4. **Should the notice mention certificates and the airtime partner?** Both are
   currently absent. Her certificate carries her name on a page anyone with the
   link can open, and her number is shared with an airtime provider. About 180
   characters covers both, taking the notice to roughly 935 of the 1024 limit —
   which leaves the translations very little room. The alternative is to leave
   the short notice as it is and carry both in the full policy, mentioning the
   public certificate again at the moment one is issued. My preference is the
   second, because the bot already pauses there to confirm her name.

---

## Character budget

Measured: the notice as drafted is **756 characters** with a real URL, against
WhatsApp's **1024** limit for an interactive message body. Buttons `CONTINUE`
(8) and `EXIT` (4) are well inside the 20-character cap.

Over 1024 WhatsApp **rejects the whole message** rather than truncating it, so
an overrun means her very first interaction fails silently. Pidgin and Igbo
typically run longer than English for the same meaning, so the length has to be
enforced at publish time, not discovered at send time.

---

## Task 1: Record consent

**Files:** `backend/prisma/schema.prisma`, a migration, the bootstrap SQL mirror,
`backend/src/ops/reset-learner-data.ts`.

- [ ] Add an append-only `consent_events` table: `id`, `userId`,
      `decision` (`accepted` | `declined`), `noticeVersion`, `noticeKey`,
      `language`, `decidedAt`. One row per decision, never updated.
- [ ] Add `consentVersion` and `consentDecidedAt` to `users` as the fast path,
      so the gate is one read rather than a sort over history. The log remains
      the compliance artefact; the columns are a cache of its latest row.
- [ ] Add `consent_events` to `CLEAR_TABLES` in the reset script, next to the
      other learner tables.
- [ ] Mirror the table in the bootstrap SQL, with **quoted** camelCase column
      names — Postgres folds unquoted identifiers to lowercase and Prisma will
      then not find them.

## Task 2: The notice as editable, translatable content

**Files:** `backend/src/config-platform/seed-bot-prompts.ts` or a new seed.

- [ ] Seed the notice under `bot.prompt.privacy_notice` so it resolves through
      the existing `getPrompt(key, lang, fallback)` path and is editable under
      Content with draft/publish, version history and rollback.
- [ ] Seed the two button labels and the EXIT acknowledgement the same way.
- [ ] The published **version number** of that document is what gets written to
      `consent_events.noticeVersion`.
- [ ] Add a publish-time length check against `WHATSAPP_LIMITS.interactiveBody`
      for this key specifically, so an over-long translation is refused at
      publish rather than failing at send. The translation workspace already
      enforces per-field limits; this extends the same idea to the notice.

## Task 3: Language first

**Files:** `backend/src/whatsapp/handler.ts`.

- [ ] New sessions start at `awaiting_language`, not `awaiting_name`.
- [ ] The language prompt is now the **first thing a stranger sees**, so its copy
      cannot greet her by name (it currently says "Thanks {name}. Choose your
      language:", which would render as "Thanks ."). New language-neutral copy,
      listing the languages in their own names.
- [ ] `awaiting_language` advances to the new consent state rather than to
      `awaiting_state`.
- [ ] Existing in-flight sessions keep working. Do not migrate anyone's state;
      the old handlers stay, and Task 5 catches anyone without consent.

## Task 4: The consent gate

**Files:** `backend/src/whatsapp/handler.ts`.

- [ ] New state `awaiting_privacy_consent`, entered after a language is chosen.
- [ ] Renders the notice with two buttons.
- [ ] **CONTINUE** — write an `accepted` row with the notice version, set the
      cached columns, advance to `awaiting_name`.
- [ ] **EXIT** — write a `declined` row, send the acknowledgement, and leave her
      in a state that shows the notice again if she writes back.
- [ ] Anything that is neither button re-sends the notice. Do not interpret free
      text as consent.
- [ ] The gate must sit **in front of every other state handler**, so no path
      into the flow bypasses it.

## Task 5: ~~Participants who onboarded before this existed~~

Dropped. There is no real participant data on the platform, so there is nobody
to catch up. The gate applies to everyone from first contact.

## Task 6: Make consent visible to operators

**Files:** `backend/src/routes/admin.ts`, `dashboard/components/users/LearnerDetailDrawer.tsx`.

- [ ] Add consent status, date and notice version to the learner drawer. An
      operator asked "did she agree, and to what?" should not need a developer
      and a database client.

## Task 7: Verify

- [ ] Unit tests for the gate: accept, decline, re-entry after decline, garbage
      input, and a participant with no consent record who is mid-programme.
- [ ] Assert the rendered notice is within the interactive-body limit, for every
      published language.
- [ ] Walk the whole flow in the **WhatsApp sandbox** (Settings → Integration).
      It exercises real published copy without a real phone or a real learner.
- [ ] Then one pass on a real handset before it reaches participants.

## Task 8: Documentation

- [ ] Update the operator handbook's onboarding description and the Content
      section, since the notice is editable there.
- [ ] Update the full privacy policy in step with the notice, so the two do not
      contradict each other.
- [ ] Note in `handoff.md` that consent is recorded, where, and what the version
      number refers to.

---

## Out of scope

- Translating the notice into Pidgin and Igbo. Those languages are still shown
  as coming soon; the notice will be drafted for translation with the rest of
  the content when they are enabled.
- A self-service deletion request path. The notice says she can ask; how that
  request is received and actioned is an operational process, not a bot feature,
  and should be settled before the notice promises it.
- Retention. The notice says information is kept only as long as necessary, and
  there is still no retention period implemented. That commitment should not be
  published in a consent notice until something enforces it.
