# WhatsApp Content Compliance Audit — Lesson Content

_Audited the **43 published lessons / 129 quiz questions** currently live in staging against the WhatsApp Cloud API delivery limits, using the actual message-assembly code in `backend/src/whatsapp/handler.ts` + `sender.ts`._

## How lessons are delivered (this determines which limit applies)

Lessons are sent as **interactive button messages** — `handler.ts:604` returns `buttons: ["QUIZ","MENU"]`, and `sender.ts` therefore builds `type: "interactive"`. The assembled body is:

```
📖 {title}\n\n{languages[lang]}{quiz_instruction}
```

WhatsApp caps an **interactive message body at 1024 characters** (plain-text messages allow 4096, but the bot doesn't use those for lessons). `sender.ts` clips button/row *titles* but does **not** clip body text — so any lesson whose assembled body exceeds 1024 is **rejected by WhatsApp on send**, logged as `whatsapp.send.failed`, and the learner receives **nothing**.

| Field | Delivered as | Limit | If exceeded |
|---|---|---|---|
| **Lesson message** (`📖 title + body + quiz prompt`) | interactive body | **1024** | **Send rejected — not clipped** |
| **Quiz message** (question + options + prompt) | interactive body | **1024** | **Send rejected — not clipped** |
| Quiz option / button label | reply button title | 20 (auto-clipped) | Label truncated; max **3** buttons |
| Module-menu button label | reply button title | 20 (auto-clipped) | Label truncated |
| List row title / description | list row | 24 / **72** | title clipped; **description NOT clipped → rejected** |

Configured prompt suffixes counted into the 1024 budget: `quiz_instruction` **82**, `quiz_time_header` **23**, `quiz_answer_prompt` **51** chars.

## ❌ CRITICAL — 27 of 43 lessons exceed 1024 (WhatsApp will REJECT the send)

`over` = characters that must be removed (from body and/or title) to deliver. All offenders are the **English** body (Pidgin/Igbo versions are all ≤1024).

| Lesson key | Msg chars | Body | Title | Over by |
|---|---|---|---|---|
| `content.lesson.m3_l9_w` | 1392 | 1272 | 34 | **368** |
| `content.lesson.m3_l5_w` | 1344 | 1228 | 30 | **320** |
| `content.lesson.m3_l8_c` | 1300 | 1169 | 45 | **276** |
| `content.lesson.m3_l7_i` | 1240 | 1114 | 40 | **216** |
| `content.lesson.m3_l6_s` | 1240 | 1118 | 36 | **216** |
| `content.lesson.m3_l3_s` | 1237 | 1112 | 39 | **213** |
| `content.lesson.m1_l4_s` | 1236 | 1095 | 55 | **212** |
| `content.lesson.m1_l9_u` | 1234 | 1113 | 35 | **210** |
| `content.lesson.m1_l5_c` | 1205 | 1087 | 32 | **181** |
| `content.lesson.m3_l2_h` | 1192 | 1080 | 26 | **168** |
| `content.lesson.m1_l6_f` | 1184 | 1066 | 32 | **160** |
| `content.lesson.m1_l2_m` | 1152 | 1035 | 31 | **128** |
| `content.lesson.m1_l7_y` | 1138 | 1012 | 40 | **114** |
| `content.lesson.m4_l6_n` | 1128 | 1008 | 34 | **104** |
| `content.lesson.m1_l3_h` | 1127 | 999 | 42 | **103** |
| `content.lesson.m3_l1_d` | 1113 | 996 | 31 | **89** |
| `content.lesson.m3_l4_i` | 1111 | 990 | 35 | **87** |
| `content.lesson.m4_l8_b` | 1104 | 981 | 37 | **80** |
| `content.lesson.m1_l8_w` | 1087 | 978 | 23 | **63** |
| `content.lesson.m4_l7_w` | 1082 | 967 | 29 | **58** |
| `content.lesson.m4_l4_t` | 1061 | 943 | 32 | **37** |
| `content.lesson.m4_l1_m` | 1043 | 935 | 22 | **19** |
| `content.lesson.m5_l6_f` | 1041 | 912 | 43 | **17** |
| `content.lesson.m4_l3_f` | 1040 | 888 | 66 | **16** |
| `content.lesson.m4_l5_b` | 1038 | 906 | 46 | **14** |
| `content.lesson.m5_l5_h` | 1037 | 906 | 45 | **13** |
| `content.lesson.m1_l1_m` | 1028 | 896 | 46 | **4** |

> Several near the bottom are over **mostly because of a long title** (e.g. `m4_l3_f` has a 66-char title) — shortening the title alone fixes them.

## ⚠️ NEAR LIMIT — 11 lessons at 900–1024 (little/no headroom)

`m4_l2_w` (977), `m2_l9_h` (974), `m5_l2_g` (972), `m5_l3_b` (946), `m5_l7_m` (942), `m5_l1_f` (941), `m2_l4_t` (939), `m2_l8_s` (936), `m2_l2_t` (936), `m5_l4_u` (921), `m2_l1_m` (919). Any copy edit or longer translation tips these over.

## Other findings

- **Quiz messages:** 0 over 1024 — all fit. ✅
- **Quiz structure:** all 129 questions have exactly **3 options**, matching the "1, 2, or 3" prompt and the 3-button UI. ✅
- **Quiz option button labels >20 chars: 226 options** will render **truncated** on the WhatsApp button (the full text still appears numbered in the body, and learners reply 1/2/3, so it's functional but untidy). Guideline: keep option text ≤20 chars.
- **Module button labels >20 chars:** 0 ✅  **Empty language bodies:** 0 ✅
- **Code note (not content):** the quiz sends `buttons:[opt1,opt2,opt3,"MENU"]`; `sender.ts` `.slice(0,3)` **drops the MENU button** during quizzes, so learners must type `menu`. Worth fixing in the handler/sender.

## Recommendations

1. **Trim the 27 over-limit lessons** so `title + body + quiz prompt ≤ 1024`. Priority by severity (Module 3 lessons are worst — five are 200–370 over).
2. **Add a guardrail in the content editor** + backend publish validation: a live character counter against the ~1024 WhatsApp budget (auto-subtracting the title + quiz-prompt overhead), warning/blocking on publish. Prevents recurrence and satisfies the project's server-side validation mandate.
3. **Optional (code):** to allow longer lessons, split the body across multiple WhatsApp messages (≤1024 each) with the buttons on the final chunk — removes the hard cap at the cost of multiple chat bubbles.
4. Keep quiz **option text ≤20 chars**; fix the dropped-MENU `.slice(0,3)` behaviour.
