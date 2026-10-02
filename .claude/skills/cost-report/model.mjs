// The cost model. One pure module: build.mjs runs it to check the defaults and
// prints a summary, and the page inlines this same source so every number on it
// is recomputed live from the same code when an assumption changes.
//
// Inputs: { prices, code, assumptions, options }. Nothing here reads a file.

const M = 1e6;
export const CATEGORIES = [
  { key: "claude", label: "Claude" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "voice", label: "Voice" },
  { key: "storage", label: "Storage and bandwidth" },
  { key: "platform", label: "Platform" },
  { key: "other", label: "Embeddings and email" },
];

export function promptTokens(chars, turn) {
  return Math.round((chars / turn.charsPerToken) * turn.tokenizerFactor);
}

function modelPrice(prices, id) {
  const p = prices.anthropic.models[id];
  if (!p) throw new Error(`no price for ${id}`);
  return p;
}

// One model turn of `calls` calls. The system block is the cached prefix: the
// first call reads it when warm and writes it when cold, later calls in the same
// turn read it. When the code caches the conversation too (`conversation`),
// each call writes what is new and the next reads everything before it;
// otherwise the conversation, images included, is full price on every call.
export function turnCost({ prices, model, prefix, ctx, growth, out, calls, images = 0, imageTokens = 0, warm, conversation = false }) {
  const p = modelPrice(prices, model);
  const cacheable = prefix >= p.minCacheTokens;
  let cost = 0;
  const whole = Math.floor(calls);
  const n = Math.ceil(calls);
  for (let i = 0; i < n; i++) {
    const weight = i < whole ? 1 : calls - whole;
    let pre;
    if (!cacheable) pre = prefix * p.in;
    else if (i === 0) pre = prefix * (warm * p.cacheRead + (1 - warm) * p.cacheWrite5m);
    else pre = prefix * p.cacheRead;
    const sent = ctx + growth * i + images * imageTokens;
    const dyn = !conversation
      ? sent * p.in
      : i === 0
        ? sent * p.cacheWrite5m
        : (sent - growth) * p.cacheRead + growth * p.cacheWrite5m;
    cost += (weight * (pre + dyn + out * p.out)) / M;
  }
  return cost;
}

function oneCall({ prices, model, input, out }) {
  const p = modelPrice(prices, model);
  return (input * p.in + out * p.out) / M;
}

export function models(code, options) {
  return {
    file: options.fileModel && options.fileModel !== "from-code" ? options.fileModel : code.models.file,
    answer: options.answerModel && options.answerModel !== "from-code" ? options.answerModel : code.models.answer,
    sort: code.models.sort,
    nightly: code.models.nightly,
  };
}

// Unit costs: what one of each action costs, given how warm each cached prefix
// is. `warm` is { file, answer, nightly } between 0 and 1.
export function units({ prices, code, assumptions, options }, warm) {
  const t = assumptions.turn;
  const md = models(code, options);
  const pt = (k) => promptTokens(code.promptChars[k] ?? 0, t);
  const tools = (model, n) => n + modelPrice(prices, model).toolSystemTokens;

  const filePrefix = pt("plan_v2") + tools(md.file, t.file.toolTokens);
  const answerPrefix = pt("answer") + tools(md.answer, t.answer.toolTokens);
  const nightlyPrefix = pt("nightly") + tools(md.nightly, t.nightly.toolTokens);
  const fileTurn = (extraCtx = 0, images = 0) =>
    turnCost({ prices, model: md.file, prefix: filePrefix, ctx: t.file.contextTokens + extraCtx, growth: t.file.growthPerCall,
      out: t.file.outputPerCall, calls: t.file.calls, images, imageTokens: t.imageTokens, warm: warm.file, conversation: code.cachesConversation });

  const wa = assumptions.whatsapp;
  const rates = prices.whatsapp.perReceiptByMarket;
  const market = options.whatsappMarket && options.whatsappMarket !== "mix" ? options.whatsappMarket : null;
  const receipt = market
    ? rates[market]
    : Object.entries(wa.marketMix).reduce((s, [k, share]) => s + share * (rates[k] ?? rates.Other), 0);

  const voicePerHour = prices.assemblyai[prices.assemblyai.used];
  const searchFee = prices.anthropic.webSearchPer1k / 1000;
  const readerPrompt = pt("reader");

  return {
    prefixes: { file: filePrefix, answer: answerPrefix, nightly: nightlyPrefix },
    models: md,
    fileText: fileTurn(),
    filePhotoPerPhoto: fileTurn(0, 1) - fileTurn(),
    fileMailExtra: fileTurn(t.mailBodyTokens) - fileTurn(),
    fileWhatsappExtra: fileTurn(300) - fileTurn(),
    answer: turnCost({ prices, model: md.answer, prefix: answerPrefix, ctx: t.answer.contextTokens, growth: t.answer.growthPerCall,
      out: t.answer.outputPerCall, calls: t.answer.calls, warm: warm.answer, conversation: code.cachesConversation }),
    classify: oneCall({ prices, model: md.sort, input: pt("classify") + t.classify.inputExtra, out: t.classify.output }),
    // One call per thread and member, the system prompt cached; the notes and
    // the member's dumps since their last pass are the uncached input.
    nightly: turnCost({ prices, model: md.nightly, prefix: nightlyPrefix, ctx: t.nightly.notesTokens + t.nightly.messagesTokens, growth: 0,
      out: t.nightly.output, calls: 1, warm: warm.nightly }),
    search: oneCall({ prices, model: md.sort, input: readerPrompt + t.readerSearch.resultTokens, out: t.readerSearch.output })
      + oneCall({ prices, model: md.sort, input: t.readerSearch.shapeIn, out: t.readerSearch.shapeOut }) + searchFee,
    read: oneCall({ prices, model: md.sort, input: readerPrompt + t.readerRead.pageTokens, out: t.readerRead.output }),
    mailLook: oneCall({ prices, model: md.sort, input: 500 + t.mailLook.candidates * t.mailLook.tokensPerImage, out: t.mailLook.output }),
    voicePerSecond: voicePerHour / 3600,
    receipt,
    embedPerToken: prices.voyage["voyage-4"] / M,
  };
}

const MONTH = 30;

// What one person in one profile costs in a month, by category, before any
// fleet-level item (plans, fixed costs, free tiers). `u` is the unit table.
export function personMonth(input, u, frequencyKey, behaviourKey) {
  const { prices, assumptions, options } = input;
  const f = assumptions.frequency[frequencyKey];
  const b = assumptions.behaviour[behaviourKey].perActiveDay;
  const days = f.activeDays;
  const t = assumptions.turn;
  const s = assumptions.storage;
  const wa = options.whatsapp ? b.whatsappSends : 0;

  // Per active day, then times days.
  const fileTurns = b.textDumps + b.photoDumps + b.voiceNotes + b.mailForwards + wa;
  const photos = b.photoDumps * b.photosPerPhotoDump;
  const classified = b.textDumps + b.questions + b.voiceNotes + wa;
  // The daily turn cap, when the code has one: turns past it are refused
  // before they cost anything, so everything a turn drives scales down.
  const turnsWanted = fileTurns + b.questions;
  const turnShare = input.code.dailyTurns && turnsWanted > input.code.dailyTurns ? input.code.dailyTurns / turnsWanted : 1;
  let claudeDay =
    turnShare * (
      fileTurns * u.fileText +
      photos * u.filePhotoPerPhoto +
      b.mailForwards * (u.fileMailExtra + u.mailLook) +
      wa * u.fileWhatsappExtra +
      b.questions * u.answer +
      classified * u.classify +
      b.searches * u.search +
      b.reads * u.read);
  let voiceDay = turnShare * b.voiceNotes * b.voiceSeconds * u.voicePerSecond;

  // The daily budget, when it works, caps everything the ledger prices: model
  // turns, search fees and transcription together.
  let capped = turnShare < 1;
  if (options.budgetEnforced) {
    const cap = input.code.budgetMicros / M;
    const spend = claudeDay + voiceDay;
    if (spend > cap) {
      capped = true;
      claudeDay *= cap / spend;
      voiceDay *= cap / spend;
    }
  }
  // The night's passes come after, and neither the budget nor the turn count
  // holds them back.
  claudeDay += nightlyPasses(input, b) * u.nightly;

  const receiptsDay = Math.min(wa * (1 + assumptions.whatsapp.extraReceiptsPerSend), assumptions.whatsapp.receiptCapPerAccountPerDay);
  const whatsappDay = receiptsDay * u.receipt;

  // Storage: what a month adds, held for monthsKept months, priced as the
  // steady-state monthly bill for one person's last year of things.
  const mbAddedDay = photos * (s.photoOriginal + s.photoLarge + s.photoThumb) + b.voiceNotes * b.voiceSeconds * s.voicePerSecond + b.mailForwards * s.mailImage;
  const gbMonth = (mbAddedDay * days) / 1024;
  const r2 = gbMonth * s.monthsKept * prices.r2.storagePerGbMonth;
  const classA = ((photos * 3 + b.voiceNotes + b.mailForwards) * days * prices.r2.classAPerMillion) / M;
  const classB = ((b.photoViews * 2) * days * prices.r2.classBPerMillion) / M;
  const egressGb = gbMonth + (b.photoViews * s.photoViewMb * days) / 1024;
  const egress = egressGb * prices.railway.egressPerGb;

  const dumps = fileTurns + b.questions;
  const embedTokens = dumps * t.embedTokensPerDump + b.questions * t.embedTokensPerQuestion;
  const embed = embedTokens * days * u.embedPerToken;
  const mailIn = b.mailForwards * days * 0.0009;

  return {
    claude: claudeDay * days,
    whatsapp: whatsappDay * days,
    voice: voiceDay * days,
    storage: r2 + classA + classB + egress,
    platform: 0,
    other: embed + mailIn,
    capped,
    counts: {
      turns: (fileTurns + b.questions) * days,
      fileTurns: fileTurns * days, answers: b.questions * days, nightlyPasses: nightlyPasses(input, b) * days,
      receipts: receiptsDay * days, voiceSeconds: b.voiceNotes * b.voiceSeconds * days, photos: photos * days,
      emails: b.mailForwards * days, gbAdded: gbMonth, egressGb,
    },
  };
}

// Nightly passes after an active day: one per thread with a material change,
// at most the code's cap, and the default thread's beside them.
export function nightlyPasses(input, b) {
  const cap = input.code.nightlyThreads ?? Infinity;
  return Math.min(b.threadsTouched, cap) + 1;
}

export function total(row) {
  return CATEGORIES.reduce((s, c) => s + (row[c.key] || 0), 0);
}

// Fleet: how many people of each profile a level means, given whether the
// level counts daily or monthly actives.
export function population(assumptions, level, basis) {
  const fm = assumptions.fleet.frequencyMix;
  const activeShare = Object.entries(fm).reduce((s, [k, share]) => s + share * (assumptions.frequency[k].activeDays / MONTH), 0);
  const mau = basis === "mau" ? level : level / activeShare;
  return { mau, dau: mau * activeShare, activeShare };
}

// How warm each cached prefix is at a fleet size: the chance another turn on the
// same path wrote or read it in the last five minutes, across every account,
// since the system block is the same for everybody.
export function warmth(input, mau) {
  const { assumptions } = input;
  const perDay = { file: 0, answer: 0, nightly: 0 };
  for (const [fk, fShare] of Object.entries(assumptions.fleet.frequencyMix)) {
    for (const [bk, bShare] of Object.entries(assumptions.fleet.behaviourMix)) {
      const b = assumptions.behaviour[bk].perActiveDay;
      const days = assumptions.frequency[fk].activeDays;
      const people = mau * fShare * bShare;
      const wa = input.options.whatsapp ? b.whatsappSends : 0;
      perDay.file += (people * days * (b.textDumps + b.photoDumps + b.voiceNotes + b.mailForwards + wa)) / MONTH;
      perDay.answer += (people * days * b.questions) / MONTH;
      perDay.nightly += (people * days * nightlyPasses(input, b)) / MONTH;
    }
  }
  const seconds = assumptions.turn.activeHoursPerDay * 3600;
  const w = {};
  for (const k of ["file", "answer"]) w[k] = 1 - Math.exp(-(perDay[k] / seconds) * 300);
  // Every account's night is enqueued at once and the passes run back to back,
  // so each prompt variant is written once a night and read by every pass after.
  const variants = assumptions.turn.nightly.promptVariants;
  w.nightly = perDay.nightly > 0 ? Math.max(0, 1 - variants / perDay.nightly) : 0;
  return w;
}

function railway(input, mau) {
  const r = input.prices.railway;
  const inf = input.assumptions.infra;
  if (inf.railwayActual != null && mau <= inf.shapes[0].upToMau) return inf.railwayActual;
  const shape = inf.shapes.find((x) => mau <= x.upToMau) ?? inf.shapes[inf.shapes.length - 1];
  return Math.max(r.proMonthly, shape.vcpu * r.vcpuMonth + shape.ramGb * r.gbRamMonth + shape.volumeGb * r.volumeGbMonth);
}

function expo(input, mau) {
  let best = Infinity;
  for (const p of input.prices.expo.plans) {
    const over = Math.max(0, mau - p.updateMau);
    if (over > 0 && p.overPerMau == null) continue;
    best = Math.min(best, p.monthly + over * (p.overPerMau ?? 0));
  }
  return best;
}

function resend(input, emails) {
  const tiers = input.prices.resend.tiers;
  for (const t of tiers) if (emails <= t.emails && !t.overPer1k) return { name: t.name, cost: t.monthly };
  const scale = tiers[tiers.length - 1];
  return { name: scale.name, cost: scale.monthly + Math.max(0, emails - scale.emails) / 1000 * scale.overPer1k };
}

// Everything at one fleet level: per-profile people and cost, the fleet-level
// items, and the total by category.
export function fleet(input, level, basis) {
  const { assumptions, options, prices } = input;
  const pop = population(assumptions, level, basis);
  const warm = warmth(input, pop.mau);
  const u = units(input, warm);
  const sum = Object.fromEntries(CATEGORIES.map((c) => [c.key, 0]));
  let emails = 0;
  const profiles = [];
  for (const [fk, fShare] of Object.entries(assumptions.fleet.frequencyMix)) {
    for (const [bk, bShare] of Object.entries(assumptions.fleet.behaviourMix)) {
      const people = pop.mau * fShare * bShare;
      const row = personMonth(input, u, fk, bk);
      for (const c of CATEGORIES) sum[c.key] += people * (row[c.key] || 0);
      emails += people * row.counts.emails;
      profiles.push({ fk, bk, people, row });
    }
  }
  // Fleet-level items.
  const newUsers = pop.mau * assumptions.infra.newUsersShareOfMau;
  const invites = newUsers * assumptions.infra.invitesPerNewUser;
  const mail = resend(input, emails + invites);
  sum.other += mail.cost - emails * 0.0009; // swap the per-email estimate for the real tier
  if (options.whatsapp) {
    const wa = assumptions.whatsapp;
    sum.whatsapp += newUsers * wa.linkingMessagesPerNewUser * u.receipt + wa.strangerRepliesPerDay * MONTH * u.receipt;
  }
  const rail = railway(input, pop.mau);
  const ex = expo(input, pop.mau);
  const fixed = prices.fixed.items.reduce((s, x) => s + x.monthly, 0);
  sum.platform += rail + ex + fixed;
  // A person's share of what does not scale with them, so a per-person figure
  // is the whole cost of having them at this size.
  for (const p of profiles) p.row.platform = sum.platform / pop.mau;
  return { level, basis, pop, warm, units: u, profiles, sum, total: total(sum), perMau: total(sum) / pop.mau,
    parts: { railway: rail, expo: ex, fixed, resend: mail } };
}

// The configurations a range sweeps. Every combination is costed, and a range is
// its cheapest and its dearest.
export function sweepOptions(input) {
  const out = [];
  const fileModels = ["claude-sonnet-5", "claude-sonnet-5-5", "claude-opus-5", "claude-opus-5-5"];
  const answerModels = ["claude-opus-5", "claude-opus-5-5", "claude-sonnet-5-5"];
  const markets = ["mix", ...Object.keys(input.prices.whatsapp.perReceiptByMarket).filter((m) => m !== "Other")];
  for (const fileModel of fileModels)
    for (const answerModel of answerModels)
      for (const whatsapp of [true, false])
        for (const whatsappMarket of whatsapp ? markets : ["mix"])
          // Once the code enforces the budget there is no configuration without it.
          for (const budgetEnforced of input.code.budgetWorks ? [true] : [false, true])
            out.push({ fileModel, answerModel, whatsapp, whatsappMarket, budgetEnforced });
  return out;
}

// Per-person ranges for every profile, and fleet ranges for every level.
export function ranges(input, basis) {
  const levels = input.assumptions.fleet.levels;
  const configs = sweepOptions(input);
  const person = {};
  const fleetR = {};
  for (const level of levels) fleetR[level] = { min: Infinity, max: -Infinity, minCfg: null, maxCfg: null };
  for (const opts of configs) {
    const inp = { ...input, options: { ...input.options, ...opts } };
    for (const level of levels) {
      const f = fleet(inp, level, basis);
      const r = fleetR[level];
      if (f.total < r.min) { r.min = f.total; r.minCfg = opts; }
      if (f.total > r.max) { r.max = f.total; r.maxCfg = opts; }
      for (const p of f.profiles) {
        const k = `${p.fk}:${p.bk}`;
        const v = total(p.row);
        const r = (person[k] ??= { min: Infinity, max: -Infinity, minCfg: null, maxCfg: null });
        if (v < r.min) { r.min = v; r.minCfg = { ...opts, level }; }
        if (v > r.max) { r.max = v; r.maxCfg = { ...opts, level }; }
      }
    }
  }
  return { person, fleet: fleetR, configs: configs.length };
}

// The same turns shaped like the principle evals (fresh accounts, little
// context), so the model can be checked against what the evals measured.
export function evalLike(input) {
  const e = input.assumptions.turn.eval;
  const t = input.assumptions.turn;
  const shaped = { ...input, assumptions: { ...input.assumptions, turn: { ...t,
    file: { ...t.file, contextTokens: e.contextTokens, calls: e.calls, growthPerCall: e.growthPerCall },
    answer: { ...t.answer, contextTokens: e.contextTokens, calls: e.calls, growthPerCall: e.growthPerCall } } } };
  return units(shaped, { file: 1, answer: 1, nightly: 1 });
}
