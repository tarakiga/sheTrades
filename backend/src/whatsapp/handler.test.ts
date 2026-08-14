import test from "node:test";
import assert from "node:assert/strict";
import { composeHelpRequestNote, isQuizReplyCorrect, resolveQuizOptionIndex, resolveReflectionAnswer } from "./handler.js";

// Real quiz whose CORRECT answer (index 0) is 22 chars — longer than the
// 20-char WhatsApp reply-button title limit. On real WhatsApp the tapped
// title is echoed back clipped to "Set who sees your in"; the dashboard
// sandbox echoes the full "Set who sees your info". Both must score correct.
const M1_L7_Q3 = ["Set who sees your info", "Increase your data", "Remove your contacts"];

test("clipped correct button title (WhatsApp) is scored correct", () => {
  // "Set who sees your info".slice(0, 20) === "Set who sees your in"
  assert.equal(isQuizReplyCorrect("Set who sees your in", M1_L7_Q3, 0), true);
});

test("full untruncated correct title (sandbox) is scored correct", () => {
  assert.equal(isQuizReplyCorrect("Set who sees your info", M1_L7_Q3, 0), true);
});

test("clipped title matching is case-insensitive", () => {
  assert.equal(isQuizReplyCorrect("SET WHO SEES YOUR IN", M1_L7_Q3, 0), true);
});

test("numeric answers still work (1 = first option)", () => {
  assert.equal(isQuizReplyCorrect("1", M1_L7_Q3, 0), true);
  assert.equal(isQuizReplyCorrect("2", M1_L7_Q3, 0), false);
});

test("numbered-prefix answers still work ('1.' / '1)')", () => {
  assert.equal(isQuizReplyCorrect("1. Set who sees your info", M1_L7_Q3, 0), true);
  assert.equal(isQuizReplyCorrect("1)", M1_L7_Q3, 0), true);
});

test("a wrong option (full text) is scored incorrect", () => {
  assert.equal(isQuizReplyCorrect("Increase your data", M1_L7_Q3, 0), false);
});

test("a wrong option whose clipped form collides with nothing is incorrect", () => {
  // M1 L7 Q2: correct index is 1 ("Updating settings"); opt[0]
  // "Deleting her WhatsApp" is 21 chars -> clipped "Deleting her WhatsAp".
  const q2 = ["Deleting her WhatsApp", "Updating settings", "Changing her number"];
  assert.equal(isQuizReplyCorrect("Deleting her WhatsAp", q2, 1), false);
  assert.equal(isQuizReplyCorrect("Updating settings", q2, 1), true);
});

test("very long correct answer (47 chars) matches its clipped title", () => {
  // M5 L7 Q2, answer index 1.
  const q = [
    "Post angry complains",
    "Message the electricity company's official page",
    "Let it be"
  ];
  // slice(0, 20) === "Message the electric"
  assert.equal(isQuizReplyCorrect("Message the electric", q, 1), true);
});

// UX Round 4 regression: all four "no option is accepted" questions shared one
// trait — the correct option's 20th character is a SPACE, so the sent button
// title ends in whitespace while the inbound echo is trimmed. The clipped
// comparison must trim both sides or these can never grade correct. These are
// the real live option sets from the report.
const ROUND4_TRAILING_SPACE_CASES: Array<{ label: string; options: string[]; answerIndex: number; tapped: string }> = [
  {
    label: "m3_l6 savings habit",
    options: ["Large cash at times", "Save leftover cash", "Small fixed amounts often"],
    answerIndex: 2,
    // "Small fixed amounts often".slice(0, 20) === "Small fixed amounts " —
    // WhatsApp/normalisation trims the trailing space before matching.
    tapped: "Small fixed amounts"
  },
  {
    label: "m4_l2 harassing message first step",
    options: ["Delete immediately", "Tell them to stop", "Don’t delete, don’t apologize"],
    answerIndex: 2,
    tapped: "Don’t delete, don’t"
  },
  {
    label: "m4_l3 fake investor red flag",
    options: ["The man is very fine", "The profile has few friends", "The person wants to partner in business"],
    answerIndex: 1,
    tapped: "The profile has few"
  },
  {
    label: "m4_l4 child tagged in photo",
    options: ["Leave it alone", "Ask them to take it down", "Repost it yourself"],
    answerIndex: 1,
    tapped: "Ask them to take it"
  }
];

for (const c of ROUND4_TRAILING_SPACE_CASES) {
  test(`Round-4 regression: trimmed trailing-space clip grades correct (${c.label})`, () => {
    assert.equal(resolveQuizOptionIndex(c.tapped, c.options), c.answerIndex);
    assert.equal(isQuizReplyCorrect(c.tapped, c.options, c.answerIndex), true);
  });

  test(`Round-4 regression: untrimmed echo also grades correct (${c.label})`, () => {
    // If Meta echoes the title exactly as sent (trailing space intact), the
    // resolver's own input trim must land on the same match.
    assert.equal(isQuizReplyCorrect(`${c.tapped} `, c.options, c.answerIndex), true);
  });
}

test("trailing-space clip does not create false matches for other options", () => {
  const options = ["Large cash at times", "Save leftover cash", "Small fixed amounts often"];
  // The other two options fit inside the title limit; tapping them must keep
  // resolving exactly (and grade incorrect against answerIndex 2).
  assert.equal(isQuizReplyCorrect("Large cash at times", options, 2), false);
  assert.equal(isQuizReplyCorrect("Save leftover cash", options, 2), false);
});

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

test("isQuizReplyCorrect scores the answer-key option correct and others incorrect", () => {
  assert.equal(isQuizReplyCorrect("Yes, system is set", M2_L6_Q1, 0), true);
  assert.equal(isQuizReplyCorrect("Not yet", M2_L6_Q1, 0), false);
});

test("a malformed answerIndex of -1 does not score unmatched replies correct", () => {
  assert.equal(isQuizReplyCorrect("what?", M2_L6_Q1, -1), false);
  assert.equal(isQuizReplyCorrect("", M2_L6_Q1, -1), false);
});

test("an exact full-text match wins over an earlier option's clipped-prefix collision", () => {
  // "Save money every day for rent".slice(0, 20) === "Save money every day"
  // (once trimmed/lowercased), which coincidentally equals the FULL text of
  // options[1]. The unambiguous exact match on index 1 must win over the
  // ambiguous clipped-prefix match on index 0.
  const opts = ["Save money every day for rent", "Save money every day", "Not sure"];
  assert.equal(resolveQuizOptionIndex("Save money every day", opts), 1);
});

test("an out-of-range numeric reply resolves to no option", () => {
  assert.equal(resolveQuizOptionIndex("9", M2_L6_Q1), -1);
  assert.equal(resolveQuizOptionIndex("0", M2_L6_Q1), -1);
});

test("whitespace-only input resolves to no option", () => {
  assert.equal(resolveQuizOptionIndex("   ", ["", "B"]), -1);
});

// ---------------------------------------------------------------------------
// Reflection questions (M2 L6 Q1 is the reported case). These ask what the
// learner DID, so there is no wrong answer: every recognised option advances.
// The help option additionally raises a help_requested signal.
// ---------------------------------------------------------------------------

test("reflection: numeric reply advances and is not a help request", () => {
  assert.deepEqual(resolveReflectionAnswer("1", M2_L6_Q1, 1), {
    action: "advance",
    helpRequested: false,
    selectedIndex: 0
  });
});

test("reflection: the honest 'Not yet' answer advances instead of failing", () => {
  // This is the case the tester missed and the worse of the two: before the
  // fix "Not yet" was scored incorrect and re-asked forever.
  assert.deepEqual(resolveReflectionAnswer("3", M2_L6_Q1, 1), {
    action: "advance",
    helpRequested: false,
    selectedIndex: 2
  });
  assert.deepEqual(resolveReflectionAnswer("Not yet", M2_L6_Q1, 1), {
    action: "advance",
    helpRequested: false,
    selectedIndex: 2
  });
});

test("reflection: help option by full text advances AND flags help", () => {
  assert.deepEqual(resolveReflectionAnswer("I need help migrating", M2_L6_Q1, 1), {
    action: "advance",
    helpRequested: true,
    selectedIndex: 1
  });
});

test("reflection: help option by CLIPPED button title advances AND flags help", () => {
  // "I need help migrating" is 21 chars, so real WhatsApp echoes it back
  // clipped to 20. Without clip tolerance the highest-value signal the bot
  // produces would be silently lost on every real device.
  assert.equal("I need help migrating".slice(0, 20), "I need help migratin");
  assert.deepEqual(resolveReflectionAnswer("I need help migratin", M2_L6_Q1, 1), {
    action: "advance",
    helpRequested: true,
    selectedIndex: 1
  });
});

test("reflection: numeric reply selecting the help option flags help", () => {
  assert.deepEqual(resolveReflectionAnswer("2", M2_L6_Q1, 1), {
    action: "advance",
    helpRequested: true,
    selectedIndex: 1
  });
});

test("reflection with no helpOptionIndex advances without ever flagging help", () => {
  for (const [reply, index] of [["1", 0], ["2", 1], ["3", 2], ["I need help migrating", 1]] as const) {
    assert.deepEqual(resolveReflectionAnswer(reply, M2_L6_Q1), {
      action: "advance",
      helpRequested: false,
      selectedIndex: index
    });
  }
});

test("reflection: unrecognised free text re-asks rather than failing", () => {
  assert.deepEqual(resolveReflectionAnswer("maybe next week", M2_L6_Q1, 1), {
    action: "reask"
  });
});

test("reflection: empty and whitespace-only replies re-ask", () => {
  assert.deepEqual(resolveReflectionAnswer("", M2_L6_Q1, 1), { action: "reask" });
  assert.deepEqual(resolveReflectionAnswer("   ", M2_L6_Q1, 1), { action: "reask" });
});

test("reflection never returns an 'incorrect' outcome for any recognised option", () => {
  // Guards the core property: whatever the learner honestly reports, they
  // advance. If this ever fails, the trap has been reintroduced.
  M2_L6_Q1.forEach((_opt, idx) => {
    const outcome = resolveReflectionAnswer(String(idx + 1), M2_L6_Q1, 1);
    assert.equal(outcome.action, "advance");
  });
});

// composeHelpRequestNote() backs the "help_requested" branch of
// recordAnalytics(): it decides what gets written to User.followUpNote. The
// DB read/write around it can't be unit-tested without Postgres, but the
// append-vs-overwrite decision is pure and is the part most worth pinning.
const HELP_EVENT = { lessonKey: "m2-l6", module: "Money Management", questionIndex: 1 };

test("help note: no existing note produces a single dated line", () => {
  assert.equal(
    composeHelpRequestNote(undefined, HELP_EVENT, "2026-07-21"),
    "[2026-07-21] Asked for help: m2-l6 (Money Management, Q2)"
  );
});

test("help note: null existing note (Prisma's shape for an empty column) is treated like none", () => {
  assert.equal(
    composeHelpRequestNote(null, HELP_EVENT, "2026-07-21"),
    "[2026-07-21] Asked for help: m2-l6 (Money Management, Q2)"
  );
});

test("help note: an existing note is appended to, never overwritten", () => {
  const existing = "[2026-07-01] Asked for help: m1-l3 (Digital Skills, Q1)";
  assert.equal(
    composeHelpRequestNote(existing, HELP_EVENT, "2026-07-21"),
    "[2026-07-01] Asked for help: m1-l3 (Digital Skills, Q1)\n" +
      "[2026-07-21] Asked for help: m2-l6 (Money Management, Q2)"
  );
});

test("help note: repeated requests across lessons all survive, oldest first", () => {
  let note: string | undefined;
  note = composeHelpRequestNote(note, { lessonKey: "m1-l3", module: "Digital Skills", questionIndex: 0 }, "2026-07-01");
  note = composeHelpRequestNote(note, { lessonKey: "m2-l6", module: "Money Management", questionIndex: 1 }, "2026-07-10");
  note = composeHelpRequestNote(note, { lessonKey: "m3-l2", module: "Legal Rights", questionIndex: 2 }, "2026-07-21");
  assert.equal(
    note,
    "[2026-07-01] Asked for help: m1-l3 (Digital Skills, Q1)\n" +
      "[2026-07-10] Asked for help: m2-l6 (Money Management, Q2)\n" +
      "[2026-07-21] Asked for help: m3-l2 (Legal Rights, Q3)"
  );
});

// ---- Full-state pagination ("Others" -> every Nigerian state, paged) ----

import { buildStatesPageReply, getFullStateRows, parseStatesPageId, statesPageId } from "./handler.js";

test("parseStatesPageId round-trips its own ids and rejects noise", () => {
  assert.equal(parseStatesPageId(statesPageId(2)), 2);
  assert.equal(parseStatesPageId(statesPageId(5)), 5);
  assert.equal(parseStatesPageId("kano"), null);
  assert.equal(parseStatesPageId("__states_page___"), null);
});

test("the fallback full-state list covers all 36 states + FCT", () => {
  assert.equal(getFullStateRows().length, 37);
});

test("page 1 carries 9 states plus a More row, within WhatsApp's 10-row cap", () => {
  const page = buildStatesPageReply("en", 1);
  const rows = page.list.sections[0]!.rows;
  assert.equal(rows.length, 10);
  assert.equal(rows[0]!.title, "Abia");
  assert.equal(rows[9]!.id, statesPageId(2));
});

test("every page respects the 10-row cap and the last page has no More row", () => {
  const totalPages = Math.ceil(37 / 9); // 5
  for (let p = 1; p <= totalPages; p += 1) {
    const rows = buildStatesPageReply("en", p).list.sections[0]!.rows;
    assert.ok(rows.length <= 10, `page ${p} exceeds the WhatsApp row cap`);
  }
  const last = buildStatesPageReply("en", totalPages).list.sections[0]!.rows;
  assert.ok(last.every((row) => parseStatesPageId(row.id) === null), "last page must not paginate further");
  assert.equal(last[last.length - 1]!.title, "FCT (Abuja)");
});

test("an out-of-range page clamps instead of erroring", () => {
  const page = buildStatesPageReply("en", 99);
  assert.match(page.reply, /\(5\/5\)$/);
});

// ---- Inbound extraction: list taps must resolve by row ID ----
// The sandbox simulator now sends real list_reply payloads (id + title) like
// Meta does; these pin the id-first contract both sides rely on - a "More
// states" tap must surface __states_page_2__, never its display title.

import { extractInboundMessage } from "./handler.js";

function listReplyPayload(id: string, title: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: "wamid.test.1",
                  from: "+2348000000001",
                  interactive: { type: "list_reply", list_reply: { id, title } }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

test("a tapped list row extracts its canonical id, not its display title", () => {
  const inbound = extractInboundMessage(listReplyPayload(statesPageId(2), "More states ➡️"));
  assert.equal(inbound?.text, "__states_page_2__");
  assert.equal(parseStatesPageId(inbound?.text ?? ""), 2);
});

test("a tapped state row extracts the state id from any page", () => {
  const inbound = extractInboundMessage(listReplyPayload("akwa_ibom", "Akwa Ibom"));
  assert.equal(inbound?.text, "akwa_ibom");
});

// ---- UX Round 3: module-completion routing (O-2) + typed-MENU copy (O-1) ----

import { advanceAfterAcceptedAnswer } from "./handler.js";
import type { RuntimeLesson } from "../config-platform/runtime-config.js";

type AdvanceSession = Parameters<typeof advanceAfterAcceptedAnswer>[0];

function makeLesson(key: string, module: string, quizCount = 1): RuntimeLesson {
  return {
    key,
    module,
    title: `Lesson ${key}`,
    languages: { en: "body text" },
    audioUrls: {},
    quiz: Array.from({ length: quizCount }, (_, i) => ({
      question: `Question ${i + 1}?`,
      options: ["Option A", "Option B", "Option C"],
      answerIndex: 0
    }))
  } as RuntimeLesson;
}

function makeSession(overrides: Record<string, unknown> = {}): AdvanceSession {
  return {
    state: "lesson_menu",
    selectedModuleId: "Module 1: First",
    currentLessonKey: "m1_l1",
    completedLessons: [],
    awaitingQuizAnswer: true,
    currentQuizIndex: 0,
    quizRetryCount: 0,
    namePrompted: true,
    lastUpdatedAt: new Date().toISOString(),
    _events: [],
    ...overrides
  } as unknown as AdvanceSession;
}

test("module completion serves the module picker directly (state -> module_menu)", () => {
  const lessonA = makeLesson("m1_l1", "Module 1: First");
  const lessonB = makeLesson("m2_l1", "Module 2: Second");
  const modulesMap = new Map([
    ["Module 1: First", [lessonA]],
    ["Module 2: Second", [lessonB]]
  ]);
  const session = makeSession();
  const result = advanceAfterAcceptedAnswer(
    session, lessonA, [lessonA], ["Module 1: First", "Module 2: Second"], modulesMap, 0, "en"
  );

  assert.equal(result.state, "module_menu");
  assert.equal(session.state, "module_menu");
  assert.ok(result.list, "completion reply must carry the module list");
  assert.deepEqual(
    result.list?.sections[0]?.rows.map((r) => r.id),
    ["module-1", "module-2"]
  );
  assert.match(result.reply, /next module below/i);
  assert.doesNotMatch(result.reply, /Reply MENU to choose another module/);
  assert.equal(result.buttons, undefined);
});

test("finishing the LAST module says programme complete and offers MENU", () => {
  const lessonA = makeLesson("m1_l1", "Module 1: Only");
  const modulesMap = new Map([["Module 1: Only", [lessonA]]]);
  const session = makeSession({ selectedModuleId: "Module 1: Only" });
  const result = advanceAfterAcceptedAnswer(
    session, lessonA, [lessonA], ["Module 1: Only"], modulesMap, 0, "en"
  );

  assert.notEqual(result.state, "module_menu");
  assert.deepEqual(result.buttons, ["MENU"]);
  assert.match(result.reply, /completed every module/i);
  assert.equal(result.list, undefined);
});

test("mid-module lesson completion still offers NEXT/MENU buttons", () => {
  const lessonA = makeLesson("m1_l1", "Module 1: First");
  const lessonA2 = makeLesson("m1_l2", "Module 1: First");
  const modulesMap = new Map([["Module 1: First", [lessonA, lessonA2]]]);
  const session = makeSession();
  const result = advanceAfterAcceptedAnswer(
    session, lessonA, [lessonA, lessonA2], ["Module 1: First"], modulesMap, 0, "en"
  );

  assert.deepEqual(result.buttons, ["NEXT", "MENU"]);
  assert.equal(session.currentLessonKey, "m1_l2");
});

test("next-question prompt copy says MENU is TYPED (no invisible button implied)", () => {
  const lesson = makeLesson("m1_l1", "Module 1: First", 2);
  const modulesMap = new Map([["Module 1: First", [lesson]]]);
  const session = makeSession();
  const result = advanceAfterAcceptedAnswer(
    session, lesson, [lesson], ["Module 1: First"], modulesMap, 0, "en"
  );

  assert.match(result.reply, /type (the word )?MENU/i);
});

// ---- Client rule 2026-08-15: module complete ONLY when every lesson is done ----

test("finishing the LAST lesson with earlier lessons skipped does NOT complete the module", () => {
  const l1 = makeLesson("m1_l1", "Module 1: First");
  const l2 = makeLesson("m1_l2", "Module 1: First");
  const l3 = makeLesson("m1_l3", "Module 1: First");
  const modulesMap = new Map([["Module 1: First", [l1, l2, l3]]]);
  // Learner skipped l1, completed l2, and is now finishing l3 (the last).
  const session = makeSession({ completedLessons: ["m1_l2"], currentLessonKey: "m1_l3" });
  const result = advanceAfterAcceptedAnswer(
    session, l3, [l1, l2, l3], ["Module 1: First"], modulesMap, 0, "en"
  );

  assert.equal(result.state, "lesson_menu");
  assert.equal(session.currentLessonKey, null);
  assert.match(result.reply, /not done yet/i);
  assert.doesNotMatch(result.reply, /completed all lessons/i);
  // The reply carries the LESSON list (gaps visible), not the module picker.
  assert.ok(result.list);
  assert.deepEqual(
    result.list?.sections[0]?.rows.map((r) => r.id),
    ["m1_l1", "m1_l2", "m1_l3"]
  );
  // No module_completed analytics event -> no reward can fire.
  assert.equal(
    (session._events ?? []).some((e) => e.type === "module_completed"),
    false
  );
});

test("finishing a skipped MIDDLE lesson last correctly completes the module", () => {
  const l1 = makeLesson("m1_l1", "Module 1: First");
  const l2 = makeLesson("m1_l2", "Module 1: First");
  const l3 = makeLesson("m1_l3", "Module 1: First");
  const other = makeLesson("m2_l1", "Module 2: Second");
  const modulesMap = new Map([
    ["Module 1: First", [l1, l2, l3]],
    ["Module 2: Second", [other]]
  ]);
  // Learner did l1 and l3, went back for l2 — completing it finishes the module.
  const session = makeSession({ completedLessons: ["m1_l1", "m1_l3"], currentLessonKey: "m1_l2" });
  const result = advanceAfterAcceptedAnswer(
    session, l2, [l1, l2, l3], ["Module 1: First", "Module 2: Second"], modulesMap, 0, "en"
  );

  assert.equal(result.state, "module_menu");
  assert.match(result.reply, /completed all lessons/i);
  assert.equal(
    (session._events ?? []).some((e) => e.type === "module_completed"),
    true
  );
});

// ---- FAQ feature (client request 2026-08-15) + main menu list conversion ----

import { buildMainMenuReply, buildFaqListReply, findFaqItem } from "./handler.js";

const FAQ_FIXTURES = [
  { id: "faq_what_is", value: "faq_what_is", label: "What is this bot?", metadata: { question: "What is the SheTrades Learning Chatbot?", answer: "Your learning companion on WhatsApp." } },
  { id: "faq_is_free", value: "faq_is_free", label: "Is it free?", metadata: { question: "Is it free?", answer: "Yes. There is no fee." } }
];

test("main menu is a list with four rows including FAQs", () => {
  const menu = buildMainMenuReply("Ada", "en");
  const rows = menu.list.sections[0]?.rows ?? [];
  assert.deepEqual(
    rows.map((r) => r.id),
    ["menu-learn", "menu-progress", "menu-language", "menu-faq"]
  );
  // Numbered body text stays as the typed-reply fallback reference.
  assert.match(menu.reply, /1\. Start Learning/);
  assert.match(menu.reply, /4\. FAQs/);
  // Row titles respect the WhatsApp 24-char cap.
  for (const row of rows) assert.ok(row.title.length <= 24, `row title too long: ${row.title}`);
});

test("FAQ list renders question rows with full questions as descriptions", () => {
  const faq = buildFaqListReply(FAQ_FIXTURES, "en");
  const rows = faq.list.sections[0]?.rows ?? [];
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.id, "faq_what_is");
  assert.match(rows[0]?.description ?? "", /SheTrades Learning Chatbot/);
  assert.match(faq.reply, /1\. What is the SheTrades Learning Chatbot\?/);
});

test("findFaqItem resolves tapped row ids, numbers, and rejects nonsense", () => {
  assert.equal(findFaqItem(FAQ_FIXTURES, "faq_is_free")?.id, "faq_is_free");
  assert.equal(findFaqItem(FAQ_FIXTURES, "2")?.id, "faq_is_free");
  assert.equal(findFaqItem(FAQ_FIXTURES, "1")?.id, "faq_what_is");
  assert.equal(findFaqItem(FAQ_FIXTURES, "9"), null);
  assert.equal(findFaqItem(FAQ_FIXTURES, "how do i fly"), null);
});
