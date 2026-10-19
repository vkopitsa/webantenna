# Build step animations: design

Date: 2026-10-19

## Intent

Many people building their first antenna can't follow a text-only build step ("Lay the wire on the lever
through the groove in the block, between the die and the roller…"). Every build step in the app gets a
short **looping animation** beside its text, showing *how the action is done*: which tool, which part goes
where, which way to push, and when it's finished. Words stay. The picture is for people who understand a
drawing faster than a sentence.

## Decided with the user

- **All steps** get an animation: the general build steps (`steps()` in `src/lib/build.ts`, Build panel) and
  every printed-part how-to line (`*_HOWTO` in `src/lib/print/families/*.ts` and `print/shells/index.ts`,
  Print panel).
- **Standard "how to do it" drawings**, not this design's real geometry or sizes. One drawing of soldering
  coax to a feed point serves every antenna that has that step.
- **One general drawing per step text**, even when the step is shared by very different antennas: "Bend and
  assemble the parts…" and "Fit the feed line at the feed point." each get one generic drawing, not one per
  antenna type. The drawing should show the action in a way that doesn't look like any one particular
  antenna (pliers bending a wire at a mark; coax centre and braid going to two feed terminals), so it
  doesn't contradict what's on the user's bench.
- **Moving pictures (style C)** for every step: a loop of a few seconds that plays the action, then repeats.
- **On screen only for now.** The PDF build sheet, the Gerber README and the parts README stay text only.
- **Drawing style**, agreed on the mockup (`.superpowers/brainstorm/…/step-style-v3.html`):
  - Flat 2D vector, with one clear view per step (usually from above, lying on the table, or from the side when height matters).
  - Every part that the step's text names has a short **label** next to it: wire, mark B1, die bolt, roller, lever, stop bolt, and so on.
  - Fixed colours per material: copper wire is copper brown, marks are red, bolts are grey, the stop bolt is yellow, printed plastic is light grey-blue.
  - The motion is the action itself: the lever swings until it hits the stop, the wire bends round the die, and so on.
  - The first mockup (abstract shapes, no labels, unclear view) was rejected as "not clear". Clarity beats elegance.

## Goals

- A first-time builder can do each step by watching its animation, with the text as backup.
- Every step line shown in the Build and Print panels has an animation, and a test keeps it that way when
  steps are added or reworded.
- Animations of the app's own printed jigs (lever bender, bending plate, cut board, groove plates, mandrels,
  cradle, cup, fork, wedges and the rest) look like those parts: the same features in the same places, so
  the user recognises the printed part.

## Non-goals

- Drawings generated from each design's real wires and dimensions (the 1:1 templates, recipe strips and
  Preview already do that).
- Animations in the PDF, the zips or any exported file.
- Photos, video files or GIF files. The animations are built in.
- Changing the step texts (except where a text turns out wrong while it's being drawn: fix it and say so).

## Anti-goals (a failure even if it "works")

- A picture that **disagrees with its text**, such as the wrong bend direction, the wrong L/R side, a different order,
  or a tool the text doesn't mention. A wrong picture is worse than none.
- Pictures that need explaining: abstract shapes, unlabelled parts, ambiguous views.
- A Build panel that stutters or drains the battery: 30+ loops running at once, all the time.
- Anything unreadable at the size it's shown, including in dark mode.

## Scale

There are about 35 general step texts (with conditional variants) and about 150 how-to lines across 13
`*_HOWTO` constants. Many lines repeat an action, for example "Print it flat, grooves up, with 100 % infill.",
"Seal the window with hot glue…", or "If it comes in several pieces, glue each spigot…". So one animation can
serve several lines. The estimate is **about 100–130 distinct animations**.

**My call:** this is too much for one go. Ship it in batches, each batch complete for the panels it covers:

1. **Infrastructure + the general Build steps** (wire cut, bend, wind, boom strip, feed line, position, measure,
   trim, seal, PCB, air patch and loop steps), plus the **cut board, lever bender and bending plate** how-to
   (the mockup's subject).
2. Bend plates, corner jigs, coil mandrels, formers.
3. Centre / fan / hub / discone / boom / spreader / standoff / spacer hardware.
4. Sky-cone: the general sheet and cage Build steps together with the kit's how-to (cover, cup, handle,
   stand, former, wedge, fork, cradle, hoop mandrel, jig, template), so the cradle, cup and mandrel are drawn
   once, faithfully, and shared. Then the shells.

**My call:** each batch gets its own implementation plan. The first plan covers batch 1 only.

Until its batch lands, a step with no animation shows its text alone, as it does today. The coverage test
(below) lists the missing ones and is switched to "must be complete" after batch 4.

## How it works (decided)

- **Built in code, no image files.** Each animation is inline SVG in a React component under
  `src/components/steps/` (for example `steps/bend.tsx`, `steps/solder.tsx`, …). The animation runs in the
  browser, works offline, follows the app's theme, and takes translated labels. `src/lib` stays free of DOM
  and React.
- **Colours from CSS tokens** in `src/index.css`, including dark mode (`:root`, the `prefers-color-scheme` block, and
  `[data-theme="dark"]`). Add material tokens such as `--copper`, `--mark`, `--bolt`, `--stop`, `--plastic` and
  `--sheet`, then reuse them.
- **Labels are translated** with `t()`, so the UK translation covers them and `i18n.test.ts` checks them.
  Label text is short nouns, like the mockup's.
- **Matching a step to its animation:** by the step's English key (`Msg.s`), the same key the i18n
  table uses, via one map in the UI (`src/components/steps/index.ts`). Several keys may point at one
  animation.
- **Coverage test:** build every antenna def's pack at its default parameters and at the variants that switch
  step branches (match, boom, wind, cutLong, levels, skirt, pinCap, coiled or straight shorts, and so on), collect every
  `pack.steps[].s`, and add every line of every `*_HOWTO`. Each must map to an animation. During batches 1–3 the
  test checks only the lines already claimed and lists the rest. From batch 4 on it fails on any missing line.
- **Layout:** each `<li>` in the Build steps and "How to use" lists becomes a row with the animation on the
  left (about 140 px wide) and the text on the right. On a phone, the animation goes above the text.
  **Tapping the animation** opens it large, in an overlay or by expanding in place (builder's choice), so the
  labels can be read. The step text stays exactly as it is now.
- **Motion:**
  - Each animation loops in about 3–5 s, with a hold on the finished state before it restarts.
  - Only the animations on screen run (IntersectionObserver), and nothing runs while the tab is hidden.
  - With `prefers-reduced-motion: reduce`, show a still: the finished state, plus the motion arrow drawn in.
- **Loading:** the animation components load as a lazy chunk, when the Build or Print panel first opens, so
  startup isn't slower.

## Lines that are not actions (my calls)

- **Reference rows** that code adds to a `howTo` list are not steps, and they get no animation and no empty slot:
  the cut board's "Hole {0}: cut {1} × {2}" rows and the lever bender / bending plate bolt lists
  (`CUTBEND_STRINGS`). They render as plain rows, as today, and the coverage test skips them by an explicit list.
- **Informational lines** describe no action, for example "Print either this lever bender or the bending plate, not
  both", "The stop holes sit at the recipe angles…" or "B1 is the mark nearest the cut end…". They still get a
  moving picture, but a simple one: the part drawn still, with the thing the line talks about pulsing or
  pointed at (the engraved angle lines, mark B1 next to the cut end). These can share drawings with the
  action steps of the same part.

## Left to the builder

- The animation technique: CSS keyframes on SVG groups or SMIL. Whichever is chosen must support reduced
  motion and pausing off-screen.
- Shared building blocks: a hand, pliers, soldering iron, the copper-wire path helper, label with leader line,
  and the motion arrow.
- How lines are grouped onto shared animations, the exact view chosen per step, the overlay design and
  the exact sizes.
- Each animation's exact timing.

## Checking it

- `npm test` (the coverage test and i18n), `npm run typecheck` and `npm run lint`.
- Look at every new animation in the running app: light and dark mode, phone width, enlarged, reduced motion.
  Compare it against its step text for direction, side, order and tools.
- Measure the Build panel of a long design (for example a sky-cone cage with every step) to confirm it scrolls
  smoothly with the animations.
