import { z } from "zod";
import { getRuntimeOptionSet, getRuntimeText, getRuntimeLessons, RuntimeLesson } from "../config-platform/runtime-config.js";

export type ConversationState = "awaiting_name" | "awaiting_language" | "main_menu" | "module_menu";

type UserSession = {
  phone: string;
  name?: string;
  language?: "en" | "pcm" | "ig";
  state: ConversationState;
  namePrompted?: boolean;
  lastUpdatedAt: string;
  completedLessons?: string[];
  currentLessonKey?: string | null;
  awaitingQuizAnswer?: boolean;
  selectedModuleId?: string | null;
};

type InboundMessage = {
  id: string;
  from: string;
  text: string;
};

export type WhatsAppWebhookResult =
  | {
      status: "ignored";
      reason: string;
    }
  | {
      status: "duplicate";
      phone: string;
      messageId: string;
      state: ConversationState;
    }
  | {
      status: "processed";
      phone: string;
      messageId: string;
      state: ConversationState;
      reply: string;
    };

const webhookPayloadSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(
          z.object({
            value: z.object({
              messages: z
                .array(
                  z.object({
                    id: z.string().min(1),
                    from: z.string().min(1),
                    text: z
                      .object({
                        body: z.string().optional()
                      })
                      .optional()
                  })
                )
                .optional()
            })
          })
        )
      })
    )
    .optional()
});

const sessions = new Map<string, UserSession>();
const processedMessageIds = new Set<string>();

function nowIso() {
  return new Date().toISOString();
}

function toLanguage(raw: string): "en" | "pcm" | "ig" | null {
  const normalized = raw.trim().toLowerCase();
  const configured = getRuntimeOptionSet("bot.language_options")
    .filter((item) => item.enabled)
    .map((item) => {
      const aliases =
        item.metadata &&
        typeof item.metadata === "object" &&
        Array.isArray((item.metadata as Record<string, unknown>).aliases)
          ? ((item.metadata as Record<string, unknown>).aliases as unknown[])
              .filter((row): row is string => typeof row === "string")
              .map((row) => row.trim().toLowerCase())
          : [];
      return {
        value: item.value.trim().toLowerCase(),
        aliases
      };
    });
  for (const option of configured) {
    if (option.value === "en" || option.value === "pcm" || option.value === "ig") {
      if (normalized === option.value || option.aliases.includes(normalized)) {
        return option.value;
      }
    }
  }
  if (["en", "english", "1"].includes(normalized)) return "en";
  if (["pcm", "pidgin", "2"].includes(normalized)) return "pcm";
  if (["ig", "igbo", "3"].includes(normalized)) return "ig";
  return null;
}

function languageLabel(language: "en" | "pcm" | "ig") {
  if (language === "en") return getRuntimeText("bot.language.en", "English");
  if (language === "pcm") return getRuntimeText("bot.language.pcm", "Pidgin");
  return getRuntimeText("bot.language.ig", "Igbo");
}

function mainMenuText(name: string) {
  return getRuntimeText(
    "bot.main_menu",
    `Welcome ${name}. Main Menu:\n1. Start Module 1\n2. My Progress\n3. Change Language`
  ).replace("{name}", name);
}

function extractInboundMessage(payload: unknown): InboundMessage | null {
  const parsed = webhookPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  const message = parsed.data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return null;

  return {
    id: message.id,
    from: message.from,
    text: message.text?.body?.trim() ?? ""
  };
}

function getOrCreateSession(phone: string): UserSession {
  const existing = sessions.get(phone);
  if (existing) return existing;

  const created: UserSession = {
    phone,
    state: "awaiting_name",
    lastUpdatedAt: nowIso()
  };
  sessions.set(phone, created);
  return created;
}

function getPrompt(
  key: string,
  lang: "en" | "pcm" | "ig",
  fallback: string
): string {
  const prompts: Record<string, Record<"en" | "pcm" | "ig", string>> = {
    "modules_menu_header": {
      en: "Choose a Module to begin:\n",
      pcm: "Make you choose one Module to start:\n",
      ig: "Họrọ modul ka ịmalite:\n"
    },
    "modules_menu_footer": {
      en: "\nReply with the module number (e.g. 1, 2, 3) or MENU to return.",
      pcm: "\nReply with the module number (e.g. 1, 2, 3) or MENU to go back.",
      ig: "\nReply na nọmba modul (dịka 1, 2, 3) ma ọ bụ MENU ka ịlaghachi."
    },
    "invalid_module": {
      en: "Invalid module selection. Please choose a Module to begin:\n",
      pcm: "Select correct module. Make you choose one Module to start:\n",
      ig: "Nhọrọ modul adịghị mma. Họrọ modul ka ịmalite:\n"
    },
    "quiz_instruction": {
      en: "\n-------------------------\nReply QUIZ to start the lesson quiz, or MENU to return.",
      pcm: "\n-------------------------\nReply QUIZ to start lesson quiz, or MENU to go back.",
      ig: "\n-------------------------\nReply QUIZ ka ịmalite ule, ma ọ bụ MENU ka ịlaghachi."
    },
    "quiz_time_header": {
      en: "📚 Quiz Time! Question:\n",
      pcm: "📚 Time for small quiz! Question:\n",
      ig: "📚 Oge Ule! Ajụjụ:\n"
    },
    "quiz_answer_prompt": {
      en: "\n\nReply with your answer (1, 2, or 3) or MENU to return.",
      pcm: "\n\nReply with your answer (1, 2, or 3) or MENU to go back.",
      ig: "\n\nReply na azịza gị (1, 2, ma ọ bụ 3) ma ọ bụ MENU ka ịlaghachi."
    },
    "correct_next": {
      en: "🎉 Correct! Excellent job. You have completed this lesson.\n\nReply NEXT to continue to the next lesson or MENU to return.",
      pcm: "🎉 You correct! Better job. You don finish dis lesson.\n\nReply NEXT to go to another lesson or MENU to go back.",
      ig: "🎉 I ziri ezi! Ọrụ dị mma. Imechara nkuzi a.\n\nReply NEXT ka ịga n'ihu na nkuzi na-abịa ma ọ bụ MENU ka ịlaghachi."
    },
    "correct_module_complete": {
      en: "🎉 Correct! Excellent job.\n\nCongratulations! You have completed all lessons in this module.\n\nReply MENU to choose another module.",
      pcm: "🎉 You correct! Better job.\n\nCongratulations! You don complete all lessons for dis module.\n\nReply MENU to select another module.",
      ig: "🎉 I ziri ezi! Ọrụ dị mma.\n\nEkele! Imechara nkuzi niile dị na modul a.\n\nReply MENU ka ịhọrọ modul ọzọ."
    },
    "incorrect_retry": {
      en: "❌ That is incorrect. Let's try again!\n\n",
      pcm: "❌ That one no correct. Make we try again!\n\n",
      ig: "❌ Nke ahụ adịghị mma. Ka anyị nwaa ọzọ!\n\n"
    },
    "bot_did_not_understand": {
      en: "I did not understand that.\nReply QUIZ to start this lesson's quiz, NEXT to progress, or MENU to return.",
      pcm: "I no understand wetin you write.\nReply QUIZ to start dis lesson quiz, NEXT to continue, or MENU to go back.",
      ig: "Aghọtaghị m nke ahụ.\nReply QUIZ ka ịmalite ule, NEXT ka ịga n'ihu, ma ọ bụ MENU ka ịlaghachi."
    }
  };

  const selected = prompts[key]?.[lang];
  return selected ?? fallback;
}

function transition(
  session: UserSession,
  text: string
): { state: ConversationState; reply: string } {
  const safeText = text.trim();
  const normalized = safeText.toLowerCase();
  const lang = session.language || "en";

  // Ensure completed lessons list is always initialized
  session.completedLessons = session.completedLessons || [];

  if (session.state === "awaiting_name") {
    const greetings = ["hi", "hello", "hey", "start", "menu", "yo", "hola", "begin", "ping", "test", "shetrades"];
    const cleanText = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
    const words = cleanText.split(/\s+/);
    const isGreeting = words.some(w => greetings.includes(w));

    if (!safeText || (isGreeting && !session.namePrompted)) {
      session.namePrompted = true;
      session.lastUpdatedAt = nowIso();
      return {
        state: "awaiting_name",
        reply: getRuntimeText(
          "bot.awaiting_name.prompt",
          "Welcome to SheTrades. Please reply with your full name to begin."
        )
      };
    }

    session.name = safeText;
    session.state = "awaiting_language";
    session.lastUpdatedAt = nowIso();
    return {
      state: session.state,
      reply: getRuntimeText(
        "bot.awaiting_language.prompt",
        `Thanks ${safeText}. Choose language:\n1. English (EN)\n2. Pidgin (PCM)\n3. Igbo (IG)`
      ).replace("{name}", safeText)
    };
  }

  if (session.state === "awaiting_language") {
    const language = toLanguage(normalized);
    if (!language) {
      return {
        state: "awaiting_language",
        reply: getRuntimeText(
          "bot.awaiting_language.invalid",
          "Invalid language option. Reply with 1 (EN), 2 (PCM), or 3 (IG)."
        )
      };
    }

    session.language = language;
    session.state = "main_menu";
    session.lastUpdatedAt = nowIso();
    return {
      state: session.state,
      reply: getRuntimeText(
        "bot.main_menu.language_set",
        `${mainMenuText(session.name ?? "Learner")}\nLanguage set: ${languageLabel(language)}`
      )
        .replace("{menu}", mainMenuText(session.name ?? "Learner"))
        .replace("{language}", languageLabel(language))
    };
  }

  // Handle global MENU command to return to Main Menu from anywhere
  if (["menu", "0", "back"].includes(normalized)) {
    session.state = "main_menu";
    session.currentLessonKey = null;
    session.selectedModuleId = null;
    session.awaitingQuizAnswer = false;
    session.lastUpdatedAt = nowIso();
    return {
      state: session.state,
      reply: mainMenuText(session.name ?? "Learner")
    };
  }

  // Load active dynamic lessons from config-platform database seeds
  const lessons = getRuntimeLessons();
  const modulesMap = new Map<string, RuntimeLesson[]>();
  for (const lesson of lessons) {
    const mName = lesson.module || "Module 1: Learning Path";
    if (!modulesMap.has(mName)) {
      modulesMap.set(mName, []);
    }
    modulesMap.get(mName)!.push(lesson);
  }
  const moduleNames = Array.from(modulesMap.keys()).sort();

  if (session.state === "main_menu") {
    // Option 1: Start Learning / Modules Menu
    if (["1", "start", "module 1", "modules", "learn"].includes(normalized)) {
      session.state = "module_menu";
      session.selectedModuleId = null;
      session.currentLessonKey = null;
      session.awaitingQuizAnswer = false;
      session.lastUpdatedAt = nowIso();

      if (moduleNames.length === 0) {
        return {
          state: session.state,
          reply: "No learning modules are available at the moment. Reply MENU to return."
        };
      }

      let reply = getPrompt("modules_menu_header", lang, "Choose a Module to begin:\n");
      moduleNames.forEach((mName, idx) => {
        reply += `${idx + 1}. ${mName}\n`;
      });
      reply += getPrompt("modules_menu_footer", lang, "\nReply with the module number (e.g. 1, 2, 3) or MENU to return.");

      return {
        state: session.state,
        reply
      };
    }

    // Option 2: My Progress summary
    if (["2", "progress", "my progress"].includes(normalized)) {
      const totalCount = lessons.length || 6;
      const completedCount = session.completedLessons.length;
      const percentage = Math.round((completedCount / totalCount) * 100);

      const summaryText = lang === "pcm"
        ? `${session.name ?? "Learner"}, your current completion is ${percentage}%. You don finish ${completedCount} out of ${totalCount} lessons. Reply 1 to start learning or MENU to return.`
        : lang === "ig"
        ? `${session.name ?? "Learner"}, ngụkọta nkuzi gị mechara bụ ${percentage}%. I mechara ${completedCount} n'ime nkuzi ${totalCount}. Reply 1 ka ịmalite ma ọ bụ MENU ka ịlaghachi.`
        : `${session.name ?? "Learner"}, your current completion is ${percentage}%. You have completed ${completedCount} out of ${totalCount} lessons. Reply 1 to start learning or MENU to return.`;

      return {
        state: session.state,
        reply: getRuntimeText("bot.progress.summary", summaryText)
          .replace("{name}", session.name ?? "Learner")
          .replace("{percentage}", String(percentage))
          .replace("{completedCount}", String(completedCount))
          .replace("{totalCount}", String(totalCount))
      };
    }

    // Option 3: Change Language
    if (["3", "language", "change language"].includes(normalized)) {
      session.state = "awaiting_language";
      session.lastUpdatedAt = nowIso();
      return {
        state: session.state,
        reply: getRuntimeText(
          "bot.awaiting_language.prompt_short",
          "Choose language:\n1. English (EN)\n2. Pidgin (PCM)\n3. Igbo (IG)"
        )
      };
    }

    return {
      state: session.state,
      reply: getRuntimeText(
        "bot.main_menu.invalid",
        `I did not understand that.\n${mainMenuText(session.name ?? "Learner")}`
      ).replace("{menu}", mainMenuText(session.name ?? "Learner"))
    };
  }

  if (session.state === "module_menu") {
    // Case A: User has not selected a specific module yet (at the module list prompt)
    if (!session.selectedModuleId) {
      const num = parseInt(normalized, 10);
      if (!isNaN(num) && num >= 1 && num <= moduleNames.length) {
        const chosenModule = moduleNames[num - 1]!;
        session.selectedModuleId = chosenModule;
        session.lastUpdatedAt = nowIso();

        const moduleLessons = modulesMap.get(chosenModule) || [];
        if (moduleLessons.length === 0) {
          return {
            state: session.state,
            reply: `No lessons found in ${chosenModule}. Reply MENU to select another module.`
          };
        }

        // Start at first incomplete lesson, or first lesson if all completed
        const completed = session.completedLessons || [];
        const firstIncomplete = (moduleLessons.find(l => !completed.includes(l.key)) || moduleLessons[0])!;
        session.currentLessonKey = firstIncomplete.key;
        session.awaitingQuizAnswer = false;

        const lessonText = firstIncomplete.languages[lang] || firstIncomplete.languages.en || "";
        const reply = `📖 ${firstIncomplete.title}\n\n${lessonText}${getPrompt("quiz_instruction", lang, "\n\nReply QUIZ to start the lesson quiz, or MENU to return.")}`;

        return {
          state: session.state,
          reply
        };
      }

      // Re-prompt list of modules if invalid input
      let reply = getPrompt("invalid_module", lang, "Invalid module selection. Please choose a Module to begin:\n");
      moduleNames.forEach((mName, idx) => {
        reply += `${idx + 1}. ${mName}\n`;
      });
      reply += getPrompt("modules_menu_footer", lang, "\nReply with the module number or MENU to return.");

      return {
        state: session.state,
        reply
      };
    }

    // Case B: User has an active selected module
    const moduleLessons = modulesMap.get(session.selectedModuleId) || [];
    const activeLesson = moduleLessons.find(l => l.key === session.currentLessonKey);

    if (!activeLesson) {
      // Safety reset if lesson key is invalid
      session.selectedModuleId = null;
      session.currentLessonKey = null;
      session.awaitingQuizAnswer = false;
      session.lastUpdatedAt = nowIso();
      return {
        state: session.state,
        reply: "Selected lesson not found. Reply MENU to return."
      };
    }

    // Subcase B.1: Chatbot is awaiting answer for the active quiz
    if (session.awaitingQuizAnswer) {
      const quizItem = activeLesson.quiz[0]; // Fetch active quiz item
      if (quizItem) {
        const correctIndex = quizItem.answerIndex;
        const correctOptionText = quizItem.options[correctIndex]?.trim().toLowerCase() || "";
        
        const isCorrectNumber = normalized === String(correctIndex + 1);
        const isCorrectText = normalized === correctOptionText;

        if (isCorrectNumber || isCorrectText) {
          // Success! Add to completed lessons
          if (!session.completedLessons.includes(activeLesson.key)) {
            session.completedLessons.push(activeLesson.key);
          }
          session.awaitingQuizAnswer = false;
          session.lastUpdatedAt = nowIso();

          // Find next lesson inside this module
          const currentIdx = moduleLessons.findIndex(l => l.key === activeLesson.key);
          const nextLesson = moduleLessons[currentIdx + 1];

          if (nextLesson) {
            session.currentLessonKey = nextLesson.key;
            return {
              state: session.state,
              reply: getPrompt("correct_next", lang, "🎉 Correct! Excellent job. You have completed this lesson.\n\nReply NEXT to continue to the next lesson or MENU to return.")
            };
          } else {
            // Completed entire module
            session.currentLessonKey = null;
            session.selectedModuleId = null;
            return {
              state: session.state,
              reply: getPrompt("correct_module_complete", lang, "🎉 Correct! Excellent job.\n\nCongratulations! You have completed all lessons in this module.\n\nReply MENU to choose another module.")
            };
          }
        } else {
          // Incorrect answer retry
          let reply = getPrompt("incorrect_retry", lang, "❌ That is incorrect. Let's try again!\n\n");
          reply += getPrompt("quiz_time_header", lang, "📚 Quiz Time! Question:\n");
          reply += `${quizItem.question}\n`;
          quizItem.options.forEach((opt, idx) => {
            reply += `${idx + 1}. ${opt}\n`;
          });
          reply += getPrompt("quiz_answer_prompt", lang, "\nReply with your answer (1, 2, or 3) or MENU to return.");
          
          return {
            state: session.state,
            reply
          };
        }
      }
    }

    // Subcase B.2: Chatbot is in lesson view (awaiting next or quiz trigger)
    if (["quiz", "start quiz", "take quiz", "test"].includes(normalized)) {
      const quizItem = activeLesson.quiz[0];
      if (!quizItem) {
        return {
          state: session.state,
          reply: "No quiz questions found for this lesson. Reply NEXT to proceed or MENU to return."
        };
      }

      session.awaitingQuizAnswer = true;
      session.lastUpdatedAt = nowIso();

      let reply = getPrompt("quiz_time_header", lang, "📚 Quiz Time! Question:\n");
      reply += `${quizItem.question}\n`;
      quizItem.options.forEach((opt, idx) => {
        reply += `${idx + 1}. ${opt}\n`;
      });
      reply += getPrompt("quiz_answer_prompt", lang, "\nReply with your answer (1, 2, or 3) or MENU to return.");

      return {
        state: session.state,
        reply
      };
    }

    if (["next", "continue"].includes(normalized)) {
      const lessonText = activeLesson.languages[lang] || activeLesson.languages.en || "";
      const reply = `📖 ${activeLesson.title}\n\n${lessonText}${getPrompt("quiz_instruction", lang, "\n\nReply QUIZ to start the lesson quiz, or MENU to return.")}`;
      session.lastUpdatedAt = nowIso();
      return {
        state: session.state,
        reply
      };
    }

    // Fallback did-not-understand message in lesson view
    return {
      state: session.state,
      reply: getPrompt("bot_did_not_understand", lang, "I did not understand that. Reply QUIZ to start this lesson's quiz, NEXT to progress, or MENU to return.")
    };
  }

  return {
    state: session.state,
    reply: getPrompt("bot_did_not_understand", lang, "I did not understand that. Reply MENU to return to the main menu.")
  };
}

export function handleWhatsAppWebhook(payload: unknown): WhatsAppWebhookResult {
  const inbound = extractInboundMessage(payload);
  if (!inbound) {
    return {
      status: "ignored",
      reason: getRuntimeText(
        "bot.webhook.ignored_reason",
        "No supported inbound text message in payload."
      )
    };
  }

  const existingSession = getOrCreateSession(inbound.from);
  if (processedMessageIds.has(inbound.id)) {
    return {
      status: "duplicate",
      phone: inbound.from,
      messageId: inbound.id,
      state: existingSession.state
    };
  }

  processedMessageIds.add(inbound.id);
  const result = transition(existingSession, inbound.text);
  sessions.set(inbound.from, existingSession);

  return {
    status: "processed",
    phone: inbound.from,
    messageId: inbound.id,
    state: result.state,
    reply: result.reply
  };
}

export function resetWhatsAppState() {
  sessions.clear();
  processedMessageIds.clear();
}

export function getWhatsAppSession(phone: string) {
  return sessions.get(phone);
}

