# Reflection Questions & Help Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop marking honest check-in answers ("Not yet", "I need help") as wrong, and turn a help request into a follow-up record instead of discarding it.

**Architecture:** Add an optional `kind` discriminator to the quiz item contract (`"scored"` default, `"reflection"` new) plus an optional `helpOptionIndex`. Absent fields mean today's exact behaviour, so all 43 live lessons are untouched until a human marks a question as reflective. The handler branches on `kind` before scoring; reflection answers always advance, and selecting the help option additionally sets the existing `User.flaggedForFollowUp` / `followUpNote` columns and emits a `help_requested` analytics event.

**Tech Stack:** TypeScript, Express 5, Prisma 7 (`@prisma/adapter-pg`), Zod 4, `node:test` + `tsx`, Next.js 16 App Router (dashboard).

---

## Background — why this exists

A tester found that in Module 2 Lesson 6, the quiz question *"Did you run a chat backup or set up a WhatsApp Business tool today?"* marks **"I need help migrating"** as ❌ incorrect and re-shows the same question.

Verified findings:

- The question is a **check-in**, not a knowledge test. It asks what the learner *did*, not what they *know*. There is no correct answer, but it is stored with an `answerIndex` like every other question.
- **"Not yet" is also marked incorrect** — the tester missed this, and it is the worse case. There is no retry limit ([handler.ts:1011-1023](../../../backend/src/whatsapp/handler.ts)), so the only exits are MENU (abandons the lesson) or claiming "Yes".
- At least **11 lessons** share this shape at question 1: `m1_l2`, `m1_l3`, `m1_l6`, `m1_l8`, `m2_l6`, `m2_l8`, `m3_l4`, `m3_l5`, `m3_l7`, `m3_l8`, `m4_l1`. The six lessons in `lessons.seed.json` are all genuine knowledge questions — the reflective style was authored later through the admin UI into a schema that only understands right and wrong.
- Completion gates money: all-correct → `completedLessons.push` → last lesson → `module_completed` → [`prisma.reward.upsert`](../../../backend/src/whatsapp/handler.ts) → real airtime. **The only path to a reward runs through claiming "Yes"**, which corrupts the completion data TechHer reports to funders.

### Why not the originally suggested fix

The tester proposed re-sending the lesson body when "I need help" is chosen. Rejected because:

1. It leaves "Not yet" broken.
2. Detecting the option requires string-matching, and the text varies per lesson (`"I need help migrating"`, `"I need help finding it"`, `"I tried but need help with the formula"`). After translation to Pidgin/Igbo an English match **silently stops working in the languages most learners use** — exactly what the CLAUDE.md no-hardcoded-values mandate forbids.
3. Re-sending compounds the over-limit body problem (27 of 43 lessons already breach the 1024-char cap).
4. Tap help → lesson re-sent → question re-asked → tap help again = new infinite loop.
5. There is **no lesson re-read command in the bot at all**, so it needs building regardless.

### Decisions already resolved

**Reward integrity needs no extra machinery.** Scored questions already must be answered correctly to advance (the retry loop enforces it), so by the time a lesson completes, every scored question in it is necessarily correct. Reflection answers advance freely without weakening that. A lesson containing *only* reflection questions will complete without proving knowledge — which is correct, because those lessons *are* check-ins.

**Out of scope (YAGNI):** a `LESSON` re-read command. Nothing in the bot supports re-reading today, the help acknowledgement does not need it, and adding a new conversation state increases the chance of a new trap. Track separately if the content team wants it.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `backend/src/config-platform/runtime-config.ts` | `RuntimeLesson` contract + payload normalisation | Modify — add `kind`, `helpOptionIndex` to the quiz item |
| `backend/src/whatsapp/handler.ts` | Conversation state machine, quiz scoring, analytics buffer | Modify — extract option resolver, add reflection branch, `help_requested` event |
| `backend/src/whatsapp/handler.test.ts` | Quiz matching unit tests | Modify — add resolver + reflection tests |
| `backend/src/config-platform/runtime-config.test.ts` | Lesson normalisation tests | Create |
| `docs/config-seeds/admin-ui-copy.seed.json` | Bot copy (config, not code) | Modify — add `bot.quiz.help_ack` |
| `dashboard/components/config/ConfigEditorDrawer.tsx` | Admin lesson/quiz builder | Modify — question-type toggle + help-option picker |
| `docs/reflection-question-candidates.md` | Backfill worksheet for the content team | Create |
| `task-list.md`, `handoff.md` | Tracking | Modify |

---

## Task 1: Extract a reusable, clip-tolerant option resolver

`isQuizReplyCorrect` already contains clip-tolerant matching (added when we fixed the 20-char WhatsApp button truncation bug). The reflection branch needs to know **which** option was picked, not just whether it was right — and it must use the *same* matcher.

This matters concretely: `"I need help migrating"` is 21 characters. WhatsApp clips reply-button titles to 20 and echoes back `"I need help migratin"`. A naive equality check would never match it.

**Files:**
- Modify: `backend/src/whatsapp/handler.ts` (the `isQuizReplyCorrect` function)
- Test: `backend/src/whatsapp/handler.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/whatsapp/handler.test.ts`:

```ts
import { isQuizReplyCorrect, resolveQuizOptionIndex } from "./handler.js";

// Real Module 2 Lesson 6 check-in options. Option 1 is 21 chars, so WhatsApp
// clips its button title to "I need help migratin" — the resolver must still
// identify it, or the help path silently never fires on real devices.
const M2_L6_Q1 = ["Yes, system is set", "I need help migrating", "Not yet"];

test("resolveQuizOptionIndex matches a clipped button title", () => {
  assert.equal(resolveQuizOptionIndex("I need help migratin", M2_L6_Q1), 1);
});

test("resolveQuizOptionIndex matches full option text", () => {
  assert.equal(resolveQuizOptionIndex("I need help migrating", M2_L6_Q1), 1);
});

test("resolveQuizOptionIndex accepts a 1-based numeric reply", () => {
  assert.equal(resolveQuizOptionIndex("3", M2_L6_Q1), 2);
});

test("resolveQuizOptionIndex accepts a numbered-prefix reply", () => {
  assert.equal(resolveQuizOptionIndex("2. I need help migrating", M2_L6_Q1), 1);
});

test("resolveQuizOptionIndex is case-insensitive", () => {
  assert.equal(resolveQuizOptionIndex("NOT YET", M2_L6_Q1), 2);
});

test("resolveQuizOptionIndex returns -1 for unmatched free text", () => {
  assert.equal(resolveQuizOptionIndex("what does this mean", M2_L6_Q1), -1);
});

test("isQuizReplyCorrect still passes after the resolver extraction", () => {
  assert.equal(isQuizReplyCorrect("Yes, system is set", M2_L6_Q1, 0), true);
  assert.equal(isQuizReplyCorrect("Not yet", M2_L6_Q1, 0), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx tsx --test src/whatsapp/handler.test.ts`
Expected: FAIL — `resolveQuizOptionIndex is not exported` / TypeScript error `has no exported member 'resolveQuizOptionIndex'`.

- [ ] **Step 3: Extract the resolver**

In `backend/src/whatsapp/handler.ts`, replace the body of `isQuizReplyCorrect` with a delegating implementation and export the new resolver:

```ts
/**
 * Resolve which option a learner's reply refers to, or -1 if none.
 *
 * Tolerant of the three shapes a reply can arrive in:
 *   - a 1-based number ("2") or numbered prefix ("2." / "2)")
 *   - the full option text (dashboard sandbox echoes it untruncated)
 *   - the option text CLIPPED to 20 chars (real WhatsApp reply buttons)
 *
 * The clipped case is not theoretical: "I need help migrating" is 21 chars,
 * so on a real device we only ever see "I need help migratin".
 */
export function resolveQuizOptionIndex(rawInput: string, options: string[]): number {
  const normalized = rawInput.trim().toLowerCase();
  const strippedInput = normalized.replace(/^\d+\s*[.)]\s*/, "").trim();

  const leadingNumberMatch = normalized.match(/^(\d+)\s*[.)]/);
  const numericCandidate = leadingNumberMatch ? leadingNumberMatch[1] : normalized;
  if (/^\d+$/.test(numericCandidate)) {
    const oneBased = Number(numericCandidate);
    if (oneBased >= 1 && oneBased <= options.length) {
      return oneBased - 1;
    }
  }

  const matchesOption = (opt: string): boolean => {
    const o = opt.trim().toLowerCase();
    const clipped = clip(o, BUTTON_TITLE_MAX);
    return normalized === o || strippedInput === o || normalized === clipped || strippedInput === clipped;
  };

  return options.findIndex(matchesOption);
}

export function isQuizReplyCorrect(
  rawInput: string,
  options: string[],
  answerIndex: number
): boolean {
  return resolveQuizOptionIndex(rawInput, options) === answerIndex;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx tsx --test src/whatsapp/handler.test.ts`
Expected: PASS — all pre-existing tests plus the 7 new ones. The pre-existing suite is the regression guard for the clipping fix; if any of those fail, the extraction changed behaviour and must be corrected, not the test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/whatsapp/handler.ts backend/src/whatsapp/handler.test.ts
git commit -m "refactor(bot): extract clip-tolerant resolveQuizOptionIndex

isQuizReplyCorrect now delegates to it. The reflection-question branch needs
to know WHICH option was chosen, not just whether it was correct, and must
reuse the same 20-char-clip tolerance — 'I need help migrating' is 21 chars,
so real WhatsApp only ever echoes 'I need help migratin'."
```

---

## Task 2: Extend the lesson contract with `kind` and `helpOptionIndex`

**Files:**
- Modify: `backend/src/config-platform/runtime-config.ts:236-240` (type) and `:260-266` (normalisation)
- Test: `backend/src/config-platform/runtime-config.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/src/config-platform/runtime-config.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeQuizItem } from "./runtime-config.js";

test("a legacy quiz item with no kind defaults to scored", () => {
  const item = normalizeQuizItem({
    question: "What is 2+2?",
    options: ["4", "5", "6"],
    answerIndex: 0
  });
  assert.equal(item.kind, "scored");
  assert.equal(item.helpOptionIndex, undefined);
  assert.equal(item.answerIndex, 0);
});

test("an explicit reflection item keeps its kind and help index", () => {
  const item = normalizeQuizItem({
    question: "Did you run a chat backup today?",
    options: ["Yes, system is set", "I need help migrating", "Not yet"],
    answerIndex: 0,
    kind: "reflection",
    helpOptionIndex: 1
  });
  assert.equal(item.kind, "reflection");
  assert.equal(item.helpOptionIndex, 1);
});

test("an unrecognised kind falls back to scored rather than throwing", () => {
  const item = normalizeQuizItem({
    question: "q",
    options: ["a", "b"],
    answerIndex: 0,
    kind: "banana"
  });
  assert.equal(item.kind, "scored");
});

test("an out-of-range helpOptionIndex is dropped", () => {
  const item = normalizeQuizItem({
    question: "q",
    options: ["a", "b"],
    answerIndex: 0,
    kind: "reflection",
    helpOptionIndex: 7
  });
  assert.equal(item.helpOptionIndex, undefined);
});

test("helpOptionIndex is ignored on a scored item", () => {
  const item = normalizeQuizItem({
    question: "q",
    options: ["a", "b"],
    answerIndex: 0,
    helpOptionIndex: 1
  });
  assert.equal(item.kind, "scored");
  assert.equal(item.helpOptionIndex, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx tsx --test src/config-platform/runtime-config.test.ts`
Expected: FAIL — `has no exported member 'normalizeQuizItem'`.

- [ ] **Step 3: Add the types and the exported normaliser**

In `backend/src/config-platform/runtime-config.ts`, replace the `quiz` member of `RuntimeLesson` (currently lines 236-240):

```ts
export type QuizItemKind = "scored" | "reflection";

export type RuntimeQuizItem = {
  question: LocalizedValue;
  options: LocalizedValue[];
  answerIndex: number;
  /**
   * "scored"     — a knowledge question with a right answer (default).
   * "reflection" — a check-in about what the learner DID. No right answer;
   *                every option is accepted. Marking "Not yet" wrong traps
   *                honest learners and pressures them into false claims,
   *                which corrupts completion data and reward payouts.
   */
  kind: QuizItemKind;
  /** Index of the "I need help" option, when kind === "reflection". */
  helpOptionIndex?: number;
};
```

and in `RuntimeLesson`:

```ts
  quiz: RuntimeQuizItem[];
```

Add the exported normaliser above `getRuntimeLessons()`:

```ts
/**
 * Normalise one raw quiz item from published config JSON.
 *
 * Backward compatible by construction: a legacy item with no `kind` becomes
 * "scored", which is exactly today's behaviour. Nothing changes for the 43
 * live lessons until a human marks a question as reflective in the admin UI.
 */
export function normalizeQuizItem(raw: any): RuntimeQuizItem {
  const kind: QuizItemKind = raw?.kind === "reflection" ? "reflection" : "scored";
  const options = Array.isArray(raw?.options) ? raw.options.map(normalizeLocalized) : [];

  const rawHelp = raw?.helpOptionIndex;
  const helpOptionIndex =
    kind === "reflection" &&
    typeof rawHelp === "number" &&
    Number.isInteger(rawHelp) &&
    rawHelp >= 0 &&
    rawHelp < options.length
      ? rawHelp
      : undefined;

  return {
    question: normalizeLocalized(raw?.question),
    options,
    answerIndex: typeof raw?.answerIndex === "number" ? raw.answerIndex : 0,
    kind,
    ...(helpOptionIndex !== undefined ? { helpOptionIndex } : {})
  };
}
```

Then replace the inline quiz mapping inside `getRuntimeLessons()` (currently lines 260-266) with:

```ts
        quiz: (Array.isArray(payload.quiz) ? payload.quiz.map(normalizeQuizItem) : [])
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx tsx --test src/config-platform/runtime-config.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: exit 0, no output. If `handler.ts` errors on the new `kind` property being required, that is correct — `normalizeQuizItem` always sets it, so any literal quiz object in a test fixture needs `kind: "scored"` added.

- [ ] **Step 6: Commit**

```bash
git add backend/src/config-platform/runtime-config.ts backend/src/config-platform/runtime-config.test.ts
git commit -m "feat(content): add quiz item kind + helpOptionIndex to the lesson contract

Absent kind normalises to 'scored', so all 43 live lessons keep today's
behaviour until a human marks a question reflective. Out-of-range or
non-reflection helpOptionIndex values are dropped rather than trusted."
```

---

## Task 3: Add the bot copy for the help acknowledgement (config, not code)

Per the CLAUDE.md mandate this string is admin-editable and translatable, so it goes in the prompt registry with real Pidgin and Igbo variants — not an English literal in the handler.

**Important:** `getPrompt(key, lang, fallback)` looks up `BOT_PROMPT_CONFIG_PREFIX + key`, where the prefix is `"bot.prompt."` ([bot-prompts.ts:15](../../../backend/src/whatsapp/bot-prompts.ts)). So the short key is `quiz_help_ack` and the published config key is `bot.prompt.quiz_help_ack`. A seed entry keyed `bot.quiz.help_ack` would never be read.

**Files:**
- Modify: `backend/src/whatsapp/bot-prompts.ts` — `BOT_PROMPT_DEFAULTS` + the label map
- Modify: `docs/config-seeds/admin-ui-copy.seed.json`
- Test: `backend/src/config-platform/seed-copy-tokens.test.ts` (existing — its "all three languages" test covers the new entry automatically)

- [ ] **Step 1: Register the in-code default**

Add to `BOT_PROMPT_DEFAULTS` in `backend/src/whatsapp/bot-prompts.ts`, next to `incorrect_retry`:

```ts
  quiz_help_ack: {
    en: "No problem — thank you for telling us. We have noted that you need help with this one, and the team will follow up.\n\n",
    pcm: "No wahala — thank you for telling us. We don note say you need help for this one, and the team go follow up.\n\n",
    ig: "Nsogbu adịghị — daalụ maka ịgwa anyị. Anyị edeela na ị chọrọ enyemaka na nke a, ndị otu ga-akpọtụrụ gị.\n\n"
  },
```

and to the label map near `quiz_time_header: "Bot · Quiz time header"`:

```ts
  quiz_help_ack: "Bot · Help request acknowledgement",
```

- [ ] **Step 2: Add the seed entry**

Insert a new object into the top-level array in `docs/config-seeds/admin-ui-copy.seed.json`, immediately after the `bot.progress.summary` entry. Note the key must carry the `bot.prompt.` prefix:

```json
  {
    "key": "bot.prompt.quiz_help_ack",
    "title": "Chatbot - Help Request Acknowledgement",
    "content": {
      "en": "No problem — thank you for telling us. We have noted that you need help with this one, and the team will follow up.",
      "pcm": "No wahala — thank you for telling us. We don note say you need help for this one, and the team go follow up.",
      "ig": "Nsogbu adịghị — daalụ maka ịgwa anyị. Anyị edeela na ị chọrọ enyemaka na nke a, ndị otu ga-akpọtụrụ gị."
    }
  },
```

- [ ] **Step 3: Verify the seed file is still valid JSON and the copy tests pass**

Run: `cd backend && npx tsx --test src/config-platform/seed-copy-tokens.test.ts`
Expected: PASS — 3 tests. The "every seed entry defines copy for all three languages" test will fail if any language variant was left blank.

- [ ] **Step 3: Commit**

```bash
git add docs/config-seeds/admin-ui-copy.seed.json
git commit -m "feat(content): add bot.quiz.help_ack copy in en/pcm/ig

Admin-editable and translatable per the CLAUDE.md mandate, rather than an
English literal in the handler."
```

---

## Task 4: Branch the handler on question kind

This is the behavioural change. Reflection answers always advance; the help option additionally raises a signal.

**Files:**
- Modify: `backend/src/whatsapp/handler.ts` — `AnalyticsEvent` union (lines 20-31) and the quiz block (from line 871)

- [ ] **Step 1: Add the analytics event variant**

In the `AnalyticsEvent` union in `backend/src/whatsapp/handler.ts`, add:

```ts
  // A learner explicitly asked for help on a reflection question. This is the
  // highest-value signal the bot produces — previously it was scored as a
  // wrong answer and discarded.
  | { type: "help_requested"; lessonKey: string; module: string; questionIndex: number };
```

- [ ] **Step 2: Add the reflection branch**

In the quiz block, immediately after `const quizItem = activeLesson.quiz[qIndex];` and inside `if (quizItem) {`, insert this branch **before** the existing `const correctIndex = quizItem.answerIndex;` line:

```ts
        // Reflection questions have no right answer — they ask what the learner
        // DID, not what they know. Scoring them traps anyone who honestly
        // answers "Not yet" and pressures them into a false "Yes" to progress,
        // which is also the only path to a reward payout.
        if (quizItem.kind === "reflection") {
          const reflectionOptions = quizItem.options.map((o) => pickLocalized(o, lang));
          const selectedIndex = resolveQuizOptionIndex(safeText, reflectionOptions);

          if (selectedIndex < 0) {
            // Unrecognised free text: re-ask without any "incorrect" framing.
            return {
              state: session.state,
              reply:
                getPrompt("quiz_time_header", lang, "📚 Quiz Time! Question:\n") +
                `${pickLocalized(quizItem.question, lang)}\n` +
                reflectionOptions.map((opt, idx) => `${idx + 1}. ${opt}\n`).join("") +
                getPrompt("quiz_answer_prompt", lang, "\nReply with your answer (1, 2, or 3) or MENU to return."),
              buttons: quizAnswerButtons(reflectionOptions)
            };
          }

          const askedForHelp =
            quizItem.helpOptionIndex !== undefined && selectedIndex === quizItem.helpOptionIndex;

          if (askedForHelp) {
            session._events!.push({
              type: "help_requested",
              lessonKey: activeLesson.key,
              module: session.selectedModuleId ?? activeLesson.module ?? "Unknown",
              questionIndex: qIndex
            });
          }

          // Every reflection answer advances. Prefix the help acknowledgement
          // when one was requested, then fall through to the same advance path
          // a correct scored answer uses.
          const ackPrefix = askedForHelp
            ? getPrompt(
                "quiz_help_ack",
                lang,
                "No problem — thank you for telling us. We have noted that you need help with this one, and the team will follow up.\n\n"
              )
            : "";

          return advanceAfterAcceptedAnswer(session, activeLesson, moduleLessons, moduleNames, modulesMap, qIndex, lang, ackPrefix);
        }
```

- [ ] **Step 3: Extract the shared advance path**

The correct-answer path (currently inlined from roughly line 889 to line 1006) must be reused rather than duplicated. Extract it into a module-level function directly above `transition()`:

```ts
/**
 * Advance past an accepted answer: next question, next lesson, or module
 * complete. Shared by the scored-correct path and the reflection path so the
 * two can never drift — a reflection answer must produce the same completion,
 * reward and analytics side effects as a correct scored answer.
 *
 * `prefix` is prepended to whatever reply is produced (used for the help
 * acknowledgement).
 */
function advanceAfterAcceptedAnswer(
  session: UserSession,
  activeLesson: RuntimeLesson,
  moduleLessons: RuntimeLesson[],
  moduleNames: string[],
  modulesMap: Map<string, RuntimeLesson[]>,
  qIndex: number,
  lang: "en" | "pcm" | "ig",
  prefix = ""
): { state: ConversationState; reply: string; buttons?: string[]; list?: WhatsAppListSpec } {
  const isLastQuestion = qIndex >= activeLesson.quiz.length - 1;

  if (!isLastQuestion) {
    session.currentQuizIndex = qIndex + 1;
    session.lastUpdatedAt = nowIso();

    const nextQuizItem = activeLesson.quiz[qIndex + 1];
    if (!nextQuizItem) {
      session.awaitingQuizAnswer = false;
      session.currentQuizIndex = 0;
      return {
        state: session.state,
        reply: prefix + "Quiz state issue. Reply MENU to return.",
        buttons: ["MENU"]
      };
    }

    const nextOptions = nextQuizItem.options.map((o) => pickLocalized(o, lang));
    let nextReply = prefix;
    nextReply += getPrompt("quiz_time_header", lang, "📚 Quiz Time! Question:\n");
    nextReply += `${pickLocalized(nextQuizItem.question, lang)}\n`;
    nextOptions.forEach((opt, idx) => {
      nextReply += `${idx + 1}. ${opt}\n`;
    });
    nextReply += getPrompt("quiz_answer_prompt", lang, "Reply with your answer (1, 2, or 3) or MENU to return.");

    return { state: session.state, reply: nextReply, buttons: quizAnswerButtons(nextOptions) };
  }

  // Last question answered — mark the lesson complete.
  if (!session.completedLessons.includes(activeLesson.key)) {
    session.completedLessons.push(activeLesson.key);
  }
  session.awaitingQuizAnswer = false;
  session.currentQuizIndex = 0;
  session.lastUpdatedAt = nowIso();

  const completedInModule = moduleLessons.filter((l) =>
    session.completedLessons!.includes(l.key)
  ).length;
  const completionPercentage =
    moduleLessons.length > 0 ? Math.round((completedInModule / moduleLessons.length) * 100) : 0;
  session._events!.push({
    type: "lesson_completed",
    lessonKey: activeLesson.key,
    module: session.selectedModuleId ?? activeLesson.module ?? "Unknown",
    completionPercentage
  });

  const currentIdx = moduleLessons.findIndex((l) => l.key === activeLesson.key);
  const nextLesson = moduleLessons[currentIdx + 1];

  if (nextLesson) {
    session.currentLessonKey = nextLesson.key;
    let remainingText = "\n\nRemaining lessons in this module:\n";
    moduleLessons.slice(currentIdx + 1).forEach((l) => {
      remainingText += `- ${pickLocalized(l.title, lang)}\n`;
    });
    const replyBase = getPrompt(
      "correct_next",
      lang,
      "🎉 Correct! Excellent job. You have completed this lesson.\n\nReply NEXT to continue to the next lesson or MENU to return."
    );
    return {
      state: session.state,
      reply: prefix + replyBase + remainingText,
      buttons: ["NEXT", "MENU"]
    };
  }

  const completedModuleName = session.selectedModuleId ?? activeLesson.module ?? "Unknown";
  session._events!.push({ type: "module_completed", module: completedModuleName });
  session.currentLessonKey = null;
  session.selectedModuleId = null;

  const incompleteModules = moduleNames.filter((m) => {
    const ls = modulesMap.get(m) || [];
    return !ls.every((l) => session.completedLessons!.includes(l.key));
  });
  let incompleteText = "";
  if (incompleteModules.length > 0) {
    incompleteText = "\n\nOther incomplete modules:\n";
    incompleteModules.forEach((m) => {
      incompleteText += `- ${m}\n`;
    });
  }
  const replyBase = getPrompt(
    "correct_module_complete",
    lang,
    "🎉 Correct! Excellent job.\n\nCongratulations! You have completed all lessons in this module.\n\nReply MENU to choose another module."
  );
  return { state: session.state, reply: prefix + replyBase + incompleteText, buttons: ["MENU"] };
}
```

Then replace the entire inlined `if (isCorrect) { ... }` body in the scored path with:

```ts
        if (isCorrect) {
          return advanceAfterAcceptedAnswer(
            session, activeLesson, moduleLessons, moduleNames, modulesMap, qIndex, lang
          );
        } else {
```

leaving the existing incorrect-retry `else` block untouched.

- [ ] **Step 4: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: exit 0. If `modulesMap` or `moduleNames` are not in scope at the call sites, pass them through from where they are built earlier in `transition()` — do not rebuild them inside the helper.

- [ ] **Step 5: Run the full whatsapp suite**

Run: `cd backend && npx tsx --test src/whatsapp/*.test.ts`
Expected: PASS — all existing tests. The extraction must not change scored behaviour; a failure here means the refactor drifted.

- [ ] **Step 6: Commit**

```bash
git add backend/src/whatsapp/handler.ts
git commit -m "feat(bot): accept every answer to a reflection question

Reflection questions ask what a learner DID, not what they know. Scoring
them marked 'Not yet' and 'I need help' as wrong and looped the learner on
the same question with no retry limit — the only escape being MENU (which
abandons the lesson) or a false 'Yes'. Since module completion drives the
reward payout, the bot was effectively paying learners to misreport.

Selecting the designated help option now emits help_requested and prefixes
an acknowledgement, then advances like any accepted answer. The advance path
is extracted and shared with the scored-correct path so the two cannot drift."
```

---

## Task 5: Persist the help signal to the learner record

`User.flaggedForFollowUp` and `User.followUpNote` already exist ([schema.prisma:17-18](../../../backend/prisma/schema.prisma)) and already surface in the `/users` page — they are simply not wired to the bot.

**Files:**
- Modify: `backend/src/whatsapp/handler.ts` — `recordAnalytics()` (from line 1113)

- [ ] **Step 1: Handle the new event**

Inside the `for (const event of events)` loop in `recordAnalytics()`, add a branch alongside the existing ones:

```ts
      } else if (event.type === "help_requested") {
        // Raise the existing follow-up flag so the request lands in the
        // /users worklist instead of vanishing. Append rather than overwrite:
        // a learner may ask for help on several lessons.
        const stamp = new Date().toISOString().slice(0, 10);
        const note = `[${stamp}] Asked for help: ${event.lessonKey} (${event.module}, Q${event.questionIndex + 1})`;
        const existing = await prisma.user.findUnique({
          where: { id: session.userId },
          select: { followUpNote: true }
        });
        const merged = existing?.followUpNote ? `${existing.followUpNote}\n${note}` : note;
        await prisma.user.update({
          where: { id: session.userId },
          data: { flaggedForFollowUp: true, followUpNote: merged }
        });
        console.log(
          JSON.stringify({
            event: "analytics.help_requested",
            userId: session.userId,
            lessonKey: event.lessonKey,
            module: event.module,
            questionIndex: event.questionIndex,
            at: nowIso()
          })
        );
```

Note: `recordAnalytics` already wraps each event in try/catch and must never throw — do not add error handling that rethrows.

- [ ] **Step 2: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/whatsapp/handler.ts
git commit -m "feat(bot): raise the follow-up flag when a learner asks for help

flaggedForFollowUp/followUpNote already existed on User and already render
in the /users page — they were never wired to the bot. Notes append rather
than overwrite so repeated requests across lessons are all retained."
```

---

## Task 6: Admin quiz builder — question type and help option

Without this, only a developer editing raw JSON can mark a question reflective, which defeats the point of the config platform.

**Files:**
- Modify: `dashboard/components/config/ConfigEditorDrawer.tsx` — quiz state (line ~141), parse (~264-272), serialize (~334-339), setters (~465), render (~1281-1293)

- [ ] **Step 1: Widen the quiz state type**

Change the `quiz` state declaration:

```tsx
  const [quiz, setQuiz] = useState<
    Array<{
      question: LangObj;
      options: LangObj[];
      answerIndex: number;
      kind: "scored" | "reflection";
      helpOptionIndex: number | null;
    }>
  >([]);
```

- [ ] **Step 2: Parse the new fields**

In the parse block, extend the mapper:

```tsx
              answerIndex: typeof q?.answerIndex === "number" ? q.answerIndex : 0,
              kind: q?.kind === "reflection" ? "reflection" : "scored",
              helpOptionIndex:
                typeof q?.helpOptionIndex === "number" ? q.helpOptionIndex : null
```

- [ ] **Step 3: Serialize the new fields**

In the serialize block, extend the quiz mapper. Only emit the new keys when meaningful, so scored questions keep byte-identical payloads and do not produce spurious version-history diffs:

```tsx
          quiz: quiz.map((q) => ({
            question: toLocalized(q.question),
            options: q.options.filter((o) => o.en.trim().length > 0).map(toLocalized),
            answerIndex: q.answerIndex,
            ...(q.kind === "reflection" ? { kind: "reflection" } : {}),
            ...(q.kind === "reflection" && q.helpOptionIndex !== null
              ? { helpOptionIndex: q.helpOptionIndex }
              : {})
          }))
```

- [ ] **Step 4: Add the setters**

Next to `setQuizAnswerIndex`:

```tsx
  const setQuizKind = (index: number, kind: "scored" | "reflection") => {
    setQuiz((prev) =>
      prev.map((q, i) =>
        i === index ? { ...q, kind, helpOptionIndex: kind === "scored" ? null : q.helpOptionIndex } : q
      )
    );
  };

  const setQuizHelpOptionIndex = (index: number, optIdx: number) => {
    setQuiz((prev) =>
      prev.map((q, i) =>
        i === index ? { ...q, helpOptionIndex: q.helpOptionIndex === optIdx ? null : optIdx } : q
      )
    );
  };
```

Also update the "add question" handler so new questions carry the defaults:

```tsx
      { question: emptyLangObj(), options: [emptyLangObj(), emptyLangObj(), emptyLangObj()], answerIndex: 0, kind: "scored", helpOptionIndex: null }
```

- [ ] **Step 5: Render the controls**

Above the per-option choice list for each question, add a question-type toggle using the existing `Button` component and design tokens (no raw hex, no inline one-off styles — see CLAUDE.md rules 4 and 9):

```tsx
<div role="group" aria-label="Question type" style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
  <Button
    type="button"
    variant={qItem.kind === "scored" ? "primary" : "secondary"}
    aria-pressed={qItem.kind === "scored"}
    onClick={() => setQuizKind(qIdx, "scored")}
  >
    Knowledge question
  </Button>
  <Button
    type="button"
    variant={qItem.kind === "reflection" ? "primary" : "secondary"}
    aria-pressed={qItem.kind === "reflection"}
    onClick={() => setQuizKind(qIdx, "reflection")}
  >
    Check-in (no right answer)
  </Button>
</div>
```

When `qItem.kind === "reflection"`, hide the "correct answer" radio (it is meaningless) and render a help-option picker instead:

```tsx
{qItem.kind === "reflection" && (
  <Button
    type="button"
    variant={qItem.helpOptionIndex === optIdx ? "primary" : "secondary"}
    aria-pressed={qItem.helpOptionIndex === optIdx}
    onClick={() => setQuizHelpOptionIndex(qIdx, optIdx)}
  >
    {qItem.helpOptionIndex === optIdx ? "Help request ✓" : "Mark as help request"}
  </Button>
)}
```

- [ ] **Step 6: Typecheck and build the dashboard**

Run: `cd dashboard && npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Verify in the browser**

Start the dev server via `preview_start` (never `npm run dev` in Bash), open the config drawer for a lesson, and confirm:
- toggling to "Check-in" hides the correct-answer radio and shows the help picker
- toggling back to "Knowledge question" clears the help selection
- the serialized JSON in raw mode shows `kind`/`helpOptionIndex` only for reflection questions

Take a screenshot for the handoff entry.

- [ ] **Step 8: Commit**

```bash
git add dashboard/components/config/ConfigEditorDrawer.tsx
git commit -m "feat(admin): question-type toggle + help-option picker in the quiz builder

Reflection questions hide the correct-answer radio (it is meaningless) and
expose a help-request picker instead. Scored questions serialize byte
identically to before, so marking nothing produces no version-history noise."
```

---

## Task 7: Backfill worksheet for the content team

The ~11 candidate lessons must be confirmed by a human — some may be genuine knowledge questions that merely *sound* soft. Do not flip them automatically.

**Files:**
- Create: `docs/reflection-question-candidates.md`

- [ ] **Step 1: Generate the candidate list**

Run this against the live content export to list every question whose options contain a help-style choice:

```bash
cd "D:/work/Tar/PROJECTS/SHE-TRADES" && python -c "
import sys,csv; sys.stdout.reconfigure(encoding='utf-8')
rows=list(csv.DictReader(open('docs/quiz_option_labels_audit.csv',encoding='utf-8')))
seen=set()
for r in rows:
    t=r['option_text'].lower()
    if 'need help' in t or 'not yet' in t:
        k=(r['lesson'],r['question'])
        if k in seen: continue
        seen.add(k)
        print(f\"| {r['lesson']} | {r['module']} | Q{r['question']} | {r['title']} | | |\")
"
```

- [ ] **Step 2: Write the worksheet**

Create `docs/reflection-question-candidates.md` with the generated rows under this header:

```markdown
# Reflection question candidates — content team review

Each row is a quiz question whose options include a help-style or "not yet"
choice, which suggests it is a **check-in** rather than a knowledge question.

Marking a question as a check-in means every answer is accepted and the
learner advances. Do NOT mark a genuine knowledge question as a check-in —
that removes real assessment.

For each row, set Verdict to `check-in` or `knowledge`, and for check-ins name
which option is the help request.

| Lesson | Module | Q# | Lesson title | Verdict | Help option # |
|---|---|---|---|---|---|
```

- [ ] **Step 3: Commit**

```bash
git add docs/reflection-question-candidates.md
git commit -m "docs: reflection-question backfill worksheet for the content team

Candidates are listed for human verdict rather than flipped automatically —
some may be knowledge questions that merely sound soft, and mis-marking one
removes real assessment."
```

---

## Task 8: Update tracking docs

**Files:**
- Modify: `task-list.md`, `handoff.md`

- [ ] **Step 1: Mark the item resolved in task-list.md**

Replace the `R3-F8`-adjacent backlog area by adding, under the UX Review Round 3 section:

```markdown
- `[x]` **R3-reflection (HIGH): check-in questions scored as right/wrong.** "Not yet" and
  "I need help" were marked ❌ with no retry limit, trapping honest learners; since module
  completion drives the reward payout, the bot effectively paid learners to misreport.
  Fixed via a `kind: "scored" | "reflection"` discriminator on the quiz item (absent =
  scored, so live lessons were untouched) plus `helpOptionIndex`. Help requests now raise
  the existing `flaggedForFollowUp`/`followUpNote` fields. Content backfill pending —
  see `docs/reflection-question-candidates.md`.
```

- [ ] **Step 2: Append a handoff entry**

Add to `handoff.md` covering: the root cause, why the tester's re-send fix was rejected, the contract change, the shared `advanceAfterAcceptedAnswer` extraction, and the outstanding content backfill.

- [ ] **Step 3: Commit and merge**

```bash
git add task-list.md handoff.md
git commit -m "docs: record reflection-question fix + backfill handoff"
git checkout main && git merge --ff-only fix/reflection-questions && git push origin main
```

(Create the branch with `git checkout -b fix/reflection-questions` before Task 1 — the repo default branch is `main` and work should not be committed directly to it.)

---

## Verification before completion

- [ ] `cd backend && npm run typecheck` → exit 0
- [ ] `cd dashboard && npm run typecheck` → exit 0
- [ ] `cd backend && npx tsx --test src/whatsapp/*.test.ts src/config-platform/*.test.ts` → all pass
- [ ] Confirm the 5 pre-existing `webhook.test.ts` failures are unchanged (they fail without Postgres — verify against the pre-change commit, do not "fix" them here)
- [ ] Manual bot run: a lesson marked as a check-in accepts "Not yet" and advances; selecting the help option acknowledges, advances, and sets `flaggedForFollowUp` on the learner row
- [ ] Manual bot run: an unmodified scored lesson still marks a wrong answer ❌ and retries — the regression that matters most

## Deployment note

The contract change is backward compatible and needs no data migration, but **the behaviour only appears once a question is marked reflective in the admin UI and published**. Deploy the backend first, then let the content team work through the backfill worksheet — there is no window where the two are inconsistent, because absent `kind` means scored.
