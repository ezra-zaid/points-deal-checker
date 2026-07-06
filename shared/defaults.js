// Amex Membership Rewards airline transfer partners.
// from:to = transfer ratio (MR points : airline miles). Editable in the
// dashboard — Amex changes partners/ratios occasionally, so treat this as a
// starting point, not gospel.
const PDC_DEFAULT_PARTNERS = [
  { id: 'aerlingus',  name: 'Aer Lingus AerClub',            from: 1,   to: 1 },
  { id: 'aeromexico', name: 'Aeroméxico Rewards',            from: 1,   to: 1.6 },
  { id: 'aeroplan',   name: 'Air Canada Aeroplan',           from: 1,   to: 1 },
  { id: 'flyingblue', name: 'Air France/KLM Flying Blue',    from: 1,   to: 1 },
  { id: 'ana',        name: 'ANA Mileage Club',              from: 1,   to: 1 },
  { id: 'avianca',    name: 'Avianca LifeMiles',             from: 1,   to: 1 },
  { id: 'ba',         name: 'British Airways Avios',         from: 1,   to: 1 },
  { id: 'cathay',     name: 'Cathay Asia Miles',             from: 1,   to: 1 },
  { id: 'delta',      name: 'Delta SkyMiles',                from: 1,   to: 1 },
  { id: 'emirates',   name: 'Emirates Skywards',             from: 1,   to: 1 },
  { id: 'etihad',     name: 'Etihad Guest',                  from: 1,   to: 1 },
  { id: 'iberia',     name: 'Iberia Plus',                   from: 1,   to: 1 },
  { id: 'jetblue',    name: 'JetBlue TrueBlue',              from: 250, to: 200 },
  { id: 'qantas',     name: 'Qantas Frequent Flyer',         from: 1,   to: 1 },
  { id: 'qatar',      name: 'Qatar Airways Avios',           from: 1,   to: 1 },
  { id: 'singapore',  name: 'Singapore KrisFlyer',           from: 1,   to: 1 },
  { id: 'virgin',     name: 'Virgin Atlantic Flying Club',   from: 1,   to: 1 },
];

// Verdict thresholds in cents per Amex point (editable in dashboard):
// below redBelow  → just pay cash (Amex portal gets you ~1¢ with zero hassle)
// above greenAbove → transferring clearly wins
const PDC_DEFAULT_SETTINGS = {
  redBelow:   1.0,
  greenAbove: 1.5,
};

// Amex transfers happen in 1,000-point increments
const PDC_TRANSFER_INCREMENT = 1000;
