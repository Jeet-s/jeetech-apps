---
name: accentgym-quick-onboarding
description: Remove pre-practice friction while preserving the optional sound assessment and saved progress
metadata:
  type: project
---

Accent Gym maintenance, 2026-11-10: first run previously opened a long introduction/pricing screen before language/accent setup; Practice then made the three-line assessment its primary action. The initial screen had no viewed-step event: `onboarding_step {step: 1}` fired only after tapping through the introduction, and optional assessments emitted later onboarding steps.

First run now has one skippable language/accent screen with a concise explanation and one Start practising button. It preserves the saved/default language instead of silently preselecting Hindi. Practice leads with the existing single-line speaking flow; the full sound check/report remains reachable from Practice and Settings. Today's real persisted streak activity drives the saved confirmation and return-tomorrow nudge. Viewed setup emits step 1 on mount; completion/skip emits onboarding_done once per mounted setup, while optional assessments emit screen_view.

No persisted fields or store version changed. Regression tests cover every language/accent starter line, skip preserving profile/progress/purchases, skipped draft choices, offline first practice and next-day streak, and saved-data round trips. Journeys now model the setup gate instead of offering practice before onboarding.

Verification: TypeScript clean; validate 145/145; nine journey goals in 1–5 actions and 7,500 fuzz actions without errors, invariant violations, restore losses or dead ends; pitfalls clean. `.agf/check-onboarding.cjs` checks real component callbacks and telemetry in light/dark mode with inert UI/native adapters and a temporary matching React test renderer. Native layout/speech QA and live funnel impact remain for the factory release process; no native build or publishing performed.
