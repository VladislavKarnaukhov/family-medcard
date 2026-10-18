---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: ["src/staff/StaffApp.jsx"]
---

## Scope
Operate. Surfaces: client app (`/`, phone first, desktop rail layout) and staff workspace (`/staff/`, desktop first, three panes). Task: keep a family's records, see dynamics, talk to the assistant (client); clear the inbox, enter lab values, run requests (staff).

## Direction contract

THESIS: A record should look like a statement. Values are large, rows are plain, and one drawn element, the range bar, shows where each value sits against the laboratory's own range. It refuses the category default of a gradient SaaS dashboard with icon tiles and pill chips.

OWN-WORLD: Warm paper ground, white flat lists divided by hairlines, near-black ink, one green accent, red only for values outside the lab range and for errors. Onest for all type, Phosphor icons, one small radius scale, no shadows except the popover.

STORY: The visitor sees whose records these are, what is outside the lab range (with the range bar), what changed, and what the assistant is doing. Staff see who is waiting and what each client needs.

FIRST VIEWPORT: Phone: wordmark and user menu, underline profile tabs, person header, the out-of-range list above the history, bottom bar. Desktop: white sidebar with text nav and profiles; history ledger left, out-of-range list and assistant right. Staff: white sidebar, inbox list, conversation, client context.

FINISH: reviewed by screenshots at 1440 and 390; DESIGN.md describes the shipped system.
