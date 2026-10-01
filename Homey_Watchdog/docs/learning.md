# Device learning in 0.7.1

## Current evidence and historical learning

`evaluateHeartbeat()` chooses the current native, capability or verified raw
Insights evidence. Its current timestamp does not restrict learning history.
`relevantEvents()` supplies actual timestamps to `learnDevice()`, which merges
them with its retained history, including timestamps older than the latest
native report. Resampled numeric Insights, cached values without an event time,
future timestamps and unverified Insights are still excluded. Capability update
times remain indirect evidence: they do not prove a periodic radio heartbeat.

History remains in the separate `device_learning_state_v1` setting, schema 1.
Existing 0.7.0 `events` are accepted when `rawEvents` is absent; no state reset
or configuration migration is required. Previously rejected history can be
recovered only while the underlying real logs remain available. The existing
bounded Insights request window is unchanged.

## Deterministic pipeline and counts

1. Merge old and incoming actual timestamps within the last 90 days. Skip new
   interaction evidence during vacation, retaining technical evidence.
2. Remove exact timestamp repeats. For a shared timestamp, prefer interaction,
   native, Insights, then capability provenance, independently of input order.
3. Sort chronologically and retain at most 384 raw timestamp records.
4. Group records in a fixed 60-second window starting at the first record of
   each group. Use that group's first actual timestamp as its observation;
   adjacent timestamps cannot extend the window indefinitely.
5. Retain the newest 96 groups and their corresponding raw records. Form
   positive intervals longer than one minute between observations.
6. Apply the conservative upper outlier rule below.
7. Calculate **all** reported quantiles from this one final interval population.

`rawEventCount` counts retained actual timestamp records after exact-repeat
removal and before minute grouping; it is not a lifetime input counter. This
keeps repeated queries from inflating the count. `uniqueEventCount` / `reportCount`
count grouped observations. `intervalCount` counts formed valid intervals;
`usedIntervalCount` / `sampleCount` count intervals used for statistics;
`excludedIntervalCount` is their difference. Invalid or expired input records
are not statistical outliers and do not contribute to these interval counts.

`observationSpanDays` is the elapsed time between first and last retained
observations. `observationDays` is the sum of the final population's intervals,
in days. Both are exposed separately. The existing expert panel shows counts,
outlier boundary, durations, quantiles and confidence reason. Short durations
are shown in hours rather than rounded to zero days.

## Conservative upper outlier rule

With fewer than eight valid intervals, exclude **none**. There is insufficient
evidence to distinguish a long normal interval from an outage safely.

With at least eight intervals, calculate a pilot median, Q1 and Q3 using linear
interpolation at index `(n - 1) * percentile`, on all valid sorted intervals.
Define the upper boundary in hours as:

```text
max(24, 8 * pilot median, Q3 + 3 * (Q3 - Q1))
```

Exclude only intervals **strictly greater** than this boundary. There is no
lower-tail trimming. The three simultaneous safeguards preserve ordinary
longer intervals and only reject clearly extreme upper gaps. The pilot median
defines the rule; it is **not** the published median. Published median, P10,
P90, P95 and longest normal pause all use the same final population.

This is a statistical heuristic, not proof of an outage. Small samples can
retain a very long interval; confidence and the manual override remain the
safeguards against adopting an unreliable automatic warning threshold.

## Periodic confidence and warning recommendation

The existing confidence criteria remain:

- P90/P10 greater than 12: `insufficient`, reason `irregular_intervals`, with the
  actual ratio available to the expert panel.
- At least 20 used intervals and 7 used observation days: `high`.
- At least 10 used intervals and 3 used observation days: `medium`.
- At least 4 used intervals and 1 used observation day: `low` / learning phase.
- Otherwise: `too_few_intervals` or `too_short_observation`.

These criteria apply to the `periodic` model, including technical sensors,
vacuums and safety devices. Contacts use the independent activity model below.

Only high or medium confidence produces an automatic learned recommendation.
The existing conservative formula remains `2 * final P95`, with minima of 4 h
for sensors, 12 h for vacuums, and 24 h for other classes. Round up to 2-hour
steps through 24 h, 6-hour steps through 72 h, then 24-hour steps; cap at 720 h.
An explicit manual threshold always wins, including a confirmed 24 h value.
No device-specific 24 h value is forced by this patch.

## Contact activity model

`deviceClass` and `learningModel` are separate. Contacts select `activity`;
buttons and remotes select `event_only` even with frequent use. Safety
capabilities (smoke, water, CO) always select `periodic`, including mixed
contact/safety devices. Motion devices retain their existing model in this
patch; activity inference is limited to contacts. Explicit manual settings
remain authoritative. Older stored learning is recomputed from retained
timestamps when its model differs; settings and suppression are preserved.

Only timestamps with interaction provenance form activity blocks. Native and
battery timestamps remain communication evidence and cannot create usage.
Exact duplicates are removed by the same bounded pipeline. At most 384 raw
records and 96 minute groups are retained over 90 days; activity is calculated
from their actual interaction records, not invented intermediate reports.

Group interactions in a **fixed 30-minute window from the first event** of
each block. Use the first and last real timestamp as block boundaries. A later
event cannot extend the window indefinitely. The upper end of the proposed
10–30 minute range accommodates short open/close pairs; the recorded reference
history contains both sub-minute pairs and a roughly 2.5-minute pair. A generic
30-minute limit also groups longer short usage bursts. It is a conservative
heuristic, not a device-specific fit or a claim that every pair belongs together.

Pause = next block's start minus preceding block's end. Keep all pauses for
diagnostics; compute median/P90/P95/longest normal pause from the same population
after the conservative upper outlier rule described above. All counts and the
number of excluded pauses are exposed. Raw periodic interval statistics remain
available separately, but their P90/P10 **never decides activity confidence**.

Observation days are UTC calendar days from the first retained interaction
through evaluation time, including the current partial day and **all silent
days**. Active days count days with a real interaction, including interactions
in a block that crosses midnight. Excluding a pause outlier does not exclude
days from coverage. The elapsed duration is also retained; this avoids assigning
high confidence just by crossing midnight. These are observed timestamps, not
proof that logging was complete on every day. Missing logs reduce confidence;
they are not evidence of a hardware fault.

Upper pauses are considered stable when P95/P90 <= 1.75 and longest normal
pause/P95 <= 2, with positive P90. Confidence is:

- `insufficient`: fewer than 4 blocks, fewer than 3 calendar days, less than
  50% active days, or unstable upper pauses. Each has a separate reason.
- `high`: at least 14 calendar days **and 13 elapsed days**, 14 blocks,
  80% active days and stable upper pauses.
- `medium`: at least 7 calendar days **and 6 elapsed days**, 7 blocks,
  60% active days and stable upper pauses.
- `low`: a visible pattern meeting the basic gates, below medium/high.

Only medium/high yields a learned automatic silence threshold:

```text
ceil(max(24, P95 normal pause + max(12, 0.25 * P95 normal pause)) / 6) * 6
```

Cap at 720 h. This adds a safety margin to the upper pause, rather than
multiplying the median. Two daily open/close blocks in the 14-day reference
produce 30 h; one daily pair produces 36 h. Otherwise contacts fall back to
`event_only` with no automatic silence obligation. Battery and availability
remain evaluated independently. A fresh native heartbeat still wins.

The profile exposes `automaticWarningAfterHours` separately from the effective
`warningAfterHours`. A manual confirmed 24 h value wins while the automatic
recommendation remains visible. UI language describes frequent/daily usage;
it does not present a contact as an exact periodic reporter. Expert details
show calculated activity counts, days, percentages, pause statistics and reason.

Vacation defaults to `pause` for activity and `normal` for periodic profiles.
Explicit `normal`/`extend`/`pause` activity overrides remain supported; safety
devices stay normal. New interaction samples are skipped during vacation and
the activity observation endpoint freezes at the last learning evaluation.
After vacation, coverage includes any retained calendar gaps conservatively;
no unavailable history or vacation activity is synthesized. Long vacations can
therefore require renewed observations before an automatic recommendation.

## Vacation expiry

Persisted `vacation.enabled` and absolute ISO `vacation.until` remain unchanged
in the compatible Watchdog configuration. Check expiry and persist off at app
initialization and before every actual Watchdog run. A timer wakes at most one
hour later (or at the nearer deadline), rechecks the **current absolute date**,
and schedules another short timer if vacation has not expired. It never turns
vacation off solely because a timer fired.

App, runtime or Homey restart reloads the same absolute deadline during app
initialization. An expired deadline is cleared before initialization continues.
Manual off clears the timer. Enabled vacation without an end date remains
active until manually switched off. The 30-day and 90-day local regression
tests advance a fake clock; they do not restart or change a production Homey.
