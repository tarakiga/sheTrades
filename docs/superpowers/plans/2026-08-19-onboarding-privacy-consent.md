# Onboarding Privacy Notice and Consent Gate

> **Shipped 2026-08-22**, staging revision 00123-2s2. Every task below is done
> and verified against the deployed service, except the two items under "Out of
> scope" and the handbook refresh noted at the end.

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

**On the notice wording itself:** the client's draft goes in as-is and is treated
as a placeholder. It is a config document, so replacing it later is an edit under
Content with draft, publish and rollback — no deploy, no developer. Nothing in
this plan depends on the final wording, only on its length and its published
version number.

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

- [x] Add an append-only `consent_events` table: `id`, `userId`,
      `decision` (`accepted` | `declined`), `noticeVersion`, `noticeKey`,
      `language`, `decidedAt`. One row per decision, never updated.
- [x] Add `consentVersion` and `consentDecidedAt` to `users` as the fast path,
      so the gate is one read rather than a sort over history. The log remains
      the compliance artefact; the columns are a cache of its latest row.
- [x] Add `consent_events` to `CLEAR_TABLES` in the reset script, next to the
      other learner tables.
- [x] Mirror the table in the bootstrap SQL, with **quoted** camelCase column
      names — Postgres folds unquoted identifiers to lowercase and Prisma will
      then not find them.

## Task 2: The notice as editable, translatable content

**Files:** `backend/src/config-platform/seed-bot-prompts.ts` or a new seed.

- [x] Seed the notice under `bot.prompt.privacy_notice` so it resolves through
      the existing `getPrompt(key, lang, fallback)` path and is editable under
      Content with draft/publish, version history and rollback.
- [x] Seed the two button labels and the EXIT acknowledgement the same way.
- [x] The published **version number** of that document is what gets written to
      `consent_events.noticeVersion`.
- [ ] **NOT DONE - marked complete in error, corrected 2026-08-22.** Add a
      publish-time length check against `WHATSAPP_LIMITS.interactiveBody` for
      this key, so an over-long notice is refused at publish rather than failing
      at send. Verified absent: `validatePayloadForType` in
      `config-platform/postgres-service.ts` switches on document type and
      `ui_copy` falls through to `default: return payload`, unvalidated. The
      editor shows no character counter either. So an admin can publish a
      1,500-character notice, WhatsApp will reject the whole first message to
      every new learner, and - because the sender swallows failures - nobody
      will be told. The translation workspace enforces per-field limits; this
      still needs to extend the same idea to the notice.

## Task 3: Language first

**Files:** `backend/src/whatsapp/handler.ts`.

- [x] New sessions start at `awaiting_language`, not `awaiting_name`.
- [x] The language prompt is now the **first thing a stranger sees**, so its copy
      cannot greet her by name (it currently says "Thanks {name}. Choose your
      language:", which would render as "Thanks ."). New language-neutral copy,
      listing the languages in their own names.
- [x] `awaiting_language` advances to the new consent state rather than to
      `awaiting_state`.
- [x] Existing in-flight sessions keep working. Do not migrate anyone's state;
      the old handlers stay for anyone mid-flow when this ships.

## Task 4: The consent gate

**Files:** `backend/src/whatsapp/handler.ts`.

- [x] New state `awaiting_privacy_consent`, entered after a language is chosen.
- [x] Renders the notice with two buttons.
- [x] **CONTINUE** — write an `accepted` row with the notice version, set the
      cached columns, advance to `awaiting_name`.
- [x] **EXIT** — write a `declined` row, send the acknowledgement, and leave her
      in a state that shows the notice again if she writes back.
- [x] Anything that is neither button re-sends the notice. Do not interpret free
      text as consent.
- [x] The gate must sit **in front of every other state handler**, so no path
      into the flow bypasses it.

## Task 5: ~~Participants who onboarded before this existed~~

Dropped. There is no real participant data on the platform, so there is nobody
to catch up. The gate applies to everyone from first contact.

## Task 6: Make consent visible to operators

**Files:** `backend/src/routes/admin.ts`, `dashboard/components/users/LearnerDetailDrawer.tsx`.

- [x] Add consent status, date and notice version to the learner drawer. An
      operator asked "did she agree, and to what?" should not need a developer
      and a database client.

## Task 7: Erasure on request

The notice promises she can ask for deletion, so the promise needs something
behind it before the notice goes live. Three decisions are settled: rewards are
de-identified rather than deleted, erasure is immediate rather than queued for
an operator, and a separate log records that it happened.

### What the database makes hard

- **Everything except certificates is `ON DELETE RESTRICT`** (sessions,
  progress, quiz attempts, rewards). A single `DELETE FROM users` fails. Erasure
  has to be an ordered transaction, which is the right shape anyway because the
  rows are not all treated alike.
- **`outbound_messages` has no foreign key** — it stores a bare phone string. It
  will not cascade and will not block. Miss it and the erasure reports success
  while leaving her number, and any message staff sent her, in the database.
  This is the one that has to be handled by hand.
- **Certificates cascade**, so her public verification link stops resolving. She
  must be told that before she confirms, not discover it when an employer tries
  the link.

### Reward de-identification

Rewards are money actually paid, and donors will want a reconcilable trail.

- [x] New `reward_archive` table: `module`, `amount`, `channel`, `status`,
      `issuedAt`, `providerTxnId`, `archivedAt`. No `userId`, no phone, no name.
- [x] On erasure, copy each reward row into it, then delete the rewards.

Call this **de-identified, not anonymous, and say so in the code**: the provider
transaction id stays, because reconciliation against the airtime provider is the
entire point of keeping the record, and the provider can still resolve that id to
a number. Anonymising it would destroy the audit value it exists for. If that
trade is not acceptable to the client, the alternative is to hash it and lose
reconciliation.

### The erasure transaction

- [x] One transaction, in this order:
      1. copy `rewards` → `reward_archive`
      2. delete `certificates`
      3. delete `rewards`
      4. delete `quiz_attempts`
      5. delete `user_progress`
      6. delete `user_sessions`
      7. delete `consent_events`
      8. delete `outbound_messages` where `phone` matches
      9. delete `users`
      10. write the erasure log row
- [x] Anything that throws rolls the whole thing back. A partial erasure is
      worse than none, because it reports done.

### The erasure log

- [x] New `erasure_log` table: `id`, `requestRef`, `requestedVia`
      (`bot` | `admin`), `decidedAt`, `tableCounts` (JSON of what was removed),
      `actorId` for an admin-initiated erasure. **No phone, no name, no user id.**
- [x] `requestRef` is a short random reference given to her in the confirmation
      message, so she can quote it without us holding anything identifying.

### The bot path

- [x] A privacy row on the main menu leading to a short explanation and a
      "Delete my information" action.
- [x] Confirmation step stating plainly, in her language, what she loses: her
      progress, and any certificate along with its verification link. Irreversible.
- [x] On confirm: run the transaction, reply with the reference, stop.
- [x] All copy is config, in the same place as the rest of the bot's wording.

### The admin path

- [x] An erase action on the learner drawer, for someone who phones or emails
      instead of using the bot. Admin role only, confirmed, and it writes the
      same log with `requestedVia: "admin"` and the actor recorded.

### Tests

- [x] The transaction removes every table listed, `outbound_messages` included —
      assert on a learner who has one.
- [x] A learner holding a certificate: it goes, and its public page 404s.
- [x] Rewards land in the archive with no identifiers, and the counts match.
- [x] A mid-transaction failure leaves everything intact.
- [x] The erasure log row contains nothing that identifies anyone.

## Task 8: Verify

- [x] Unit tests for the gate: accept, decline, re-entry after decline, garbage
      input, and a participant with no consent record who is mid-programme.
- [x] Assert the rendered notice is within the interactive-body limit, for every
      published language.
- [x] Walk the whole flow in the **WhatsApp sandbox** (Settings → Integration).
      It exercises real published copy without a real phone or a real learner.
- [x] Then one pass on a real handset before it reaches participants.

## Task 9: Documentation

- [x] Note in `handoff.md` that consent is recorded, where, and what the version
      number refers to.
- [ ] **Deferred:** the operator handbook's onboarding description, the Content
      section, and the learner-drawer screenshot. The client is replacing the
      notice wording, and the handbook screenshots would be re-shot against
      copy that is about to change. Refresh it once the final text is
      published — the capture script in `docs/handoff/source/capture.mjs`
      re-takes all twenty in one run.
- [ ] **Blocked on the client:** update the full privacy policy in step with the
      notice, so the two do not contradict each other. The policy still has no
      certificate section and still promises a retention period nothing
      enforces.

---

## Out of scope

- Translating the notice into Pidgin and Igbo. Those languages are still shown
  as coming soon; the notice will be drafted for translation with the rest of
  the content when they are enabled.
- Retention. The notice says information is kept only as long as necessary, and
  there is still no retention period implemented. That commitment should not be
  published in a consent notice until something enforces it.
