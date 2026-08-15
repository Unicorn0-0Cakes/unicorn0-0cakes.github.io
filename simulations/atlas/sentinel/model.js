/* ============================================================================
   SENTINEL — THE OVERSIGHT EXPERIMENT · model kernel v0.3.0
   ----------------------------------------------------------------------------
   A spin-off of the Cognitive Civilization Experiment (CCE), built for exactly
   two outcome variables that CCE could not move:

       D  — abuse detection delay        (years, onset -> detection)
       G  — governance quality index     (0..1)

   In CCE both were structurally decoupled from the treatment:
     * G = 0.5 + 0.2*mean(competence) + 0.2*mean(ethics) - 0.6*corrupt_frac,
       where competence and ethics are ~N(0,1) draws over ~dozens of officials.
       mean of n iid standard normals ~ N(0, 1/n) => G is white noise about 0.5.
       The allocation rule never enters. No memory, no feedback, no regime.
     * D was floored by `max_undetected_duration` and a per-year detection
       probability close to 1, so nearly everything was caught in year 0 and the
       residual variance was sampling noise on a near-zero mean.

   SENTINEL keeps the two metrics and rebuilds everything upstream of them:
     1. institutional INERTIA          — G is a slow state, not an iid draw
     2. TWO-WAY COUPLING               — G drives detection; detection cleans G
     3. RED QUEEN CONCEALMENT          — adversaries adapt to detection pressure
     4. CHANNEL CORRELATION            — redundant oversight that isn't independent
     5. CAPTURE CASCADE                — a genuine bifurcation, not noise
   Plus three DECOY parameters wired into the sampler but into nothing else, so
   the sensitivity screen can be checked against a known-null.

   NOT CALIBRATED. No parameter is fitted to empirical data. This is an
   instrument for reasoning about model structure, not a claim about the world.
   ========================================================================== */

'use strict';

// ---------------------------------------------------------------- rng -------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function binom(rng, n, p) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n < 30) { let c = 0; for (let i = 0; i < n; i++) if (rng() < p) c++; return c; }
  const m = n * p, s = Math.sqrt(n * p * (1 - p));
  return Math.max(0, Math.min(n, Math.round(m + s * gauss(rng))));
}
const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);

// ------------------------------------------------------- parameter register -
// kind: 'lever'  -> wired into the model
//       'decoy'  -> sampled but deliberately unused (screen validity check)
//       'fixed'  -> structural, not swept
const REGISTER = [
  // ---- detection architecture ---------------------------------------------
  { key: 'channels',     label: 'Detection channels',        unit: '',      min: 1,    max: 8,   step: 1,     def: 4,    kind: 'lever', grp: 'DET',
    note: 'Independent routes by which a hidden situation can surface: scheduled inspection, medical anomaly, attendance, financial trace, anonymous report.' },
  { key: 'correl',       label: 'Channel correlation',       unit: 'ρ',     min: 0,    max: 0.95,step: 0.01,  def: 0.35, kind: 'lever', grp: 'DET',
    note: 'How much the channels share a single point of failure. Effective channels = 1 + (k−1)(1−ρ). At ρ=0.95, eight channels behave like one.' },
  { key: 'interval',     label: 'Inspection interval',       unit: 'yr',    min: 0.25, max: 6,   step: 0.25,  def: 1.5,  kind: 'lever', grp: 'DET',
    note: 'Years between scheduled checks. Enters as an exponent, so halving it has diminishing returns once per-check yield is high.' },
  { key: 'yield',        label: 'Per-check yield',           unit: 'q',     min: 0.02, max: 0.60,step: 0.01,  def: 0.18, kind: 'lever', grp: 'DET',
    note: 'Probability one channel catches an active situation at one check, before governance and concealment modifiers.' },
  { key: 'reporter',     label: 'Reporter protection',       unit: '',      min: 0,    max: 1,   step: 0.01,  def: 0.5,  kind: 'lever', grp: 'DET',
    note: 'Statutory whistleblower protection. Opens an extra channel whose real yield is gated by G — nominal protection in a weak institution is worth little.' },
  { key: 'adapt',        label: 'Concealment adaptivity',    unit: 'λ',     min: 0,    max: 1,   step: 0.01,  def: 0.45, kind: 'lever', grp: 'DET',
    note: 'Red Queen term. Perpetrators track detection pressure and invest in concealment, cancelling part of every gain in raw detection capability.' },
  { key: 'maxUndet',     label: 'Hard duration cap',         unit: 'yr',    min: 1,    max: 60,  step: 1,     def: 40,   kind: 'lever', grp: 'DET',
    note: 'Forced detection at this age regardless of capability. CCE pinned this low, which is what flattened its delay metric. Raise it to see the model underneath.' },

  // ---- governance architecture --------------------------------------------
  { key: 'independence', label: 'Audit independence',        unit: 'ι',     min: 0,    max: 1,   step: 0.01,  def: 0.55, kind: 'lever', grp: 'GOV',
    note: 'Degree to which auditors are appointed, funded and dismissed by someone other than the audited. The single largest lever on G.' },
  { key: 'term',         label: 'Term length',               unit: 'yr',    min: 1,    max: 40,  step: 1,     def: 8,    kind: 'lever', grp: 'GOV',
    note: 'Years before mandatory rotation. Rotation clears accumulated capture; capture hazard rises with tenure.' },
  { key: 'translag',     label: 'Transparency lag',          unit: 'yr',    min: 0,    max: 20,  step: 1,     def: 5,    kind: 'lever', grp: 'GOV',
    note: 'Delay before official records become public. Also gates record-based selection: you cannot select on a record nobody can read.' },
  { key: 'capture',      label: 'Capture pressure',          unit: 'κ',     min: 0,    max: 1,   step: 0.01,  def: 0.45, kind: 'lever', grp: 'GOV',
    note: 'Concentration and persistence of outside interests with something to gain. Environmental, not chosen — the stress the architecture is tested against.' },
  { key: 'budget',       label: 'Oversight budget',          unit: '',      min: 0.02, max: 1,   step: 0.01,  def: 0.4,  kind: 'lever', grp: 'GOV',
    note: 'Share of oversight capacity actually funded. Multiplies audit effectiveness but cannot substitute for independence.' },

  // ---- decoys: sampled, never read ----------------------------------------
  { key: 'dLeaderIQ',    label: 'Leader competence–IQ link', unit: 'r',     min: 0,    max: 1,   step: 0.01,  def: 0.20, kind: 'decoy', grp: 'NUL',
    note: 'Carried over from CCE verbatim. Sampled by the screen, read by nothing. If it ranks above the noise floor, the screen is broken.' },
  { key: 'dAllocation',  label: 'Allocation-rule weight',    unit: '',      min: 0,    max: 1,   step: 0.01,  def: 0.50, kind: 'decoy', grp: 'NUL',
    note: 'Stands in for CCE\'s A/B/C treatment. Deliberately null: the point is that the allocation rule has no causal path to either metric.' },
  { key: 'dPopScale',    label: 'Population scale',          unit: '×',     min: 0.1,  max: 3,   step: 0.01,  def: 1.0,  kind: 'decoy', grp: 'NUL',
    note: 'Null by construction. Both outcomes are intensive quantities; scaling the citizen count changes precision, not level.' },
];

const SELECTION_RULES = [
  { key: 'score',     label: 'HIGHEST SCORE', note: 'CCE\'s rule. Office goes to the highest measured official score. Ethics is not screened for at all, so the office-holding pool is a random ethics draw from the population.' },
  { key: 'sortition', label: 'SORTITION',     note: 'Random selection from the eligible population. Same mean ethics as the population, but no campaign, no coalition and no incumbency — capture has to start from scratch each rotation.' },
  { key: 'peer',      label: 'PEER ELECTION', note: 'Colleagues choose, and colleagues know who is decent — a real ethics premium. But the same network that carries the knowledge carries the capture, so the premium erodes under pressure.' },
  { key: 'record',    label: 'TRACK RECORD',  note: 'Selection on documented past conduct. The strongest ethics premium available — and completely dependent on transparency. Under a long records lag it degrades to a random draw.' },
];

const REGIMES = {
  I: { name: 'REGIME I · CENTRAL', blurb: 'One strong central inspectorate, well funded, long-serving, reporting to the body it inspects.',
       p: { channels: 2, correl: 0.85, interval: 1.0, yield: 0.34, reporter: 0.25, adapt: 0.5, maxUndet: 40,
            independence: 0.30, term: 22, translag: 12, capture: 0.45, budget: 0.85, selection: 'score' } },
  II: { name: 'REGIME II · DISTRIBUTED', blurb: 'Many separate channels under separate authorities. Cheaper per channel, weaker per channel, hard to switch off all at once.',
       p: { channels: 6, correl: 0.20, interval: 1.5, yield: 0.15, reporter: 0.55, adapt: 0.5, maxUndet: 40,
            independence: 0.60, term: 8, translag: 5, capture: 0.45, budget: 0.45, selection: 'peer' } },
  III:{ name: 'REGIME III · ADVERSARIAL', blurb: 'Audit that answers to nobody it audits, protected reporting, short terms, records published almost immediately.',
       p: { channels: 4, correl: 0.35, interval: 1.25, yield: 0.20, reporter: 0.92, adapt: 0.5, maxUndet: 40,
            independence: 0.95, term: 4, translag: 1, capture: 0.45, budget: 0.55, selection: 'record' } },
};

function defaults() {
  const p = {};
  REGISTER.forEach(r => { p[r.key] = r.def; });
  p.selection = 'peer';
  return p;
}

// ------------------------------------------------------------ shock stream --
// Shared across regimes for a given seed, exactly as in CCE: the same shocks,
// in the same years, at the same severities, independent of every parameter.
function shockStream(seed, years) {
  const rng = mulberry32(seed * 7919 + 104729);
  const out = [];
  let y = Math.floor(12 + rng() * 30);
  while (y < years) {
    out.push({ year: y, sev: 0.35 + 0.65 * rng(), dur: 3 + Math.floor(rng() * 6),
               kind: rng() < 0.5 ? 'austerity' : 'interest_surge' });
    y += 18 + Math.floor(rng() * 46);
  }
  return out;
}

// ------------------------------------------------------------------ kernel --
const N_CITIZENS = 100000;
const N_OFFICIALS = 64;
const AGE_MAX = 80;

function ethicsDraw(rng, rule, P) {
  // mean ethics premium of the office-holding pool, by selection rule
  let mu, sd;
  switch (rule) {
    case 'sortition': mu = 0.02; sd = 1.00; break;
    // peer knowledge is real but rides the same network capture rides
    case 'peer':      mu = 0.62 * (1 - 0.75 * P.capture); sd = 0.88; break;
    // you cannot select on a record nobody can read
    case 'record':    mu = 1.05 * (1 - Math.min(P.translag, 20) / 20); sd = 0.80; break;
    case 'score':
    default:          mu = 0.00; sd = 1.00; break;   // CCE: no ethics screening
  }
  return mu + sd * gauss(rng);
}

function simulate(P, seed, years) {
  years = years || 500;
  const rng = mulberry32((seed | 0) * 2654435761 + 12345);
  const shocks = shockStream(seed, years);
  const shockYear = new Float64Array(years);   // active severity per year
  const shockKind = new Array(years).fill(null);
  shocks.forEach(s => {
    for (let i = 0; i < s.dur && s.year + i < years; i++) {
      const decay = s.sev * (1 - i / (s.dur + 1));
      if (decay > shockYear[s.year + i]) { shockYear[s.year + i] = decay; shockKind[s.year + i] = s.kind; }
    }
  });

  // --- officials ------------------------------------------------------------
  const eth = new Float64Array(N_OFFICIALS);
  const ten = new Float64Array(N_OFFICIALS);
  const cap = new Uint8Array(N_OFFICIALS);
  for (let i = 0; i < N_OFFICIALS; i++) {
    eth[i] = ethicsDraw(rng, P.selection, P);
    ten[i] = Math.floor(rng() * Math.max(P.term, 1));
  }

  // --- hidden-harm age structure -------------------------------------------
  const hid = new Float64Array(AGE_MAX + 1);
  let conceal = 0.10;
  let G = 0.50;

  const sD = new Float64Array(years);     // detection delay
  const sG = new Float64Array(years);     // governance quality
  const sCap = new Float64Array(years);   // captured fraction
  const sHid = new Float64Array(years);   // hidden burden per 100k
  const sCon = new Float64Array(years);   // concealment
  const sAud = new Float64Array(years);   // audit effectiveness
  const sInc = new Float64Array(years);   // incidence per 100k
  const events = [];

  const kEff = 1 + (P.channels - 1) * (1 - P.correl);
  const checks = 1 / Math.max(P.interval, 0.05);

  for (let y = 0; y < years; y++) {
    const shock = shockYear[y];
    const kind = shockKind[y];
    const budgetY = clamp(P.budget * (kind === 'austerity' ? 1 - 0.7 * shock : 1), 0.01, 1);
    const captureY = clamp(P.capture * (kind === 'interest_surge' ? 1 + 1.4 * shock : 1), 0, 2);

    // ---- governance: capture, audit, rotation ------------------------------
    let nCap = 0; for (let i = 0; i < N_OFFICIALS; i++) nCap += cap[i];
    let capFrac = nCap / N_OFFICIALS;

    // captured officials shield each other; past ~35% the audit function folds
    const shield = 1 / (1 + Math.exp((capFrac - 0.30) / 0.055));
    const aEff = clamp(P.independence * (0.22 + 0.78 * budgetY) * (0.03 + 0.97 * shield), 0, 0.97);

    for (let i = 0; i < N_OFFICIALS; i++) {
      ten[i] += 1;
      if (!cap[i]) {
        // Capture is contagious: a captured colleague is who recruits you, and
        // who guarantees the recruitment will not be reported. This term is what
        // turns the shield into a genuine saddle-node rather than a soft dip.
        const hz = 0.022 * captureY * Math.exp(-1.25 * eth[i])
                 * (1 + 1.8 * Math.min(ten[i] / Math.max(P.term, 1), 2.5))
                 * (1 + 4.5 * capFrac)
                 * (1 - 0.82 * aEff);
        if (rng() < hz) { cap[i] = 1; }
      } else if (rng() < aEff) {
        // detected and removed; the seat is refilled by the selection rule
        cap[i] = 0; ten[i] = 0; eth[i] = ethicsDraw(rng, P.selection, P);
        if (events.length < 4000) events.push({ year: y, type: 'capture_detected' });
      }
      if (ten[i] >= P.term) {                     // mandatory rotation
        const wasCap = cap[i];
        cap[i] = 0; ten[i] = 0; eth[i] = ethicsDraw(rng, P.selection, P);
        if (wasCap && events.length < 4000) events.push({ year: y, type: 'rotated_out_captured' });
      }
    }

    nCap = 0; let sumE = 0;
    for (let i = 0; i < N_OFFICIALS; i++) { nCap += cap[i]; sumE += eth[i]; }
    capFrac = nCap / N_OFFICIALS;
    const meanEth = sumE / N_OFFICIALS;

    const transp = 1 - Math.min(P.translag, 20) / 20;
    const Gt = clamp(
        0.40
      + 0.15 * Math.tanh(meanEth)
      + 0.20 * P.independence
      + 0.13 * transp
      + 0.09 * budgetY
      + 0.06 * P.reporter
      - 1.15 * Math.pow(capFrac, 0.72)
      - 0.10 * shock,
      0, 1);
    G = clamp(0.84 * G + 0.16 * Gt + 0.010 * gauss(rng), 0, 1);   // institutional inertia

    // ---- detection ---------------------------------------------------------
    const gGate = 0.30 + 1.35 * G;                       // G is a real multiplier now
    const wEff = P.reporter * (0.25 + 0.75 * G);         // protection you can't rely on isn't protection
    const qRep = clamp((0.08 + 0.42 * P.reporter) * gGate * (1 - conceal), 0, 0.95);

    let detTot = 0, delaySum = 0;
    for (let a = AGE_MAX; a >= 0; a--) {
      const n = hid[a];
      if (n <= 0) { hid[a] = 0; continue; }
      const vis = 1 - Math.exp(-a / 7);                  // traces accumulate with duration
      const q = clamp(P.yield * gGate * (1 - conceal) * (1 + 0.65 * vis), 0.0005, 0.95);
      let pdet = 1 - Math.pow(1 - q, kEff * checks) * Math.pow(1 - qRep, wEff * checks);
      if (a >= P.maxUndet) pdet = 1;                     // hard cap
      const d = binom(rng, Math.round(n), pdet);
      hid[a] = n - d;
      detTot += d; delaySum += d * a;
    }

    // detection pressure at age zero drives both deterrence and concealment
    const q0 = clamp(P.yield * gGate * (1 - conceal), 0.0005, 0.95);
    const pressure = 1 - Math.pow(1 - q0, kEff * checks) * Math.pow(1 - qRep, wEff * checks);
    // λ sets how much of the detection pressure adversaries can actually track
    // (the ceiling), not merely how fast they get there — otherwise every λ>0
    // converges on the same equilibrium and the lever registers as null.
    conceal = clamp(conceal + 0.30 * (0.94 * P.adapt * pressure - conceal), 0, 0.93);

    // ---- ageing and onset ---------------------------------------------------
    for (let a = AGE_MAX; a > 0; a--) hid[a] = hid[a - 1];
    hid[0] = 0;
    let burden = 0; for (let a = 0; a <= AGE_MAX; a++) burden += hid[a];
    const onsetRate = 0.0030 * (1 - 0.42 * pressure) * (1 + 0.35 * shock);
    hid[0] = binom(rng, Math.max(0, N_CITIZENS - Math.round(burden)), onsetRate);

    sD[y] = detTot > 0 ? delaySum / detTot : 0;
    sG[y] = G; sCap[y] = capFrac; sCon[y] = conceal; sAud[y] = aEff;
    sHid[y] = (burden + hid[0]) / (N_CITIZENS / 100000);
    sInc[y] = hid[0] / (N_CITIZENS / 100000);
  }

  const tail = Math.max(1, Math.floor(years * 0.4));
  const mean = (arr) => { let s = 0; for (let i = years - tail; i < years; i++) s += arr[i]; return s / tail; };
  const sd = (arr) => { const m = mean(arr); let s = 0; for (let i = years - tail; i < years; i++) s += (arr[i] - m) ** 2; return Math.sqrt(s / tail); };

  return {
    years, shocks,
    series: { D: sD, G: sG, cap: sCap, hidden: sHid, conceal: sCon, audit: sAud, incidence: sInc },
    summary: {
      D: mean(sD), G: mean(sG), Dsd: sd(sD), Gsd: sd(sG),
      cap: mean(sCap), hidden: mean(sHid), conceal: mean(sCon),
      audit: mean(sAud), incidence: mean(sInc),
      captured: mean(sCap) > 0.35,
    },
    events,
  };
}

// ------------------------------------------------- sensitivity screen -------
// Latin hypercube over every lever + every decoy; standardised regression
// coefficients (beta) and Spearman rho against each outcome.
function lhs(rng, n, d) {
  const M = [];
  for (let j = 0; j < d; j++) {
    const col = [];
    for (let i = 0; i < n; i++) col.push((i + rng()) / n);
    for (let i = n - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [col[i], col[k]] = [col[k], col[i]]; }
    M.push(col);
  }
  return M;
}
function rank(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(x, y) {
  const n = x.length; let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return (sxx === 0 || syy === 0) ? 0 : sxy / Math.sqrt(sxx * syy);
}
// OLS on standardised inputs -> standardised regression coefficients
function src(X, y) {
  const n = y.length, d = X.length;
  const Z = X.map(col => {
    const m = col.reduce((a, b) => a + b, 0) / n;
    const s = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / n) || 1;
    return col.map(v => (v - m) / s);
  });
  const my = y.reduce((a, b) => a + b, 0) / n;
  const sy = Math.sqrt(y.reduce((a, b) => a + (b - my) ** 2, 0) / n) || 1;
  const zy = y.map(v => (v - my) / sy);
  // normal equations with ridge for stability
  const A = [], b = [];
  for (let i = 0; i < d; i++) {
    A.push(new Array(d).fill(0));
    let bi = 0;
    for (let k = 0; k < n; k++) bi += Z[i][k] * zy[k];
    b.push(bi / n);
    for (let j = 0; j < d; j++) {
      let s = 0; for (let k = 0; k < n; k++) s += Z[i][k] * Z[j][k];
      A[i][j] = s / n + (i === j ? 1e-6 : 0);
    }
  }
  // gaussian elimination
  for (let i = 0; i < d; i++) {
    let piv = i; for (let r = i + 1; r < d; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
    const p = A[i][i] || 1e-12;
    for (let j = i; j < d; j++) A[i][j] /= p;
    b[i] /= p;
    for (let r = 0; r < d; r++) {
      if (r === i) continue;
      const f = A[r][i]; if (!f) continue;
      for (let j = i; j < d; j++) A[r][j] -= f * A[i][j];
      b[r] -= f * b[i];
    }
  }
  // R^2
  let ss = 0;
  for (let k = 0; k < n; k++) { let p = 0; for (let i = 0; i < d; i++) p += b[i] * Z[i][k]; ss += (zy[k] - p) ** 2; }
  return { beta: b, r2: 1 - ss / n };
}

function sensitivityScreen(nSamples, years, seed, base) {
  nSamples = nSamples || 220; years = years || 300; seed = seed || 1;
  const rng = mulberry32(seed * 99991 + 7);
  const keys = REGISTER.filter(r => r.kind !== 'fixed').map(r => r.key);
  const meta = keys.map(k => REGISTER.find(r => r.key === k));
  const U = lhs(rng, nSamples, keys.length);
  const X = keys.map(() => []);
  const yD = [], yG = [];
  const rows = [];
  for (let i = 0; i < nSamples; i++) {
    const P = Object.assign({}, base || defaults());
    keys.forEach((k, j) => {
      const m = meta[j];
      let v = m.min + U[j][i] * (m.max - m.min);
      if (m.step >= 1) v = Math.round(v);
      P[k] = v; X[j].push(v);
    });
    // selection rule is categorical: rotate deterministically so it is balanced
    P.selection = SELECTION_RULES[i % SELECTION_RULES.length].key;
    const r = simulate(P, 1000 + i, years);
    yD.push(r.summary.D); yG.push(r.summary.G);
    rows.push({ P, D: r.summary.D, G: r.summary.G, cap: r.summary.cap });
  }
  const bD = src(X, yD), bG = src(X, yG);
  const out = keys.map((k, j) => ({
    key: k, label: meta[j].label, kind: meta[j].kind, grp: meta[j].grp, note: meta[j].note,
    betaD: bD.beta[j], betaG: bG.beta[j],
    rhoD: pearson(rank(X[j]), rank(yD)),
    rhoG: pearson(rank(X[j]), rank(yG)),
  }));
  // categorical effect of the selection rule, measured as a group contrast
  const byRule = SELECTION_RULES.map(sr => {
    const sub = rows.filter(r => r.P.selection === sr.key);
    const mD = sub.reduce((a, b) => a + b.D, 0) / sub.length;
    const mG = sub.reduce((a, b) => a + b.G, 0) / sub.length;
    return { key: sr.key, label: sr.label, D: mD, G: mG, n: sub.length };
  });
  const spread = (a) => Math.max(...a) - Math.min(...a);
  const sdY = (a) => { const m = a.reduce((x, y2) => x + y2, 0) / a.length; return Math.sqrt(a.reduce((x, y2) => x + (y2 - m) ** 2, 0) / a.length); };
  out.push({
    key: 'selection', label: 'Selection rule', kind: 'lever', grp: 'GOV',
    note: 'Categorical. Reported as the between-rule spread of the outcome mean, standardised by the overall outcome SD — directly comparable to a beta.',
    betaD: spread(byRule.map(r => r.D)) / (sdY(yD) || 1),
    betaG: spread(byRule.map(r => r.G)) / (sdY(yG) || 1),
    rhoD: 0, rhoG: 0, categorical: true,
  });
  return { rows: out, byRule, r2D: bD.r2, r2G: bG.r2, n: nSamples, yD, yG };
}

// --------------------------------------------- bifurcation / tipping sweep --
function bifurcation(base, keyX, steps, reps, years) {
  steps = steps || 41; reps = reps || 9; years = years || 260;
  const m = REGISTER.find(r => r.key === keyX);
  const out = [];
  for (let s = 0; s < steps; s++) {
    const v = m.min + (m.max - m.min) * s / (steps - 1);
    const pts = [];
    for (let r = 0; r < reps; r++) {
      const P = Object.assign({}, base); P[keyX] = m.step >= 1 ? Math.round(v) : v;
      const res = simulate(P, 4000 + r * 137 + s, years);
      pts.push({ G: res.summary.G, D: res.summary.D, cap: res.summary.cap, captured: res.summary.captured });
    }
    out.push({ x: v, pts, capturedFrac: pts.filter(p => p.captured).length / reps });
  }
  return { key: keyX, label: m.label, steps: out };
}

if (typeof module !== 'undefined') {
  module.exports = { simulate, sensitivityScreen, bifurcation, defaults, REGISTER, REGIMES, SELECTION_RULES, mulberry32 };
}
