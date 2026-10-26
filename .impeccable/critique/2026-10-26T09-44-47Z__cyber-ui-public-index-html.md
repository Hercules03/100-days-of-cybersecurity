---
target: Cyber Study UI (cyber-ui/public/index.html)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/GitHub/100-days-of-cybersecurity/cyber-ui/public/index.html"
target_fingerprint: "sha256:ec584a0e61327eb2f18bc64b032e8ca0f60dbe4a05b1d98a0f37603b869d0b3a"
target_path: /Users/GitHub/100-days-of-cybersecurity/cyber-ui/public/index.html
timestamp: 2026-10-26T09-44-47Z
slug: cyber-ui-public-index-html
closed: true
---
# Cyber Study UI — Design Critique

**Target:** cyber-ui/public/index.html (Operate-mode study tracker)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No success/failure signal on any save; saveProgress() never .catch'ed |
| 2 | Match System / Real World | 3 | "Check in/out" is shift-work language, not study; otherwise legible |
| 3 | User Control and Freedom | 2 | Check-in is irreversible; only route out is Delete (destroys note + time) |
| 4 | Consistency and Standards | 2 | Mixed emoji/glyph icons; 🐍 for all code files; "Open lesson" hidden 99% of days |
| 5 | Error Prevention | 2 | Unsaved note silently destroyed by Check in/Check out |
| 6 | Recognition Rather Than Recall | 2 | No legend for calendar cell colors; bare "D5" labels force recall |
| 7 | Flexibility and Efficiency | 2 | No keyboard nav, no tree search, state resets on reload |
| 8 | Aesthetic and Minimalist Design | 3 | Cohesive dark token system; 🐍/📄 per row is the only noise |
| 9 | Error Recovery | 1 | "Could not open {path}" with no reason; init() has no error handling |
| 10 | Help and Documentation | 2 | Zero in-app guidance; check-in contract never explained |
| **Total** | | **21 / 40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

**LLM assessment:** Largely specific, but specificity lives in the content layer, not the interaction layer. The 🔐 brand, 🧪 Lab buttons, 🐍 code glyphs, phase bars, and "UP NEXT → Day N" header root this in a cybersecurity curriculum. The tracking machinery ("Check in/out," streak/duration tiles, green-done/yellow-active calendar) is commodity habit-tracker chrome — swap lessons.json and it's indistinguishable from a gym log.

**Deterministic scan:** exit code 2 → 1 finding, `side-tab` at style.css:163. FALSE POSITIVE: the markdown blockquote border-left, a conventional affordance, not an accent card border. Detector caught nothing genuinely wrong; real issues came from manual review.

**Visual overlays:** not available (no browser automation in sub-agent session); CLI scan used as fallback evidence.

## Overall Impression

A competent solo study tool with a disciplined dark visual system and one excellent interaction ("Start Day N"). The logging flow has three trust-breaking bugs stacked on day one: a "Start" button that doesn't open the lesson, a "Days completed" counter that disagrees with the header's "next day," and a note field that silently eats the learner's reflection. Biggest opportunity: make check-in → read → check-out a single coherent action.

## What's Working

1. "▶ Start Day N" quick-start (app.js:287-327) — always points at the next unlogged lesson, derives the number from real progress, starts a session in one click.
2. Disciplined visual system — one token block (style.css:1-15), consistent surfaces, tabular numerals, real dark "cyber" palette.
3. Self-contained reading pipeline — zero-dep markdown renderer + file explorer collapse the repo into one tab with working link resolution.

## Priority Issues

1. [P0] Unsaved notes silently destroyed by Check in / Check out (app.js:251-264). Fix: capture textarea value before re-render, or auto-save/guard. → /impeccable harden
2. [P1] No feedback or failure surfacing on any state change; saveProgress() fire-and-forget with no .catch. Fix: inline "Saved ✓ / Failed" + error branch. → /impeccable harden
3. [P1] Check-in irreversible; "done" semantics contradict (UP NEXT advances on check-in, dashboard counts check-out). Fix: nextLessonNum respects check-out, add un-check-in. → /impeccable clarify + harden
4. [P2] "Start Day N" doesn't open lesson; "Open lesson" hidden for 99 of 100 days (app.js:239). Fix: derive from lessonSource(), auto-open on start. → /impeccable clarify
5. [P2] No legend for calendar color states; "D5" labels force recall. Fix: legend under cal-head + per-cell tooltip. → /impeccable layout

## Persona Red Flags

- **Jordan (first-timer):** "Start Day 1" lands on calendar, not the reading; check-in/check-out contract unexplained → returns to "0 completed" vs "Day 2"; first note vanishes on clock-out.
- **Sam (accessibility):** calendar cells are divs with no tabindex/role/aria (app.js:190-202); color-only state; 10–11px muted labels; emoji-only buttons.
- **Riley (stress-tester):** note lost on clock-out; confirm() under-specifies deletion; silent write failures; old empty day pre-fills next lesson number.

## Minor Observations

- No responsive CSS (no @media rules; fixed 280px sidebar).
- 🐍 for all non-md files including .sh/.json/.yml (app.js:97).
- Delete offered on empty days (false affordance).
- Study-time total has no ceiling; forgotten check-out inflates it.
- In-progress sessions have a count tile but no list.
- init() has no error handling (blank shell on API failure).
- .hidden defined twice (style.css:90, :107).

## Questions to Consider

1. Why does "Start Day N" not open the lesson? Is the clock-in the product, or the reading?
2. Is "check-in/check-out" the right frame? "Start session → done" might dissolve note-loss + the 0-vs-Day-2 contradiction.
3. Where is the 100-day arc emotionally? Only celebration is one header string.
