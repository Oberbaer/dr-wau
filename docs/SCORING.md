# Scoring model v1

The report contains four category scores. The overall score is weighted as follows:

- Flow integrity: 50%
- Device health: 25%
- App health: 15%
- Maintainability: 10%

Each finding code and severity combination receives a base reduction: critical 20, high 10, medium 4, low 1 and info 0. Repeated findings use logarithmic scaling. Reductions are applied successively to the remaining category score instead of being added, so several related symptoms cannot abruptly force a large installation to zero. Category scores are clamped to 0–100.

The score is a prioritization aid, not proof that an installation is safe or optimal. Every finding exposes a severity, confidence, subject and recommendation. Heuristic findings never claim a confirmed defect.
