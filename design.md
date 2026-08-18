<!-- Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 -->
# Design: Sổ Tài Sản

Locked design system for the whole app. Future design work reads this file first
and defers to it. Amend this file intentionally before introducing a visual
exception. `design.md` governs decisions; `tokens.css` is the canonical runtime
implementation.

## System

- Genre: modern-minimal with a utilitarian product voice.
- App macrostructure: Workbench. Function and financial data carry each screen.
- Theme: custom, light-only iOS familiarity with a burgundy anchor.
- Axes: light paper / SF system sans / warm red accent.
- Platform posture: touch-first PWA, familiar controls, compact information density.
- Libraries: keep the existing React and CSS stack. Add no UI or motion library.

## Product principles

1. Preserve route, store, data, sync, and financial behavior.
2. Prefer direct labels, visible totals, tabular numerals, and predictable controls.
3. Use one containment layer. Avoid decorative cards nested inside cards.
4. App pages have no decorative enrichment, gradients, illustrations, or fake device chrome.
5. Burgundy identifies primary action and selection. It should remain a small signal.
6. Gain, loss, and warning colors always accompany text, sign, or icon context.
7. Light mode is the only supported color scheme.

## Macrostructure family

- App pages: Workbench with compact screen headers, grouped data surfaces, and persistent app chrome.
- Detail and form pages: Workbench drill-down with one clear primary action and inline secondary actions.
- Settings and history: Workbench index with grouped rows and restrained separators.
- Marketing pages: not in scope.
- Content pages: not in scope.

## Canonical color roles

- `--color-paper`: `oklch(97.8% 0.006 20)`, primary page paper.
- `--color-paper-2`: `oklch(95.5% 0.008 20)`, app background.
- `--color-paper-3`: `oklch(92.5% 0.01 20)`, selected or grouped surface.
- `--color-surface`: `oklch(99.2% 0.003 20)`, elevated controls and cards.
- `--color-ink`: `oklch(18% 0.014 20)`, primary text.
- `--color-ink-2`: `oklch(33% 0.016 20)`, secondary text.
- `--color-muted`: `oklch(55% 0.014 20)`, helper text.
- `--color-rule`: `oklch(86% 0.012 20)`, separators.
- `--color-accent`: `oklch(52% 0.205 21)`, preserved burgundy brand accent.
- `--color-focus`: `oklch(56% 0.22 21)`, keyboard focus.
- `--color-gain`: `oklch(50% 0.145 145)`, positive value.
- `--color-loss`: `oklch(57% 0.21 27)`, negative or destructive value.
- `--color-warning`: `oklch(67% 0.16 55)`, caution and pending state.

Every rendered color references a named token. Add a token to `tokens.css`
before using a new color. Do not add dark-mode overrides.

## Typography

- Display: Apple SF system display stack, weight 760, roman.
- Body: Apple SF system text stack, weight 400.
- Mono: SF Mono system stack, reserved for technical values when necessary.
- Numeric data: tabular figures.
- Display tracking: `-0.03em`.
- Body size: `15px`; iOS control label anchor: `17px`.
- Scale: `11, 12, 13, 15, 17, 20, 24, 28, 34`, plus a restrained fluid display step.
- Headings are roman. Do not use italic emphasis in headings.

## Spacing and layout

- Use the 4px scale in `tokens.css`: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- Prefer named spacing tokens over raw values in migrated code.
- Preserve safe-area behavior and the fixed mobile app shell.
- Preserve selector contracts `.app`, `.scroll`, `.tabbar`, and `.bottom-actions`.
- Apply `overflow-x: clip` to both `html` and `body`.
- Validate at 320px, 375px, 414px, and 768px widths.
- Clickable labels stay on one line; their containers reflow instead.

## Shape and depth

- Controls: 10px radius.
- Inputs: 12px radius.
- Cards: 16px radius.
- Sheets: 22px radius.
- App shell on wide viewports: 28px radius.
- Pills: fully rounded only for compact status or segmented controls.
- Use separators before shadows. Cards use one quiet shadow at most.
- No colored glows on light surfaces.

## Motion

- Motion is quiet and functional. Animate only transform and opacity.
- Enter: `--ease-out`; exit: `--ease-in`; state change: `--ease-in-out`.
- Durations: 120ms micro, 220ms short, 420ms long.
- Focus indication appears instantly and never animates.
- Reduced motion collapses spatial movement to an opacity transition of 150ms or less.

## Interaction and CTA voice

- Primary action: burgundy fill, accent-ink text, input radius, compact iOS padding.
- Secondary action: surface or transparent background, rule border, same radius.
- Destructive action: loss color plus explicit destructive copy.
- Success is silent when the changed result is visible.
- Button labels use specific Vietnamese verbs and remain one line.
- Visible UI copy uses neither em dash nor en dash characters.

## Page allowances

- App pages must not use decorative enrichment.
- Data visualizations may use semantic color when the meaning is also textual.
- Existing emoji and icon decisions are preserved during foundation work; unify them only in a later migration task.
- No route, store, business logic, or persistence changes are design-system work.

## What all pages must share

- The same light surface hierarchy, accent, semantic colors, SF stacks, radii, and motion.
- The same tab bar and bottom action behavior.
- The same numeric alignment and focus treatment.
- The same compact, direct, utilitarian copy posture.

## Exports

### Runtime CSS

`tokens.css` at the project root is the canonical implementation and is imported
by `src/index.css`. It contains the complete color, type, spacing, radius,
shadow, focus, easing, and duration set.

### Tailwind v4 adapter

The project does not use Tailwind. If added later, map `--color-*`, `--font-*`,
and `--text-*` directly, and map each `--space-*` token to the equivalent
`--spacing-*` name inside `@theme`.

### DTCG adapter

The project does not use a token pipeline. If one is added, preserve each
`tokens.css` value as a DTCG `$value` with `$type` set to `color`,
`fontFamily`, `dimension`, or `duration`.

### shadcn/ui adapter

The project does not use shadcn/ui. If adopted later, map paper to background,
ink to foreground, accent to primary, accent-ink to primary-foreground, rule to
border and input, focus to ring, and loss to destructive. Do not introduce a
dark selector.
