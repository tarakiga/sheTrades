# WhatsApp Number Go-Live Runbook

Moving the SheTrades bot from Meta's **test number** to the **real business
number** learners will message.

**Audience:** whoever holds the business phone/SIM, plus a platform admin.
**Time:** ~30 minutes of active work, plus Meta's display-name review (hours
to a couple of days).
**Reversible:** yes — see [Rollback](#rollback).

---

## 🛑 PHASE 0 — BUSINESS VERIFICATION (hard blocker, 2026-08-17)

**Nothing below this line can proceed until the SheTrades Digital Project
business portfolio is verified with Meta.** The WhatsApp account is currently
**restricted**:

> Duration: Permanent
> - You can't start conversations with customers
> - You can't respond to messages from customers
> - **You can't have phone numbers added to it** ← blocks Phase 2

This is **not** a policy violation and there is **nothing to appeal**. It is
Meta's standard restriction on *unverified* portfolios, and "Permanent" means
"until you verify", not "forever". The API confirms the account itself is
healthy (`status: ACTIVE`, `account_review_status: APPROVED`,
`business_verification_status: not_verified`).

**Fix:** Business portfolio → WhatsApp account → **Start Verification**.
Needs the CAC certificate, proof of address, and usually a utility bill or
bank statement in the exact registered business name. Owned by TechHer.

**Meanwhile the test number keeps working.** Verified 2026-08-17: real
inbound messages from allowlisted testers still reach the platform and the bot
still replies. So client UAT can continue on the test number — only *launch*
is blocked.

> Verification also resolves two other pending items: the display name only
> shows to learners after it completes, and messaging limits tier up from 250
> business-initiated conversations/24h.

> Meta redesigns its console regularly. Menu labels below may shift slightly;
> the sequence and the concepts do not.

---

## Where we are today

Verified against Meta's Graph API on 2026-08-17. The portfolio holds **two**
WhatsApp Business Accounts:

| | Test WABA `991712293855596` | **Techherng WABA `1105900442606502`** |
|---|---|---|
| Name | "Test WhatsApp Business Account" | "Techherng" |
| Review status | APPROVED | APPROVED |
| Number | `+1 555-136-9480` (Meta test number) | **`+234 803 512 5590`** ← the real one |
| Phone Number ID | `1234106906450551` | `1092983957237129` |
| Display name | "Test Number" | "Techherng" |
| Platform | CLOUD_API | **ON_PREMISE** |
| Status | CONNECTED | **DISCONNECTED** |
| App subscribed for webhooks | ✅ SheTrades Bot | ❌ **NONE** |

Other constants:

| | |
|---|---|
| Meta App | SheTrades Bot (`1343120591357878`) — **Mode: Live** ✅ |
| Access token | System User token, **never expires**, and already has access to **both** WABAs ✅ |
| App secret | Configured; signature verification enforced (fails closed) ✅ |

### What this means

**Plan: use the Techherng WABA, not the test one.** The real number already
lives there, that account is already APPROVED and owned by the right portfolio,
and our token can already read it. The other account is a scaffold Meta created
automatically for the test number — its name ("Test WhatsApp Business Account")
can surface in Meta surfaces, so it is not a good permanent home.

**Three things change, not one:**

1. The number gets registered on **Cloud API** (it is currently ON_PREMISE /
   DISCONNECTED — i.e. not serving any live API).
2. The SheTrades Bot app must be **subscribed to the Techherng WABA** for
   webhooks. It currently is not. ← *Miss this and everything looks correctly
   configured while the bot stays completely silent.*
3. Our config needs **both** `phoneNumberId` **and** `businessAccountId` updated.

---

## STOP — decide this first

The number shows **DISCONNECTED**, so it is not currently serving an API
integration — migrating it cannot break a live system. But the WhatsApp
**Business App** is not an "API connection", so it could still be in use on
someone's handset.

**Ask TechHer: is anyone messaging people from +234 803 512 5590 today?**

A number can live on the WhatsApp Business App *or* the Cloud API, never both.
After migration:

- ❌ Nobody can use the WhatsApp Business App with that number again.
- ❌ Existing chat history on that number is permanently lost.
- ✅ Every inbound message goes to the bot instead.

| If… | Then |
|---|---|
| Nobody uses it / it is reserved for the bot | Proceed. No downside. |
| Staff actively chat with people on it | **Stop.** Use a separate number for the bot, or the client loses that support channel. |
| Unsure | Ask before touching anything. Account deletion is not undoable for history. |

Get this confirmed **in writing** before Phase 1.

> **Display name bonus:** the number's verified name is already **"Techherng"**.
> If that matches the CAC document, the display-name decision is effectively
> already made — confirm with TechHer rather than inventing a new name.

---

## Phase 1 — ONLY IF Phase 2 is blocked

> ⚠️ **Try Phase 2 first.** Attempting registration is non-destructive — the worst
> outcome is an error message. Do **not** delete anything until Meta actually
> blocks you, because account deletion permanently destroys chat history.
>
> ⚠️ **"Delete the account" means the account inside the WhatsApp Business App on
> the physical handset.** It does **NOT** mean deleting anything on the Meta
> portfolio / Business Manager page. Never delete the Techherng WABA
> (`1105900442606502`) — that is the account we are migrating *into*; deleting it
> would throw away an APPROVED account, the number's registration and any
> message templates.

**Prerequisite for Phase 2 regardless of this phase:** someone must have the SIM
in a handset to read the verification code. That person can also just tell you
whether the Business App is installed with this number — more reliable than
inferring it from an error.

If Phase 2 reports the number is already registered:

1. **Back up chat history** on the handset (archive only — it will not appear in
   the new setup): WhatsApp Business App → **Settings → Chats → Chat backup →
   Back up**. Export individual important chats via
   open chat → **⋮ → More → Export chat**.
2. **Disable two-step verification** (blocks re-registration if left on):
   **Settings → Account → Two-step verification → Turn off**.
   *Note the 6-digit PIN before turning it off — the on-premise→Cloud API
   migration flow may ask for it.*
3. **Delete the account from the app:**
   **Settings → Account → Delete my account** → enter the number → confirm.
4. **Wait ~3 minutes** for Meta to release the number, then retry Phase 2.

### If the block is the ON_PREMISE record, not the Business App

The number already exists in the Techherng WABA as `ON_PREMISE / DISCONNECTED`
with id `1092983957237129`. Meta may therefore offer a **migrate to Cloud API**
path rather than a fresh "add number" — that flow asks for the number's
**two-step verification PIN**, not an SMS code. If nobody knows the PIN it can be
reset from the WhatsApp Manager for that number. Read the console's error text
before assuming the handset app is the obstacle.

---

## Phase 2 — Register the number on the Cloud API ← **START HERE**

**Have the SIM in a handset before you begin** — Meta sends a verification code
to it.

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps**
   → **SheTrades Bot** → **WhatsApp → API Setup**.
2. At the top, switch the **WhatsApp Business Account selector** to
   **"Techherng"** (`1105900442606502`). *Do not* add the number to the test
   account.
3. Click **Add phone number** and enter `+234 803 512 5590`.
   - If Meta reports the number already exists on this account, look for a
     **register / connect to Cloud API** action instead — it is currently
     recorded as ON_PREMISE and needs re-registering onto Cloud API.
4. Set the **Display name**. It is currently "Techherng" — keep it if that
   matches the CAC document, otherwise enter the exact registered business name.
   Meta reviews this and rejects mismatches.
5. Choose **SMS** or **Voice call** verification, then enter the code.
   *(Have the SIM in a handset and to hand.)*
6. Confirm the number now shows **platform: CLOUD_API** and
   **status: CONNECTED**.
7. **Copy the Phone Number ID** shown beneath the number. It may differ from the
   old ON_PREMISE id (`1092983957237129`) — use whatever is displayed now.

---

## Phase 3 — Subscribe the app to the Techherng WABA ⚠️

**Do not skip.** Webhook subscriptions are per-WABA. The SheTrades Bot app is
subscribed to the *test* account only; without this step the number will send
fine but **no inbound message will ever reach the bot**, with no error anywhere.

**In the console:** app dashboard → **WhatsApp → Configuration** → with the
Techherng WABA selected, confirm the app is subscribed and the **`messages`**
webhook field is ticked. Callback URL:
`https://<backend-url>/webhook/whatsapp`, verify token as stored in config.

**Or via API** (uses the existing System User token):

```bash
curl -X POST "https://graph.facebook.com/v23.0/1105900442606502/subscribed_apps" \
  -H "Authorization: Bearer $WHATSAPP_TOKEN"
```

**Verify it took:**

```bash
curl -s "https://graph.facebook.com/v23.0/1105900442606502/subscribed_apps" \
  -H "Authorization: Bearer $WHATSAPP_TOKEN"
```

Expect `SheTrades Bot` / `1343120591357878` in the response. An empty `data`
array means it did not work — fix before continuing.

---

## Phase 4 — Point the platform at the new number

No deploy required — this is a config change.

1. Log in to the dashboard as an admin.
2. **Settings → Integrations → WhatsApp**.
3. Update **two** fields:
   - **Phone Number ID** → the value from Phase 2, step 7.
   - **Business Account ID** → `1105900442606502`.
4. Leave **Access Token**, **Verify Token**, and **App Secret** unchanged.
5. Click **Test Connection** → must report success.
6. **Publish**. Live within ~60 seconds (config cache refresh).

---

## Phase 5 — Prove it works BEFORE opening the doors

Do this while the recipient allowlist still protects you.

1. From your own phone, message the **new business number** on WhatsApp: `hi`
2. Expected: the bot asks for your name → language → state → main menu with
   5 rows (Start Learning / My Progress / Change Language / FAQs / Resources).
3. Walk one lesson and one quiz question to confirm content loads.
4. Confirm in the dashboard that you appear under **Users**.
5. If nothing arrives, see [Troubleshooting](#troubleshooting).

---

## Phase 6 — Go live

1. **Add a payment method to the Techherng WABA** — Meta **Business Settings →
   WhatsApp Accounts → Techherng → Payment settings**. Without this, sends fail
   once the free allowance is used. Easy to miss because testing works fine
   without it.
2. Confirm **App Mode: Live** (already set).
3. Clear test data accumulated during Phase 5:
   `npm run ops:reset-learner-data -w @shetrades/backend -- --confirm`
4. Regenerate the QR / wa.me poster with the real number, then share it.

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
| **Bot silent, Test Connection passes, no errors anywhere** | **App not subscribed to the Techherng WABA** — the most likely failure | Redo **Phase 3** and verify `subscribed_apps` is non-empty |
| Bot silent after Phase 4 | Wrong Phone Number ID, or config not published | Re-check the ID; confirm **Test Connection** passes; confirm you clicked Publish |
| Bot silent, subscription confirmed | Webhook rejected | Check Cloud Run logs for `whatsapp.webhook.rejected`. Reason `signature_invalid` = the App Secret in our config doesn't match the app's current secret |
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
