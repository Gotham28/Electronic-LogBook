---
version: alpha
name: Arogya Electronic LogBook
description: Clinical training records for residents and faculty, organized around a calm teal logbook interface.
colors:
  primary: "hsl(174 72% 34%)"
  background: "hsl(178 57% 97%)"
  foreground: "hsl(190 39% 13%)"
  accent: "#0d9488"
  surface: "#ffffff"
typography:
  sans:
    fontFamily: "Open Sauce One, Segoe UI, sans-serif"
  display:
    fontFamily: "Roboto, Segoe UI, sans-serif"
  mono:
    fontFamily: "Cascadia Code, Consolas, monospace"
rounded:
  DEFAULT: "1rem"
  card: "1.125rem"
  control: "0.75rem"
  chip: "9999px"
spacing:
  mobile-gutter: "1rem"
  mobile-control-height: "2.75rem"
  mobile-section-gap: "1rem"
  mobile-page-bottom-clearance: "5.5rem"
  content-max: "1380px"
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    height: "2.75rem"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    height: "2.75rem"
  badge:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
  mobile-navigation:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    height: "3.75rem"
    size: "1.25rem"
---

# Arogya Electronic LogBook Design System

## Overview

### Creative North Star

The interface should feel like a well-ordered clinical record desk: familiar logbook hierarchy, quiet white surfaces, and teal cues that make the active workflow easy to find. Keep the existing soft teal and glass treatment restrained so clinical records stay primary.

### Product context and register

- **Audience and primary job:** Postgraduate residents record training activity; faculty review records; department heads oversee progress.
- **Target market(s) and evidence:** The project brief identifies Arogya's medical training use. This UI is the Electronic LogBook module.
- **Locale(s) and language policy:** Current product UI is written in English. The inspected app has no locale switch in its shared layout.
- **Usage scene:** Repeated record entry and review on desktop and phones, often during a busy clinical day.
- **Register:** Product interface across resident, faculty, HOD, and administration screens.
- **Memorable signature:** A soft teal active state inside pale, translucent application surfaces.
- **Restraint:** Keep text, record status, dates, units, and primary actions more prominent than decoration.
- **Anti-references:** Avoid dense miniature labels, oversized dashboard tiles, and competing accent colors that make records harder to scan.
- **Token ownership/runtime mapping:** The existing runtime CSS in `src/index.css` is canonical (Tailwind CSS v4 `@theme inline` and CSS variables). This file records its accepted visual language and mobile scale. Shared primitives in `src/components/ui/` consume those runtime styles; CSS mobile rules normalize their rendered sizes. Demo department accents are sourced from `src/lib/demoDepartments.ts` and mapped by `src/App.tsx` to `--demo-accent`, `--demo-accent-readable` (contrast-safe accent text on light surfaces), and `--demo-accent-foreground` (white or dark text on accent fills, selected by contrast). Demo teal text utilities use the readable accent token. No generated token export is used.

## Colors

Use the semantic teal primary and foreground from `src/index.css` for action and reading hierarchy. White is the main card surface. Pale teal backgrounds and borders group related controls without competing with status colors. The established body gradient is background atmosphere only; avoid adding stronger decorative gradients to record content. Preserve semantic status colors and do not rely on color alone.

## Typography

Use Open Sauce One for interface text and Roboto for display headings, with Segoe UI and system sans-serif fallbacks. On phones, use a stable scale: captions 12px, labels 14px, body and fields 16px, emphasis 18px, and page titles 28px. Larger headings step through 20px, 24px, and 32px. Keep uppercase metadata at least 12px on phones. Preserve desktop utility sizing and existing weights.

## Layout

Keep the desktop content maximum at 1380px. Phone screens use 16px side gutters, a single content column where space requires it, and 16px section spacing. The phone application shell keeps a compact header and the existing role-specific bottom navigation. Reserve 44px for standard controls and 60px for navigation items, plus the device safe area. Content clears the fixed bottom bar. Tables that need card presentation retain their cell labels; comparison tables remain horizontally scrollable inside their own container.

## Elevation & Depth

Use a thin border and a soft shadow to distinguish cards and the mobile navigation surface. Blur and translucency belong to app chrome and overlays, not to record text surfaces. Keep static data cards quiet and avoid adding stronger shadows to create hierarchy.

## Shapes

Use the existing 12px control radius, 18px card radius, and pill chips. Lucide icons use an outline treatment; phone navigation icons are 20px with a 1.75 stroke. Put the selected navigation icon on a small pale-teal circular field. Keep visible text labels under navigation icons.

## Components

### Foundational visual states

Keep focus visibly teal, selected states readable, disabled states muted, and busy states dimensionally stable. Use the existing shared component state styles and semantic status colors.

### Buttons and actions

Retain the existing teal primary, white outline, and quiet ghost hierarchy. Phone buttons have a 44px minimum height; icon buttons also have a 44px minimum width. Preserve the existing button variants and action labels.

### Navigation and data display

Keep the desktop sidebar and phone bottom bar tied to the same role-appropriate navigation items. The active phone item uses a restrained circular tint and text label. Use compact record cards only where a row is understandable on its own; keep comparison tables in a labeled horizontal scroll region.

### Forms and overlays

Single-line phone fields and selects are at least 44px high and use 16px text. Text areas retain room for multiline entry. Dialog actions stack on phones and remain reachable within the viewport. Preserve shared validation, navigation, and permission behavior.

### Iconography

Use the existing Lucide icon family. Keep navigation icons at 20px with consistent 1.75 stroke width on phones, centered above readable labels. Do not use an icon without an accessible name or a visible label where the action is not universally understood.

### Motion

Keep the existing short state transitions. Do not add ambient or decorative motion to clinical record screens.

### Content and data visualization

Retain established clinical and workflow wording. Keep dates, counts, units, and status labels attached to their values. Do not replace failed data with fallback numbers.

## Do's and Don'ts

- **Do:** Use the shared mobile type scale and control sizing across screens.
- **Do:** Preserve every role's current navigation destinations and visible labels.
- **Don't:** Shrink important mobile text below 12px or use a blanket font-size override for every button.
- **Don't:** hide layout overflow by clipping the page; fix the content or contain genuine table scrolling.
