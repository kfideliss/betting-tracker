# EDGE Betting Tracker — Handoff Prompt

## Project
React web app (Vite) at `/Users/kelvinfidelis/Documents/Edge/edge-betting-tracker/`.
Main file: `src/App.jsx` (single-file app — all logic and UI in one file).
Deployed on Vercel. Auth via `src/auth.jsx`, storage via `src/storage.jsx` (localStorage).
GitHub: `github.com/kfideliss/betting-tracker`.

## Working constraints (read first)
- The `mcp__workspace__bash` sandbox has a disk-space issue — shell/build commands fail. Use file tools (Read/Write/Edit) directly on the mounted folder.
- The user has **no local `npm`**, so they cannot run/build locally. The deployed Vercel site is the only place changes are visible — they must `git add . && git commit && git push` manually, then hard-refresh (private tab) to dodge cache.
- Each push creates a new Vercel deployment URL (random hash). The user should use the **stable** project URL (no hash) so they always see the latest build.
- Always read `src/App.jsx` in full (or the target region) before editing — exact string matching required.

## Deployment commands (user runs these)
```
cd /Users/kelvinfidelis/Documents/Edge/edge-betting-tracker
git add .
git commit -m "<message>"
git push
```

## localStorage keys
`bets_v1`, `books_v1`, `txns_v1`, `sports_v1`, `markets_v1`, `credits_v1`. Confirm `credits_v1` is covered by the backup/restore utility (`exportAllData`/`importAllData` in `storage.jsx`) when touching that area.

## Key data structures
```js
const C = { bg, surface, card, border, combined, win, loss, push, pending, bonus, future, cashout, text, muted, accent }
const BOOK_COLORS = ["#1e6fff","#00a651","#f97316","#ec4899","#14b8a6","#eab308","#8b5cf6","#ef4444"]
const SPORTS  = ["AFL","Soccer","NRL","NBA","Other"]          // seed list; user adds custom via Settings
const MARKETS = ["Head-to-Head","Line/Handicap","Player Stats","Same Game Multi","Over/Under","Futures Market","Other"]
const BET_TYPES = ["Regular","Live","Future","Multi"]
const OUTCOMES  = ["Pending","Win","Loss","Push","Bonus Refund","Cashed Out"]

// Bet (key fields): id, date, settledDate?, sport, market, bookmaker, match, stake, odds,
//   myProb?, outcome, betType, isBonus, deducted, collectAmount?, refundAmount?, deferred?
// Book: { name, balance, color, plAdjust? }
// Credit (credits_v1): { id, book, amount, source, expiry, dateReceived, status:"available"|"used", usedBetId?, usedDate? }
// Txn: { id, book, type:"deposit"|"withdrawal", amount, date, notes }
```

## Balance accounting model (IMPORTANT — read before touching balances)
Three functions:
- `betPL(b)` — profit/loss for **P&L stats**, independent of `deducted`. Win → stake*(odds−1); Loss/Bonus Refund → −cost; Cashed Out → collect−cost; Push/Pending → 0 (cost = isBonus?0:stake).
- `balanceEffect(b,outcome)` — change to the **bookie balance**, depends on `b.deducted`.
- `betBalEffect(x)` — **net lifetime balance impact** = upfront stake deduction (if `deducted` && !bonus) + settled `balanceEffect`. Single source of truth for log/edit/delete.

Rules in force:
- **All non-bonus bets deduct their stake on placement** (`deducted=true` for new non-bonus bets). Bonus bets never touch the balance.
- Settled `balanceEffect` with `deducted=true`: Win → stake*odds (full return), Loss → 0, Push → stake (refund), Cashed Out → collectAmount.
- Legacy bets placed before this change keep `deducted=false` and settle with the old net model — both models coexist correctly per-bet.
- `submitBet`: new bet applies `betBalEffect`; **edit** reverses the previous bet's `betBalEffect` (on its old bookie) then applies the new one (handles stake/odds/outcome/bookmaker/bonus changes).
- `deleteBet`: reverses `betBalEffect`.
- `settleBet`: delta = −balanceEffect(current,current.outcome) + balanceEffect(updated,newOutcome). Used by Quick Settle and "Change result".
- `bankrollSeries`: models BOTH cash flows — a −stake event at `b.date` for deducted bets, and a `balanceEffect` event at `settleDate` for settled bets — plus deposits/withdrawals. Reconstructs the start balance by working back from current `book.balance`.

## Dates
All auto date-stamps use `todayLocal()` (local YYYY-MM-DD), NOT `toISOString()` (UTC — ran a day behind for the Melbourne user). Use `todayLocal()` for any new date stamping.

## Manual balance edits → P&L (`plAdjust`)
`saveBalEdit` records `newBalance − oldBalance` into `book.plAdjust` (cumulative), so correcting a bookie balance flows into its P&L. Deposits/withdrawals go through `addTxn`/`adjustBalance` and do NOT affect P&L. `plAdjust` is included in P&L only in the **All Time** time filter; ROI is always computed from tracked bets only.

## Time filters
- `timeFilter` — dashboard stat cards + breakdowns (pills at top of dashboard).
- `chartFilter` — separate dropdown controlling the line charts only (Overall P&L, Bankroll History, P&L by Sport).

## Features implemented (state: all built; confirm all pushed)
1. Multis in Quick Settle; only Futures in the collapsible accordion.
2. By Sport dashboard rows clickable → inline By Market sub-breakdown for that sport.
3. Bankroll History chart: per-bookie line toggle pills (hidden by default; Combined always shown).
4. P&L by Sport chart: cumulative P&L per sport, dashed lines, toggle pills (all on by default via a `hiddenSports` model so new sports show automatically).
5. Move pending bets between Quick Settle and Futures (`deferred` flag — preserves bet type).
6. Bonuses tab: credit inventory (add/place/delete, expiry tracking with ≤7d flag), dedicated bonus-bet list, performance stats (credits available, expiring soon, cash extracted, conversion %, win rate). Refund settling creates a usable bonus **credit** in inventory (not a same-event bonus bet).
7. "Change result" button re-settles already-settled bets (balance-correct) in the Bets log and Bonuses tab.
8. Overall P&L chart (cumulative betting profit, **excludes** deposits/withdrawals).
9. Dedicated `chartFilter` date dropdown for the line charts.
10. Bet form: live "If it wins" potential payout; pending bets in the log show "→ $X if win".
11. Bet-type → market constraints: Multi → {Same Game Multi, Multi-leg}; Future → locked to Futures Market.
12. "Other" pinned to the bottom of sport/market dropdowns; custom sports/markets flow through to breakdowns and the P&L-by-sport graph (`allSports`/`allMarkets` = union of custom lists + values present in bets).
13. Pushes excluded from win rate and per-sport strike rate.
14. Local-date fix (`todayLocal`) for all date stamps.
15. Balance integrity: log/edit/delete all reconcile the bookie balance via `betBalEffect`; bankroll graph models placement deductions; `plAdjust` gated to All-Time.

## Known limitations / gotchas
- **Phantom `plAdjust`:** earlier an edit-reconciliation bug caused balance drift; the user corrected balances manually and those corrections were recorded as P&L. Those legacy adjustments remain baked into All-Time bookie P&L. The drift bug is now fixed.
- Editing a Cashed Out / Bonus Refund bet via the Edit form: the Outcome dropdown only offers Pending/Win/Loss/Push, so those outcomes can't be re-selected there (use "Change result"). `collectAmount`/`refundAmount` preserved on edit.
- Deleting a bet that previously settled as "Bonus Refund" does not remove the bonus credit it generated.
- Manual `plAdjust` has no date, hence the All-Time-only treatment (deliberate approximation).

## Queued / not yet actioned (wait for user instruction)
- **Reset P&L adjustment** control per bookie in Settings — proposed (to clear phantom `plAdjust`), awaiting user confirmation.
- **Password change** (long-standing): user once asked "are you able to change the password" but never clarified which password (app login in `src/auth.jsx`, or a hardcoded value). Clarify before actioning.

## Notes
- Git pushes done manually by the user.
- When verifying live, the deployed app currently loads straight to the dashboard (no login wall observed), so deployed numbers can be inspected in the browser to confirm fixes — but the deployed build lags any unpushed local changes.
- This `HANDOFF.md` is tracked in the repo; consider `.gitignore`-ing it if you don't want it deployed.
