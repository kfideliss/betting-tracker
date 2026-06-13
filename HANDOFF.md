# EDGE Betting Tracker — Handoff Prompt

## Project
React web app (Vite) at `/Users/kelvinfidelis/Documents/Edge/edge-betting-tracker/`.  
Main file: `src/App.jsx` (single-file app, all logic and UI in one file).  
Deployed on Vercel. Auth via `src/auth.jsx`, storage via `src/storage.jsx` (localStorage).

## State of the codebase
A visual overhaul was recently applied to `src/App.jsx` (committed but not yet pushed — user needs to run `git add . && git commit -m "visual overhaul - charts, stat cards, breakdowns" && git push` manually).

Changes already in the file:
- **StatCard**: left accent border (`borderLeft: 3px solid color`), value 22px/800 weight, label 0.12em tracking/600 weight, slightly more padding.
- **EDGE wordmark**: gradient `#1e6fff → #a78bfa` via `WebkitTextFillColor: transparent`.
- **Bankroll History chart**: switched from `LineChart` to `ComposedChart` (imports updated), gradient area fill under Combined line (`id="combinedGrad"`), Combined `strokeWidth 3`, book lines dashed `strokeDasharray="4 2"`, Y-axis `tickFormatter={v=>\`$\${v}\`}`, tooltip `boxShadow`, transaction markers show as coloured arrows without the word "deposit"/"withdrawal".
- **By Market & By Sport**: 3px proportional P&L progress bars under each row (green/positive, red/negative), `maxAbs` scaled.
- **Analysis bookmaker cards**: `borderTop: 3px solid bs.color`, Balance & P&L 16px/800 weight, label `marginBottom: 2`.

## Key data structures (from App.jsx)
```js
const C = { bg, surface, card, border, combined, win, loss, push, pending, bonus, future, cashout, text, muted, accent }
const BOOK_COLORS = ["#1e6fff","#00a651","#f97316","#ec4899","#14b8a6","#eab308","#8b5cf6","#ef4444"]
const SPORTS = ["AFL","Soccer","NRL","NBA","Other"]
const MARKETS = ["Head-to-Head","Line/Handicap","Player Stats","Same Game Multi","Over/Under","Futures Market","Other"]
const BET_TYPES = ["Regular","Future","Multi"]

// Pending split (current — needs change #1):
const pendingRegular = pendingAll.filter(b => b.betType === "Regular")          // → Quick Settle
const pendingFutures = pendingAll.filter(b => b.betType === "Future" || b.betType === "Multi") // → collapsible
```

## Queued changes (not yet actioned — wait for user instruction)

### 1. Multis in Quick Settle
**What**: Multis should appear in the Quick Settle section alongside Regular bets. Only Futures stay in the collapsible "Futures & Multis" accordion.  
**Change**:
- `pendingRegular` → filter `betType === "Regular" || betType === "Multi"`
- `pendingFutures` → filter `betType === "Future"` only
- Rename the collapsible section label from "Futures & Multis" to "Futures" accordingly.

### 2. Sport → Market drill-down on Dashboard
**What**: In the "By Sport" breakdown on the dashboard, clicking a sport row expands it to show a By Market sub-breakdown filtered to that sport only (P&L, ROI, count per market for the selected sport).  
**How**: Add a `selectedSport` state (null by default). Clicking a sport row toggles `selectedSport`. When expanded, compute `marketBreakdown` filtered to `b.sport === selectedSport` and render it inline below the sport row (same progress bar style as the top-level By Market breakdown).

### 3. Bookie toggle on Bankroll History chart
**What**: Small pill toggle buttons above/beside the Bankroll History chart, one per bookie. Default: individual bookie lines hidden (Combined always visible). Toggling a pill shows/hides that bookie's dashed line.  
**How**: Add `visibleBooks` state (default: empty set or `{}`). Render pill buttons for each book with `books.map(...)`. Conditionally render each `<Line>` only if `visibleBooks` includes that book name.

### 4. P&L by Sport chart (cumulative over time)
**What**: A new chart on the dashboard (below or near Bankroll History) showing cumulative P&L over time with one line per sport. Same visual style — `ComposedChart`, dashed lines per sport, toggleable sports via pill buttons.  
**How**: Build a `sportPLSeries` computed value similar to `bankrollSeries`. For each settled bet sorted by `settleDate`, accumulate running P&L per sport. Each data point = `{ date, AFL: x, Soccer: y, ... }`. Render as `ComposedChart` with one `<Line>` per sport using `BOOK_COLORS` cycling for sport colours. Add sport toggle pills (same pattern as change #3).

### 5. Password change (unresolved from earlier)
User asked "are you able to change the password" but never clarified: which password (app login in `src/auth.jsx`, or a hardcoded value)? Clarify with user before actioning.

## Notes
- The bash workspace has a disk space issue — shell commands via `mcp__workspace__bash` will fail. Use file tools (Read/Write/Edit) directly on the mounted folder instead.
- Git push must be done manually by the user in their terminal.
- Always read `src/App.jsx` in full before making changes — it's a single large file and edits need exact string matching.
