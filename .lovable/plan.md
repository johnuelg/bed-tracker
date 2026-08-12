# Occupancy Rate comparison transparency

## Goal
Make the Occupancy Rate KPI card clearly explain how its comparison and variance are calculated, without changing the underlying occupancy formula.

## Changes
1. Update the card’s comparison label to identify the exact baseline date and time rather than using an ambiguous “vs” value.
2. Show both comparison measures when a prior selection exists:
   - **Percentage-point variance**: current occupancy rate minus the prior selected rate.
   - **Relative percentage change**: percentage-point variance divided by the prior selected rate, multiplied by 100.
3. Add concise, in-context calculation details to the Occupancy Rate card so users can understand:
   - the current rate source (the active global Occupancy Rate formula, with its built-in fallback),
   - which prior selected snapshot is used as the baseline,
   - how zero or near-zero baseline rates are handled (show percentage points only to avoid an invalid relative percentage).
4. Preserve the existing visual status benchmark and trend color semantics; only improve the comparison wording and explanatory presentation.

## Technical details
- The dashboard currently records the last selected date/time and compares the current occupancy rate against that snapshot.
- `variance (points) = current rate − prior rate`
- `relative change (%) = (variance / |prior rate|) × 100`
- No database migration or KPI formula changes are required.
