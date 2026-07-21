# Reflection question candidates — content team review

Each row below is a quiz question whose options include a help-style or "not yet"
choice, which suggests it is a **check-in** rather than a knowledge question.

## Why this list exists

A tester found that in Module 2 Lesson 6, the question *"Did you run a chat backup
or set up a WhatsApp Business tool today?"* marked **"I need help migrating"** as
❌ incorrect and re-showed the same question. Investigating it turned up something
larger:

- **"Not yet" was also marked incorrect** — the more common honest answer.
- There is **no retry limit**, so the only ways out were MENU (which abandons the
  lesson) or claiming "Yes".
- Module completion drives a **real airtime reward payout**, so the bot was
  effectively paying learners to say they had done something they hadn't. That
  corrupts the completion figures reported to funders.

The bot now supports two question types. This worksheet decides which existing
questions should become the new type.

## What the two types mean

| | **Knowledge question** (`scored`) | **Check-in** (`reflection`) |
|---|---|---|
| Asks | what the learner *knows* | what the learner *did* |
| Wrong answers | marked ❌, learner retries | none — every answer is accepted |
| Progress | advances only when correct | always advances |
| Help option | not available | can be marked; flags the learner for follow-up |

**Marking a question as a check-in means every answer is accepted and the learner
advances.** Do NOT mark a genuine knowledge question as a check-in — that removes
real assessment. When in doubt, leave it as a knowledge question and add a note.

## How to fill this in

For each row set **Verdict** to `check-in` or `knowledge`. For check-ins, put the
option number (1, 2 or 3, as shown in the lesson) that represents the learner
asking for help — that option will flag them for follow-up on the `/users` page.

Leave **Help option #** blank for `knowledge` rows, and blank for any check-in
that has no help-style option.

| Lesson | Module | Q# | Lesson title | Verdict | Help option # |
|---|---|---|---|---|---|
| `m1_l2_m` | Module 1 | Q1 | My Phone Got Missing, What Now? | | |
| `m1_l3_h` | Module 1 | Q1 | Hacked WhatsApp Accounts? How to Stop Them | | |
| `m1_l6_f` | Module 1 | Q1 | Fake Alert Problem in the Market | | |
| `m1_l8_w` | Module 1 | Q1 | WhatsApp Eats All My MB | | |
| `m2_l6_m` | Module 2 | Q1 | My WhatsApp Business Shop | | |
| `m2_l8_s` | Module 2 | Q1 | Sending One Message to Many Customers - No Groups! | | |
| `m3_l4_i` | Module 3 | Q1 | I Have Sent the Money — Confirm It! | | |
| `m3_l5_w` | Module 3 | Q1 | Working Safely With POS Agents | | |
| `m3_l7_i` | Module 3 | Q1 | Is My Pricing Making Me Profit? Or Loss? | | |
| `m3_l8_c` | Module 3 | Q1 | Creating a WhatsApp Catalogue or Product List | | |
| `m4_l1_m` | Module 4 | Q1 | My Phone Belongs to Me | | |

`m2_l6_m` is the one the tester reported, so it is the obvious first candidate —
but it still needs the same human verdict as the rest.

## Applying a verdict

1. Open **Config → Content** in the admin dashboard and edit the lesson.
2. Go to the **Quiz** step and find the question.
3. Click **Check-in (no right answer)**. The correct-answer control disappears —
   that is expected, a check-in has no right answer.
4. Click **Mark as help request** under the option a learner would pick when
   stuck.
5. Save as a draft, preview, then publish.

Nothing changes for a question until someone does this. Every question is treated
as a knowledge question by default, so leaving a row unfilled is safe — it simply
keeps today's behaviour.

## Caveats

- **This list is derived from English option text only.** It matches on "need
  help" and "not yet", so a check-in phrased differently will not appear here.
  If you know of others, add rows.
- **The list is not proof.** A question can contain a soft-sounding option and
  still be a real knowledge question. The verdict column exists precisely because
  this needs a human judgement, not a text match.
- Once Pidgin and Igbo translations exist, the same review should be repeated
  against them — the option wording may not map one-to-one.
