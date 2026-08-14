/**
 * Default bot conversation copy.
 *
 * These are the SAFE FALLBACKS. The handler overlays published config from the
 * "content" namespace under key `bot.prompt.<key>` (see getRuntimeLocalizedText),
 * so admins can edit any of this copy from the dashboard without a code change.
 * When config is empty/unpublished the bot uses the values below, so the flow
 * never breaks.
 *
 * The same defaults are used by `seed-bot-prompts.ts` to publish an editable
 * baseline into config.
 */
export type BotPromptText = { en: string; pcm?: string; ig?: string };

export const BOT_PROMPT_CONFIG_PREFIX = "bot.prompt.";

export const BOT_PROMPT_DEFAULTS: Record<string, BotPromptText> = {
  modules_menu_header: {
    en: "Choose a Module to begin:\n",
    pcm: "Make you choose one Module to start:\n",
    ig: "Họrọ modul ka ịmalite:\n"
  },
  modules_menu_footer: {
    en: "",
    pcm: "",
    ig: ""
  },
  invalid_module: {
    en: "Invalid module selection. Please choose a Module to begin:\n",
    pcm: "Select correct module. Make you choose one Module to start:\n",
    ig: "Nhọrọ modul adịghị mma. Họrọ modul ka ịmalite:\n"
  },
  quiz_instruction: {
    en: "\n-------------------------\nReply QUIZ to start the lesson quiz, or MENU to return.",
    pcm: "\n-------------------------\nReply QUIZ to start lesson quiz, or MENU to go back.",
    ig: "\n-------------------------\nReply QUIZ ka ịmalite ule, ma ọ bụ MENU ka ịlaghachi."
  },
  quiz_time_header: {
    en: "📚 Quiz Time! Question:\n",
    pcm: "📚 Time for small quiz! Question:\n",
    ig: "📚 Oge Ule! Ajụjụ:\n"
  },
  // UX Round 3 O-1: three-option questions fill all three WhatsApp reply-button
  // slots, so no MENU button can render there. The copy must be explicit that
  // MENU is TYPED (it works from anywhere via the global handler) rather than
  // implying a button the learner will never see.
  quiz_answer_prompt: {
    en: "\n\nSelect your answer below, or type the word MENU to return.",
    pcm: "\n\nSelect your answer below, or type the word MENU to go back.",
    ig: "\n\nHọrọ azịza gị n'okpuru, ma ọ bụ dee okwu MENU ka ịlaghachi."
  },
  correct_headline: {
    en: "🎉 Correct!",
    pcm: "🎉 You correct!",
    ig: "🎉 I ziri ezi!"
  },
  // Reflection questions ask what a learner DID, not what they know, so the
  // copy below must acknowledge WITHOUT affirming correctness. Saying
  // "Correct!" to someone who answered "Not yet" or "I need help" is the same
  // pressure to misreport that scoring these questions created.
  reflection_headline: {
    en: "✅ Thanks for sharing.",
    pcm: "✅ Thank you for tell us.",
    ig: "✅ Daalụ maka ịkọrọ anyị."
  },
  reflection_next: {
    en: "✅ Thanks for sharing.\n\nYou have completed this lesson.\n\nReply NEXT to continue to the next lesson or MENU to return.",
    pcm: "✅ Thank you for tell us.\n\nYou don finish dis lesson.\n\nReply NEXT to go to the next lesson or MENU to go back.",
    ig: "✅ Daalụ maka ịkọrọ anyị.\n\nImechara nkuzi a.\n\nZaghachi NEXT ka ịga na nkuzi na-esote ma ọ bụ MENU ka ịlaghachi."
  },
  // UX Round 3 O-2: module-complete replies now carry the module picker
  // directly, so the copy invites a pick below instead of promising a MENU
  // hop that used to land on the top-level main menu.
  reflection_module_complete: {
    en: "✅ Thanks for sharing.\n\nYou have completed all lessons in this module.\n\nChoose your next module below.",
    pcm: "✅ Thank you for tell us.\n\nYou don finish all the lessons for dis module.\n\nPick your next module below.",
    ig: "✅ Daalụ maka ịkọrọ anyị.\n\nImechara nkuzi niile dị na modul a.\n\nHọrọ modul ọzọ gị n'okpuru."
  },
  correct_next: {
    en: "🎉 Correct! Excellent job. You have completed this lesson.\n\nReply NEXT to continue to the next lesson or MENU to return.",
    pcm: "🎉 You correct! Better job. You don finish dis lesson.\n\nReply NEXT to go to another lesson or MENU to go back.",
    ig: "🎉 I ziri ezi! Ọrụ dị mma. Imechara nkuzi a.\n\nReply NEXT ka ịga n'ihu na nkuzi na-abịa ma ọ bụ MENU ka ịlaghachi."
  },
  correct_module_complete: {
    en: "🎉 Correct! Excellent job.\n\nCongratulations! You have completed all lessons in this module.\n\nChoose your next module below.",
    pcm: "🎉 You correct! Better job.\n\nCongratulations! You don complete all lessons for dis module.\n\nPick your next module below.",
    ig: "🎉 I ziri ezi! Ọrụ dị mma.\n\nEkele! Imechara nkuzi niile dị na modul a.\n\nHọrọ modul ọzọ gị n'okpuru."
  },
  // Shown when the learner has finished EVERY module: there is nothing left
  // to pick, so this one genuinely does route to the main menu.
  programme_complete: {
    en: "🎓 Amazing! You have completed every module in the programme. Reply MENU to return to the main menu.",
    pcm: "🎓 Correct! You don finish every module for the programme. Reply MENU to go back to main menu.",
    ig: "🎓 Ịdị mma! Imechara modul niile n'ime mmemme a. Zaghachi MENU ka ịlaghachi na isi menu."
  },
  incorrect_retry: {
    en: "❌ That is incorrect. Let's try again!\n\n",
    pcm: "❌ That one no correct. Make we try again!\n\n",
    ig: "❌ Nke ahụ adịghị mma. Ka anyị nwaa ọzọ!\n\n"
  },
  quiz_help_ack: {
    en: "No problem — thank you for telling us. We have noted that you need help with this one, and the team will follow up.\n\n",
    pcm: "No wahala — thank you for telling us. We don note say you need help for this one, and the team go follow up.\n\n",
    ig: "Nsogbu adịghị — daalụ maka ịgwa anyị. Anyị edeela na ị chọrọ enyemaka na nke a, ndị otu ga-akpọtụrụ gị.\n\n"
  },
  bot_did_not_understand: {
    en: "I did not understand that.\nReply QUIZ to start this lesson's quiz, NEXT to progress, or MENU to return.",
    pcm: "I no understand wetin you write.\nReply QUIZ to start dis lesson quiz, NEXT to continue, or MENU to go back.",
    ig: "Aghọtaghị m nke ahụ.\nReply QUIZ ka ịmalite ule, NEXT ka ịga n'ihu, ma ọ bụ MENU ka ịlaghachi."
  },
  state_prompt: {
    en: "Which state are you in?",
    pcm: "Which state you dey?",
    ig: "Kedu steeti ị nọ?"
  },
  state_button: {
    en: "Choose state",
    pcm: "Choose state",
    ig: "Họrọ steeti"
  },
  state_other_label: {
    en: "Others",
    pcm: "Others",
    ig: "Ndị ọzọ"
  },
  custom_state_prompt: {
    en: "Please type the name of your state.",
    pcm: "Abeg type the name of your state.",
    ig: "Biko dee aha steeti gị."
  },
  state_invalid: {
    en: "Please choose your state from the list.",
    pcm: "Abeg choose your state from the list.",
    ig: "Biko họrọ steeti gị na ndepụta."
  },
  quiz_unavailable: {
    en: "This lesson's quiz isn't available right now. Reply NEXT to continue or MENU to return.",
    pcm: "Dis lesson quiz no dey available now. Reply NEXT to continue or MENU to go back.",
    ig: "Ule nkuzi a adịghị ugbu a. Zaghachi NEXT ka ịga n'ihu ma ọ bụ MENU ka ịlaghachi."
  },
  lesson_menu_header: {
    en: "Choose a lesson to begin (✅ = done):",
    pcm: "Choose lesson wey you wan start (✅ = done):",
    ig: "Họrọ nkuzi ka ịmalite (✅ = emechara):"
  },
  lesson_menu_footer: {
    en: "\nReply with a number, or tap “Choose lesson”. MENU to go back.",
    pcm: "\nReply with number, or tap “Choose lesson”. MENU to go back.",
    ig: "\nZaghachi na nọmba, ma ọ bụ pịa “Họrọ nkuzi”. MENU ka ịlaghachi."
  },
  lesson_menu_button: {
    en: "Choose lesson",
    pcm: "Choose lesson",
    ig: "Họrọ nkuzi"
  },
  module_menu_button: {
    en: "Choose module",
    pcm: "Choose module",
    ig: "Họrọ modul"
  }
};

/** Human-readable titles for the config documents (admin UI). */
export const BOT_PROMPT_TITLES: Record<string, string> = {
  modules_menu_header: "Bot · Modules menu header",
  modules_menu_footer: "Bot · Modules menu footer",
  invalid_module: "Bot · Invalid module selection",
  quiz_instruction: "Bot · Quiz instruction",
  quiz_time_header: "Bot · Quiz time header",
  quiz_help_ack: "Bot · Help request acknowledgement",
  quiz_answer_prompt: "Bot · Quiz answer prompt",
  correct_headline: "Bot · Correct answer headline",
  correct_next: "Bot · Correct answer (next lesson)",
  correct_module_complete: "Bot · Correct answer (module complete)",
  reflection_headline: "Bot · Reflection answer headline",
  reflection_next: "Bot · Reflection answer (next lesson)",
  reflection_module_complete: "Bot · Reflection answer (module complete)",
  programme_complete: "Bot · Programme complete (all modules done)",
  incorrect_retry: "Bot · Incorrect answer (retry)",
  bot_did_not_understand: "Bot · Did not understand",
  state_prompt: "Bot · State prompt",
  state_button: "Bot · State picker button",
  state_other_label: "Bot · State 'Others' label",
  custom_state_prompt: "Bot · Custom state prompt",
  state_invalid: "Bot · Invalid state selection",
  quiz_unavailable: "Bot · Quiz unavailable (empty/corrupt)",
  lesson_menu_header: "Bot · Lesson menu header",
  lesson_menu_footer: "Bot · Lesson menu footer",
  lesson_menu_button: "Bot · Lesson menu button",
  module_menu_button: "Bot · Module menu button"
};
