---
name: Accent Gym coaching phrase boundaries
description: Preserve complete thoughts while bounding per-phoneme feedback
metadata:
  type: project
---
The QA speech hook supplies a paragraph. Scoring the entire paragraph exceeds the structured per-phoneme output budget, but the previous six-word slicing produced incomplete thoughts such as “I think the best way to”. Keep the full transcript, show the exact phrase before coaching, preserve complete sentences up to 18 words, and split longer sentences at breath/clause boundaries without dropping words. Retain the provisioned response budget and reject incomplete coverage. Local tests cannot establish live AI availability or latency.
