# WorkerDeck design system

WorkerDeck is a calm, dense control plane for people operating Cloudflare applications. Its visual
language is built from near-neutral surfaces, precise one-pixel structure, compact type, and one
recognizable orange signal. It should feel engineered, not decorated.

The dashboard reference supplied for the September 2026 redesign is the source of truth for layout,
density, hierarchy, and surface treatment. WorkerDeck orange remains the source of truth for brand
recognition. When those goals compete, preserve the reference dashboard's restraint: orange marks the
primary action or the current state; it does not tint the whole product.

## Core principles

1. **The shell is stable.** Navigation, page alignment, header controls, and content width remain
   consistent between routes. Pages do not invent their own chrome.
2. **Structure is quiet.** Use spacing first, a neutral surface second, a divider third, and elevation
   only for content that floats above the application.
3. **Orange is scarce.** Use it for the single primary action, active navigation, focus, important
   selection, and the occasional key data accent. Statuses keep their semantic colors.
4. **Density is deliberate.** The default is a compact professional interface: 40 px controls,
   58 px data rows, 14 px body copy, and 12–13 px metadata. Density must never compromise the minimum
   target or text-size rules below.
5. **Motion explains state.** Motion provides feedback, spatial continuity, or a less jarring update.
   It never makes data drift for atmosphere.
6. **Every state is designed.** Loading, empty, error, disabled, focus, hover, pressed, selected, and
   narrow-screen presentations are part of the component, not follow-up work.

The visual signature is the **deploy topology motif**: a restrained orange core connected to neutral
repo, domain, data, and deployment nodes. Reserve it for onboarding, empty states, and architecture
explanations. Do not repeat it as background decoration.

## Implementation sources

- `apps/dashboard/src/design-system.css` owns semantic tokens and shared component treatments.
- `apps/dashboard/src/styles.css` owns route-specific layout and domain visualizations.
- `apps/dashboard/src/components/` owns shared React behavior such as the shell, dialogs, status,
  project navigation, and the command menu.
- Page files consume those primitives. They should not introduce new raw colors, shadows, radii, or
  animation curves.

## Color

Components reference semantic tokens only. A raw color is allowed only inside the two theme token
blocks or in an asset with a fixed brand color.

### Required semantic tokens

| Role                 | Light     | Dark      | Usage                                 |
| -------------------- | --------- | --------- | ------------------------------------- |
| Brand                | `#F26100` | `#FF6B0A` | Logo, active icon, selected emphasis  |
| Background           | `#F5F6F7` | `#0B0D0F` | Application canvas                    |
| Surface              | `#FFFFFF` | `#15181C` | Panels, cards, tables                 |
| Elevated surface     | `#FFFFFF` | `#1A1E23` | Dialogs, popovers, menus              |
| Sunken surface       | `#F7F8F9` | `#101317` | Inputs, table headers, inset controls |
| Border               | `#D9DDE2` | `#292E35` | Panel and control structure           |
| Subtle border        | `#E7E9EC` | `#20252B` | Row dividers and internal rules       |
| Foreground           | `#17191D` | `#F3F4F6` | Headings and primary content          |
| Secondary foreground | `#454B54` | `#C5C9CF` | Supporting content                    |
| Muted foreground     | `#68707B` | `#9198A3` | Metadata, placeholders, inactive nav  |
| Primary              | `#C94F00` | `#FF7A1A` | One filled action per view            |
| Primary foreground   | `#FFFFFF` | `#1A0B02` | Text/icons on primary                 |
| Secondary            | `#FFFFFF` | `#1B1F24` | Neutral action backgrounds            |
| Success              | `#087D5B` | `#39D0A0` | Ready, live, connected                |
| Warning              | `#8A5C00` | `#F1B949` | Attention, ownership constraints      |
| Destructive          | `#BD3542` | `#FF6B72` | Delete, failed, irreversible          |
| Info                 | `#126EAE` | `#6BB8FF` | Running, neutral system information   |
| Focus                | `#BD4700` | `#FF9A57` | Keyboard focus perimeter              |
| Hover                | `#F3F4F6` | `#1B1F24` | Neutral hover surface                 |
| Selected             | `#FFF0E5` | `#221A15` | Active navigation and selected rows   |

The `brand` token can be brighter than the filled `primary` token. In light mode, the primary is
intentionally darker so white action labels remain readable. In dark mode, primary buttons use dark
ink on bright orange. Do not force white text onto bright orange.

Success, warning, destructive, and info always include text or an icon in addition to color. The
orange brand hue never substitutes for warning, and red is never used for a neutral action.

### Themes

WorkerDeck supports `light`, `dark`, and `system` modes. `system` resolves through
`prefers-color-scheme` and follows changes while the app is open. Store the mode, not the resolved
theme. Theme changes must suppress global transitions for that frame so the interface snaps cleanly
instead of smearing through dozens of color transitions.

Dark mode is not an inverted light palette. Its surface steps are wider, status colors are less dark,
and structural shadows are almost absent. Light mode uses a cool white canvas, darker semantic colors,
and a small shadow only where a floating layer needs separation.

## Typography

| Role             | Family               | Size     | Line height | Weight  | Tracking   |
| ---------------- | -------------------- | -------- | ----------- | ------- | ---------- |
| Page display     | Public Sans Variable | 28–32 px | 1.12        | 680     | `-0.035em` |
| Large heading    | Public Sans Variable | 22 px    | 1.2         | 650     | `-0.025em` |
| Section heading  | Public Sans Variable | 16 px    | 1.3         | 620     | `-0.015em` |
| Body             | Public Sans Variable | 14 px    | 1.5         | 400–500 | normal     |
| Label/control    | Public Sans Variable | 13 px    | 1.35        | 550–650 | normal     |
| Caption/metadata | Public Sans Variable | 12 px    | 1.45        | 450–600 | normal     |
| Data/code        | IBM Plex Mono        | 12–13 px | 1.5         | 400–500 | normal     |
| Brand wordmark   | Archivo Variable     | 16 px    | 1           | 690     | `-0.035em` |

Use one `h1` per page. Heading levels descend even if adjacent levels share a size. Apply
`text-wrap: balance` to short headings and `text-wrap: pretty` to descriptions. Cap instructional
copy near 68 characters. Apply tabular figures to counts, rates, durations, prices, timestamps, and
other values that update.

Below 18 px, never use a weight below 400. Inputs render at 16 px on screens up to 620 px to prevent
iOS zoom. Text is selectable unless the surface is a drag target.

## Spacing

The spacing scale is `4, 8, 12, 16, 20, 24, 32, 40` px. Use multiples from this scale before adding
a new value.

| Context             | Desktop       | Tablet   | Mobile        |
| ------------------- | ------------- | -------- | ------------- |
| Page inline padding | 32 px         | 24 px    | 14–18 px      |
| Page bottom padding | 72 px         | 56 px    | 44 px         |
| Section gap         | 20–24 px      | 20 px    | 16–20 px      |
| Panel heading       | 15 px × 20 px | same     | 15 px × 16 px |
| Card padding        | 16–20 px      | 16–20 px | 16 px         |
| Field stack gap     | 6–8 px        | same     | 8 px          |
| Form group gap      | 12–16 px      | 12 px    | 12 px         |
| Navigation item gap | 2 px          | 2 px     | 2 px          |

The gap between separate groups is at least twice the gap between items inside a group. Align all
page content to the same leading edge. Use logical properties for inline directions.

## Shape and elevation

| Primitive                    | Radius                    | Border                            | Elevation                   |
| ---------------------------- | ------------------------- | --------------------------------- | --------------------------- |
| Button/input/navigation item | 8 px                      | 1 px where needed                 | None                        |
| Badge/status                 | 6 px                      | 1 px or transparent semantic fill | None                        |
| Panel/card                   | 14 px                     | 1 px structural border            | Inset hairline only         |
| Dialog/popover               | 10 px                     | 1 px strong structure             | One layered floating shadow |
| Avatar                       | Circular or 6 px monogram | Optional semantic border          | None                        |

Use dividers inside tables, lists, and fixed chrome. Do not put a divider between sections when 24 px
of spacing communicates the grouping. Strong elevation is reserved for dialogs, menus, and the mobile
navigation drawer. Avoid gradients except data visualization or a required media treatment.

Nested radii are concentric: inner radius equals outer radius minus the surrounding padding. For
example, an 8 px control inside a 14 px panel needs at least 6 px of inset.

## Component contracts

### Buttons

- `primary`: one filled orange action per view. Verb-first label. Use dark ink in dark mode and white
  in light mode through `--color-primary-foreground`.
- `secondary`: neutral surface, visible border, primary foreground.
- `danger`: red solid only for the confirming action in a destructive flow.
- `ghost/icon`: no fill at rest; neutral hover fill. Icon-only buttons require an `aria-label`.
- `loading`: keep the original verb, add progress language or spinner, set `disabled`, and retain the
  original width.
- `disabled`: 50–58% opacity, no hover, `not-allowed` cursor.
- `pressed`: `scale(0.96)` for 140 ms. Never move with margin or position.

### Inputs and selects

Use a visible label. Placeholder text is an example, never the label. Controls are 40–42 px tall,
filled with the sunken surface, and have a neutral border. Focus uses a 2 px focus perimeter and a
3 px subtle ring. Errors set `aria-invalid`, reference adjacent recovery copy with `aria-describedby`,
and focus the first invalid field after submit. Preserve paste and appropriate `type`, `name`,
`autocomplete`, and `inputmode` behavior.

Native selects are preferred. If a custom select becomes necessary, it must implement the ARIA APG
keyboard pattern before it can replace the native control.

### Tabs

Tabs are text on a border-bottom rail. Inactive labels are muted; active labels use primary foreground
plus a 2 px orange indicator. Tabs remain at least 44 px high and become horizontally scrollable with
snap hints rather than wrapping into ambiguous rows.

### Cards and panels

A panel is a structural surface with one border and little or no shadow. Do not nest generic panels.
Cards can contain a header, body, and footer separated by subtle internal rules. Card hover changes
the surface by one neutral step only; avoid lift and glow.

### Tables and data lists

Headers use an 11–12 px semibold label, 6% tracking, muted color, and the sunken surface. Standard rows
are 58 px tall. Names and core values use proportional type; identifiers, branches, hashes, and paths
use the mono face. Use tabular figures for numbers.

At tablet widths, genuinely wide operational tables may scroll horizontally inside a clearly bounded
panel. At mobile widths, high-value tables should recompose into labeled rows or compact two-column
records. Do not simply scale type down. Never truncate an important value without a title, tooltip,
copy action, or detail view that exposes the full string.

### Badges and status indicators

Badges use a 6 px radius rather than a decorative pill unless the value is avatar-like. A status pairs
its semantic color with a word and, where space permits, a dot or icon. `running` uses info blue,
`ready/live` success green, `attention` warning amber, and `failed/destructive` red. Orange is reserved
for WorkerDeck selection and deploy emphasis.

### Navigation and sidebar

The desktop sidebar is 288 px wide and may collapse to 76 px. It contains, in order: brand/version,
grouped product navigation, the primary project action, documentation, and workspace identity. Group
labels are 11 px uppercase metadata. The active route uses the selected surface and orange icon/text.

Collapsed navigation keeps only icons and native title tooltips. At 1024 px and below, the sidebar is
a drawer rather than a narrow desktop rail. It takes focus on open, closes with Escape/scrim/close
button/navigation, locks background scroll, and restores focus to the menu trigger.

### Header

On desktop the header blends into the canvas and keeps search/theme utilities at the trailing edge,
aligned with the page title. It is not a second boxed navigation bar. On tablet and mobile it becomes
sticky, gains a subtle border and blur, and shows the compact brand plus menu trigger.

### Dialogs and dropdowns

Use native `dialog` where possible for focus trapping and Escape behavior. Dialogs have an elevated
surface, 10 px radius, one border, and one floating shadow. The backdrop is neutral black at 50–68%
opacity. Primary and cancel actions remain visible without scrolling on ordinary phone heights.

Menus and popovers originate at the trigger, use the elevated surface, and close on Escape and outside
press. Command search is intentionally instant because keyboard users may invoke it frequently.

### Tooltips

Tooltips explain unlabeled icons or unfamiliar terms, not obvious buttons. They appear after a short
delay, use caption type, and never contain required information. Once one tooltip in a toolbar is
open, adjacent tooltips appear without additional delay. Native `title` is the acceptable baseline for
the collapsed navigation and top-bar icon controls.

### Toasts and notifications

Routine updates use a polite live region. Urgent untied errors use `role="alert"`. Success is concise
and repeats the action vocabulary: “Project created.” Errors state what failed and the next recovery
step. Actionable or error toasts persist until dismissed; purely informational success messages may
time out. Toasts enter and leave through the same edge.

### Empty, loading, and error states

- Empty states identify the empty object, explain how it is populated, and offer one next action. The
  deploy topology motif may be used for a first-project state.
- Skeletons mirror the final layout and use a low-contrast linear shimmer. Do not show a spinner over
  an otherwise empty page.
- Errors are calm and explicit: name the failed operation, preserve available content, and provide a
  concrete retry or configuration path. Never use “Oops” or blame the operator.

## Motion

Motion has one named purpose: feedback, spatial consistency, state indication, preventing a jarring
change, or explanation in rare onboarding.

| Interaction          | Duration | Curve           | Properties              |
| -------------------- | -------- | --------------- | ----------------------- |
| Button press         | 140 ms   | `--ease-out`    | `transform`             |
| Hover/color feedback | 140 ms   | `ease`          | color/background/border |
| Tooltip              | 125 ms   | `--ease-out`    | opacity/transform       |
| Menu/select          | 200 ms   | `--ease-out`    | opacity/transform       |
| Route enter          | 180 ms   | `--ease-out`    | opacity/translateY(6px) |
| Dialog/backdrop      | 250 ms   | `--ease-out`    | opacity/scale(0.96)     |
| Mobile drawer        | 320 ms   | `--ease-drawer` | transform               |
| Loading shimmer      | 1200 ms  | linear          | transform               |

The first route render does not animate. Route transitions are subtle and do not block interaction.
High-frequency command-menu opening is instant. Animate only `transform`, `opacity`, and color-related
properties except a measured accordion. Never use `transition: all`, `ease-in`, `scale(0)`, or a UI
duration above 300 ms except the gesture-like drawer.

Gate hover treatments with `(hover: hover) and (pointer: fine)`. Under `prefers-reduced-motion`, remove
translation, scale, spinning, pulsing, and shimmer; retain a short opacity crossfade when it improves
state comprehension.

## Responsive system

Breakpoints follow content failure rather than device names:

- **Above 1180 px:** 288 px sidebar, trailing search field, multi-column project/resource layouts.
- **1025–1180 px:** 248 px sidebar, icon-only command trigger, two-column resources, single-column
  overview/operation compositions where the side rail no longer fits comfortably.
- **621–1024 px:** drawer navigation, sticky compact header, 24 px page gutter, touch-sized controls.
- **320–620 px:** 14–18 px gutter, one-column cards/forms, 16 px inputs, two-up compact metrics,
  recomposed deployment records, horizontally scrollable project tabs.

Do not hide an action solely to fit a breakpoint. Move it into stable mobile chrome or the normal
flow. Honor safe-area insets for any future bottom or edge-fixed controls. The app must reflow at
320 px and 200% zoom without clipping primary tasks.

## Accessibility requirements

- Body and control text meets WCAG AA: 4.5:1 below 18 px normal or 14 px bold, 3:1 for large text.
  Non-text UI boundaries and focus indicators meet 3:1 against adjacent colors.
- Every keyboard-reachable control has a visible `:focus-visible` perimeter of at least 2 px.
- Every pointer action has a keyboard path. Native buttons, links, inputs, selects, and dialogs are
  preferred over recreated semantics.
- Desktop targets are normally 40 × 40 px; dense icon actions never fall below 24 × 24 px. Touch
  targets are 44 × 44 px with no overlapping extended areas.
- Icon-only controls have descriptive accessible names. Decorative SVGs remain hidden from the
  accessibility tree.
- State and meaning never depend on color or motion alone.
- Dialogs trap focus, make the page behind inert, close with Escape when safe, and restore trigger
  focus.
- Dynamic routine feedback uses a stable polite live region. Errors that are not field-specific use
  an alert. Field errors are connected with `aria-describedby`.
- `prefers-reduced-motion`, forced colors, 200% zoom, keyboard navigation, and a 320 px viewport are
  release checks.

## Copy rules

Use sentence case. Buttons start with a verb and name the result: “Create project”, “Save changes”,
“Delete deployment”. Confirmations repeat the consequence in the confirm button. Links describe their
destination. Use the same term through a complete flow. Empty and error text is instructional, brief,
and free of jokes or blame.

## Building future pages

1. Start with the existing shell, `page-frame`, `page-intro`, semantic tokens, and shared components.
2. Compose from `panel`, button, form, status, tabs, and data-row contracts before adding a new class.
3. Add a missing role to `design-system.css`; never borrow a token because its current value happens
   to look correct.
4. Put domain-specific geometry in `styles.css`, but keep color, radius, elevation, typography, and
   motion connected to semantic tokens.
5. Improve a shared component when a new route exposes a limitation. Do not fork a page-specific
   button, input, status, dialog, or table treatment.
6. Ship the page only after checking default, hover, focus, active, disabled, loading, empty, error,
   light, dark, system, reduced-motion, desktop, tablet, and mobile behavior as applicable.

New raw colors, unscoped shadows, arbitrary spacing, `transition: all`, page-specific control heights,
and a second icon library require design-system review.
