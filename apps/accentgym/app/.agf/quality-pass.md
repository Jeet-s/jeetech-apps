---
name: Accent Gym store screenshot quality pass
description: Five real-screen scenes that preserve the owner-accepted app and emphasize practice, sound guidance and saved words
metadata:
  type: project
---

The owner explicitly limited this pass to store screenshots and visual-only additions. Do not redesign QA-approved screens or flows. All src/screens files, src/ui files, App.tsx, core logic and protected modules remain byte-for-byte unchanged from this pass's baseline (.agf/store-pass-before/approved-sources.sha256).

Inspected all six .agf/critique/ours_*.png captures and all six reference JPGs, including the two BoldVoice promotional images. The references use device frames and marketing compositions; do not reproduce those inside a scene. The factory supplies the framing and captions.

Current story in shots.json (five scenes):
- practice — the actual PracticeScreen, 21-day streak, a saved warm-up, 2/6 resumable session, and the same assessment action shown in the real app.
- plan — the actual ResultView at the end of the three-line diagnostic: V, TH (think), W, and a named listening drill for each. Uses the real diagnostic results and Hindi/US profile.
- feedback — the actual ResultView for the custom word "vest", selected V. Uses the persisted result of recordCustom, rather than displaying an interpret-only result with a saved claim. Word and phoneme averages agree. V/W is explicitly a text-based suggestion; the existing coaching limitation remains visible.
- review — the real populated ReviewScreen: four due words and the existing type-any-text utility. Replaces the score-led Progress capture as the history/utility scene.
- pro — the real ProSheet with existing prices, free-tier copy and Restore.

Removed the empty idle recorder, unanswered drill and dominant 82/100 Progress screen from the store sequence. Their legacy record/drill/sounds/progress scene links still render. No fake recording, invented acoustic score, phone frame, marketing headline, or decorative scene backdrop was added. Caption lengths are at most six words.

The requested kit is already present: gradient/categorical/tones and hero/amount/overline/tabular tokens; HeroCard, Pill, ProgressBar, Amount, Skeleton/List, DonutChart, Legend, showValues, accents, trailing content and EmptyState art. Preserve existing app customizations, IPA font coverage, palette and Sheet repairs.

Verification: TypeScript zero errors; validate 141/141; journeys eight goals, 7,500 random actions, zero errors/invariant violations/roundtrip losses/dead ends; pitfalls zero errors. Actual fixture checks pass. .agf/check-store-scenes.cjs renders the real React component trees using inert native adapters in light and dark: all five scenes plus four legacy links pass, and hashes prove approved sources unchanged. This is a render/content smoke check, not native layout QA. Final Expo web JavaScript export passes; no native/release build was run.

Fresh device screenshot review and the 8/10 design verdict remain pending. The in-app browser preview host is unavailable. The earlier recording, feedback and progress layout redesign requests remain outside the owner's explicit screenshot-only boundary; this pass does not claim to have implemented them or reached 8/10.
