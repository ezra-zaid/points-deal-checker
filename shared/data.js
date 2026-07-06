// ============================================================================
// TRANSFER PARTNER LOOKUP TABLE
// Built from the public transfer charts of Amex, Chase, Citi and Capital One.
// Seeded from charts as publicly listed (last reviewed July 2026). Issuers add,
// drop and re-ratio partners without notice — ALWAYS verify on the issuer's own
// transfer page before sending points. This table decides step 1 only
// ("which of MY programs can even reach this trip"); it never prices anything.
// ============================================================================

const ISSUERS = [
  { id: 'amex',  name: 'Amex Membership Rewards', short: 'Amex',        increment: 1000 },
  { id: 'chase', name: 'Chase Ultimate Rewards',  short: 'Chase',       increment: 1000 },
  { id: 'citi',  name: 'Citi ThankYou Points',    short: 'Citi',        increment: 1000 },
  { id: 'cap1',  name: 'Capital One Miles',       short: 'Capital One', increment: 1000 },
];

// alliance tells you the REACH of a program: an alliance member can usually
// book award seats on any airline in its alliance, which is how a program
// with no flights to your destination can still get you there.
const PARTNERS = [
  { id: 'aerlingus',  name: 'Aer Lingus AerClub',          type: 'airline', alliance: 'Avios family',  site: 'aerlingus.com' },
  { id: 'aeromexico', name: 'Aeroméxico Rewards',          type: 'airline', alliance: 'SkyTeam',       site: 'aeromexico.com' },
  { id: 'aircanada',  name: 'Air Canada Aeroplan',         type: 'airline', alliance: 'Star Alliance', site: 'aircanada.com (Aeroplan)' },
  { id: 'afklm',      name: 'Air France/KLM Flying Blue',  type: 'airline', alliance: 'SkyTeam',       site: 'flyingblue.com' },
  { id: 'ana',        name: 'ANA Mileage Club',            type: 'airline', alliance: 'Star Alliance', site: 'ana.co.jp' },
  { id: 'avianca',    name: 'Avianca LifeMiles',           type: 'airline', alliance: 'Star Alliance', site: 'lifemiles.com' },
  { id: 'ba',         name: 'British Airways Avios',       type: 'airline', alliance: 'oneworld',      site: 'britishairways.com' },
  { id: 'cathay',     name: 'Cathay Asia Miles',           type: 'airline', alliance: 'oneworld',      site: 'asiamiles.com' },
  { id: 'delta',      name: 'Delta SkyMiles',              type: 'airline', alliance: 'SkyTeam',       site: 'delta.com' },
  { id: 'emirates',   name: 'Emirates Skywards',           type: 'airline', alliance: 'independent',   site: 'emirates.com' },
  { id: 'etihad',     name: 'Etihad Guest',                type: 'airline', alliance: 'independent',   site: 'etihad.com' },
  { id: 'eva',        name: 'EVA Air Infinity MileageLands', type: 'airline', alliance: 'Star Alliance', site: 'evaair.com' },
  { id: 'finnair',    name: 'Finnair Plus',                type: 'airline', alliance: 'oneworld',      site: 'finnair.com' },
  { id: 'iberia',     name: 'Iberia Plus',                 type: 'airline', alliance: 'oneworld',      site: 'iberia.com' },
  { id: 'jetblue',    name: 'JetBlue TrueBlue',            type: 'airline', alliance: 'independent',   site: 'jetblue.com' },
  { id: 'qantas',     name: 'Qantas Frequent Flyer',       type: 'airline', alliance: 'oneworld',      site: 'qantas.com' },
  { id: 'qatar',      name: 'Qatar Airways Avios',         type: 'airline', alliance: 'oneworld',      site: 'qatarairways.com' },
  { id: 'singapore',  name: 'Singapore KrisFlyer',         type: 'airline', alliance: 'Star Alliance', site: 'singaporeair.com' },
  { id: 'southwest',  name: 'Southwest Rapid Rewards',     type: 'airline', alliance: 'independent',   site: 'southwest.com' },
  { id: 'tap',        name: 'TAP Miles&Go',                type: 'airline', alliance: 'Star Alliance', site: 'flytap.com' },
  { id: 'turkish',    name: 'Turkish Miles&Smiles',        type: 'airline', alliance: 'Star Alliance', site: 'turkishairlines.com' },
  { id: 'united',     name: 'United MileagePlus',          type: 'airline', alliance: 'Star Alliance', site: 'united.com' },
  { id: 'virgin',     name: 'Virgin Atlantic Flying Club', type: 'airline', alliance: 'SkyTeam',       site: 'virginatlantic.com' },
  { id: 'accor',      name: 'Accor Live Limitless',        type: 'hotel',   alliance: 'hotel',         site: 'all.accor.com' },
  { id: 'choice',     name: 'Choice Privileges',           type: 'hotel',   alliance: 'hotel',         site: 'choicehotels.com' },
  { id: 'hilton',     name: 'Hilton Honors',               type: 'hotel',   alliance: 'hotel',         site: 'hilton.com' },
  { id: 'hyatt',      name: 'World of Hyatt',              type: 'hotel',   alliance: 'hotel',         site: 'hyatt.com' },
  { id: 'ihg',        name: 'IHG One Rewards',             type: 'hotel',   alliance: 'hotel',         site: 'ihg.com' },
  { id: 'marriott',   name: 'Marriott Bonvoy',             type: 'hotel',   alliance: 'hotel',         site: 'marriott.com' },
  { id: 'wyndham',    name: 'Wyndham Rewards',             type: 'hotel',   alliance: 'hotel',         site: 'wyndhamhotels.com' },
];

// from:to = points you send : points you receive.
// feeWarn = the issuer may add a fee on this transfer (e.g. Amex passes on a
// small excise-tax offset for US-based airline programs). We FLAG it rather
// than compute it because the fee rules change — check the transfer page.
const LINKS = [
  // ---- Amex Membership Rewards ----
  { issuer: 'amex', partner: 'aerlingus',  from: 1,   to: 1 },
  { issuer: 'amex', partner: 'aeromexico', from: 1,   to: 1.6 },
  { issuer: 'amex', partner: 'aircanada',  from: 1,   to: 1 },
  { issuer: 'amex', partner: 'afklm',      from: 1,   to: 1 },
  { issuer: 'amex', partner: 'ana',        from: 1,   to: 1 },
  { issuer: 'amex', partner: 'avianca',    from: 1,   to: 1 },
  { issuer: 'amex', partner: 'ba',         from: 1,   to: 1 },
  { issuer: 'amex', partner: 'cathay',     from: 1,   to: 1 },
  { issuer: 'amex', partner: 'delta',      from: 1,   to: 1, feeWarn: true },
  { issuer: 'amex', partner: 'emirates',   from: 1,   to: 1 },
  { issuer: 'amex', partner: 'etihad',     from: 1,   to: 1 },
  { issuer: 'amex', partner: 'iberia',     from: 1,   to: 1 },
  { issuer: 'amex', partner: 'jetblue',    from: 250, to: 200, feeWarn: true },
  { issuer: 'amex', partner: 'qantas',     from: 1,   to: 1 },
  { issuer: 'amex', partner: 'qatar',      from: 1,   to: 1 },
  { issuer: 'amex', partner: 'singapore',  from: 1,   to: 1 },
  { issuer: 'amex', partner: 'virgin',     from: 1,   to: 1 },
  { issuer: 'amex', partner: 'choice',     from: 1,   to: 1 },
  { issuer: 'amex', partner: 'hilton',     from: 1,   to: 2 },
  { issuer: 'amex', partner: 'marriott',   from: 1,   to: 1 },

  // ---- Chase Ultimate Rewards ----
  { issuer: 'chase', partner: 'aerlingus', from: 1, to: 1 },
  { issuer: 'chase', partner: 'aircanada', from: 1, to: 1 },
  { issuer: 'chase', partner: 'afklm',     from: 1, to: 1 },
  { issuer: 'chase', partner: 'ba',        from: 1, to: 1 },
  { issuer: 'chase', partner: 'emirates',  from: 1, to: 1 },
  { issuer: 'chase', partner: 'iberia',    from: 1, to: 1 },
  { issuer: 'chase', partner: 'jetblue',   from: 1, to: 1 },
  { issuer: 'chase', partner: 'singapore', from: 1, to: 1 },
  { issuer: 'chase', partner: 'southwest', from: 1, to: 1 },
  { issuer: 'chase', partner: 'united',    from: 1, to: 1 },
  { issuer: 'chase', partner: 'virgin',    from: 1, to: 1 },
  { issuer: 'chase', partner: 'hyatt',     from: 1, to: 1 },
  { issuer: 'chase', partner: 'ihg',       from: 1, to: 1 },
  { issuer: 'chase', partner: 'marriott',  from: 1, to: 1 },

  // ---- Citi ThankYou Points ----
  { issuer: 'citi', partner: 'aeromexico', from: 1, to: 1 },
  { issuer: 'citi', partner: 'afklm',      from: 1, to: 1 },
  { issuer: 'citi', partner: 'avianca',    from: 1, to: 1 },
  { issuer: 'citi', partner: 'cathay',     from: 1, to: 1 },
  { issuer: 'citi', partner: 'emirates',   from: 1, to: 1 },
  { issuer: 'citi', partner: 'etihad',     from: 1, to: 1 },
  { issuer: 'citi', partner: 'eva',        from: 1, to: 1 },
  { issuer: 'citi', partner: 'jetblue',    from: 1, to: 1 },
  { issuer: 'citi', partner: 'qantas',     from: 1, to: 1 },
  { issuer: 'citi', partner: 'qatar',      from: 1, to: 1 },
  { issuer: 'citi', partner: 'singapore',  from: 1, to: 1 },
  { issuer: 'citi', partner: 'turkish',    from: 1, to: 1 },
  { issuer: 'citi', partner: 'virgin',     from: 1, to: 1 },
  { issuer: 'citi', partner: 'accor',      from: 2, to: 1 },
  { issuer: 'citi', partner: 'choice',     from: 1, to: 2 },
  { issuer: 'citi', partner: 'wyndham',    from: 1, to: 1 },

  // ---- Capital One Miles ----
  { issuer: 'cap1', partner: 'aeromexico', from: 1, to: 1 },
  { issuer: 'cap1', partner: 'aircanada',  from: 1, to: 1 },
  { issuer: 'cap1', partner: 'afklm',      from: 1, to: 1 },
  { issuer: 'cap1', partner: 'avianca',    from: 1, to: 1 },
  { issuer: 'cap1', partner: 'ba',         from: 1, to: 1 },
  { issuer: 'cap1', partner: 'cathay',     from: 1, to: 1 },
  { issuer: 'cap1', partner: 'emirates',   from: 1, to: 1 },
  { issuer: 'cap1', partner: 'etihad',     from: 1, to: 1 },
  { issuer: 'cap1', partner: 'eva',        from: 2, to: 1.5 },
  { issuer: 'cap1', partner: 'finnair',    from: 1, to: 1 },
  { issuer: 'cap1', partner: 'qantas',     from: 1, to: 1 },
  { issuer: 'cap1', partner: 'singapore',  from: 1, to: 1 },
  { issuer: 'cap1', partner: 'tap',        from: 1, to: 1 },
  { issuer: 'cap1', partner: 'turkish',    from: 1, to: 1 },
  { issuer: 'cap1', partner: 'virgin',     from: 1, to: 1 },
  { issuer: 'cap1', partner: 'accor',      from: 2, to: 1 },
  { issuer: 'cap1', partner: 'choice',     from: 1, to: 1 },
  { issuer: 'cap1', partner: 'wyndham',    from: 1, to: 1 },
];
