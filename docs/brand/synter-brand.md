# Synter brand spec for the synter-loop sites

Source: Context.dev brand data for synterai.com (colors, logos) plus the live synterai.com stylesheet (`/synter-v1/site.css`), pulled Nov 7, 2026. Context.dev's styleguide crawl got synterai.com's Clerk error page, so the type, spacing and component values below come from the live CSS. Reference captures: `/Users/supabowl/synter-brand-ref/` (`ref-home.png` hero, `ref-synter-full.png` full page, `site.css`, `home.html`). These stay out of the repo.

Applies to `site/public/index.html`, `site/public/live/index.html`, `site/public/assets/site.css` and the loop/live scripts.

## Positioning (don't skip)

The site is **synter-loop, a Hermes plugin built on Synter**. It is not Synter's site. Keep "synter-loop" as the wordmark. Use the Synter mark only in a "Built on Synter" lockup (header right or footer) linking to https://synterai.com. Don't copy Synter's headline copy, customer logos, partner badges or photos.

## Color tokens (replace the current `--bg/--panel/--accent` set)

| Token | Hex | Use |
|---|---|---|
| `--carbon` | `#0b0e12` | page and hero background, nav, footer |
| `--ink` | `#181c1e` | text on light sections |
| `--paper` | `#f4f4f0` | light section background, text on dark |
| `--pale` | `#ebece7` | alternate light surface |
| `--line` | `#c9cfca` | rules on light sections |
| `--muted` | `#5c656a` | secondary text on light |
| `--lime` | `#9cff5a` | primary accent: CTA fill, eyebrows, active states, the loop's live node |
| `--lime-hover` | `#b6ff88` | CTA hover |
| `--white` | `#e8ebee` | body text on dark |
| `--dark-line` | `#344048` | rules and card borders on dark |
| `--dark-panel` | `#10171b` | cards and panels on dark |
| `--dark-active` | `#203028` | selected tab or step on dark |
| `--dark-muted` | `#a6b5b6` | secondary text on dark |
| `--midnight` | `#0b0f1a` | Context.dev site color, optional deep gradient stop |
| `--logo-lime` | `#cefc0c` | mark color only, not UI |

Keep `--warm` and `--bad` for warning and error states only, and retune them to sit on carbon (amber `#f5b942`, red `#ff6b6b` are fine).

The site stays dark-first (carbon), like synterai.com's hero. Use `--paper` light bands for one or two sections if it helps rhythm (synterai.com alternates dark hero, then paper sections).

## Type

- Body and headings: **Inter** (400, 450, 500, 600). Body 16px/1.55, antialiased.
- Headings: weight 400, `letter-spacing: -0.045em`, `line-height: 1.08`. h1 `clamp(44px, 6.1vw, 96px)`, h2 `clamp(32px, 4.3vw, 64px)`. Big, light, tight; that's the signature.
- Eyebrows and labels: **IBM Plex Mono** 400, 11px/1.6, `letter-spacing: .08em`, uppercase, in `--lime` on dark. Use for the "In development · Hermes Agent Plugin Hackathon" badge, section kickers, step numbers, the install line and /live metadata.
- Wordmark: **Space Grotesk** 500, 20–24px, `letter-spacing: 1.4px`, with the mark at 25px and a 6–12px gap.
- Self-host all three as woff2 under `site/public/assets/fonts/` (all OFL). The CSP allows only `'self'` for styles and fonts, so no Google Fonts link. Use `font-display: swap`.

## Components

- **Primary CTA**: lime fill, carbon text, **square corners** (radius 0), padding `17px 25px`, weight 500, 16px, `display:inline-flex; justify-content:space-between; gap:48px`, trailing ↗ glyph. Hover `--lime-hover`.
- **Secondary link**: white text, 1px bottom border, trailing ↗ or ↓.
- **Nav**: carbon, 76px tall, wordmark left, light links right (15–16px, `--white`), lime CTA at far right. 1px `--dark-line` bottom rule.
- **Cards and panels on dark**: `--dark-panel` fill, 1px `--dark-line` border, radius 16–24px (synterai.com's product-preview bar uses ~22px), no shadows.
- **Tabs and steps**: square, 1px `--dark-line` dividers; active gets `box-shadow: inset 0 3px var(--lime)` and `--dark-active` fill. Use this for the loop's step list (Spend Guard → Tag Witness → Truth Layer → Agent ROAS → Jev).
- **Code / install line**: IBM Plex Mono on `--dark-panel`, lime text, square or 4px radius; Copy button as a secondary CTA.
- **Rules**: 1px lines, generous whitespace; padding `clamp(24px, 4.45vw, 86px)` on the sides (`--pad`).
- Shadows: none anywhere. Radius scale: 0 (buttons, tabs), 4px (inputs, code), 16–24px (cards).

## Loop diagram and motion

- Nodes: `--dark-panel` circles with `--dark-line` stroke; the active node and its arc in `--lime`; labels Inter 500. Center "Synter MCP" node gets the Synter mark.
- Keep GSAP 3.12.5 from cdnjs. Motion should match synterai.com: slow, calm, no bounce. Respect `prefers-reduced-motion` and add a visible "Pause motion" control like synterai.com's.

## /live

- Same nav and tokens. Table/list rows: 1px `--dark-line` dividers, mono for run ids, timestamps and token counts; status chips square with lime (ok), amber (warn), red (blocked).

## Favicon

Replace `favicon.svg` with a lime-on-carbon synter-loop glyph (or the Synter mark if you keep the "Built on Synter" lockup), and keep the SVG.

## Done when

- Both pages use only these tokens; no leftover `#3ddc84`, `#0b0f0d` or system fonts.
- Fonts load from `/assets/fonts/` with the existing CSP unchanged.
- Site tests pass; deployed to https://synter-loop.jordan-691.workers.dev and `/live/`.
- Screenshots at 1440×900 and 390×844 (phone) for both pages, committed to `PLANNING/` or attached to the PR.
