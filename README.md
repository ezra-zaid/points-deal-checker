# ✈️ Points Deal Checker

A Chrome/Edge extension that answers one question in plain English: **is this award flight worth transferring Amex points for, or should you just pay cash?** All data stays local in your browser.

## The math, dumbed down

```
value of the deal = (cash price − award taxes/fees) ÷ points you'd transfer
```

That gives **cents per Amex point**. The verdict:

- 🔴 **under 1¢** — just pay cash (the Amex travel portal gets you ~1¢ with zero hassle, so anything below that is a bad trade)
- 🟡 **1–1.5¢** — borderline, your call
- 🟢 **over 1.5¢** — transfer, the points win

(Thresholds are editable in Settings.)

## How to use it

1. Find an award flight on an airline site (or in a deal newsletter)
2. Check the cash price for the same flight on Google Flights
3. Click ✈️ → pick the airline → enter award miles, award fees, cash price
4. Read the verdict

The extension remembers your Amex and airline balances, so it tells you exactly how many Amex points to transfer (accounting for what you already have, the transfer ratio, any transfer bonus, and Amex's 1,000-point increments) — and warns you if:

- you don't have enough points
- fees are eating the "deal"
- you're about to transfer before confirming the award seat exists (**transfers are one-way!**)

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Turn on **Developer mode** → **Load unpacked** → pick this folder
3. Pin the ✈️ icon

## Dashboard

- **Balances & Partners** — your Amex balance, per-airline balances, and the transfer-ratio table (editable; Amex changes partners occasionally). Links to a current transfer-bonus tracker.
- **Deal History** — deals you saved, so you learn what "good" looks like on your routes
- **Settings** — verdict thresholds

## Notes

- Transfer bonuses are entered manually (a dropdown: +15% to +40% or custom) — reliable beats automated-but-stale.
- Partner list ships with Amex US Membership Rewards airline partners as of mid-2026; edit freely.
