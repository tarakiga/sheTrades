# WhatsApp Number Go-Live Runbook

Moving the SheTrades bot from Meta's **test number** to the **real business
number** learners will message.

**Audience:** whoever holds the business phone/SIM, plus a platform admin.
**Time:** ~30 minutes of active work, plus Meta's display-name review (hours
to a couple of days).
**Reversible:** yes — see [Rollback](#rollback).

> Meta redesigns its console regularly. Menu labels below may shift slightly;
> the sequence and the concepts do not.

---

## Where we are today

| | |
|---|---|
| Meta App | SheTrades Bot (`1343120591357878`) — **Mode: Live** ✅ |
| WhatsApp Business Account (WABA) | `991712293855596` |
| Current number | `+1 555-136-9480` — **Meta test number**, capped at 5 allowlisted recipients ❌ |
| Access token | System User token, **never expires** ✅ (does **not** change during this process) |
| App secret | Configured, signature verification enforced ✅ |
| Webhook | Subscribed at the app/WABA level ✅ (carries over to the new number) |

**The only thing being replaced is the phone number and its Phone Number ID.**

---

## STOP — decide this first

**Is the business number currently used for human conversations?**

A number can live on the WhatsApp **Business App** *or* the **Cloud API**, never
both. After migration:

- ❌ Nobody can use the WhatsApp Business App with that number again.
- ❌ Existing chat history on that number is permanently lost.
- ✅ Every inbound message goes to the bot instead.

| If… | Then |
|---|---|
| The number is new / unused | Migrate it. No downside. Proceed. |
| Staff actively chat with people on it | **Do not migrate.** Get a separate number for the bot, or the client loses that support channel. |
| Unsure | Ask TechHer before touching anything. Deleting the account is not undoable for history. |

Get this confirmed **in writing** from the client before Phase 1.

---

## Phase 1 — Free the number from the WhatsApp Business App

*Skip entirely if the number has never been used on WhatsApp.*

1. **Back up chat history** (archive only — it will not appear in the new setup):
   WhatsApp Business App → **Settings → Chats → Chat backup → Back up**.
   Also export individual chats if any are important:
   open chat → **⋮ → More → Export chat**.
2. **Disable two-step verification** (blocks re-registration if left on):
   **Settings → Account → Two-step verification → Turn off**.
3. **Delete the account from the app:**
   **Settings → Account → Delete my account** → enter the number → confirm.
4. **Wait ~3 minutes** for Meta to release the number.

---

## Phase 2 — Register the number on the Cloud API

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps**
   → **SheTrades Bot** → **WhatsApp → API Setup**.
2. Click **Add phone number**.
3. Confirm it is being added to WABA **`991712293855596`** (the existing one) —
   not a newly created account. Our platform config points at that WABA ID.
4. Enter:
   - **Display name** — must match the business name on the CAC document TechHer
     submitted for verification. Meta reviews this; a mismatch gets rejected.
   - **Business category** and description.
5. Enter the phone number → choose **SMS** or **Voice call** verification.
6. Enter the code Meta sends. *(Have the SIM in a handset and to hand.)*
7. The number now appears in the **From** dropdown on the API Setup page.
8. **Copy the new Phone Number ID** — the long numeric ID shown beneath the
   number. This is the one value the platform needs.

> Display-name review runs in the background. The number works immediately;
> until the name is approved **and** business verification completes, learners
> see the phone number rather than the brand name.

---

## Phase 3 — Point the platform at the new number

No deploy required — this is a config change.

1. Log in to the dashboard as an admin.
2. **Settings → Integrations → WhatsApp**.
3. Replace **Phone Number ID** with the value from Phase 2, step 8.
   - Leave **Access Token** unchanged (permanent System User token).
   - Leave **Business Account ID**, **Verify Token**, and **App Secret** unchanged.
4. Click **Test Connection** → must report success.
5. **Publish**. Live within ~60 seconds (config cache refresh).

---

## Phase 4 — Prove it works BEFORE opening the doors

Do this while the recipient allowlist still protects you.

1. From your own phone, message the **new business number** on WhatsApp: `hi`
2. Expected: the bot asks for your name → language → state → main menu with
   5 rows (Start Learning / My Progress / Change Language / FAQs / Resources).
3. Walk one lesson and one quiz question to confirm content loads.
4. Confirm in the dashboard that you appear under **Users**.
5. If nothing arrives, see [Troubleshooting](#troubleshooting).

---

## Phase 5 — Go live

1. **Add a payment method to the WABA** — Meta **Business Settings → WhatsApp
   Accounts → [your WABA] → Payment settings**. Without this, sends fail once
   the free allowance is used. Easy to miss because testing works fine without it.
2. Confirm **App Mode: Live** (already set).
3. Clear test data if any accumulated during Phase 4:
   `npm run ops:reset-learner-data -w @shetrades/backend -- --confirm`
4. Share the number / QR poster with learners.

**Messaging limits until business verification completes:** 250
*business-initiated* conversations per 24 hours. **Learner-initiated
conversations are unlimited** — and since learners always message first, this
rarely bites. Limits tier up automatically after verification.

---

## Rollback

To return the number to the WhatsApp Business App:

1. Meta app dashboard → **WhatsApp → API Setup** → select the number →
   **Delete/deregister**.
2. Re-install the WhatsApp Business App and register the number normally.
3. Chat history from the Cloud API period does not transfer.

Meanwhile the platform keeps working if you point the Phone Number ID back at
the test number (`1234106906450551`).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "This number is already registered" | Business App account not fully deleted, or <3 min elapsed | Repeat Phase 1 step 3, wait, retry |
| Verification code never arrives | Number can't receive SMS from short codes | Use the **Voice call** option instead |
| Re-registration blocked | Two-step verification still on | Was Phase 1 step 2 done? If the app is already deleted, wait 7 days or contact Meta support |
| Bot silent after Phase 3 | Wrong Phone Number ID, or config not published | Re-check the ID; confirm **Test Connection** passes; confirm you clicked Publish |
| Bot silent, Test Connection passes | Webhook not receiving | Check Cloud Run logs for `whatsapp.webhook.rejected`. Reason `signature_invalid` = the App Secret in our config doesn't match the app's current secret |
| Display name rejected | Doesn't match CAC / breaks Meta's naming policy | Resubmit with the exact registered business name |
| Messages fail after some volume | No payment method on the WABA | Phase 5 step 1 |

---

## Notes for the platform admin

- The **access token never changes** here. If it ever does need rotating, it must
  be a **System User** token (Business Settings → System Users), *not* the
  24-hour temporary token shown on the API Setup page.
- Webhook signature verification **fails closed** as of rev `00115-jm7`: an
  unsigned or wrongly-signed request is rejected with 401, and a missing App
  Secret returns 503. Do not clear the App Secret field.
- Scripts driving the bot via the sandbox header must also send
  `X-SheTrades-Sandbox-Token`
  (`gcloud secrets versions access latest --secret=whatsapp-sandbox-token`).
