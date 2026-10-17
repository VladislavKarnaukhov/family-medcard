---
name: Близкие (KIN)
description: Семейное досье на индиго-крашеном льне: одна нить-стёжка проводит записи человека сквозь время.
colors:
  indigo: "#2b3a7a"
  indigo-deep: "#1c2755"
  indigo-mid: "#5468b8"
  indigo-mist: "#e4e8f6"
  rail-hover: "#26336d"
  linen: "#eef0f5"
  surface: "#ffffff"
  thread-line: "#dadeea"
  thread-line-strong: "#c3c9dc"
  ink: "#1a1f36"
  ink-muted: "#565c78"
  alert: "#b3362e"
  alert-mist: "#fbecea"
typography:
  display:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
  input: "10px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "#233069"
  button-soft:
    backgroundColor: "{colors.indigo-mist}"
    textColor: "{colors.indigo-deep}"
    rounded: "{rounded.md}"
    height: "48px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.alert}"
    rounded: "{rounded.md}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "10px 14px"
    height: "48px"
  chip-accent:
    backgroundColor: "{colors.indigo-mist}"
    textColor: "{colors.indigo-deep}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  chip-alert:
    backgroundColor: "{colors.alert-mist}"
    textColor: "{colors.alert}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  tab-active:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    height: "44px"
  tab-idle:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    height: "44px"
  rail:
    backgroundColor: "{colors.indigo-deep}"
    textColor: "{colors.surface}"
    width: "272px"
  rail-link-active:
    backgroundColor: "{colors.rail-hover}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "44px"
  notice:
    backgroundColor: "{colors.indigo-mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: Близкие (KIN)

## Overview

**Creative North Star: "Индиго и стёжка" (indigo-dyed linen with a running stitch)**

The system is a piece of indigo-dyed linen. A committed deep indigo shell (side rail, mobile header, active states) frames a cool pale linen-grey ground, and white surfaces sit on that ground without nesting. Ink-indigo text, a single accent family (indigo), and red reserved for values outside the laboratory range and for errors. Both the shell and the ground carry a barely visible woven-thread texture, so the cloth reads as material without becoming pattern.

The one signature move is the running stitch: a dashed indigo thread. It is the spine of the client timeline (a person's records carried through time), the underline beneath every section heading, the double-tone thread beneath the person header, the dashed edge of the attention list and empty states, the dashed ring on the active profile, and the dashed reference lines on indicator charts. The family's story is one thread; everything else stays quiet so the thread can be seen.

Density is calm and airy, phone first for clients (large type, 48px touch targets) and a desktop rail layout; staff get a dense three-pane workspace on the same tokens. The system is factual: no decoration that implies diagnosis, no medical-green skin, no grey SaaS card grid.

**Key Characteristics:**
- Indigo shell, linen ground, white flat surfaces, ink-indigo text.
- One accent family; red only for out-of-range values and errors.
- Onest for all text, drawn SVG icons in one 1.75 stroke.
- Running-stitch dashes as divider, spine, edge and chart reference.
- Soft two-layer shadows; the strong shadow is for popovers and the single assistant card.
- Motion limited to one entrance: the thread drawing itself, then cards rising in sequence.

## Colors

A cool, committed indigo palette on a pale linen ground, with one warm red held back for deviations.

### Primary
- **Dyed Indigo** (#2b3a7a): primary actions, active tabs and profile chips, bottom-nav active icon, key icons on white.
- **Deep Indigo** (#1c2755): the rail and mobile header cloth, link text, text on soft indigo surfaces, pressed button state.
- **Thread Indigo** (#5468b8): the stitch itself (timeline spine, section thread, dashed edges), focus rings, secondary icons, dashed focus outline.
- **Indigo Mist** (#e4e8f6): soft buttons, selected list rows, info notices, accent chips, avatar fill.
- **Rail Hover** (#26336d): active and hover item on the deep indigo rail.

### Neutral
- **Cool Linen** (#eef0f5): page ground, with a faint woven texture overlay.
- **White Surface** (#ffffff): cards, inputs, chat bubbles, bottom bar.
- **Thread Line** (#dadeea): hairline card borders, row dividers, base of the person thread.
- **Thread Line Strong** (#c3c9dc): section stitch, input border, ghost-button border, dashed empty-state border.
- **Ink** (#1a1f36): all primary text; also the base of both shadows.
- **Muted Ink** (#565c78): secondary text, captions, hints.

### Alert
- **Out-of-Range Red** (#b3362e) on **Alert Mist** (#fbecea): values outside the laboratory range, error messages, unread badge, destructive actions. Danger buttons use a soft red border (#e2b9b5).

### Named Rules
**The Red Is a Finding Rule.** Red appears only on a value outside the lab range (stated relative to the lab's reference) or on an error or destructive action. It is never decoration, never a brand color, never a tone for general emphasis.

**The One Family Rule.** All emphasis is indigo in different depths (deep, dyed, thread, mist). No second accent hue.

## Typography

**Display, headline, body and label font:** Onest Variable (fallback ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif). One family only.

**Character:** A friendly, legible Cyrillic-capable sans used at generous sizes. Hierarchy comes from size and weight (400, 500, 600, 650, 700), not from a second face. Base size is 17px on phones and 16px from 1024px up; headings are 650 weight with slightly negative tracking and balanced wrapping.

### Hierarchy
- **Display** (700, 2.25rem, 1.1, -0.02em): the large numeric reading on an indicator page, set with proportional numerals so digits do not gap.
- **Headline** (650, 1.75rem on phone / 1.875rem on desktop, 1.2): page title in the page header; the staff inbox title is 1.5rem.
- **Title** (650, 1.25rem, 1.2): section headings, always followed by a stitch line; attention panel heading at 1.125rem.
- **Body** (400, 1rem, 1.5): running text; supporting lines are muted and capped around 60ch; secondary body at 0.95rem for rows, tables, notices.
- **Label** (500, 0.875rem, 1.5): field labels, chips, captions, dates; the smallest sizes are 0.75rem (staff timestamps, rail captions) and 0.7rem (bottom-nav labels).

### Named Rules
**The Numerals Rule.** Large single readings use proportional numerals with tight tracking; dense tables and entry rows (the A4 summary sheet, result-entry rows) use tabular numerals.

**The One Face Rule.** Onest only. No second display face, no monospace, no uppercase-tracked small labels.

## Layout

Phone first. Client content sits in a column up to 1080px with 16px side padding on phone and 40px from 1024px, with 112px of bottom padding on phone to clear the fixed bottom tab bar. From 1024px a sticky 272px indigo rail appears on the left (wordmark, navigation, family profiles, user), and the phone header, profile chips and bottom bar disappear. Unauthenticated and legal pages use a bare indigo header over a 920px column.

The home screen is a two-column grid from 1024px: a flexible timeline column and a 340px sticky attention column; on phone the order inverts so the out-of-range block sits above the timeline. Sections are separated by a title with a stitch line, spaced with a 36px top margin (mt-9) and 12px under the heading; list items sit on an 8 to 12px rhythm (space-y-2 and space-y-3), card padding is 20px, page gutters are 16px. Tap targets are 48px on phone (44px on desktop); icon-led rows are at least 44 to 56px tall.

Staff workspace is desktop first: a 240px indigo rail, then a three-pane inbox: a 340px conversation list, a flexible conversation with the reply box fixed at the bottom, and a 340px client context panel from the xl breakpoint. Other staff pages sit in a column up to 1100px. Breakpoints in use: sm 640px, lg 1024px, xl 1280px.

Print: a one-sheet A4 summary (12mm margin, 10pt) with all chrome hidden.

## Elevation & Depth

Hybrid, mostly flat. Depth comes first from tone (white on linen, hairline borders) and only secondarily from soft ink-tinted shadows. Surfaces are never nested inside one another; a card does not contain a bordered card.

### Shadow Vocabulary
- **Card** (`0 1px 2px rgba(26,31,54,0.05), 0 4px 14px -6px rgba(26,31,54,0.08)`): every white card, timeline entry, chat bubble from the other side, quick-action row.
- **Pop** (`0 2px 6px rgba(26,31,54,0.08), 0 18px 40px -16px rgba(26,31,54,0.28)`): the user menu, template list popover, and the assistant card on the dashboard.
- **Button** (Tailwind `shadow-sm`): primary buttons only.

### Named Rules
**The Quiet Surface Rule.** Rest state is the card shadow at most. The pop shadow marks things that float or that are the one call to action of the screen. Hover on the assistant card lifts it 2px; no other card lifts.

## Shapes

Soft, rounded, and woven. Cards and containers use 16px corners (rounded-2xl), buttons, notices and list rows 12px (rounded-xl), menu items and inline controls 8px, inputs 10px. Pills (chips, tabs, profile switcher, avatars, badges) are fully round. Chat bubbles are 16px with a 6px tail corner on the sending side. Borders are 1px hairlines in thread line colors; the stitch alternative is a 1.5px dashed border (thread line strong for empty or internal-note surfaces, thread indigo for the attention list). Icons are drawn inline SVG on a 24px grid, round caps and joins, 1.75 stroke, used at 14 to 26px.

## Components

### Buttons
- **Shape:** 12px corners, minimum height 48px (44px from 1024px), 20px horizontal padding, medium weight, icon at 19px with an 8px gap. The large variant is full width at 56px with 18px text.
- **Primary:** Dyed Indigo fill with white text; hover #233069, pressed Deep Indigo.
- **Soft:** Indigo Mist fill with Deep Indigo text; hover #d6dcf1.
- **Ghost:** white fill, Thread Line Strong border, ink text; hover fills with linen.
- **Danger:** white fill, soft red border, red text; hover fills with Alert Mist.
- **Quiet:** no fill, Deep Indigo text; hover Indigo Mist.
- **Focus:** a 2px dashed Thread Indigo outline with 2px offset (a stitched ring). Disabled is 50% opacity.

### Chips
- Fully round, 14px text at medium weight, 10px by 2px padding. Tones: accent (mist on deep indigo), alert (alert mist on red), quiet (linen with a hairline ring, muted text), solid (indigo on white), outline (white with a thread-indigo ring). The out-of-range status chip is the alert tone with an up or down arrow.

### Cards / Containers
- 16px corners, white, 1px thread-line border, card shadow, 20px padding. Entries inside the timeline use the same recipe with 16px by 12px padding. Disclosure rows use native details with a rotating chevron and a table of values with hairline row dividers.

### Inputs / Fields
- White, 1px Thread Line Strong border, 10px radius, 48px high (44px on desktop), 10px by 14px padding; placeholder #7b819d; hover border #a6aecb.
- **Focus:** border turns Dyed Indigo with a 3px halo of Thread Indigo at 28% opacity. Labels sit above at 14px medium; hints below in muted ink. Errors are an Alert Mist block with a triangle icon, announced as an alert.
- Internal staff notes swap the input border to dashed.

### Navigation
- **Rail (desktop):** Deep Indigo woven cloth, 272px, 44px items with 12px corners, white at 75% by default, Rail Hover fill with full white when active, unread badge as a white pill. Profiles list below; the active profile is a white row with a dashed ring around its avatar; "add profile" has a dashed circle.
- **Mobile top bar:** the same cloth with the wordmark and a user menu pill (white at 10%) that opens a pop-shadow popover.
- **Bottom tab bar:** white at 95% with blur and a hairline top border, five tabs of 64px, icon in a 56 by 32 pill that turns Indigo Mist when active, 11px labels, unread badge in red.
- **Profile switcher (phone):** horizontally scrolling pill tabs with initials; active is solid indigo, idle is white with a border, "add" is a dashed pill.
- **Staff rail:** 240px flat Deep Indigo with the same item recipe, without the woven texture.

### Section Heading
- Title text followed by a 2px stitch line (7px dashes, 6px gaps, Thread Line Strong). The system's standard divider; used instead of rules or boxes.

### Timeline (signature)
- A vertical stitch spine (2px, dashes of Thread Indigo at 55% opacity) at 19px from the left, drawn top to bottom once; each entry has a 40px white circle on the spine holding an icon (indigo, or red on a flagged entry) and a card to its right. Entries rise in with a 40ms stagger. Under the person header sits the double-tone thread: stitches in Thread Indigo over a hairline.

### Attention Panel and Assistant Card
- The attention list is a white block with a dashed Thread Indigo edge, rows with a red icon circle, label, range text and the red reading on the right. The assistant card is the one woven indigo card with the pop shadow, white text, an unread pill and a two-line preview.

### Inbox (staff)
- List rows of 340px with a divided hairline list, selected row in Indigo Mist, unread shown as a semibold name and a small indigo dot on the avatar. Messages: own messages are indigo with white text, incoming are white with the card shadow, internal notes are white with a dashed border; day separators are a centered caption between two stitch lines. The reply box is white with a top border, template popover above it.

## Do's and Don'ts

### Do:
- **Do** use Dyed Indigo (#2b3a7a) for the primary action and the Deep Indigo cloth (#1c2755) for shell surfaces; keep every emphasis inside the indigo family.
- **Do** mark every section with a title plus the stitch line, and carry sequences (events, steps) on the vertical stitch spine.
- **Do** reserve red (#b3362e on #fbecea) for values outside the lab range, phrased relative to the lab's reference, and for errors and destructive actions.
- **Do** keep surfaces flat and un-nested: white on linen, 1px hairline, card shadow.
- **Do** keep tap targets at 48px on phone and 44px on desktop, and body text at 16px or larger.
- **Do** use the 1.75-stroke drawn icon set at one weight, and the dashed 2px Thread Indigo outline for focus.
- **Do** keep motion to the entrance: thread draw, 40ms staggered rise; honor reduced motion.

### Don't:
- **Don't** add a second accent hue or a green medical skin; red is not a brand color.
- **Don't** build grids of identical bordered cards or nest a card inside a card.
- **Don't** use shadows beyond the card, pop and primary-button values, or lift cards on hover other than the assistant card.
- **Don't** use a second typeface, uppercase letter-spaced small labels, or glyph and emoji icons.
- **Don't** replace the stitch with a solid rule or a box border as a section divider.

## Not canonized

- Wordmark caption "KIN" uses wide tracking (0.28em) as part of the logo lockup only; it is not a type style for labels or headings elsewhere.
- Code-entry input uses 0.4em tracking for the one-time code only.
- `src/index.css` contains a duplicated copy of the thread animation rules nested inside the reduced-motion media query (the `.thread-in` rule there sets `animation: none`); it is a stylesheet defect, not a system rule.
- The contract names a 264px rail and tabular numerals throughout; the build ships a 272px rail and uses tabular numerals only in the summary sheet and result-entry rows. The build is recorded above.
