"use strict";
/* =====================================================================
   INSIDE THE ATOM — screens.js

   Every view, and the control inspector. Rendering only: nothing here
   decides anything about the physics, and nothing here holds state that
   is not in `S` (main.js) or in the session ledger (model.js).

   Two habits are kept throughout:
     · a number that came from a paper carries a provenance tag next to
       it, and so does one that did not;
     · every canvas is followed by a written summary of the same thing,
       so that no fact in this instrument exists only as pixels.
   ===================================================================== */

var Screens = (function () {

  /* ---------------- small helpers ---------------- */
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function P(kind, label) {
    var t = { doc: "documented", ped: "pedagogical", der: "derived" }[kind] || kind;
    return '<span class="prov ' + kind + '" title="' + esc(label || t) + '">' + t + '</span>';
  }
  function big(n) {
    if (!isFinite(n)) return "—";
    if (n >= 1e6) {
      var e = Math.floor(Math.log10(n));
      var m = n / Math.pow(10, e);
      return (Math.round(m * 100) / 100) + " × 10" + sup(e);
    }
    return n.toLocaleString("en-GB");
  }
  function sup(e) {
    var map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
    return String(e).split("").map(function (c) { return map[c] || c; }).join("");
  }
  function pct(v, d) { return (isFinite(v) ? fmt(v * 100, d === undefined ? 2 : d) : "—") + "%"; }
  function stat(k, v, cls) {
    return '<div class="stat ' + (cls || "") + '"><span class="k">' + esc(k) + '</span>' +
           '<span class="v">' + v + '</span></div>';
  }
  function kv(k, v, title) {
    return '<div class="kv"' + (title ? ' title="' + esc(title) + '"' : "") +
           '><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
  }
  function card(title, sub, body, extra) {
    return '<div class="card"' + (extra || "") + '>' +
      (title ? '<h3>' + title + '</h3>' : "") +
      (sub ? '<div class="sub">' + sub + '</div>' : "") + body + '</div>';
  }
  function modelChip(key) {
    var m = MODELS[key];
    return '<span class="pill ' + (key === "rutherford" ? "nuc" : "dif") + '">' + esc(m.name) + '</span>';
  }

  /* Guard: only reveal the model in play when the mode allows it. */
  function modelIsSecret(S) { return S.mode === "blind" && !S.conclusion; }

  /* ==================================================================
     THE MODE CHOOSER
     ================================================================== */
  var MODES = [
    {
      key: "guided", name: "Guided reconstruction",
      p: "The 1909 experiment, in five steps. You are introduced to the apparatus, asked to commit to a prediction before you look, then walked through collecting counts and comparing the two models against them.",
      tags: ["Recommended first run", "Prediction is recorded", "About 15 minutes"]
    },
    {
      key: "blind", name: "Blind model identification",
      p: "One of the two models is chosen from the seed and hidden. You choose where to point the detector and how large an exposure to spend, then state which model it is and how confident you are. The answer is shown only after your conclusion is on the record.",
      tags: ["Model hidden until you commit", "Confidence required", "Likelihood ratio reported"]
    },
    {
      key: "compare", name: "Model comparison",
      p: "Matched conditions through both models at once — same seed, same angles, same exposure — with the observed counts and the predicted distributions overlaid on one axis.",
      tags: ["Matched seeds", "Both models visible", "Overlay plots"]
    },
    {
      key: "free", name: "Free laboratory",
      p: "Every control unlocked, including the ones that take the model outside the range where its assumptions hold. The instrument will tell you when you have done that rather than stopping you.",
      tags: ["All controls", "Validity flagged", "No script"]
    }
  ];

  function renderHome() {
    var el = $("homeModes");
    if (!el) return;
    el.innerHTML = MODES.map(function (m) {
      return '<button class="modecard" data-mode="' + m.key + '">' +
        '<h3>' + esc(m.name) + '</h3><p>' + esc(m.p) + '</p>' +
        '<div class="tags">' + m.tags.map(function (t) {
          return '<span class="pill">' + esc(t) + '</span>';
        }).join("") + '</div></button>';
    }).join("");
  }

  /* ==================================================================
     TOP BAR
     ================================================================== */
  function renderTopbar(S) {
    var s = Atom.summary(S.session);
    var geo = Atom.geometry(S.cfg);
    var o = S.lastObs;
    var cells = "";

    cells += stat("Exposures", String(s.exposures));
    cells += stat("Particles fired", big(s.fired));
    cells += stat("Detected", big(s.detected));
    cells += stat("Detector", S.cfg.detAngle + "° ±" + S.cfg.detWidth + "°");
    if (o) {
      cells += stat("Last raw count", String(o.raw));
      cells += stat("Corrected", fmt(o.corrected, 1) + " ± " + fmt(o.sigma, 1));
    }
    cells += stat("Past " + LARGE_ANGLE_DEG + "°", String(s.largeAngleCounts),
      s.largeAngleCounts > 0 ? "good" : "");
    cells += stat("Past " + BACKSCATTER_DEG + "°", String(s.backscatterCounts));
    if (geo.validity !== "ok") {
      cells += stat("Single scattering", geo.validity === "warn" ? "strained" : "failing",
        geo.validity === "warn" ? "warn" : "bad");
    }
    $("tbStats").innerHTML = cells;

    var names = { guided: "Guided reconstruction", blind: "Blind identification",
                  compare: "Model comparison", free: "Free laboratory" };
    $("tbMode").textContent = "· " + (names[S.mode] || "Free laboratory");

    /* rail tallies */
    var lt = $("navLedger").querySelector(".tally");
    if (s.exposures > 0) {
      if (!lt) { lt = document.createElement("span"); lt.className = "tally"; $("navLedger").appendChild(lt); }
      lt.textContent = s.exposures;
    } else if (lt) lt.remove();
  }

  /* ==================================================================
     SCREEN — APPARATUS
     ================================================================== */
  function bench(S) {
    var geo = Atom.geometry(S.cfg);
    var o = S.lastObs;
    var h = "";

    h += '<div class="screenhead"><h2>The apparatus</h2>' +
      '<p>Source, shield and slit on the left; the foil at the centre of the graduated circle; the ' +
      'zinc-sulphide screen and its microscope swinging around it. The paths are drawn from the same ' +
      'law that produces the counts, but they are an illustration — no one has ever seen an alpha ' +
      'particle in flight.</p></div>';

    if (S.mode === "guided") h += guidedPanel(S);

    h += '<div class="cols wide">';

    h += '<div><div class="canvaswrap"><canvas id="benchCanvas" aria-label="Plan view of the scattering apparatus"></canvas>' +
      '<div class="overlaybar">' +
      '<button data-act="traj-down" title="Draw fewer trajectories">− paths</button>' +
      '<button data-act="traj-up" title="Draw more trajectories">+ paths</button>' +
      '</div></div>' +
      '<div class="chartsummary" id="benchSummary"></div></div>';

    /* the last exposure, in full */
    var right = "";
    if (o) {
      right += kv("Detector angle", o.detAngleDeg + "° ± " + o.detWidthDeg + "°");
      right += kv("Solid angle", fmt(o.omega, 4) + " sr");
      right += kv("Particles fired", big(o.fired));
      right += kv("Reached the aperture", big(o.eligible));
      right += kv("Recorded by the screen", big(o.detected));
      right += kv("Background counts", String(o.background));
      right += kv("Raw count", '<b>' + o.raw + '</b>');
      right += kv("Estimated background", fmt(o.backgroundMean, 2));
      right += kv("Corrected count", fmt(o.corrected, 2));
      right += kv("Uncertainty (1σ)", "± " + fmt(o.sigma, 2));
      right += kv("Exposure seed", String(o.exposureSeed));
      var verdict = "";
      if (o.detAngleDeg < o.detWidthDeg) {
        verdict += '<div class="note bad" style="margin-top:10px"><b>The aperture includes the ' +
          'incident beam.</b> At ' + o.detAngleDeg + '° with a ±' + o.detWidthDeg + '° radius the ' +
          'detector is looking straight down the barrel, so most of this count is beam that was never ' +
          'deflected at all. Nothing about scattering can be read off it. Geiger and Marsden kept the ' +
          'counting angle "always large compared with the angular radius of the beam" for this reason.</div>';
      }
      if (o.corrected <= o.sigma) {
        verdict += '<div class="note warn" style="margin-top:10px"><b>Consistent with background.</b> ' +
          'This exposure did not detect anything you can distinguish from the counts you would get ' +
          'with the foil removed. That is a real result, and it is not the same as a zero.</div>';
      } else if (o.detAngleDeg >= LARGE_ANGLE_DEG) {
        verdict += '<div class="note good" style="margin-top:10px"><b>A count past ' + LARGE_ANGLE_DEG + '°.</b> ' +
          'Something turned the particle back the way it came. Rutherford\'s remark about a fifteen-inch ' +
          'shell bouncing off tissue paper is about this number being anything other than zero.</div>';
      } else {
        verdict += '<div class="note" style="margin-top:10px">' + o.raw + ' counts at ' + o.detAngleDeg +
          '°, of which about ' + fmt(o.backgroundMean, 1) + ' are expected from background.</div>';
      }
      right += verdict;
    } else {
      right = '<div class="emptyish">No exposure yet. Press <b>Expose</b>, or the space bar.</div>';
    }
    h += '<div>' + card("Last exposure", modelIsSecret(S)
      ? "The model in play is hidden in this mode."
      : "Under " + MODELS[S.cfg.model].name.toLowerCase() + ".", right) + '</div>';

    h += '</div>';

    /* the geometry the numbers rest on */
    var gh = "";
    gh += kv("Target", geo.target.name + " (" + geo.target.sym + "), Z = " + geo.Z);
    gh += kv("Alpha energy", fmt(geo.E, 3) + " MeV");
    gh += kv("Velocity", sig(geo.u, 3) + " cm s⁻¹ (β = " + fmt(geo.beta, 4) + ")");
    gh += kv("b, closest approach head-on", fmt(geo.b_fm, 2) + " fm", "b = Z₁Z₂ke²/E");
    gh += kv("Areal density n·t", sig(geo.nt, 3) + " cm⁻²");
    gh += kv("Atomic layers crossed", big(Math.round(geo.layers)));
    gh += kv("Smallest deflexion possible", fmt(geo.thetaMin * DEG, 3) + "°",
      "2·arctan(b / 2p_max); no impact parameter in the foil is large enough to give less");
    gh += kv("Diffuse-model θ_t", fmt(geo.thetaT * DEG, 3) + "°",
      "characteristic angle of the compound-scattering law");
    gh += kv("Predicted P(> 5°)", sig(geo.ss5, 3));
    h += '<div class="cols c2">' +
      card("Derived geometry", "Everything the two scattering laws need. Only n·t enters; thickness and density never appear separately.", gh) +
      card("Where the model stands", validityNote(geo), validityBody(geo)) +
      '</div>';

    return h;
  }

  function validityNote(geo) {
    return "Rutherford's thin-foil result assumes the chance of a second large deflexion is negligible.";
  }
  function validityBody(geo) {
    var cls = geo.validity === "ok" ? "good" : (geo.validity === "warn" ? "warn" : "bad");
    var msg;
    if (geo.validity === "ok") {
      msg = "<b>Single scattering holds.</b> " + pct(geo.ss5, 2) + " of particles are deflected past 5°, " +
        "so the chance of two such deflexions in one crossing is about " + sig(geo.ss5 * geo.ss5, 2) +
        " — negligible, which is the condition the theory was derived under.";
    } else if (geo.validity === "warn") {
      msg = "<b>Single scattering is strained.</b> " + pct(geo.ss5, 2) + " of particles are deflected past 5°. " +
        "Multiple scattering is not implemented here, so the small-angle end of the distribution is now " +
        "understated. Counts past about 30° are still trustworthy.";
    } else {
      msg = "<b>Single scattering has failed.</b> " + pct(geo.ss5, 1) + " of particles are deflected past 5°, " +
        "and a substantial fraction will be scattering more than once. This model does not implement " +
        "multiple scattering, so everything on this screen is approximate. Geiger and Marsden found the " +
        "scattering proportional to thickness for thin foils and noted it rising faster than that for thicker ones; " +
        "the second effect is absent here.";
    }
    return '<div class="note ' + cls + '">' + msg + '</div>' +
      '<div class="tiny muted" style="margin-top:8px">Thin foils in the 1913 paper ran from about 0.1 to 0.9 cm ' +
      'of air equivalent. The reference gold foil, 2.1 × 10⁻⁵ cm, is 210 nm here. ' + P("doc") + '</div>';
  }

  /* ------------------ guided mode panel ------------------ */
  function guidedPanel(S) {
    var step = GUIDED[S.guidedStep] || GUIDED[0];
    var chips = GUIDED.map(function (g, i) {
      return '<div class="' + (i === S.guidedStep ? "on" : (i < S.guidedStep ? "done" : "")) + '">' +
        (i + 1) + ". " + esc(g.title) + '</div>';
    }).join("");

    var body = '<p>' + esc(step.body) + '</p>' +
      '<p class="tiny muted" style="margin-bottom:10px">' + esc(step.aside) + '</p>';

    if (step.key === "predict") {
      if (S.prediction === null) {
        body += '<div class="cols c2">' + [
          ["none", "None at all", "The alpha particle is far too heavy and fast for anything in an atom to turn it round."],
          ["1e6", "About one in a million", "A very rare accident of some kind."],
          ["1e4", "About one in ten thousand", "Rare, but you would see it if you looked long enough."],
          ["1e2", "About one in a hundred", "Common enough to have been noticed years earlier."]
        ].map(function (c) {
          return '<button class="choice" data-predict="' + c[0] + '"><h4>' + esc(c[1]) + '</h4><p>' + esc(c[2]) + '</p></button>';
        }).join("") + '</div>';
      } else {
        var labels = { none: "none at all", "1e6": "about one in a million",
                       "1e4": "about one in ten thousand", "1e2": "about one in a hundred" };
        body += '<div class="note info">Your prediction is recorded: <b>' + esc(labels[S.prediction]) +
          '</b>. It is shown again on the Conclusion screen beside what you measured.</div>';
      }
    }

    if (step.key === "collect") {
      var s = Atom.summary(S.session);
      body += '<div class="note ' + (s.exposures >= 4 ? "good" : "") + '">' +
        s.exposures + ' exposure' + (s.exposures === 1 ? "" : "s") + ' so far' +
        (s.maxAngleSearched !== null ? ', out to ' + s.maxAngleSearched + '°' : "") + '. ' +
        (s.largeAngleExposures === 0
          ? 'Nothing past ' + LARGE_ANGLE_DEG + '° has been looked at yet.'
          : s.largeAngleCounts + ' count' + (s.largeAngleCounts === 1 ? "" : "s") +
            ' recorded past ' + LARGE_ANGLE_DEG + '°.') +
        '</div>';
    }

    if (step.key === "compare" || step.key === "why") {
      body += '<div class="note info">The <b>Distribution</b> screen now draws both models over your ' +
        'points. The <b>Models</b> screen will run matched conditions through each of them.</div>';
    }

    var nav = '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
      '<button class="btn' + (S.guidedStep === 0 ? "" : "") + '" data-act="guided-prev"' +
      (S.guidedStep === 0 ? " disabled" : "") + '>← Back</button>' +
      '<button class="btn primary" data-act="guided-next"' +
      (S.guidedStep >= GUIDED.length - 1 ? " disabled" : "") + '>' +
      (step.key === "predict" && S.prediction === null ? "Choose a prediction first" : "Next step →") + '</button>' +
      '</div>';

    return card("Guided reconstruction · step " + (S.guidedStep + 1) + " of " + GUIDED.length,
      "", '<div class="steps">' + chips + '</div>' + body + nav);
  }

  /* ==================================================================
     SCREEN — COUNTS
     ================================================================== */
  function counts(S) {
    var L = S.session.ledger, s = Atom.summary(S.session);
    var h = '<div class="screenhead"><h2>Counts</h2>' +
      '<p>What the screen actually recorded, exposure by exposure, with the estimated background ' +
      'and the counting error on each total.</p></div>';

    /* required measurement panel */
    var o = S.lastObs;
    var m = "";
    m += '<div class="cols c4">';
    m += card("Particles fired", "This exposure · total",
      '<div class="num" style="font-size:20px">' + (o ? big(o.fired) : "—") + '</div>' +
      '<div class="tiny muted">' + big(s.fired) + ' across ' + s.exposures + ' exposures</div>');
    m += card("Particles detected", "Recorded on the screen",
      '<div class="num" style="font-size:20px">' + (o ? big(o.detected) : "—") + '</div>' +
      '<div class="tiny muted">' + big(s.detected) + ' in total</div>');
    m += card("Large-angle events", "Counts past " + LARGE_ANGLE_DEG + "°",
      '<div class="num" style="font-size:20px">' + s.largeAngleCounts + '</div>' +
      '<div class="tiny muted">' + s.largeAngleExposures + ' exposure' +
      (s.largeAngleExposures === 1 ? "" : "s") + ' taken there</div>');
    m += card("Backscatter", "Counts past " + BACKSCATTER_DEG + "°",
      '<div class="num" style="font-size:20px">' + s.backscatterCounts + '</div>' +
      '<div class="tiny muted">' + s.backscatterExposures + ' exposure' +
      (s.backscatterExposures === 1 ? "" : "s") + ' taken there</div>');
    m += '</div>';
    h += m;

    /* the sweep */
    h += card("Detector sweep",
      "Raw counts at each angle you have measured, newest last. The dashed line inside each bar is the " +
      "background you would expect at that exposure with the foil removed; the whisker is √N on the raw total.",
      '<div class="canvaswrap plain"><canvas id="sweepCanvas" aria-label="Raw counts by detector angle"></canvas></div>' +
      '<div class="overlaybar" style="position:static;margin-top:8px">' +
      '<button data-act="sweep-log" class="' + (S.view.sweepLog ? "on" : "") + '">Log</button>' +
      '<button data-act="sweep-lin" class="' + (!S.view.sweepLog ? "on" : "") + '">Linear</button>' +
      '</div>' +
      '<div class="chartsummary" id="sweepSummary"></div>');

    /* Fraction beyond selected angles — a MODEL quantity. It is not
       measurable from an aperture at one angle without assuming the
       shape of the tail, which is the thing under test, so this table
       carries predictions only and says so. */
    var degs = [5, 15, 30, 45, 90, 120, 150];
    var pred = Atom.beyond(S.cfg, degs);
    var rows = pred.map(function (p) {
      return '<tr><td class="n">' + p.deg + '°</td>' +
        '<td class="n">' + (modelIsSecret(S) ? "—" : sig(p.rutherford, 3)) + '</td>' +
        '<td class="n">' + (modelIsSecret(S) ? "—" : (p.thomson < 1e-300 ? "0" : sig(p.thomson, 3))) + '</td>' +
        '<td class="n">' + (modelIsSecret(S) ? "—" :
          "1 in " + big(Math.round(1 / Math.max(p.rutherford, 1e-300)))) + '</td></tr>';
    }).join("");

    h += card("Fraction scattered beyond an angle — predicted",
      "What each model says would happen at the current settings, over the whole sphere. These are " +
      "<b>predictions, not measurements</b>. Turning your counts at one angle into a whole-sphere " +
      "fraction would mean assuming the shape of the tail, and the shape of the tail is what you are " +
      "trying to establish." +
      (modelIsSecret(S) ? " Withheld until you commit a conclusion." : ""),
      '<div class="tablewrap"><table class="data"><thead><tr>' +
      '<th class="n">Beyond</th><th class="n">Nuclear</th><th class="n">Diffuse</th>' +
      '<th class="n">Nuclear, as odds</th></tr></thead><tbody>' + rows + '</tbody></table></div>');

    /* The model-independent comparison: measured yield against predicted
       yield, at the same angle and through the same aperture. Nothing is
       extrapolated anywhere. */
    if (L.length) {
      var mrows = L.map(function (o) {
        var y = Charts.yieldOf(o);
        var c = o.settings;
        var pr = Atom.predictBoth(c);
        var pyR = pr.rutherford / o.omega, pyT = pr.thomson / o.omega;
        var straddles = (o.detAngleDeg < o.detWidthDeg);
        return '<tr><td class="n">' + o.index + '</td><td class="n">' + o.detAngleDeg + '°</td>' +
          '<td class="n">' + o.raw + '</td>' +
          '<td class="n">' + (y.limit ? "≤ " + sig(y.upper, 3) : sig(y.y, 3) + " ± " + sig(y.s, 2)) + '</td>' +
          '<td class="n">' + (modelIsSecret(S) ? "—" : sig(pyR, 3)) + '</td>' +
          '<td class="n">' + (modelIsSecret(S) ? "—" : (pyT < 1e-300 ? "0" : sig(pyT, 3))) + '</td>' +
          '<td class="wrap tiny muted">' + (straddles
            ? "aperture includes the incident beam"
            : (y.limit ? "consistent with background" : "")) + '</td></tr>';
      }).join("");
      h += card("Measured against predicted, angle by angle",
        "The measured yield is the corrected count divided by the exposure, the aperture solid angle " +
        "and the detector efficiency — which is exactly the quantity each model predicts, so the two " +
        "sit side by side with nothing extrapolated between them.",
        '<div class="tablewrap scrollbox"><table class="data"><thead><tr>' +
        '<th class="n">#</th><th class="n">Angle</th><th class="n">Raw</th>' +
        '<th class="n">Measured, per sr</th><th class="n">Nuclear</th><th class="n">Diffuse</th>' +
        '<th>Note</th></tr></thead><tbody>' + mrows + '</tbody></table></div>');
    }

    return h;
  }

  /* ==================================================================
     SCREEN — DISTRIBUTION
     ================================================================== */
  function distribution(S) {
    var h = '<div class="screenhead"><h2>Angular distribution</h2>' +
      '<p>Your measurements reduced to a yield per steradian per incident particle, which is the same ' +
      'quantity the models predict, so the two can share an axis. Points with uncertainty bars are ' +
      'measurements; lines are models.</p></div>';

    var secret = modelIsSecret(S);

    h += card("Counts against angle",
      "A solid line with round points is the nuclear model; a dashed line with square points is the " +
      "diffuse one. An arrow instead of a point is an upper limit — a count that could not be told " +
      "apart from background." + (secret ? " Model curves are withheld in blind mode." : ""),
      '<div class="canvaswrap plain"><canvas id="distCanvas" aria-label="Angular distribution of detected counts"></canvas></div>' +
      '<div class="overlaybar" style="position:static;margin-top:8px">' +
      '<button data-act="dist-logy" class="' + (S.view.logY ? "on" : "") + '">Log counts</button>' +
      '<button data-act="dist-liny" class="' + (!S.view.logY ? "on" : "") + '">Linear counts</button>' +
      '<button data-act="dist-logx" class="' + (S.view.logX ? "on" : "") + '">Log angle</button>' +
      (secret ? "" :
        '<button data-act="dist-ruth" class="' + (S.view.showRuth ? "on" : "") + '">Nuclear</button>' +
        '<button data-act="dist-thom" class="' + (S.view.showThom ? "on" : "") + '">Diffuse</button>') +
      '</div>' +
      legendHTML(secret) +
      '<div class="chartsummary" id="distSummary"></div>' +
      textAlt(S));

    h += '<div class="cols c2">';
    h += card("Polar view",
      "The same information around the foil. The beam comes in from the left; radius is the logarithm " +
      "of the yield, ten decades from the outside in.",
      '<div class="canvaswrap"><canvas id="polarCanvas" aria-label="Polar plot of the scattering distribution"></canvas></div>' +
      '<div class="chartsummary" id="polarSummary"></div>');

    /* the 1913 data, offered as a check on the law rather than as a fit */
    h += card("Geiger and Marsden 1913, Table II " + P("doc", "Phil. Mag. 25, p. 610"),
      "The published test of the cosec⁴ law: scintillation counts at each angle, divided by 1/sin⁴(φ/2). " +
      "If the law holds the last column is constant. It is not a fit to this model — it is the data the " +
      "model has to be consistent with.",
      gm1913Table());
    h += '</div>';

    return h;
  }

  function legendHTML(secret) {
    var h = '<div class="legend">';
    if (!secret) {
      h += '<span><i style="border-color:var(--m-nuclear)"></i>Nuclear model — solid</span>';
      h += '<span><i class="dash" style="border-color:var(--m-diffuse)"></i>Diffuse model — dashed</span>';
    }
    h += '<span><i class="dot" style="background:var(--ok)"></i>Measured, with 1σ bar</span>';
    h += '<span><i class="dot" style="background:transparent;box-shadow:inset 0 0 0 1.5px var(--ok)"></i>Upper limit</span>';
    h += '<span><i style="border-color:var(--rf-gold);border-top-style:dotted"></i>Detector now</span>';
    h += '</div>';
    return h;
  }

  function textAlt(S) {
    var pts = S.session.ledger.map(Charts.yieldOf).filter(Boolean)
      .sort(function (a, b) { return a.deg - b.deg; });
    if (!pts.length) return "";
    var rows = pts.map(function (p) {
      return '<tr><td class="n">' + p.deg + '°</td><td class="n">' + p.raw + '</td>' +
        '<td class="n">' + (p.limit ? "≤ " + sig(p.upper, 3) : sig(p.y, 3)) + '</td>' +
        '<td class="n">' + sig(p.s, 2) + '</td>' +
        '<td>' + (p.limit ? "upper limit" : "measured") + '</td></tr>';
    }).join("");
    return '<details class="textalt"><summary>The same chart as a table</summary>' +
      '<div class="tablewrap"><table class="data"><thead><tr><th class="n">Angle</th>' +
      '<th class="n">Raw</th><th class="n">Yield per sr</th><th class="n">1σ</th><th>Kind</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></details>';
  }

  function gm1913Table() {
    var rows = GM1913_TABLE2.wide.map(function (r) {
      return '<tr><td class="n">' + r.deg + '°</td><td class="n">' + sig(r.inv, 3) + '</td>' +
        '<td class="n">' + r.gold.toLocaleString("en-GB") + '</td>' +
        '<td class="n">' + fmt(r.gold / r.inv, 1) + '</td>' +
        '<td class="n">' + fmt(r.silver / r.inv, 1) + '</td></tr>';
    }).join("");
    return '<div class="tablewrap scrollbox"><table class="data"><thead><tr>' +
      '<th class="n">φ</th><th class="n">1/sin⁴(φ/2)</th><th class="n">Gold, N</th>' +
      '<th class="n">Gold N·sin⁴</th><th class="n">Silver N·sin⁴</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="tiny muted" style="margin-top:8px">' + esc(GM1913_TABLE2.note) +
      ' Across this range the number of scattered particles varies by a factor of about 5,700 while the ' +
      'last two columns move by less than a factor of two.</div>';
  }

  /* ==================================================================
     SCREEN — EVIDENCE LEDGER
     ================================================================== */
  function ledger(S) {
    var L = S.session.ledger;
    var h = '<div class="screenhead"><h2>Evidence ledger</h2>' +
      '<p>Every exposure, with the settings and the seed it was taken under. Nothing is ever removed: ' +
      'an exposure that found nothing is a result, and it stays on the record.</p></div>';

    if (!L.length) {
      h += '<div class="emptyish">No exposures yet.</div>';
    } else {
      var rows = L.map(function (o) {
        var st = o.settings;
        return '<tr>' +
          '<td class="n">' + o.index + '</td>' +
          '<td class="n">' + o.detAngleDeg + '° ±' + o.detWidthDeg + '°</td>' +
          '<td class="n">' + big(o.fired) + '</td>' +
          '<td class="n">' + o.raw + '</td>' +
          '<td class="n">' + fmt(o.backgroundMean, 2) + '</td>' +
          '<td class="n">' + fmt(o.corrected, 2) + '</td>' +
          '<td class="n">± ' + fmt(o.sigma, 2) + '</td>' +
          '<td class="n">' + fmt(o.omega, 4) + '</td>' +
          '<td class="wrap tiny">' + esc(st.target) + ' Z' + o.geo.Z + ' · ' +
            fmt(st.energy, 2) + ' MeV · ' + st.thickness + ' nm · ε ' + fmt(st.efficiency, 2) +
            ' · bkg ' + fmt(st.background, 1) + ' · spread ' + fmt(st.beamSpread, 1) + '°</td>' +
          '<td class="n">' + o.exposureSeed + '</td>' +
          '</tr>';
      }).join("");

      h += card("", "", '<div class="tablewrap scrollbox"><table class="data"><thead><tr>' +
        '<th class="n">#</th><th class="n">Detector</th><th class="n">Fired</th><th class="n">Raw</th>' +
        '<th class="n">Bkg est.</th><th class="n">Corrected</th><th class="n">1σ</th>' +
        '<th class="n">Ω (sr)</th><th>Settings</th><th class="n">Seed</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>');
    }

    h += card("Export",
      "Everything the instrument knows, in formats that can be checked outside it. The observation CSV " +
      "carries the same numbers as the table above, from the same objects — there is no second copy.",
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn" data-act="export-config">Configuration (JSON)</button>' +
      '<button class="btn" data-act="export-obs">Observations (CSV)</button>' +
      '<button class="btn" data-act="export-dist">Angular distribution (CSV)</button>' +
      '<button class="btn" data-act="export-compare">Model comparison (CSV)</button>' +
      '<button class="btn" data-act="export-methods">Methods summary (text)</button>' +
      '<button class="btn primary" data-act="print">Printable report</button>' +
      '</div>' +
      '<div class="tiny muted" style="margin-top:10px">Every export carries the instrument version (' +
      VERSION + '), the session seed (' + S.session.seed + ') and the per-exposure seeds, which is ' +
      'everything needed to reproduce the run exactly.</div>');

    return h;
  }

  /* ==================================================================
     SCREEN — MODEL COMPARISON
     ================================================================== */
  function compare(S) {
    var h = '<div class="screenhead"><h2>Model comparison</h2>' +
      '<p>The same angles, the same exposure and the same seed, put through both models. This is the ' +
      'one screen where you are allowed to see what each model would have done — which is exactly why ' +
      'it is not available while a model is hidden.</p></div>';

    if (modelIsSecret(S)) {
      h += '<div class="note warn"><b>Withheld.</b> A model is currently hidden. Record a conclusion on ' +
        'the <b>Conclusion</b> screen and this screen unlocks.</div>';
      return h;
    }

    h += card("Run a matched pair",
      "Fourteen angles from 5° to 150°, run through the nuclear model and the diffuse model with " +
      "matched seeds, so any difference between them is the physics and not the dice.",
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<button class="btn primary" data-act="run-compare">Run both models</button>' +
      '<span class="tiny muted">' + big(S.cfg.particles) + ' particles at each angle, ±' +
      S.cfg.detWidth + '° aperture, seed ' + S.cfg.seed + '</span></div>');

    if (S.compare && S.compare.rutherford) {
      var R = S.compare.rutherford, T = S.compare.thomson;
      var rows = R.map(function (o, i) {
        var t = T[i];
        return '<tr><td class="n">' + o.detAngleDeg + '°</td>' +
          '<td class="n">' + o.raw + '</td><td class="n">' + sig(o.accept, 3) + '</td>' +
          '<td class="n">' + t.raw + '</td><td class="n">' +
            (t.accept < 1e-300 ? "0" : sig(t.accept, 3)) + '</td>' +
          '<td class="n">' + (t.accept > 0 ? sig(o.accept / t.accept, 3) : "∞") + '</td></tr>';
      }).join("");

      h += card("Matched conditions",
        "Raw counts and predicted acceptance, side by side. The last column is how many times more " +
        "likely a particle is to reach the detector under the nuclear model than under the diffuse one.",
        '<div class="tablewrap scrollbox"><table class="data"><thead><tr>' +
        '<th class="n">Angle</th><th class="n">Nuclear raw</th><th class="n">Nuclear P</th>' +
        '<th class="n">Diffuse raw</th><th class="n">Diffuse P</th><th class="n">Ratio</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>');

      h += card("Overlay",
        "Both sets of observations against both predicted distributions.",
        '<div class="canvaswrap plain"><canvas id="cmpCanvas" aria-label="Overlaid model comparison"></canvas></div>' +
        legendHTML(false) +
        '<div class="chartsummary" id="cmpSummary"></div>');

      /* where the models actually separate */
      var sep = null;
      for (var i = 0; i < R.length; i++) {
        if (T[i].accept > 0 && R[i].accept / T[i].accept > 100 && sep === null) sep = R[i].detAngleDeg;
        if (T[i].accept === 0 && sep === null) sep = R[i].detAngleDeg;
      }
      h += '<div class="note info"><b>Where the two models part company.</b> ' +
        (sep === null
          ? "Across this sweep the two models never differ by more than a factor of a hundred."
          : "Below about " + sep + "° the two predictions are within a factor of a hundred of each other, " +
            "and a modest exposure will not separate them. Above it the diffuse model runs out of " +
            "probability altogether: not a small number, a number that is zero to every decimal place " +
            "a computer holds. That is why the interesting measurement is the expensive one.") +
        '</div>';
    }

    return h;
  }

  /* ==================================================================
     SCREEN — CONCLUSION
     ================================================================== */
  function conclude(S) {
    var s = Atom.summary(S.session);
    var h = '<div class="screenhead"><h2>Conclusion</h2>' +
      '<p>What the evidence you collected supports, and what it does not.</p></div>';

    if (S.mode === "blind") return h + blindConclusion(S, s);
    if (S.mode === "guided") return h + guidedConclusion(S, s);
    return h + freeConclusion(S, s);
  }

  function evidenceSummary(s) {
    var b = "";
    b += kv("Exposures", String(s.exposures));
    b += kv("Particles fired", big(s.fired));
    b += kv("Counts recorded", big(s.detected));
    b += kv("Furthest angle searched", s.maxAngleSearched === null ? "none" : s.maxAngleSearched + "°");
    b += kv("Furthest angle with a count", s.maxAngleWithCount === null ? "none" : s.maxAngleWithCount + "°");
    b += kv("Counts past " + LARGE_ANGLE_DEG + "°", String(s.largeAngleCounts));
    b += kv("Counts past " + BACKSCATTER_DEG + "°", String(s.backscatterCounts));
    return b;
  }

  function blindConclusion(S, s) {
    var h = "";
    if (!S.conclusion) {
      if (s.exposures === 0) {
        return '<div class="note warn">Take at least one exposure before concluding anything.</div>';
      }
      h += card("State your conclusion",
        "Which model is behind the counts you have collected, and how confident are you? Both are " +
        "recorded before anything is revealed.",
        '<div class="cols c2">' + MODEL_KEYS.map(function (k) {
          return '<button class="choice' + (S.draftChoice === k ? " sel" : "") + '" data-choose="' + k + '">' +
            '<h4>' + esc(MODELS[k].name) + '</h4><p>' + esc(MODELS[k].note) + '</p></button>';
        }).join("") + '</div>' +
        '<div class="ctl" style="margin-top:12px"><label><span class="lab">Confidence</span>' +
        '<b id="confVal">' + (S.draftConfidence || 70) + '%</b></label>' +
        '<input type="range" id="confRange" min="50" max="99" step="1" value="' +
        (S.draftConfidence || 70) + '" aria-label="Confidence in your choice, per cent">' +
        '<div class="hint">50% is a coin toss. Above 90% you are claiming this should be wrong less than ' +
        'one time in ten.</div></div>' +
        '<button class="btn primary" data-act="commit" ' + (S.draftChoice ? "" : "disabled") +
        '>Record conclusion and reveal</button>');
      h += card("What you have to go on", "", evidenceSummary(s));
      return h;
    }

    var r = S.conclusion;
    h += card(r.correct ? "Correct" : "Not correct",
      "The model was chosen from the session seed (" + S.session.seed + ") before you took any exposure.",
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
      '<span class="pill ' + (r.correct ? "ok" : "danger") + '">' + (r.correct ? "Right" : "Wrong") + '</span>' +
      modelChip(r.hidden) + '<span class="pill">You said: ' + esc(MODELS[r.choice].short) + '</span>' +
      '<span class="pill">Confidence ' + r.confidence + '%</span></div>' +
      '<div class="note ' + (r.correct ? "good" : "bad") + '">' + esc(r.calibration) + '</div>');

    h += '<div class="cols c2">';
    h += card("Evidence collected", "", evidenceSummary(s));

    var lr = "";
    var mag = Math.abs(r.log10LR);
    var favours = r.logLR > 0 ? "nuclear" : "diffuse";
    lr += kv("Observations used", String(r.usable));
    lr += kv("Log₁₀ likelihood ratio", (r.logLR > 0 ? "+" : "") + fmt(r.log10LR, 1));
    lr += kv("Favours", r.usable ? MODELS[favours === "nuclear" ? "rutherford" : "thomson"].short : "—");
    lr += '<div class="note" style="margin-top:10px">' +
      (mag < 0.5
        ? "Your data barely distinguishes the two models. That is a statement about where you pointed the detector and how long you looked, not about the atom."
        : mag < 2
          ? "Your data leans one way by a factor of about " + big(Math.round(Math.pow(10, mag))) +
            ". Suggestive, not conclusive."
          : "Your data separates the two models by more than " + fmt(mag, 0) +
            " orders of magnitude. This is what a decisive measurement looks like.") +
      '</div>' +
      '<div class="tiny muted" style="margin-top:8px">The ratio is the product of Poisson likelihoods ' +
      'across your exposures under each model\'s predicted mean, background included. It is reported to ' +
      'one decimal place because that is all the precision it has.</div>';
    h += card("How strong was the evidence", "", lr);
    h += '</div>';

    if (r.informative.length) {
      var rows = r.informative.map(function (o) {
        return '<tr><td class="n">' + o.index + '</td><td class="n">' + o.deg + '°</td>' +
          '<td class="n">' + o.raw + '</td><td class="n">' + sig(o.muR, 3) + '</td>' +
          '<td class="n">' + sig(o.muT, 3) + '</td>' +
          '<td class="n">' + (o.logLR > 0 ? "+" : "") + fmt(o.logLR / Math.LN10, 1) + '</td></tr>';
      }).join("");
      h += card("Which observations did the work",
        "Ranked by how far each one moved the likelihood ratio on its own.",
        '<div class="tablewrap"><table class="data"><thead><tr><th class="n">#</th><th class="n">Angle</th>' +
        '<th class="n">Raw</th><th class="n">Expected, nuclear</th><th class="n">Expected, diffuse</th>' +
        '<th class="n">log₁₀ LR</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
    }

    h += '<div class="note info"><b>What one trial can and cannot tell you.</b> Getting this right at ' +
      '90% confidence does not make you well calibrated, and getting it wrong does not make you badly ' +
      'calibrated. Calibration is a property of a run of judgements at the same stated confidence. ' +
      'Reset with a different seed and do it again — several times — before drawing any conclusion ' +
      'about your own confidence.</div>';

    h += '<button class="btn primary" data-act="new-blind">New blind trial, new seed</button>';
    return h;
  }

  function guidedConclusion(S, s) {
    var labels = { none: "none at all", "1e6": "about one in a million",
                   "1e4": "about one in ten thousand", "1e2": "about one in a hundred" };
    var geo = Atom.geometry(S.cfg);
    var got = Atom.tableFor(S.cfg, "rutherford");
    var pred90 = Atom.tableBeyond(got.tab, LARGE_ANGLE_DEG * RAD);

    var h = card("Your prediction, and what happened",
      "",
      (S.prediction
        ? kv("You predicted", labels[S.prediction] || S.prediction)
        : kv("You predicted", "nothing was recorded")) +
      kv("This foil, nuclear model", sig(pred90, 3) + " past " + LARGE_ANGLE_DEG + "°") +
      kv("That is about", "1 in " + big(Math.round(1 / Math.max(pred90, 1e-300)))) +
      kv("Geiger and Marsden 1909 " + P("doc"), "about 1 in 8,000, from a thick platinum plate") +
      '<div class="note info" style="margin-top:10px">The two numbers are not the same measurement. ' +
      'The 1909 figure came from a <i>thick</i> plate, where a particle can scatter many times and ' +
      'still find its way out — a volume effect, as Geiger and Marsden showed by varying the number of ' +
      'foils. This instrument implements single scattering from a thin foil, so it predicts the ' +
      'thin-foil number instead. Both say the same thing about the atom.</div>');

    h += card("Why the rare events matter", "",
      '<p>' + esc(GUIDED[4].body) + '</p><p class="tiny muted">' + esc(GUIDED[4].aside) + '</p>' +
      '<div class="note">Both models put most of the beam within a couple of degrees of straight ahead. ' +
      'At 1° the diffuse model predicts <i>more</i> scattering than the nuclear one. Every exposure you ' +
      'spend below about 5° buys you almost nothing, and it is the cheapest place to look.</div>');

    h += card("Evidence collected", "", evidenceSummary(s));
    return h;
  }

  function freeConclusion(S, s) {
    var h = card("The record", "What this session has established, stated no more strongly than it can be.",
      evidenceSummary(s));
    if (s.exposures === 0) return h;

    var claims = [];
    if (s.largeAngleCounts > 0) {
      claims.push("Particles were detected past " + LARGE_ANGLE_DEG + "°. No diffuse-charge model in " +
        "this instrument produces any count there at any exposure, so this observation alone rules it out.");
    } else if (s.largeAngleExposures > 0) {
      claims.push("You looked past " + LARGE_ANGLE_DEG + "° and found nothing. That is consistent with " +
        "a diffuse charge — and also with a concentrated one and too small an exposure. Under the " +
        "current settings the nuclear model predicts about " +
        fmt(S.cfg.particles * Atom.predictBoth(S.cfg).rutherford * S.cfg.efficiency, 2) +
        " counts per exposure at " + S.cfg.detAngle + "°.");
    } else {
      claims.push("Nothing has been looked at past " + LARGE_ANGLE_DEG + "°, which is where the two " +
        "models disagree. Nothing collected so far bears on the question.");
    }
    var geo = Atom.geometry(S.cfg);
    if (geo.validity !== "ok") {
      claims.push("Some of these exposures were taken outside the range where single scattering holds. " +
        "Counts at small angles are understated there, and no claim about the small-angle shape should " +
        "rest on them.");
    }
    h += card("What this supports", "",
      claims.map(function (c) { return '<div class="note">' + c + '</div>'; }).join(""));
    return h;
  }

  /* ==================================================================
     SCREEN — ASSUMPTIONS
     ================================================================== */
  function notes(S) {
    var geo = Atom.geometry(S.cfg);
    var h = '<div class="screenhead"><h2>Assumptions</h2>' +
      '<p>Where each number came from, what the model leaves out, and what it cannot be used to argue. ' +
      'The full account is on the <a href="methods.html">methods page</a>.</p></div>';

    h += card("Provenance of the numbers in play", "",
      '<div class="tablewrap"><table class="data"><thead><tr><th>Quantity</th><th class="n">Value</th>' +
      '<th>Where it came from</th></tr></thead><tbody>' + [
        ["k·e²", "1.439964 MeV·fm", "doc", "Standard constant; the combination that makes b come out in femtometres."],
        ["Alpha kinetic energy, Ra C′", "7.687 MeV", "doc", "²¹⁴Po alpha decay, Q = 7.833 MeV, less the ²¹⁰Pb recoil."],
        ["Velocity quoted in 1913", "2.06 × 10⁹ cm s⁻¹", "doc", "Geiger & Marsden 1913, p. 622 — implies 8.80 MeV on the modern alpha mass. Their range–velocity scale ran about 7% high."],
        ["Reference gold foil", "2.1 × 10⁻⁵ cm = 210 nm", "doc", "The foil of the 1913 absolute measurement."],
        ["Detector efficiency", fmt(S.cfg.efficiency, 2), "doc", "Default 0.85: \"only about 85 per cent of the incident α particles\" were counted on their screens (1913, p. 622)."],
        ["Target Z, A, density", geo.target.sym + ": Z " + geo.Z + ", A " + fmt(geo.A, 3), "doc", "Modern values. Rutherford and Geiger & Marsden deduced Z ≈ A/2, which for gold gives 98.5 against the true 79."],
        ["Thomson charge N_T", fmt(geo.Zt, 0) + " (= 3A)", "doc", "Crowther's deduction from β-ray scattering that the number of corpuscles is about three times the atomic weight, cited in Rutherford 1911 §1."],
        ["Background rate", fmt(S.cfg.background, 1) + " per 10⁹ fired", "ped", "No counterpart in the papers. Geiger & Marsden measured their stray-particle rate with the foil removed and subtracted it; the magnitude here is chosen so that a rare count can be ambiguous."],
        ["Beam angular spread", fmt(S.cfg.beamSpread, 1) + "°", "ped", "The 1913 diaphragms are not reproduced. A Rayleigh profile of this width is convolved onto the exit distribution."],
        ["Exposure size", big(S.cfg.particles) + " particles", "ped", "An exposure is a number of particles delivered, not a length of time. The 1913 programme counted about 100,000 scintillations over several weeks."],
        ["b at these settings", fmt(geo.b_fm, 2) + " fm", "der", "Z₁Z₂ke²/E, computed from the above."],
        ["n·t", sig(geo.nt, 4) + " cm⁻²", "der", "Density and atomic weight give n; thickness gives t. Only the product enters."]
      ].map(function (r) {
        return '<tr><td>' + esc(r[0]) + '</td><td class="n">' + esc(r[1]) + '</td>' +
          '<td class="wrap">' + P(r[2]) + ' ' + esc(r[3]) + '</td></tr>';
      }).join("") + '</tbody></table></div>');

    h += '<div class="cols c2">';
    h += card("What is left out", "Physical effects the model does not have.",
      '<ul style="margin:0;padding-left:18px;line-height:1.65">' + [
        "Multiple scattering. Every deflection is a single encounter. Geiger and Marsden measured the scattering rising slightly faster than the thickness for thicker foils; that excess is absent here.",
        "Energy loss in the foil. The 1913 paper applied a correction of up to 9 per cent for the thickest foils. The beam here leaves the foil at the energy it entered with.",
        "Nuclear recoil. The alpha is treated as scattering off an infinitely heavy centre. Rutherford calculated the velocity loss as 2 per cent for gold at 90°, and 14 per cent for aluminium — so the light targets here are the least accurate.",
        "Screening by the atomic electrons, which cuts off the very smallest deflections. Here that cut-off comes instead from the finite area per atom, which is a different mechanism reaching a similar place.",
        "Any quantum mechanics at all. The Rutherford cross-section happens to survive the transition to quantum theory for pure Coulomb scattering; nothing else in the classical picture does.",
        "Nuclear force. At high enough energy the alpha reaches the nucleus and the Coulomb law stops describing the encounter. That limit is not modelled and not flagged."
      ].map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ul>');

    h += card("What this cannot establish", "Claims the instrument does not support, however it is operated.",
      '<ul style="margin:0;padding-left:18px;line-height:1.65">' + [
        "The quantum structure of the atom. Rutherford's nucleus is a point charge in a classical orbit problem; it says nothing about energy levels, and the atom it describes is unstable.",
        "Electron orbitals. There are no electrons in this model at all — only a compensating charge that has been shown to be negligible for the deflections of interest.",
        "Nuclear substructure. The nucleus here has a charge and no size, no constituents and no excited states.",
        "An exact reconstruction of the historical apparatus. The geometry is schematic and several of the 1909 and 1913 dimensions are not reproduced.",
        "The value of the nuclear charge from your own data. You can measure a distribution consistent with a concentrated charge; extracting Z from it needs the absolute normalisation, which this instrument gives you rather than asking you to measure."
      ].map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ul>');
    h += '</div>';

    h += card("Rutherford's atom is not the modern one",
      "",
      '<p>The 1911 paper proposes a charge concentrated at the centre of the atom and is careful to say ' +
      'it cannot tell whether that charge is positive or negative: "it has not so far been found possible ' +
      'to obtain definite evidence to determine whether it be positive or negative." It says nothing about ' +
      'how the outer charge is arranged, and Rutherford explicitly sets the question of the atom\'s ' +
      'stability aside.</p>' +
      '<p>Everything that makes an atom an atom — why it has the size it does, why it does not collapse, ' +
      'why it emits the light it emits — came later and came from quantum mechanics. What the scattering ' +
      'experiment established is narrower and firmer than a model of the atom: that almost all the ' +
      'positive charge and mass sits in a volume very much smaller than the atom itself.</p>');

    return h;
  }

  /* ==================================================================
     THE INSPECTOR
     ================================================================== */
  function slider(id, key, cfg, value, extra) {
    var c = CONTROLS[key];
    var shown = extra && extra.display ? extra.display : value;
    var v = c.log ? Math.log10(Math.max(1, value)) : value;
    return '<div class="ctl"><label for="' + id + '"><span class="lab">' + esc(c.label) + '</span>' +
      '<b id="' + id + 'Val">' + shown + (c.unit ? " " + c.unit : "") + '</b></label>' +
      '<input type="range" id="' + id + '" data-key="' + key + '"' +
      ' min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" value="' + v + '"' +
      ' aria-label="' + esc(c.label) + '">' +
      (extra && extra.hint ? '<div class="hint">' + extra.hint + '</div>' : "") + '</div>';
  }

  function inspector(S) {
    var geo = Atom.geometry(S.cfg);
    var h = "";

    /* ---- the model ---- */
    h += '<div class="insp-h">Atomic model</div>';
    if (modelIsSecret(S)) {
      h += '<div class="note warn" style="margin-bottom:0"><b>Hidden.</b> One of the two models was ' +
        'chosen from seed ' + S.session.seed + ' before you started. It is not shown anywhere in the ' +
        'interface until you record a conclusion.</div>';
    } else {
      h += '<div class="seg" style="margin-bottom:8px">' + MODEL_KEYS.map(function (k) {
        return '<button data-model="' + k + '" class="' + (S.cfg.model === k ? "on" : "") + '" ' +
          'style="flex:1">' + esc(MODELS[k].short) + '</button>';
      }).join("") + '</div>' +
      '<div class="tiny muted">' + esc(MODELS[S.cfg.model].note) + '</div>';
    }

    /* ---- the beam and the target ---- */
    h += '<div class="insp-h">Beam and target</div>';
    h += slider("cParticles", "particles", S.cfg, S.cfg.particles,
      { display: big(S.cfg.particles),
        hint: "Logarithmic. A rare event needs a large exposure before its absence means anything." });
    h += slider("cEnergy", "energy", S.cfg, S.cfg.energy,
      { display: fmt(S.cfg.energy, 3),
        hint: "Radium C′ gives 7.687 MeV. " + P("doc") });
    h += '<div class="ctl"><label for="cTarget"><span class="lab">Foil material</span>' +
      '<b>Z = ' + geo.Z + '</b></label>' +
      '<select id="cTarget" aria-label="Foil material">' + TARGETS.map(function (t) {
        return '<option value="' + t.key + '"' + (S.cfg.target === t.key ? " selected" : "") + '>' +
          esc(t.name) + " (" + t.sym + ", Z " + t.Z + ")</option>";
      }).join("") + '</select>' +
      '<div class="hint">Every metal here appears in the 1909 reflector table, the 1913 foil table, or both. ' + P("doc") + '</div></div>';
    h += slider("cThickness", "thickness", S.cfg, S.cfg.thickness,
      { display: S.cfg.thickness,
        hint: "The 1913 reference gold foil was 210 nm. " +
          (geo.validity === "ok" ? "" : '<b style="color:var(--watch)">Single scattering is ' +
            (geo.validity === "warn" ? "strained" : "failing") + ' at this thickness.</b>') });

    /* ---- the detector ---- */
    h += '<div class="insp-h">Detector</div>';
    h += slider("cAngle", "detAngle", S.cfg, S.cfg.detAngle,
      { display: S.cfg.detAngle, hint: "Arrow keys move the detector one degree at a time." });
    h += slider("cWidth", "detWidth", S.cfg, S.cfg.detWidth,
      { display: fmt(S.cfg.detWidth, 1),
        hint: "Solid angle " + fmt(Atom.solidAngle(S.cfg.detWidth * RAD), 4) + " sr. A wider aperture " +
          "catches more and resolves less." });

    /* ---- presets ---- */
    h += '<div class="insp-h">Presets</div>';
    h += '<div class="presetgrid">' + PRESETS.map(function (p) {
      return '<button data-preset="' + p.key + '" title="' + esc(p.why) + '">' + esc(p.name) + '</button>';
    }).join("") + '</div>' +
      '<div class="hint" style="margin-top:6px">Each preset shows exactly which values it will change ' +
      'before applying anything.</div>';

    /* ---- advanced ---- */
    h += '<div class="insp-h">Advanced ' +
      '<button class="btn sm ghost" data-act="toggle-advanced" style="float:right;margin-top:-4px" ' +
      'aria-expanded="' + (S.advanced ? "true" : "false") + '">' +
      (S.advanced ? "Hide" : "Show") + '</button></div>';
    if (S.advanced) {
      h += slider("cSeed", "seed", S.cfg, S.cfg.seed,
        { display: S.cfg.seed,
          hint: "The session seed. Every exposure derives its own from this and its position in the " +
                "ledger, so the same seed and the same sequence of actions reproduce a run exactly." });
      h += '<div class="rowin" style="margin:-6px 0 12px">' +
        '<input type="number" id="cSeedNum" value="' + S.cfg.seed + '" min="1" max="999999" ' +
        'aria-label="Seed, typed">' +
        '<button class="btn sm" data-act="reseed">New seed</button></div>';
      h += slider("cEff", "efficiency", S.cfg, S.cfg.efficiency,
        { display: fmt(S.cfg.efficiency, 2), hint: "0.85 is the figure Geiger and Marsden give. " + P("doc") });
      h += slider("cBkg", "background", S.cfg, S.cfg.background,
        { display: fmt(S.cfg.background, 1),
          hint: "Stray counts from the diaphragm and the vessel walls. Currently " +
                fmt(S.cfg.background * S.cfg.particles / 1e9, 2) + " expected per exposure. " + P("ped") });
      h += slider("cSpread", "beamSpread", S.cfg, S.cfg.beamSpread,
        { display: fmt(S.cfg.beamSpread, 1), hint: "Convolved onto the exit distribution. " + P("ped") });
      h += '<div class="ctl"><label for="cZ"><span class="lab">Override target charge Z</span>' +
        '<b>' + (S.cfg.zOverride ? S.cfg.zOverride : "off") + '</b></label>' +
        '<div class="rowin"><input type="number" id="cZ" min="1" max="120" step="0.5" ' +
        'value="' + (S.cfg.zOverride || "") + '" placeholder="' + geo.target.Z + '" ' +
        'aria-label="Override the target nuclear charge">' +
        '<button class="btn sm" data-act="clear-z">Clear</button></div>' +
        '<div class="hint">Set this to A/2 to see the value Rutherford deduced, and how much of the ' +
        '1913 absolute measurement it accounts for.</div></div>';
      h += slider("cSpeed", "speed", S.cfg, S.view.speed,
        { display: S.view.speed, hint: "Affects the apparatus animation only. No count depends on it." });
      h += slider("cTraj", "trajDensity", S.cfg, S.view.trajDensity,
        { display: S.view.trajDensity, hint: "How many sampled paths the apparatus view draws." });
    }

    /* ---- readout ---- */
    h += '<div class="insp-h">Readout</div>';
    h += kv("b", fmt(geo.b_fm, 2) + " fm");
    h += kv("n·t", sig(geo.nt, 3) + " cm⁻²");
    h += kv("Velocity", sig(geo.u, 3) + " cm s⁻¹");
    if (!modelIsSecret(S)) {
      var pr = Atom.predictBoth(S.cfg);
      var mk = S.cfg.model;
      h += kv("Acceptance here", sig(pr[mk], 3));
      h += kv("Expected counts", fmt(S.cfg.particles * pr[mk] * S.cfg.efficiency, 2));
    }
    h += kv("Expected background", fmt(S.cfg.background * S.cfg.particles / 1e9, 2));

    return h;
  }

  /* ==================================================================
     CANVAS PAINTING — called after the HTML lands
     ================================================================== */
  function curvesFor(S) {
    var out = [], secret = modelIsSecret(S);
    if (secret) return out;
    if (S.view.showRuth) {
      out.push({ token: "orange", dash: [], points: Atom.curve(S.cfg, "rutherford", 200) });
    }
    if (S.view.showThom) {
      out.push({ token: "teal", dash: [6, 4], points: Atom.curve(S.cfg, "thomson", 200) });
    }
    return out;
  }

  function paint(S) {
    var cv;
    if (S.screen === "bench") {
      cv = $("benchCanvas");
      if (cv) {
        Apparatus.draw(cv, {
          height: Math.max(320, Math.min(460, cv.clientWidth * 0.62)),
          detAngle: S.cfg.detAngle, detWidth: S.cfg.detWidth,
          beamSpread: S.cfg.beamSpread, targetName: Atom.geometry(S.cfg).target.name,
          thicknessNm: S.cfg.thickness, paths: S.paths,
          speed: S.view.speed, trajDensity: S.view.trajDensity, now: performance.now()
        });
      }
      var bs = $("benchSummary");
      if (bs) {
        var s = Atom.summary(S.session);
        bs.innerHTML = '<b>' + (S.paths.length) + ' sampled paths drawn.</b> ' +
          'The detector aperture is the shaded wedge at ' + S.cfg.detAngle + '°, ' +
          fmt(Atom.solidAngle(S.cfg.detWidth * RAD), 4) + ' steradians of the sphere. ' +
          (Apparatus.reduced()
            ? 'Reduced motion is on: paths are drawn statically and the counts update without animation.'
            : 'Marks on the screen fade over 900 ms and no two start within 400 ms of each other.') +
          ' ' + s.exposures + ' exposure' + (s.exposures === 1 ? "" : "s") + ' recorded.';
      }
    }

    if (S.screen === "counts") {
      cv = $("sweepCanvas");
      if (cv) Charts.sweepChart(cv, {
        observations: S.session.ledger, logY: S.view.sweepLog,
        height: Math.max(210, Math.min(300, cv.clientWidth * 0.34))
      });
      var ss = $("sweepSummary");
      if (ss) ss.innerHTML = sweepText(S);
    }

    if (S.screen === "distribution") {
      cv = $("distCanvas");
      var curves = curvesFor(S);
      if (cv) Charts.distribution(cv, {
        observations: S.session.ledger, curves: curves, logY: S.view.logY, logX: S.view.logX,
        markAngle: S.cfg.detAngle,
        height: Math.max(260, Math.min(400, cv.clientWidth * 0.46))
      });
      var ds = $("distSummary");
      if (ds) ds.innerHTML = Charts.describeDistribution(S.session.ledger, curves);
      cv = $("polarCanvas");
      if (cv) Charts.polar(cv, {
        observations: S.session.ledger, curves: curves,
        height: Math.max(240, Math.min(340, cv.clientWidth * 0.78))
      });
      var ps = $("polarSummary");
      if (ps) ps.innerHTML = polarText(S);
    }

    if (S.screen === "compare" && S.compare && S.compare.rutherford) {
      cv = $("cmpCanvas");
      if (cv) Charts.distribution(cv, {
        observations: S.compare.rutherford.concat(S.compare.thomson),
        curves: curvesFor(S), logY: true, logX: false, markAngle: null,
        height: Math.max(260, Math.min(380, cv.clientWidth * 0.44))
      });
      var cs = $("cmpSummary");
      if (cs) cs.innerHTML = compareText(S);
    }
  }

  function sweepText(S) {
    var L = S.session.ledger;
    if (!L.length) return "No exposures yet. Each bar will show the raw count at one detector angle.";
    var tot = 0, maxO = L[0], zero = 0;
    L.forEach(function (o) { tot += o.raw; if (o.raw > maxO.raw) maxO = o; if (o.raw === 0) zero++; });
    return "<b>" + L.length + " exposures, " + big(tot) + " counts in total.</b> The largest is " +
      maxO.raw + " at " + maxO.detAngleDeg + "°. " +
      (zero ? zero + " exposure" + (zero === 1 ? " returned" : "s returned") + " nothing at all. " : "") +
      "Bars are on a " + (S.view.sweepLog ? "logarithmic" : "linear") + " scale.";
  }

  function polarText(S) {
    var geo = Atom.geometry(S.cfg);
    if (modelIsSecret(S)) return "Model curves are withheld while a model is hidden. Your own measurements are shown.";
    var r = Atom.tableFor(S.cfg, "rutherford"), t = Atom.tableFor(S.cfg, "thomson");
    var f = function (tab, d) { return Atom.tableG(tab, d * RAD); };
    return "<b>At 5° the two models are within a factor of " +
      fmt(Math.max(f(r.tab, 5) / Math.max(f(t.tab, 5), 1e-300), f(t.tab, 5) / Math.max(f(r.tab, 5), 1e-300)), 0) +
      " of each other.</b> At 45° the nuclear model predicts " + sig(f(r.tab, 45), 2) +
      " per steradian per particle and the diffuse model predicts " +
      (f(t.tab, 45) < 1e-300 ? "nothing at all" : sig(f(t.tab, 45), 2)) +
      ". The nuclear curve is a straight line on this plot because a power law is a straight line " +
      "in logarithms, and the power is four.";
  }

  function compareText(S) {
    var R = S.compare.rutherford, T = S.compare.thomson;
    var rTot = 0, tTot = 0, rBig = 0, tBig = 0;
    R.forEach(function (o) { rTot += o.raw; if (o.detAngleDeg >= LARGE_ANGLE_DEG) rBig += o.raw; });
    T.forEach(function (o) { tTot += o.raw; if (o.detAngleDeg >= LARGE_ANGLE_DEG) tBig += o.raw; });
    return "<b>Matched sweep, " + R.length + " angles each.</b> The nuclear model produced " + big(rTot) +
      " counts in total, " + rBig + " of them past " + LARGE_ANGLE_DEG + "°. The diffuse model produced " +
      big(tTot) + " counts in total, " + tBig + " past " + LARGE_ANGLE_DEG + "° — and any counts it does " +
      "show at large angles are background, not scattering.";
  }

  /* ==================================================================
     dispatch
     ================================================================== */
  var RENDER = { bench: bench, counts: counts, distribution: distribution,
                 ledger: ledger, compare: compare, conclude: conclude, notes: notes };

  function render(S) {
    var el = $("screen-" + S.screen);
    if (el && RENDER[S.screen]) el.innerHTML = RENDER[S.screen](S);
    $("inspector").innerHTML = inspector(S);
    renderTopbar(S);
    paint(S);
  }

  return {
    renderHome: renderHome, render: render, paint: paint,
    renderTopbar: renderTopbar, esc: esc, big: big, modelIsSecret: modelIsSecret
  };
})();
