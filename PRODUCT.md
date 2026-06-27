# Product

## Register

product

## Users

Security engineers, maintainers, and release owners auditing public npm organization packages. They use the tool during supply-chain reviews to understand trusted publishing coverage, recent manual publishes, and publish access held by non-members.

## Product Purpose

Audit npm organizations in the browser against public npm data, preserving the documented behavior of the original shell scripts while making the results easier to run, inspect, export, and share as read-only snapshots.

## Brand Personality

Precise, skeptical, operational. The interface should feel like a focused audit console: dense enough for repeated investigation, clear about incomplete data, and restrained in its use of visual emphasis.

## Anti-references

Do not make this feel like a marketing landing page, a generic SaaS dashboard, or a decorative security-themed site. Avoid vague trust claims, hidden failure states, and visuals that compete with tables, logs, and audit configuration.

## Design Principles

- Preserve audit semantics before visual polish.
- Surface uncertainty and failed fetches where users make decisions.
- Keep controls familiar, compact, and keyboard-accessible.
- Prefer readable tables, logs, and export affordances over decorative UI.
- Treat sharing as an explicit persistence action, never a default.

## Accessibility & Inclusion

Target WCAG 2.2 AA for the core app surface. Preserve keyboard operability, accessible names for icon-only controls, reduced-motion compatibility, and automated axe coverage for both light and dark effective themes.
