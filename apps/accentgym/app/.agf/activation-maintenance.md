---
name: accentgym-direct-offline-practice
description: Keep native service startup out of setup and expose existing offline practice without retyping
metadata:
  type: project
---

Accent Gym maintenance, 2026-11-11: the workspace already contained the one-screen setup and viewed-step analytics repair documented in onboarding-maintenance.md. The reported historical step-2/step-3 drop-offs are not reproducible as required onboarding screens in this source. Keep the optional assessment out of the new-user funnel; do not emit fictitious step events.

Remaining reproducible friction: Main mounts during onboarding and immediately initialized native billing and ad consent. These now start once, 600 ms after onboarding finishes, independently of each other. Ads initialization, consent enforcement, revenue slot and billing entitlement reconciliation remain active. Setup copy now explains the no-mic option.

The home speaking flow previously buried offline practice behind Type instead, an empty text input and a further submit. Home and the recording sheet now expose Listen & say without a mic directly, using the existing displayed sentence and the existing unscored save flow. Recording remains the primary action. Saving still persists guidedPractice and a real streak, fires core_action with guided_practice, calls review.actionCompleted, and shows the lasting saved result and tomorrow nudge. No microphone, AI call or AI allowance is required for this existing offline flow. No schema, store version, protected module, monetization configuration or dependency manifest changed.

Verification: npx tsc --noEmit; validate 145/145; journeys nine goals in 1–5 actions, 7,500 fuzz actions with no crashes, invariant violations, restore losses or dead ends; pitfalls clean. Real component callbacks checked in light/dark using check-onboarding.cjs and check-activation.cjs with inert native/UI adapters. The latter covers direct entry, unchanged quota/scores, successful save/streak/telemetry/review, reopening and the recording fallback. These checks do not establish native layout, service health or improved live conversion. No native/release build or publishing performed.
