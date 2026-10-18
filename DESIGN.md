---
name: Близкие
description: Выписка: белые строки на тёплой бумаге, один зелёный акцент, полоса диапазона у каждого значения.
colors:
  paper: "#f8f5ef"
  surface: "#fffdf9"
  line: "#e9e3d7"
  line-strong: "#d8d0c0"
  ink: "#26332f"
  muted: "#67685f"
  accent: "#1b6b58"
  accent-dark: "#0f4f40"
  accent-soft: "#e5efe8"
  accent-mid: "#5fa592"
  alert: "#b3362e"
  alert-soft: "#fbecea"
typography:
  display:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  secondary:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Onest Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    height: "48px"
  button-soft:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-dark}"
    rounded: "{rounded.sm}"
    height: "48px"
  list:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  rail-link-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "40px"
---

# Design System: Близкие

## Overview

**Creative North Star: «Выписка» (a clinical statement set like a bank statement)**

The product is a record, so it looks like one: white rows on warm paper, separated by hairlines, with numbers set large and everything else quiet. There is no brand ornament. The only drawn element is the range bar, a thin track that shows where a value sits against the laboratory's own range. That bar is the system's signature and the only place the interface draws anything of its own.

The earlier indigo, linen and running-stitch look was dropped because it read as a generic AI-made SaaS skin. The replacement avoids the same tells: no gradient or glow, no pill chips and tabs, no icon-in-circle rows, no card stacks with soft shadows, no decorative dashes or textures, no eyebrows.

**Key Characteristics:**
- Warm paper ground, warm-white flat surfaces, soft dark-green ink (no black anywhere), one green accent.
- Red only for values outside the lab range and for errors.
- Hairline lists and tables instead of card grids; at most one level of container.
- Onest for all text, Phosphor icons (regular weight, filled only for the active bottom-nav tab).
- One radius scale (8, 12, 14 px). No shadows except the popover.
- Motion: a short rise on first entry, disabled under reduced motion.

## Colors

- **Paper** (#f8f5ef): page ground. **Surface** (#ffffff): lists, inputs, sidebars, header.
- **Line** (#e9e3d7) hairlines and row dividers; **Line Strong** (#d8d0c0) input and ghost-button borders.
- **Ink** (#26332f): a soft dark green-slate used for text; there is no pure black in the system. **Muted** (#67685f): secondary text.
- **Accent** (#1b6b58) with **Accent Dark** (#0f4f40): links, focus ring, soft buttons; **Accent Soft** (#e5efe8): soft buttons, notices, own chat bubbles; **Accent Mid** (#5fa592): the in-range segment of the range bar and chart band.
- **Alert** (#b3362e) on **Alert Soft** (#fbecea): out-of-range values, errors, destructive actions.

**The Red Is a Finding Rule.** Red marks a value outside the lab range (relative to the lab's own reference) or an error. It is never decoration or brand color.

**The One Accent Rule.** Green is the only hue. Emphasis elsewhere is ink and weight.

## Typography

Onest Variable only. Hierarchy comes from size and weight (400, 500, 600, 650, 700): page title 1.75rem, section title 1.125rem under a hairline, body 1rem (17px on phones), secondary 0.95rem, captions 0.875rem and no smaller than 0.72rem. Large single readings use the `num-display` class (proportional numerals, tight tracking); dense tables use tabular numerals.

## Layout

Phone first. Client content sits in a column up to 1080px; from 1024px a sticky 252px white sidebar carries the wordmark, a text navigation, the family's profiles and the user. On phone a white header, underline profile tabs and a fixed five-item bottom bar replace it. The home screen is a flexible history column and a 340px column with the out-of-range list and the assistant. Tap targets are 48px on phone, at least 40px on desktop.

Staff are desktop first: a 240px white sidebar, then a three-pane inbox (340px list, conversation, client context from 1280px). Other staff pages sit in a column up to 1100px. Print: a one-sheet A4 summary with all chrome hidden.

## Components

- **Buttons:** 8px radius, 48px high. Primary is Accent with white text; soft is Accent Soft with Accent Dark text; ghost is white with a Line Strong border; danger is white with a red border and text. Focus is a solid 2px accent ring.
- **Lists:** white rows divided by hairlines inside a 10px bordered block. The history list is a ledger: date column, then the entry.
- **Range bar:** a 3px track, a 5px Accent Mid segment for the lab range, a 14px marker (Accent Dark, red when outside). It carries an aria-label with the value and range.
- **Tabs:** text with a 2px Accent underline on the active one; no pills.
- **Badges and chips:** 6px radius; solid is Accent, alert is Alert Soft.
- **Chat:** own messages on Accent Soft, others on Paper, 10px bubbles; staff internal notes use a dashed border.
- **Charts:** dark-green ink line, dots turn red outside the range, dashed accent reference lines with a pale accent band.
- **Inputs:** white, Line Strong border, 8px radius, 48px high; focus border accent.

## Do's and Don'ts

- Do keep one bordered container level, state ranges as the lab's own, and show every deviation with the value and its range.
- Don't add gradients, glows, blur, textures, shadows on cards, pill shapes, icon-in-circle rows, eyebrows, or a second accent color.
- Don't describe results with words like «норма» or «опасно».
