# 💳✈️ Points Transfer Decision

A Chrome extension (Manifest V3) that fixes the backwards way people use credit card points:

> **The problem:** you see "+30% bonus to Virgin Atlantic!", transfer points first, and look for a flight second. Transfers are final. If the flight isn't there — or is a bad deal — those points are stranded.

This tool enforces the right order:

1. **Trip first** — where are you going, which points do you hold? The built-in transfer-partner table (Amex MR, Chase UR, Citi TYP, Capital One) shows which programs your points can actually reach, with alliance hints for coverage.
2. **Real prices second** — for each promising program you check *their own site* and type in the real points price and taxes/fees. Nothing gets ranked until you do. The extension never invents award prices.
3. **Bonus last, as a tiebreaker only** — paste in bonuses you've seen (program, %, expiry). They discount options you've *already priced*. A bonus on an unpriced partner gets a nudge ("price it first"), never a ranking.

The **"Am I ready to transfer?"** button is the final gate — it refuses to bless a transfer until you've priced a real award, confirmed the seat exists, and have enough points. Then it tells you exactly what to send where, in plain English.

## What it deliberately does NOT do

- ❌ No booking, payments, or account access — it's a calculator
- ❌ No scraping of loyalty sites (fragile, against ToS) — you paste real numbers
- ❌ No stored credentials
- ❌ No backend, no external API calls — everything stays in your browser

## What you enter (because it changes constantly)

- Your balances per program
- The award prices/fees you looked up
- Active transfer bonuses and their expiry dates

## Numbers it computes

- **Points you'd actually send** — accounting for the transfer ratio ("send 1 → get 0.8" for Amex→JetBlue), rounded up to the issuer's transfer increment, minus nothing (partial transfers hoping to "top up later" get a warning instead)
- **Value per point sent** — (cash price − award fees) ÷ points sent, so wildly different options are apples-to-apples
- **Transfer fee flags** — e.g. Amex adds a fee to some US airline transfers; flagged, not computed, because fee rules drift

## Install

1. `chrome://extensions` → **Developer mode** → **Load unpacked** → this folder
2. Pin the icon; your in-progress research persists between popup openings
3. **New trip** clears the research but keeps your balances, programs, and bonuses

## Data freshness

The partner/ratio table in `shared/data.js` is seeded from public transfer charts (last reviewed July 2026). Issuers change these without notice — **always verify on the issuer's transfer page before sending points.**
