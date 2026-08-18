"""Rewrite every em-dash in the handbook into ordinary punctuation.

Each pair below is a hand-written rewrite, not a blanket substitution: an
em-dash does different work in different sentences (a colon here, a full stop
there, a pair of commas around an aside), and swapping them all for one mark
would leave the prose limping. The script asserts every pattern was found and
that none survive, so a missed sentence fails loudly instead of shipping.
"""
import io
import sys

M = "—"  # em-dash
PATH = "handbook.html"

PAIRS = [
    # 2. How the platform works
    (f"control from here {M} the lesson text", "control from here: the lesson text"),
    # 3. Signing in
    (f"was issued to {M} not a personal address", "was issued to, not a personal address"),
    # 5. Overview
    (f"not on its own {M} a high pass rate", "not on its own. A high pass rate"),
    (f"carries a status pill {M}\n        <strong>Healthy</strong>, <strong>Watch</strong> or <strong>Idle</strong> {M} so you can scan",
     "carries a status pill\n        (<strong>Healthy</strong>, <strong>Watch</strong> or <strong>Idle</strong>), so you can scan"),
    (f"<strong>Recent Reward Activity</strong> {M} the last", "<strong>Recent Reward Activity</strong>: the last"),
    (f"<strong>Users requesting help</strong> {M} learners who tapped", "<strong>Users requesting help</strong>: learners who tapped"),
    (f"<strong>At-Risk Learners</strong> {M} registered but", "<strong>At-Risk Learners</strong>: registered but"),
    (f"<strong>Module Funnel Snapshot</strong> {M} how many", "<strong>Module Funnel Snapshot</strong>: how many"),
    (f"<strong>Upcoming Milestones</strong> {M} learners about", "<strong>Upcoming Milestones</strong>: learners about"),
    # 6. Users
    ("<dt>Eye &mdash; open her details</dt>", "<dt>Eye: open her details</dt>"),
    ("<dt>Speech bubble &mdash; message on WhatsApp</dt>", "<dt>Speech bubble: message on WhatsApp</dt>"),
    ("<dt>Flag &mdash; mark for follow-up</dt>", "<dt>Flag: mark for follow-up</dt>"),
    (f"conversation right now {M} useful when someone says", "conversation right now, which is useful when someone says"),
    (f"received, and {M} once\n        she has earned one {M} a link to her certificate",
     "received, and, once\n        she has earned one, a link to her certificate"),
    # 7. Analytics
    ("<td>Content &mdash; the welcome and first module</td>", "<td>Content: the welcome and first module</td>"),
    ("<td>Content &mdash; lesson length and structure</td>", "<td>Content: lesson length and structure</td>"),
    ("<td>Content &mdash; the wording that introduces the quiz</td>", "<td>Content: the wording that introduces the quiz</td>"),
    ("<td>Content &mdash; the questions themselves</td>", "<td>Content: the questions themselves</td>"),
    # 8. Content
    (f"<strong>Lessons</strong> {M} the teaching material", "<strong>Lessons</strong>: the teaching material"),
    (f"<strong>Bot messages</strong> {M} everything else", "<strong>Bot messages</strong>: everything else"),
    (f"The chips above the table {M} <strong>All</strong>, <strong>Draft</strong>,\n        <strong>Live</strong>, <strong>Trash</strong> {M} filter it.",
     "The chips above the table (<strong>All</strong>, <strong>Draft</strong>,\n        <strong>Live</strong>, <strong>Trash</strong>) filter it."),
    (f"the way WhatsApp does {M} <code>*bold*</code>\n          and <code>_italics_</code> {M} and shows you a preview",
     "the way WhatsApp does, with <code>*bold*</code>\n          and <code>_italics_</code>, and shows you a preview"),
    (f"<strong>Info</strong> {M} choose a category", "<strong>Info</strong>: choose a category"),
    (f"<strong>Content</strong> {M} write the text", "<strong>Content</strong>: write the text"),
    (f"<strong>Preview</strong> {M} see it as a learner will", "<strong>Preview</strong>: see it as a learner will"),
    (f"a request for help {M} a learner", "a request for help. A learner"),
    (f"the console being fussy {M} longer text is", "the console being fussy: longer text is"),
    (f"before anything is published {M}\n        machine translation is a starting point here, never the final word",
     "before anything is published.\n        Machine translation is a starting point here, never the final word"),
    # 9. Rewards
    (f"provider is not responding {M} check Settings", "provider is not responding. Check Settings"),
    (f"themselves are not set here {M} they live in", "themselves are not set here. They live in"),
    # 10. Reports
    (f"different audiences {M} Donor leads", "different audiences: Donor leads"),
    (f"without disturbing the schedule {M}\n        useful when a donor asks", "without disturbing the schedule,\n        which is useful when a donor asks"),
    # 11. Certificates
    (f"box is a <em>handle</em> {M} it marks", "box is a <em>handle</em>: it marks"),
    (f"all-capitals name {M} that is how", "all-capitals name. That is how"),
    (f"and it gets a new name {M} the box suggests", "and it gets a new name, and the box suggests"),
    (f"next certificate is issued with {M} write a\n        note", "next certificate is issued with. Write a\n        note"),
    # 12. Settings
    ("<h3>Options &mdash; the lists people choose from</h3>", "<h3>Options: the lists people choose from</h3>"),
    ("<h3>Legal &mdash; consent and policy text</h3>", "<h3>Legal: consent and policy text</h3>"),
    ("<h3>Integration &mdash; connections to the outside world</h3>", "<h3>Integration: connections to the outside world</h3>"),
    ("<h3>Rewards &mdash; how much, and when</h3>", "<h3>Rewards: how much, and when</h3>"),
    ("<h3>Admins &mdash; your team</h3>", "<h3>Admins: your team</h3>"),
    ("<h3>Branding &mdash; making it yours</h3>", "<h3>Branding: making it yours</h3>"),
    (f"disappears from the bot {M} the\n        learners who already chose it", "disappears from the bot, and the\n        learners who already chose it"),
    (f"journey {M} welcome, name, state, language, a lesson, a quiz {M} without touching",
     "journey (welcome, name, state, language, a lesson, a quiz) without touching"),
    (f"want {M} you are removing access", "want: you are removing access"),
    # 13. Your account
    (f"an authenticator app {M} Google Authenticator, Microsoft\n          Authenticator and Authy all work",
     "an authenticator app. Google Authenticator, Microsoft\n          Authenticator and Authy all work"),
    # 14. How changes go live
    (f"months later {M} so write a real note", "months later, so write a real note"),
    # 15. Who can do what
    ("<td>&mdash;</td>", "<td>No</td>"),
    (f"Two Admins {M} never one", "Two Admins, never one"),
    # 16. Operating rhythm
    (f"<li>Overview {M} is anything showing", "<li>Overview: is anything showing"),
    (f"<strong>Users requesting help</strong> {M} anyone new?", "<strong>Users requesting help</strong>: anyone new?"),
    (f"<li>Rewards {M} any <strong>Failed</strong>", "<li>Rewards: any <strong>Failed</strong>"),
    # 17. Troubleshooting
    (f"what happened instead {M} that alone", "what happened instead. That alone"),
    # 19. Checklist and footer
    (f"switched on when {M} and only when {M} you are ready", "switched on when, and only when, you are ready"),
    ("SheTrades Digital &mdash; Operator Handbook", "SheTrades Digital Operator Handbook"),
]

text = io.open(PATH, encoding="utf-8").read()
before = text.count(M) + text.count("&mdash;")

for old, new in PAIRS:
    if old not in text:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        print("NOT FOUND:", old[:90])
        raise SystemExit(1)
    text = text.replace(old, new)

leftover_char = text.count(M)
leftover_entity = text.count("&mdash;")
if leftover_char or leftover_entity:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    for line_no, line in enumerate(text.split("\n"), 1):
        if M in line or "&mdash;" in line:
            print(f"LEFTOVER {line_no}: {line.strip()[:110]}")
    raise SystemExit(1)

io.open(PATH, "w", encoding="utf-8", newline="\n").write(text)
print(f"rewrote {before} em-dashes, none remain")
