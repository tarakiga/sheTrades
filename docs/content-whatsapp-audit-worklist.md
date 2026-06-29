# WhatsApp Content Audit — Correction Worklist

_Pinpointable lists to clean up **before** enabling the editor guardrail. Counts are the assembled interactive-message length `📖 {title}

{body}{quiz_instruction}` (WhatsApp interactive-body limit = **1024**). Companion spreadsheets: `lesson_body_audit.csv`, `quiz_option_labels_audit.csv`._

## CRITICAL FINDING — Pidgin & Igbo are placeholders

**All 43 lessons** have their `pcm` (Pidgin) and `ig` (Igbo) bodies set to the literal default `"Welcome content"` (15 chars). Only the **English** body holds real lesson text. Any learner who selects Pidgin or Igbo receives `📖 {title}

Welcome content` for every lesson. The over-1024 problem is therefore **English-only**; pcm/ig are far under the limit but are **empty of real content**.

## A. Lesson message body audit — all 43 lessons

`*` = OVER 1024 (send rejected) · `~` = NEAR (900–1023) · plain = OK. Columns are assembled-message chars per language.

| Lesson | Module | en | pcm | ig | Status | Title |
|---|---|---|---|---|---|---|
| `m3_l9_w` | Module 3: Financial Tools and E-commerce | 1392* | 135 | 135 | OVER | What My Records Say After One Week |
| `m3_l5_w` | Module 3: Financial Tools and E-commerce | 1344* | 131 | 131 | OVER | Working Safely With POS Agents |
| `m3_l8_c` | Module 3: Financial Tools and E-commerce | 1300* | 146 | 146 | OVER | Creating a WhatsApp Catalogue or Product List |
| `m3_l7_i` | Module 3: Financial Tools and E-commerce | 1240* | 141 | 141 | OVER | Is My Pricing Making Me Profit? Or Loss? |
| `m3_l6_s` | Module 3: Financial Tools and E-commerce | 1240* | 137 | 137 | OVER | Saving Money Small Small — Digitally |
| `m3_l3_s` | Module 3: Financial Tools and E-commerce | 1237* | 140 | 140 | OVER | Small Daily Expenses Eating Your Profit |
| `m1_l4_s` | Module 1: Digital Safety | 1236* | 156 | 156 | OVER | Send Me Your OTP: The Call That Collects People's Money |
| `m1_l9_u` | Module 1: Digital Safety | 1234* | 136 | 136 | OVER | Using Voice Notes for Your Business |
| `m1_l5_c` | Module 1: Digital Safety | 1205* | 133 | 133 | OVER | Check That Link Before You Click |
| `m3_l2_h` | Module 3: Financial Tools and E-commerce | 1192* | 127 | 127 | OVER | House Money or Shop Money? |
| `m1_l6_f` | Module 1: Digital Safety | 1184* | 133 | 133 | OVER | Fake Alert Problem in the Market |
| `m1_l2_m` | Module 1: Digital Safety | 1152* | 132 | 132 | OVER | My Phone Got Missing, What Now? |
| `m1_l7_y` | Module 1: Digital Safety | 1138* | 141 | 141 | OVER | Your Privacy Matters More Than You Think |
| `m4_l6_n` | Module 4: Women's Rights and Digital Well-Being | 1128* | 135 | 135 | OVER | Nigerian Law and Online Harassment |
| `m1_l3_h` | Module 1: Digital Safety | 1127* | 143 | 143 | OVER | Hacked WhatsApp Accounts? How to Stop Them |
| `m3_l1_d` | Module 3: Financial Tools and E-commerce | 1113* | 132 | 132 | OVER | Did I Really Make Profit Today? |
| `m3_l4_i` | Module 3: Financial Tools and E-commerce | 1111* | 136 | 136 | OVER | I Have Sent the Money — Confirm It! |
| `m4_l8_b` | Module 4: Women's Rights and Digital Well-Being | 1104* | 138 | 138 | OVER | Becoming a Safe Woman for Other Women |
| `m1_l8_w` | Module 1: Digital Safety | 1087* | 124 | 124 | OVER | WhatsApp Eats All My MB |
| `m4_l7_w` | Module 4: Women's Rights and Digital Well-Being | 1082* | 130 | 130 | OVER | When WhatsApp Feels Too Heavy |
| `m4_l4_t` | Module 4: Women's Rights and Digital Well-Being | 1061* | 133 | 133 | OVER | Things Never to Be Shared Online |
| `m4_l1_m` | Module 4: Women's Rights and Digital Well-Being | 1043* | 123 | 123 | OVER | My Phone Belongs to Me |
| `m5_l6_f` | Module 5: Civic Participation Online | 1041* | 144 | 144 | OVER | Finding the Right Women and Business Groups |
| `m4_l3_f` | Module 4: Women's Rights and Digital Well-Being | 1040* | 167 | 167 | OVER | Fake Love, Fake Accounts, and People Pretending to Be Someone Else |
| `m4_l5_b` | Module 4: Women's Rights and Digital Well-Being | 1038* | 147 | 147 | OVER | Blocking, Reporting, and Protecting Your Peace |
| `m5_l5_h` | Module 5: Civic Participation Online | 1037* | 146 | 146 | OVER | How and to Whom To Report Community Problems? |
| `m1_l1_m` | Module 1: Digital Safety | 1028* | 147 | 147 | OVER | My Phone for More Than Calls and WhatsApp Gist |
| `m4_l2_w` | Module 4: Women's Rights and Digital Well-Being | 977~ | 143 | 143 | NEAR | What Online Harassment Actually Looks Like |
| `m2_l9_h` | Module 2: Digital Marketing | 974~ | 133 | 133 | NEAR | Happy Customers, More Customers! |
| `m5_l2_g` | Module 5: Civic Participation Online | 972~ | 150 | 150 | NEAR | Government Has Started Sharing Money, Is It True? |
| `m5_l3_b` | Module 5: Civic Participation Online | 946~ | 145 | 145 | NEAR | Before You Forward That Message, Check Again |
| `m5_l7_m` | Module 5: Civic Participation Online | 942~ | 117 | 117 | NEAR | My Voice Matters |
| `m5_l1_f` | Module 5: Civic Participation Online | 941~ | 143 | 143 | NEAR | Finding Useful Business Information Online |
| `m2_l4_t` | Module 2: Digital Marketing | 939~ | 146 | 146 | NEAR | Turning My Product Photo Into a Simple Flyer  |
| `m2_l8_s` | Module 2: Digital Marketing | 936~ | 151 | 151 | NEAR | Sending One Message to Many Customers - No Groups! |
| `m2_l2_t` | Module 2: Digital Marketing | 936~ | 143 | 143 | NEAR | The Right Photo to Get the Right Customer  |
| `m5_l4_u` | Module 5: Civic Participation Online | 921~ | 154 | 154 | NEAR | Using Your Phone to Document a Problem in Your Market |
| `m2_l1_m` | Module 2: Digital Marketing | 919~ | 139 | 139 | NEAR | My Free Shop Banner - WhatsApp Status  |
| `m2_l6_m` | Module 2: Digital Marketing | 896 | 126 | 126 | OK | My WhatsApp Business Shop |
| `m2_l10_p` | Module 2: Digital Marketing | 893 | 133 | 133 | OK | Posting Regularly Without Stress |
| `m2_l3_a` | Module 2: Digital Marketing | 883 | 145 | 145 | OK | Available Is Not Enough - Captions That Sell |
| `m2_l7_r` | Module 2: Digital Marketing | 873 | 127 | 127 | OK | Replying My Customers Well |
| `m2_l5_s` | Module 2: Digital Marketing | 867 | 133 | 133 | OK | Social Media Promotional Posting |

**Totals:** 43 lessons — **27 OVER**, **11 NEAR**, 5 OK. (All OVER/NEAR are the English body.)

## B. Lesson messages NEAR the limit (900–1023, English) — watch when editing

| Lesson | English msg chars | Headroom | Title |
|---|---|---|---|
| `m4_l2_w` | 977 | 47 | What Online Harassment Actually Looks Like |
| `m2_l9_h` | 974 | 50 | Happy Customers, More Customers! |
| `m5_l2_g` | 972 | 52 | Government Has Started Sharing Money, Is It True? |
| `m5_l3_b` | 946 | 78 | Before You Forward That Message, Check Again |
| `m5_l7_m` | 942 | 82 | My Voice Matters |
| `m5_l1_f` | 941 | 83 | Finding Useful Business Information Online |
| `m2_l4_t` | 939 | 85 | Turning My Product Photo Into a Simple Flyer  |
| `m2_l8_s` | 936 | 88 | Sending One Message to Many Customers - No Groups! |
| `m2_l2_t` | 936 | 88 | The Right Photo to Get the Right Customer  |
| `m5_l4_u` | 921 | 103 | Using Your Phone to Document a Problem in Your Market |
| `m2_l1_m` | 919 | 105 | My Free Shop Banner - WhatsApp Status  |

## C. Quiz option button labels over 20 chars (truncated on the button)

Grouped by lesson. `Q`=question #, `opt`=option #, then length and text. Full text still shows numbered in the body; learners reply 1/2/3.

**`m1_l1_m`** — My Phone for More Than Calls and WhatsApp Gist  (5 over)
- Q1 opt2 (21): I tried but got stuck
- Q2 opt2 (36): Shared her product, price and number
- Q3 opt1 (21): Charging your battery
- Q3 opt2 (23): Raising ringtone volume
- Q3 opt3 (22): Sending product photos

**`m1_l2_m`** — My Phone Got Missing, What Now?  (4 over)
- Q1 opt2 (21): I tried but need help
- Q2 opt3 (25): Her contacts were deleted
- Q3 opt1 (24): Wait and hope it returns
- Q3 opt2 (22): Block your SIM quickly

**`m1_l3_h`** — Hacked WhatsApp Accounts? How to Stop Them  (4 over)
- Q1 opt2 (21): I tried but need help
- Q2 opt2 (21): Send the code quickly
- Q2 opt3 (28): Ask a friend to help send it
- Q3 opt3 (21): The person who called

**`m1_l4_s`** — Send Me Your OTP: The Call That Collects People's Money  (5 over)
- Q2 opt1 (25): Your account is in danger
- Q2 opt2 (24): Your bank needs the code
- Q2 opt3 (24): It is most likely a scam
- Q3 opt2 (21): Send it and stay safe
- Q3 opt3 (24): Ask your neighbour first

**`m1_l5_c`** — Check That Link Before You Click  (5 over)
- Q2 opt1 (21): Forward it to friends
- Q2 opt2 (23): Click quickly to get it
- Q2 opt3 (24): Stop and check carefully
- Q3 opt1 (21): Check carefully first
- Q3 opt2 (24): Click and see what opens

**`m1_l6_f`** — Fake Alert Problem in the Market  (5 over)
- Q1 opt2 (22): I need help opening it
- Q2 opt1 (24): Check your account first
- Q2 opt3 (25): Give the goods to be kind
- Q3 opt2 (24): Trust what they show you
- Q3 opt3 (24): Confirm payment yourself

**`m1_l7_y`** — Your Privacy Matters More Than You Think  (6 over)
- Q1 opt2 (27): I looked but did not change
- Q2 opt1 (21): Deleting her WhatsApp
- Q2 opt2 (29): Updating her privacy settings
- Q2 opt3 (25): Changing her phone number
- Q3 opt1 (26): Control who sees your info
- Q3 opt2 (24): Increase your data speed

**`m1_l8_w`** — WhatsApp Eats All My MB  (4 over)
- Q1 opt2 (22): I need help finding it
- Q2 opt2 (22): Turn off auto-download
- Q2 opt3 (23): Buy more data every day
- Q3 opt3 (25): Turn off auto-downloading

**`m1_l9_u`** — Using Voice Notes for Your Business  (6 over)
- Q1 opt2 (27): I recorded but did not send
- Q2 opt1 (31): Voice notes feel warm and clear
- Q2 opt2 (30): Customers prefer long messages
- Q2 opt3 (24): She used perfect English
- Q3 opt1 (24): Send it without checking
- Q3 opt3 (23): Record in a noisy place

**`m2_l10_p`** — Posting Regularly Without Stress  (3 over)
- Q2 opt1 (21): It deducts bank funds
- Q3 opt1 (22): Pacing a 3-day routine
- Q3 opt2 (22): Deleting business apps

**`m2_l2_t`** — The Right Photo to Get the Right Customer   (1 over)
- Q3 opt2 (22): To adjust phone volume

**`m2_l3_a`** — Available Is Not Enough - Captions That Sell  (2 over)
- Q1 opt2 (21): I feel shy to show it
- Q3 opt2 (22): It lowers product cost

**`m2_l4_t`** — Turning My Product Photo Into a Simple Flyer   (3 over)
- Q1 opt2 (23): I got stuck downloading
- Q3 opt1 (21): It saves battery life
- Q3 opt2 (21): It makes reading easy

**`m2_l5_s`** — Social Media Promotional Posting  (1 over)
- Q1 opt2 (21): No, but I will search

**`m2_l6_m`** — My WhatsApp Business Shop  (1 over)
- Q1 opt2 (21): I need help migrating

**`m2_l7_r`** — Replying My Customers Well  (1 over)
- Q2 opt1 (21): It consumes more data

**`m2_l8_s`** — Sending One Message to Many Customers - No Groups!  (1 over)
- Q1 opt2 (21): I need help making it

**`m2_l9_h`** — Happy Customers, More Customers!  (1 over)
- Q2 opt2 (21): Block private details

**`m3_l1_d`** — Did I Really Make Profit Today?  (4 over)
- Q1 opt2 (21): I tried but got stuck
- Q3 opt1 (30): Once a month when you remember
- Q3 opt2 (31): At the end of each business day
- Q3 opt3 (30): Only when something goes wrong

**`m3_l2_h`** — House Money or Shop Money?  (6 over)
- Q2 opt1 (29): Her business will look busier
- Q2 opt2 (47): She will not know if her business is profitable
- Q2 opt3 (33): Her customers will trust her more
- Q3 opt1 (31): Spending all profit on yourself
- Q3 opt2 (62): Taking a fixed amount regularly instead of dipping in randomly
- Q3 opt3 (41): Borrowing from family to run the business

**`m3_l3_s`** — Small Daily Expenses Eating Your Profit  (6 over)
- Q1 opt1 (26): Yes, I wrote them all down
- Q1 opt2 (31): I tracked some but missed a few
- Q2 opt3 (48): It does not matter because the amounts are small
- Q3 opt1 (23): At the end of the month
- Q3 opt2 (23): The moment you spend it
- Q3 opt3 (37): Only when the amount is above NGN 500

**`m3_l4_i`** — I Have Sent the Money — Confirm It!  (8 over)
- Q1 opt1 (27): Yes, I know how to check it
- Q1 opt2 (22): I need help finding it
- Q2 opt1 (42): Trust the screenshot and release the goods
- Q2 opt2 (52): Check her own bank account before releasing anything
- Q2 opt3 (25): Ask a neighbour to decide
- Q3 opt1 (28): The screenshot they show you
- Q3 opt2 (30): Their word that they have paid
- Q3 opt3 (43): Checking your own bank account or USSD code

**`m3_l5_w`** — Working Safely With POS Agents  (8 over)
- Q1 opt1 (26): Yes, I confirmed it myself
- Q1 opt2 (32): I need help knowing how to check
- Q2 opt1 (36): Try the transaction again to be safe
- Q2 opt2 (42): Refuse to pay again and request a reversal
- Q2 opt3 (34): Leave and hope it sorts itself out
- Q3 opt1 (33): Thank the agent and leave quickly
- Q3 opt2 (60): Confirm the transaction on your own banking app or USSD code
- Q3 opt3 (40): Ask the agent if everything went through

**`m3_l6_s`** — Saving Money Small Small — Digitally  (8 over)
- Q1 opt1 (28): Yes, I made my first deposit
- Q1 opt2 (39): I found the app but did not deposit yet
- Q2 opt1 (34): Hide the cash in a different place
- Q2 opt2 (38): Move her savings to a digital platform
- Q2 opt3 (28): Stop saving and spend freely
- Q3 opt1 (34): Saving a large amount once a month
- Q3 opt2 (45): Saving whatever is left at the end of the day
- Q3 opt3 (50): Saving a small fixed amount every day consistently

**`m3_l7_i`** — Is My Pricing Making Me Profit? Or Loss?  (4 over)
- Q1 opt2 (38): I tried but need help with the formula
- Q3 opt1 (41): The same as what others around you charge
- Q3 opt2 (50): Higher than your total cost including all expenses
- Q3 opt3 (44): As low as possible to attract more customers

**`m3_l8_c`** — Creating a WhatsApp Catalogue or Product List  (7 over)
- Q1 opt1 (26): Yes, my catalogue is ready
- Q1 opt2 (23): I started but need help
- Q2 opt1 (47): Type out all her products and prices one by one
- Q2 opt2 (70): Send her WhatsApp Catalogue link so the customer can browse everything
- Q2 opt3 (35): Ask the customer to visit her stall
- Q3 opt2 (65): A clear photo, product name, correct price, and short description
- Q3 opt3 (43): A long story about how the product was made

**`m3_l9_w`** — What My Records Say After One Week  (5 over)
- Q1 opt1 (28): Yes, I know my weekly profit
- Q1 opt2 (30): I looked but did not calculate
- Q3 opt1 (38): Ignore it and hope next week is better
- Q3 opt2 (55): Use it to find ways to reduce transport costs next week
- Q3 opt3 (23): Stop recording expenses

**`m4_l1_m`** — My Phone Belongs to Me  (7 over)
- Q1 opt2 (41): I tried but need help finding the setting
- Q2 opt1 (24): Her right to free speech
- Q2 opt2 (45): Her right to digital independence and privacy
- Q2 opt3 (22): Her right to education
- Q3 opt1 (41): True, nobody should ever touch your phone
- Q3 opt2 (61): it is about choosing who has access, not locking everyone out
- Q3 opt3 (44): True, sharing your phone is always dangerous

**`m4_l2_w`** — What Online Harassment Actually Looks Like  (9 over)
- Q1 opt1 (37): A friendly customer trying to connect
- Q1 opt2 (49): Online harassment, excessive and unwanted contact
- Q1 opt3 (29): Normal business communication
- Q2 opt1 (49): A customer showing appreciation for your products
- Q2 opt2 (56): Online harassment, specifically unwanted sexual advances
- Q2 opt3 (41): A normal way for customers to communicate
- Q3 opt1 (49): Delete it immediately so you don't have to see it
- Q3 opt2 (27): Reply and tell them to stop
- Q3 opt3 (53): Stay calm, do not delete it yet, and do not apologize

**`m4_l3_f`** — Fake Love, Fake Accounts, and People Pretending to Be Someone Else  (9 over)
- Q1 opt1 (49): Send the money because they seem to be in trouble
- Q1 opt2 (70): Recognize this as a major red flag, block them, and report the account
- Q1 opt3 (58): Ask for more details about their emergency before deciding
- Q2 opt1 (29): The person is very attractive
- Q2 opt2 (66): The profile has very few friends and quickly asks for bank details
- Q2 opt3 (39): The person wants to partner in business
- Q3 opt1 (46): Trust them if they sound friendly and educated
- Q3 opt2 (47): Send a small amount of money first to test them
- Q3 opt3 (72): Ask for a video call or do a reverse image search of their profile photo

**`m4_l4_t`** — Things Never to Be Shared Online  (9 over)
- Q1 opt1 (41): A photo of her new product with the price
- Q1 opt2 (54): A photo of her bank statement showing the large amount
- Q1 opt3 (65): A general message saying "Big sales today! Thank you, customers!"
- Q2 opt1 (22): Your full home address
- Q2 opt2 (76): A photo of your new product with its price and your business WhatsApp number
- Q2 opt3 (55): Your exact real-time location while away from your shop
- Q3 opt1 (48): Leave it, it is their post and not your business
- Q3 opt2 (49): Ask them to remove the tag or take down the photo
- Q3 opt3 (46): Share it yourself since they already posted it

**`m4_l5_b`** — Blocking, Reporting, and Protecting Your Peace  (8 over)
- Q1 opt1 (32): Yes, I reviewed and updated them
- Q1 opt2 (36): I looked but did not change anything
- Q2 opt1 (33): Reply and tell the person to stop
- Q2 opt2 (36): Block the unknown number on WhatsApp
- Q2 opt3 (23): Change her phone number
- Q3 opt1 (38): Reporting sends them a warning message
- Q3 opt2 (78): Reporting helps the platform act and protects other women from the same person
- Q3 opt3 (45): Reporting automatically deletes their account

**`m4_l6_n`** — Nigerian Law and Online Harassment  (6 over)
- Q1 opt1 (27): Reply to them one last time
- Q1 opt2 (50): Take dated screenshots of the messages as evidence
- Q1 opt3 (50): Delete the messages so you do not have to see them
- Q3 opt1 (58): Delete the messages so she does not have to see them again
- Q3 opt2 (113): Take dated screenshots, block and report on the platform, and consider reporting to the police given the severity
- Q3 opt3 (44): Ignore it completely since it is just online

**`m4_l7_w`** — When WhatsApp Feels Too Heavy  (5 over)
- Q1 opt2 (35): I did not know this feature existed
- Q2 opt1 (32): Digital stress or screen fatigue
- Q3 opt1 (52): Keep all notifications on so you never miss anything
- Q3 opt2 (90): Set specific phone work hours and turn off non-essential notifications outside those hours
- Q3 opt3 (63): Respond to every customer message immediately, even at midnight

**`m4_l8_b`** — Becoming a Safe Woman for Other Women  (9 over)
- Q1 opt1 (57): Start a public argument with the stranger in the comments
- Q1 opt2 (89): Send Joy a private message to offer support and report the insulting comments to Facebook
- Q1 opt3 (59): Share the stranger's profile with others to gang up on them
- Q2 opt1 (31): Because it is not your business
- Q2 opt2 (87): Because engaging them can escalate the situation and draw negative attention to you too
- Q2 opt3 (49): Because the platform will handle it automatically
- Q3 opt1 (61): Allow members to say anything,  freedom of expression matters
- Q3 opt2 (69): Set clear anti-harassment rules and actively moderate to enforce them
- Q3 opt3 (36): Only admit women you know personally

**`m5_l1_f`** — Finding Useful Business Information Online  (7 over)
- Q1 opt2 (47): I tried but I'm not sure I used the right words
- Q2 opt1 (40): A WhatsApp message forwarded by a friend
- Q2 opt2 (55): The official website of a government agency like SMEDAN
- Q2 opt3 (40): A blog post with no named author or date
- Q3 opt1 (45): Act on it immediately since it sounds helpful
- Q3 opt2 (69): Pause and check it against two or three other reputable sources first
- Q3 opt3 (38): Forward it to friends so they know too

**`m5_l2_g`** — Government Has Started Sharing Money, Is It True?  (7 over)
- Q1 opt2 (40): I don't have a message to test right now
- Q2 opt1 (61): It is a genuine opportunity, pay quickly before slots run out
- Q2 opt2 (61): It is a scam, legitimate grants never ask for upfront payment
- Q2 opt3 (57): You should forward it to friends so they can also benefit
- Q3 opt1 (60): A formal application process with clear eligibility criteria
- Q3 opt2 (56): "Forward this to everyone" pressure and urgent deadlines
- Q3 opt3 (48): A named contact person and proper office address

**`m5_l3_b`** — Before You Forward That Message, Check Again  (7 over)
- Q1 opt2 (43): I didn't have a suspicious message to check
- Q2 opt1 (57): Forward it immediately to protect your family and friends
- Q2 opt2 (66): Search the claim on Google and check official health sources first
- Q2 opt3 (40): Try the mixture first to see if it works
- Q3 opt1 (57): Because it is usually written by professional journalists
- Q3 opt2 (53): Because it triggers strong emotion and looks official
- Q3 opt3 (36): Because government agencies share it

**`m5_l4_u`** — Using Your Phone to Document a Problem in Your Market  (7 over)
- Q1 opt2 (33): I tried but I'm not confident yet
- Q2 opt1 (43): One quick, blurry close-up of just the hole
- Q2 opt2 (86): Clear photos from different angles showing the pothole, its size, and nearby landmarks
- Q2 opt3 (44): A photo with no date or location information
- Q3 opt1 (44): Delete it immediately to free up phone space
- Q3 opt2 (56): Keep it saved safely until the problem is fully resolved
- Q3 opt3 (36): Send it to everyone in your contacts

**`m5_l5_h`** — How and to Whom To Report Community Problems?  (8 over)
- Q1 opt1 (21): Yes, I identified one
- Q1 opt2 (33): I'm still not sure who to contact
- Q2 opt1 (27): The State Governor directly
- Q2 opt2 (56): Your market leaders or the LGA Department of Environment
- Q2 opt3 (29): A national television station
- Q3 opt1 (30): Give up since nothing happened
- Q3 opt2 (69): Send a polite follow-up, and escalate to a higher authority if needed
- Q3 opt3 (29): Wait indefinitely for a reply

**`m5_l6_f`** — Finding the Right Women and Business Groups  (7 over)
- Q1 opt2 (34): I searched but haven't decided yet
- Q2 opt1 (76): It has clear rules, an active admin, and focuses on genuine business support
- Q2 opt2 (53): It allows members to post anything without moderation
- Q2 opt3 (54): It frequently shares exciting investment opportunities
- Q3 opt1 (59): Click any group link sent to you, even from unknown numbers
- Q3 opt2 (61): Only join through a link shared by someone you know and trust
- Q3 opt3 (56): Join as many groups as possible to increase your chances

**`m5_l7_m`** — My Voice Matters  (7 over)
- Q1 opt2 (27): I started but didn't finish
- Q2 opt1 (57): Posting angry complaints on your personal WhatsApp status
- Q2 opt2 (100): A polite but firm message to the electricity company's official page, with dates and impact included
- Q2 opt3 (43): Waiting for other traders to complain first
- Q3 opt1 (66): Because your daily experience as a trader is itself valid evidence
- Q3 opt2 (38): Because only officials' opinions count
- Q3 opt3 (50): Because speaking up guarantees an immediate result

**Total quiz option labels >20 chars: 226 across 42 lessons.**
