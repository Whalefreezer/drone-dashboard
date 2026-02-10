# NZO Top 24 Double Elimination Format (Draft)

## Scope
This document captures the NZO Top 24 bracket format based on the provided bracket image and event notes.

- Field size: 24 pilots
- Composition:
	- Top 22 qualified pilots
	- 2 pilots bumped up from the lower grouping
- Format: Double elimination progression across Rounds 1-4
- Standard race scoring (per race):
	- 1st = 10 points
	- 2nd = 7 points
	- 3rd = 4 points
	- 4th = 3 points
	- 5th = 2 points
	- 6th = 1 point

## Heat Structure
Key NZO difference: races are run with **3 heats per race** in the elimination rounds.

Round cadence from event notes:

1. Round 1 race order: `Race 1 -> Race 2 -> Race 3 -> Race 4 -> Race 5 -> Race 6`, then repeat this sequence 3 times (H1-H3 per race).
2. Round 2 race order: `Race 7 -> Race 8 -> Race 9`, then repeat this sequence 3 times.
3. Round 3 race order: `Race 10 -> Race 11 -> Race 12`, then repeat this sequence 3 times.

From the bracket image:

- Race 16, 17, and 18 are shown with H1-H3 columns.
- Race 19 is labeled `TOP 6 - FINALISTS - RACE 19 [CTA]` and is shown with H1-H13 columns.

## Bracket Progression

### Round 1: Top 24 Opening Heats
- Race 1 seeds: `1, 12, 13, 24`
- Race 2 seeds: `6, 7, 18, 19`
- Race 3 seeds: `4, 9, 16, 21`
- Race 4 seeds: `3, 10, 15, 22`
- Race 5 seeds: `5, 8, 17, 20`
- Race 6 seeds: `2, 11, 14, 23`

Advancement from Round 1:

- Top 2 from each race go to Top 12 (Races 10-12).
- 3rd and 4th from each race drop to losers bracket (Races 7-9).

### Round 2A: Losers Bracket Entry
- Race 7: `3rd R1, 4th R1, 3rd R3, 4th R3`
- Race 8: `3rd R2, 4th R2, 3rd R4, 4th R4`
- Race 9: `3rd R5, 4th R5, 3rd R6, 4th R6`

Advancement:

- 1st/2nd from R7 -> Race 13
- 1st/2nd from R8 -> Race 14
- 1st/2nd from R9 -> Race 15

### Round 2B: Top 12
- Race 10: `1st R1, 2nd R1, 1st R3, 2nd R3`
- Race 11: `1st R2, 2nd R2, 1st R4, 2nd R4`
- Race 12: `1st R5, 2nd R5, 1st R6, 2nd R6`

Advancement:

- 1st/2nd from R10, R11, R12 -> Top 6 Semi (Race 16)
- 3rd/4th from R10 -> Race 13
- 3rd/4th from R11 -> Race 14
- 3rd/4th from R12 -> Race 15

### Round 3A: Losers Continuation
- Race 13: `1st R7, 2nd R7, 3rd R10, 4th R10`
- Race 14: `1st R8, 2nd R8, 3rd R11, 4th R11`
- Race 15: `1st R9, 2nd R9, 3rd R12, 4th R12`

Advancement:

- 1st/2nd from R13, R14, R15 -> Losers Race 17

### Round 3B: Top 6 Semi
- Race 16: `1st R10, 2nd R10, 1st R11, 2nd R11, 1st R12, 2nd R12`

Advancement:

- 1st/2nd/3rd from R16 -> Race 19 (Top 6 Finalists)
- 4th/5th/6th from R16 -> Race 18 (Bottom 6 Semi)

### Round 4A: Losers Race
- Race 17: `1st R13, 2nd R13, 1st R14, 2nd R14, 1st R15, 2nd R15`

Advancement:

- 1st/2nd/3rd from R17 -> Race 18

### Round 4B: Bottom 6 Semi
- Race 18: `1st R17, 2nd R17, 3rd R17, 4th R16, 5th R16, 6th R16`

Advancement:

- 1st/2nd/3rd from R18 -> Race 19

### Final
- Race 19 (CTA): `1st R16, 2nd R16, 3rd R16, 1st R18, 2nd R18, 3rd R18`

## Race-Run Summary (Operator View)

1. Run Round 1 block (`R1-R6`) in rotating order, 3 full loops.
2. Run Round 2 losers block (`R7-R9`) in rotating order, 3 full loops.
3. Run Round 3 winners block (`R10-R12`) in rotating order, 3 full loops.
4. Run `R13-R15`, then `R16`, then `R17`, then `R18`, then `R19` according to event timing and race control.

## Notes / Assumptions
- This write-up is based on the provided NZO notes plus `scratchapd/brackets.png`.
- `R19 [CTA]` and H1-H13 are interpreted directly from the bracket image label/columns.
- If NZO publishes an official seeding chart with alternating race numbers, the chart should override race-call order while keeping the same advancement dependencies.
