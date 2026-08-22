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
  // Shown when the learner reaches the END of a module's lesson order but
  // skipped lessons remain: the module is NOT complete (client rule
  // 2026-08-15: every lesson must be done), so no celebration fires and the
  // lesson list is re-served with the gaps visible.
  module_lessons_remaining: {
    en: "You have finished this lesson, but some lessons in this module are not done yet. Pick one below to complete the module.",
    pcm: "You don finish dis lesson, but some lessons for dis module never complete. Pick one below make you finish the module.",
    ig: "Imechara nkuzi a, mana ụfọdụ nkuzi na modul a emechabeghị. Họrọ otu n'okpuru ka imechaa modul ahụ."
  },
  // Main-menu list chrome (menu became a list when FAQs pushed it past
  // WhatsApp's 3-button cap, 2026-08-15).
  main_menu_button: {
    en: "Choose option",
    pcm: "Pick option",
    ig: "Họrọ nhọrọ"
  },
  main_menu_section: {
    en: "Main Menu",
    pcm: "Main Menu",
    ig: "Isi Menu"
  },
  // FAQ browser copy. FAQ CONTENT lives in the bot.faqs option set; these are
  // only the chrome strings around it.
  faq_header: {
    en: "❓ FAQs — tap a question below, or type MENU to return.",
    pcm: "❓ FAQs — tap one question below, or type MENU to go back.",
    ig: "❓ FAQs — pịa ajụjụ n'okpuru, ma ọ bụ dee MENU ka ịlaghachi."
  },
  faq_button: {
    en: "See questions",
    pcm: "See questions",
    ig: "Lee ajụjụ"
  },
  faq_empty: {
    en: "FAQs are not available right now. Reply MENU to return to the main menu.",
    pcm: "FAQs no dey available now. Reply MENU to go back to main menu.",
    ig: "FAQs adịghị ugbu a. Zaghachi MENU ka ịlaghachi na isi menu."
  },
  faq_answer_hint: {
    en: "Reply FAQ for more questions, or MENU to return.",
    pcm: "Reply FAQ for more questions, or MENU to go back.",
    ig: "Zaghachi FAQ maka ajụjụ ndị ọzọ, ma ọ bụ MENU ka ịlaghachi."
  },
  faq_missing_answer: {
    en: "This answer has not been published yet. Reply MENU to return.",
    pcm: "This answer never publish yet. Reply MENU to go back.",
    ig: "Edebeghị azịza a. Zaghachi MENU ka ịlaghachi."
  },
  resources_header: {
    en: "📌 Resources — tap a topic below, or type MENU to return.",
    pcm: "📌 Resources — tap one topic below, or type MENU to go back.",
    ig: "📌 Resources — pịa isiokwu n'okpuru, ma ọ bụ dee MENU ka ịlaghachi."
  },
  resources_button: {
    en: "See resources",
    pcm: "See resources",
    ig: "Lee resources"
  },
  resources_empty: {
    en: "Resources are not available right now. Reply MENU to return to the main menu.",
    pcm: "Resources no dey available now. Reply MENU to go back to main menu.",
    ig: "Resources adịghị ugbu a. Zaghachi MENU ka ịlaghachi na isi menu."
  },
  resources_answer_hint: {
    en: "Reply RESOURCES for more, or MENU to return.",
    pcm: "Reply RESOURCES for more, or MENU to go back.",
    ig: "Zaghachi RESOURCES maka ndị ọzọ, ma ọ bụ MENU ka ịlaghachi."
  },
  resources_missing_content: {
    en: "This resource has not been published yet. Reply MENU to return.",
    pcm: "This resource never publish yet. Reply MENU to go back.",
    ig: "Edebeghị ihe a. Zaghachi MENU ka ịlaghachi."
  },
  language_coming_soon: {
    en: "🔜 {language} is coming soon — we are working on it! Please continue in English for now.",
    pcm: "🔜 {language} dey come soon — we dey work on am! Abeg continue with English for now.",
    ig: "🔜 {language} na-abịa n'oge na-adịghị anya — anyị na-arụ ya! Biko jiri Bekee gaa n'ihu ugbu a."
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
  },
  // Completion certificate. English only for now — the pcm/ig pass comes with
  // the rest of the translation work, and getPrompt already falls back to en,
  // so a learner on Pidgin reads English here rather than nothing.
  //
  // The learner reading this has spent weeks on a low-end phone to get here.
  // Keep it short, warm and free of jargon; every sentence has to survive
  // being read on a 4-line screen.
  certificate_congrats: {
    // {name} is the ONBOARDING name, shown because it is what will be printed
    // on a permanent, publicly verifiable credential — a learner who typed a
    // nickname at signup gets one chance to see that before it is frozen.
    // Substituted the same way bot.main_menu does it (first {name} only).
    en: "🎓 Congratulations! You have finished every module.\n\nYour certificate will show this name:\n\n{name}\n\nIs that how you want it written? Choose below."
  },
  certificate_confirm_yes: {
    // Reply-button title: 20 UTF-16 units max (WHATSAPP_LIMITS.buttonTitle).
    en: "Yes, use this name"
  },
  certificate_confirm_change: {
    en: "Change the name"
  },
  certificate_name_prompt: {
    en: "No problem. Send the full name you want on your certificate, spelled exactly how it should be printed."
  },
  certificate_name_too_long: {
    // {max} is filled from MAX_NAME_LENGTH so the number a learner is held to
    // can never drift from the number the sanitiser actually enforces.
    en: "That name is too long for the certificate — {max} letters is the most it can hold. Please send a shorter version."
  },
  certificate_name_empty: {
    en: "I did not get a name there. Please send your full name."
  },
  certificate_sent: {
    // Rides as the CAPTION on the certificate image, so it is the sentence
    // that arrives attached to the artwork itself.
    en: "Here is your certificate. Well done — you earned it. The link below lets anyone check that it is real."
  },
  certificate_send_failed: {
    // Covers both unhappy outcomes: the row was never written, and the row
    // exists but the image did not reach the chat. It must be true in both,
    // so it promises nothing about what is saved — only what to do next.
    en: "Sorry, your certificate could not be sent just now. Nothing you did is wrong — we have logged it for our team. Choose My Certificate from the menu in a few minutes and we will try again."
  },
  certificate_menu_label: {
    // List row title: 24 UTF-16 units max (WHATSAPP_LIMITS.listRowTitle).
    en: "My Certificate"
  },
  certificate_menu_description: {
    // List row description: 72 UTF-16 units max.
    en: "Get your completion certificate"
  },
  certificate_not_ready: {
    en: "Your certificate is not ready yet. Finish every module and it will come to you right here."
  },

  // --- Privacy notice and consent -----------------------------------------
  //
  // The notice below is the CLIENT'S DRAFT, in as a placeholder until they
  // supply the final wording. It is published as a config document, so
  // replacing it is an edit under Content with draft, publish and rollback --
  // no deploy and no developer.
  //
  // Two constraints on whoever edits it. It is sent as an interactive message,
  // so the body must stay under 1024 characters or WhatsApp REJECTS the whole
  // message and her very first interaction fails silently. And the two button
  // labels below must stay under 20 characters, or WhatsApp truncates them.
  //
  // English only on purpose: Pidgin and Igbo are still shown to learners as
  // coming soon, and getPrompt falls back to `en`, so a half-translated notice
  // cannot reach anybody. It goes through the translation workflow with the
  // rest of the content when those languages are enabled.
  privacy_notice: {
    en: [
      "Before we begin, a quick note about your privacy.",
      "",
      "To provide this learning programme, TechHerNG will collect your WhatsApp number, name, preferred language, location and information about your learning progress.",
      "",
      "We use this information to register you, provide your lessons, track your progress, support you, provide incentives or rewards where you qualify, and prepare programme reports. We do not sell your personal information.",
      "",
      "You can ask to see or correct your information or request deletion where applicable. We may need to keep some records for programme reporting or legal requirements, but we will only keep information for as long as necessary.",
      "",
      "Read our full Privacy Notice: https://www.shetrades.digital/privacy",
      "",
      "Would you like to continue?"
    ].join("\n")
  },
  privacy_accept_label: {
    en: "CONTINUE"
  },
  privacy_decline_label: {
    en: "EXIT"
  },
  // Deliberately not a dead end. Consent that cannot be reconsidered is weaker
  // than consent that can, and at this point the only thing held about her is
  // her number and the language she picked.
  privacy_declined: {
    en: "No problem. We have not collected anything else about you. If you change your mind, send us a message any time and we will start again."
  },

  // --- Erasure on request --------------------------------------------------
  privacy_menu_label: {
    en: "My data and privacy"
  },
  privacy_menu_description: {
    en: "See what we hold, or ask us to delete it"
  },
  privacy_data_summary: {
    en: "We hold your WhatsApp number, the name you gave us, your language, your location, and your progress through the lessons.\n\nRead our full Privacy Notice: https://www.shetrades.digital/privacy\n\nYou can ask us to delete all of it."
  },
  privacy_erase_button: {
    en: "Delete my info"
  },
  privacy_keep_button: {
    en: "No, keep it"
  },
  // Every irreversible consequence stated before she can confirm, not after.
  // Losing a certificate is the one she is least likely to expect, so it is
  // named rather than covered by "your information".
  privacy_erase_confirm: {
    en: "Are you sure?\n\nThis cannot be undone. We will delete your name, your number, your progress and your quiz results. If you have earned a certificate, it will be deleted too and its link will stop working for anyone you have shared it with.\n\nYou can start the programme again later, but you would begin from the first lesson."
  },
  privacy_erase_confirm_button: {
    en: "Yes, delete it"
  },
  privacy_erase_cancel_button: {
    en: "Cancel"
  },
  privacy_erase_cancelled: {
    en: "Nothing has been deleted. Your progress is safe."
  },
  // She is given the reference because it is the only thing that connects her
  // to the record that the erasure happened, and it points only one way.
  privacy_erase_done: {
    en: "Your information has been deleted.\n\nYour reference is {ref}. Keep it if you ever need to ask us whether your request was carried out.\n\nThank you for being part of the programme."
  },
  privacy_erase_failed: {
    en: "Something went wrong and nothing has been deleted. Please try again in a few minutes, or contact us if it keeps happening."
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
  module_lessons_remaining: "Bot · Module has unfinished lessons",
  main_menu_button: "Bot · Main menu list button",
  main_menu_section: "Bot · Main menu section title",
  faq_header: "Bot · FAQ list header",
  faq_button: "Bot · FAQ list button",
  faq_empty: "Bot · FAQ empty state",
  faq_answer_hint: "Bot · FAQ answer hint",
  faq_missing_answer: "Bot · FAQ missing answer",
  resources_header: "Bot · Resources list header",
  resources_button: "Bot · Resources list button",
  resources_empty: "Bot · Resources empty state",
  resources_answer_hint: "Bot · Resource content hint",
  resources_missing_content: "Bot · Resource missing content",
  language_coming_soon: "Bot · Language coming soon",
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
  module_menu_button: "Bot · Module menu button",
  certificate_congrats: "Bot · Certificate congratulations",
  certificate_confirm_yes: "Bot · Certificate confirm button",
  certificate_confirm_change: "Bot · Certificate change-name button",
  certificate_name_prompt: "Bot · Certificate name prompt",
  certificate_name_too_long: "Bot · Certificate name too long",
  certificate_name_empty: "Bot · Certificate name empty",
  certificate_sent: "Bot · Certificate image caption",
  certificate_send_failed: "Bot · Certificate send failed",
  certificate_menu_label: "Bot · Certificate menu label",
  certificate_menu_description: "Bot · Certificate menu description",
  certificate_not_ready: "Bot · Certificate not ready",
  privacy_notice: "Bot · Privacy notice (shown before anything is collected)",
  privacy_accept_label: "Bot · Privacy notice continue button",
  privacy_decline_label: "Bot · Privacy notice exit button",
  privacy_declined: "Bot · Privacy notice declined",
  privacy_menu_label: "Bot · Privacy menu label",
  privacy_menu_description: "Bot · Privacy menu description",
  privacy_data_summary: "Bot · What we hold about you",
  privacy_erase_button: "Bot · Delete my information button",
  privacy_keep_button: "Bot · Keep my information button",
  privacy_erase_confirm: "Bot · Delete confirmation warning",
  privacy_erase_confirm_button: "Bot · Delete confirm button",
  privacy_erase_cancel_button: "Bot · Delete cancel button",
  privacy_erase_cancelled: "Bot · Delete cancelled",
  privacy_erase_done: "Bot · Delete completed (use {ref} for the reference)",
  privacy_erase_failed: "Bot · Delete failed"
};
