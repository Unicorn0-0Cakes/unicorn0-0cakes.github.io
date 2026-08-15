# Accessibility

Version 0.1.0-milestone1. Implemented in `src/accessibility.js` and throughout
the markup.

---

## Implemented

| requirement | how |
|---|---|
| light and dark modes | inherited from `assets/orbital.css`; both are designed, not inverted |
| reduced motion | `prefers-reduced-motion` honoured, plus an in-page toggle. Suppresses droplet shimmer, field-arrow animation and chart transitions. **Physics continues** — the simulation is still running, it just is not decorated |
| pause | `Space`, and a labelled button |
| slow motion | speed control includes 0.25× and 0.5× |
| keyboard operation | every control is a native `button`, `input` or `select`; droplet selection is a focusable list as well as a canvas click; full shortcut set in `UX_FLOW.md` §3 |
| visible focus | 2 px outline in `--rf-orange` with a 2 px offset, never removed |
| screen-reader labels | every control has a `<label>` or `aria-label`; the tracking panel is an `aria-live="polite"` region announcing fit results |
| text alternatives for graphs | every chart has a `<figcaption>` prose summary **and** a `<details><table>` with the underlying numbers |
| non-colour polarity | `+` / `−` glyphs and the words "upper plate positive"; field arrows have direction, not just hue |
| non-colour status | accepted `✓`, rejected `✕`, caution `~`, unresolved `?`, plus the word |
| numerical inputs beside sliders | every slider has a paired number input with the same `aria-label` |
| adjustable text size | 90 / 100 / 115 / 130 % control, applied as a root font-size scale |
| no dragging required | none of the core actions use drag |
| sound | none. The optional-sound requirement is met by having no sound at all |
| high contrast | `prefers-contrast: more` raises line and text contrast; an in-page toggle does the same |

## Canvas accessibility

The two canvases are the one place where a visual medium is unavoidable. Each
carries:

- `role="img"` with an `aria-label` that is **regenerated as the state changes**,
  e.g. *"Chamber. 23 droplets visible. Selected droplet D-0003, 2.1 mm above the
  lower plate, rising at 21 micrometres per second. Field on, 152 volts, upper
  plate positive."*
- a parallel text readout below, always visible, giving the selected droplet's
  position, velocity and elapsed track time as numbers.

A user who cannot see the chamber can still run the whole experiment from the
readout and the controls.

## Known gaps

- The chart text summaries are generated from templates and are good for
  trends, but a complex residual plot is genuinely hard to summarise; the data
  table is the fallback.
- No testing with real assistive technology has been done. The claims above are
  about what is implemented, not about verified usability.
  **This is recorded as an open item and the accessibility audit in Milestone 7
  is not complete.**
- Colour contrast ratios have not been formally measured against WCAG AA.
