import test from "node:test";
import assert from "node:assert/strict";

import { parseInlineLinks } from "./inline-links.js";

test("plain text is one text segment", () => {
  assert.deepEqual(parseInlineLinks("Developed with care."), [{ kind: "text", text: "Developed with care." }]);
});

test("a markdown link becomes a link segment between the text around it", () => {
  assert.deepEqual(parseInlineLinks("Developed by [Decy4](https://decy4.com/) and others."), [
    { kind: "text", text: "Developed by " },
    { kind: "link", text: "Decy4", href: "https://decy4.com/" },
    { kind: "text", text: " and others." }
  ]);
});

test("two links in one line keep their order and the text between them", () => {
  const segments = parseInlineLinks(
    "Developed by [Decy4](https://decy4.com/) and [Virtumultimedia](https://virtumultimedia.com/)."
  );
  assert.deepEqual(
    segments.map((s) => (s.kind === "link" ? `L:${s.text}` : `T:${s.text}`)),
    ["T:Developed by ", "L:Decy4", "T: and ", "L:Virtumultimedia", "T:."]
  );
});

test("only http and https destinations become links; anything else stays literal text", () => {
  // An editor pasting the wrong thing must not be able to plant a script URL
  // on the public page. The text is kept verbatim so the mistake is visible.
  assert.deepEqual(parseInlineLinks("see [here](javascript:alert(1)) now"), [
    { kind: "text", text: "see [here](javascript:alert(1)) now" }
  ]);
  assert.deepEqual(parseInlineLinks("[mail](mailto:a@b.c)"), [{ kind: "text", text: "[mail](mailto:a@b.c)" }]);
});

test("a link with empty text or an empty destination is left as literal text", () => {
  assert.deepEqual(parseInlineLinks("[](https://x.example/)"), [{ kind: "text", text: "[](https://x.example/)" }]);
  assert.deepEqual(parseInlineLinks("[x]()"), [{ kind: "text", text: "[x]()" }]);
});

test("an empty string yields no segments", () => {
  assert.deepEqual(parseInlineLinks(""), []);
});

test("adjacent links produce no empty text segments between them", () => {
  assert.deepEqual(parseInlineLinks("[a](https://a.example/)[b](https://b.example/)"), [
    { kind: "link", text: "a", href: "https://a.example/" },
    { kind: "link", text: "b", href: "https://b.example/" }
  ]);
});
