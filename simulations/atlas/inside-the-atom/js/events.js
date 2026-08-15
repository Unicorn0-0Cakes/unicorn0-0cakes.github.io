"use strict";
/* =====================================================================
   INSIDE THE ATOM — events.js

   Input handling and the exports. One delegated click listener, one
   delegated input listener, one keyboard listener — so a control added
   to a screen works without anything being wired to it by hand.

   Keyboard operation is not an afterthought here: every action in the
   instrument has a key, every control is a native input that arrow keys
   already drive, and nothing is reachable by pointer alone.
   ===================================================================== */

var Events = (function () {

  var S = null, api = null;
  function bind(state, actions) { S = state; api = actions; }

  /* ================================================================
     modal
     ================================================================ */
  var lastFocus = null;
  function modal(kicker, title, body, foot) {
    lastFocus = document.activeElement;
    $("modalKicker").textContent = kicker || "";
    $("modalTitle").textContent = title || "";
    $("modalBody").innerHTML = body || "";
    $("modalFoot").innerHTML = foot || '<button class="btn" data-act="close-modal">Close</button>';
    $("veil").classList.add("on");
    var first = $("modalFoot").querySelector("button");
    if (first) first.focus();
  }
  function closeModal() {
    $("veil").classList.remove("on");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ================================================================
     presets — always shown before they are applied
     ================================================================ */
  function previewPreset(key) {
    var p = presetByKey(key);
    if (!p) return;
    var rows = [], k;
    for (k in p.set) {
      var from = S.cfg[k], to = p.set[k];
      var f = fmtField(k, from), t = fmtField(k, to);
      rows.push('<tr><td>' + Screens.esc(FIELD_LABEL[k] || k) + '</td>' +
        '<td class="n">' + f + '</td><td class="n">→</td>' +
        '<td class="n"><b>' + t + '</b></td>' +
        '<td>' + (String(from) === String(to) ? '<span class="tiny muted">unchanged</span>' : "") + '</td></tr>');
    }
    modal("Preset", p.name,
      '<p>' + Screens.esc(p.why) + '</p>' +
      '<div class="tablewrap"><table class="data"><thead><tr><th>Control</th><th class="n">Now</th>' +
      '<th></th><th class="n">After</th><th></th></tr></thead><tbody>' + rows.join("") +
      '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:10px">Nothing else changes. The ledger is not cleared — ' +
      'exposures taken before and after a preset sit side by side, each carrying its own settings.</p>',
      '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn primary" data-act="apply-preset" data-preset="' + key + '">Apply preset</button>');
  }

  function fmtField(k, v) {
    if (v === null || v === undefined) return "—";
    if (k === "model") return MODELS[v] ? MODELS[v].short : String(v);
    if (k === "target") return targetByKey(v).name;
    if (k === "particles") return Screens.big(v);
    return String(v);
  }

  function applyPreset(key) {
    var p = presetByKey(key);
    if (!p) return;
    for (var k in p.set) S.cfg[k] = p.set[k];
    closeModal();
    api.afterSettingsChange("Preset applied: " + p.name);
  }

  /* ================================================================
     downloads — all built from the live session objects
     ================================================================ */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }

  function csvRow(a) {
    return a.map(function (v) {
      var s = String(v === null || v === undefined ? "" : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",");
  }

  function exportConfig() {
    var geo = Atom.geometry(S.cfg);
    var o = {
      instrument: "inside-the-atom", version: VERSION, exported: new Date().toISOString(),
      mode: S.mode, seed: S.session.seed, exposureCount: S.session.counter,
      settings: Atom.snapshot(S.cfg),
      derived: {
        Z: geo.Z, A: geo.A, b_fm: geo.b_fm, nt_cm2: geo.nt, n_cm3: geo.n,
        thickness_cm: geo.thickness_cm, thetaMin_deg: geo.thetaMin * DEG,
        thomsonCharge: geo.Zt, thomsonThetaT_deg: geo.thetaT * DEG,
        velocity_cm_s: geo.u, beta: geo.beta,
        singleScatteringP5: geo.ss5, validity: geo.validity
      },
      hiddenModel: (S.mode === "blind" && !S.conclusion) ? "withheld" : (S.session.hidden || null),
      note: "Angles in degrees. b = Z1*Z2*k*e^2/E. Only n*t enters the scattering law. " +
            "Reproduce a run with the same seed and the same sequence of exposures."
    };
    download("inside-the-atom-config-" + stamp() + ".json", JSON.stringify(o, null, 2), "application/json");
  }

  function exportObservations() {
    var head = ["index", "exposure_seed", "session_seed", "model", "detector_angle_deg",
      "detector_radius_deg", "solid_angle_sr", "particles_fired", "reached_aperture",
      "detected", "background_counts", "background_estimate", "raw_count", "corrected_count",
      "uncertainty_1sigma", "acceptance", "target", "Z", "energy_MeV", "thickness_nm",
      "efficiency", "background_rate_per_1e9", "beam_spread_deg"];
    var lines = [csvRow(head)];
    S.session.ledger.forEach(function (o) {
      var st = o.settings;
      lines.push(csvRow([
        o.index, o.exposureSeed, st.seed,
        Screens.modelIsSecret(S) ? "withheld" : o.model,
        o.detAngleDeg, o.detWidthDeg, o.omega, o.fired, o.eligible, o.detected,
        o.background, o.backgroundMean, o.raw, o.corrected, o.sigma, o.accept,
        st.target, o.geo.Z, st.energy, st.thickness, st.efficiency, st.background, st.beamSpread
      ]));
    });
    download("inside-the-atom-observations-" + stamp() + ".csv", lines.join("\n"), "text/csv");
  }

  function exportDistribution() {
    var head = ["angle_deg", "nuclear_per_sr_per_particle", "diffuse_per_sr_per_particle",
      "nuclear_fraction_beyond", "diffuse_fraction_beyond"];
    var lines = [csvRow(head)];
    var r = Atom.tableFor(S.cfg, "rutherford"), t = Atom.tableFor(S.cfg, "thomson");
    for (var d = 0.5; d <= 179.5; d += 0.5) {
      var th = d * RAD;
      lines.push(csvRow([d, Atom.tableG(r.tab, th), Atom.tableG(t.tab, th),
        Atom.tableBeyond(r.tab, th), Atom.tableBeyond(t.tab, th)]));
    }
    download("inside-the-atom-distribution-" + stamp() + ".csv", lines.join("\n"), "text/csv");
  }

  function exportCompare() {
    if (!S.compare || !S.compare.rutherford) {
      modal("Export", "Nothing to export yet",
        "<p>Run a matched pair on the <b>Models</b> screen first. This export is the two runs " +
        "side by side, and there are no runs.</p>");
      return;
    }
    var head = ["angle_deg", "particles_fired", "nuclear_acceptance", "nuclear_raw",
      "nuclear_corrected", "nuclear_sigma", "diffuse_acceptance", "diffuse_raw",
      "diffuse_corrected", "diffuse_sigma", "acceptance_ratio", "nuclear_seed", "diffuse_seed"];
    var lines = [csvRow(head)];
    S.compare.rutherford.forEach(function (o, i) {
      var t = S.compare.thomson[i];
      lines.push(csvRow([o.detAngleDeg, o.fired, o.accept, o.raw, o.corrected, o.sigma,
        t.accept, t.raw, t.corrected, t.sigma,
        t.accept > 0 ? o.accept / t.accept : "inf", o.exposureSeed, t.exposureSeed]));
    });
    download("inside-the-atom-model-comparison-" + stamp() + ".csv", lines.join("\n"), "text/csv");
  }

  function exportMethods() {
    var geo = Atom.geometry(S.cfg);
    var s = Atom.summary(S.session);
    var L = [];
    L.push("INSIDE THE ATOM — methods summary");
    L.push("Instrument version " + VERSION + " (" + UPDATED + "). Exported " + new Date().toISOString());
    L.push("");
    L.push("SOURCES");
    L.push("  Geiger, H. and Marsden, E. (1909). On a Diffuse Reflection of the alpha-Particles.");
    L.push("    Proceedings of the Royal Society A, 82, 495-500.");
    L.push("  Rutherford, E. (1911). The Scattering of alpha and beta Particles by Matter and the");
    L.push("    Structure of the Atom. Philosophical Magazine, series 6, 21(125), 669-688.");
    L.push("  Geiger, H. and Marsden, E. (1913). The Laws of Deflexion of alpha Particles through");
    L.push("    Large Angles. Philosophical Magazine, series 6, 25(148), 604-623.");
    L.push("");
    L.push("THE TWO MODELS");
    L.push("  Nuclear (Rutherford 1911, sections 2-3). Single close encounter with a point charge.");
    L.push("    cot(phi/2) = 2p/b, with b = Z1*Z2*k*e^2/E the head-on distance of closest approach.");
    L.push("    Impact parameter sampled uniformly in area to p_max = 1/sqrt(pi*n*t), which reproduces");
    L.push("    P(> phi) = (pi/4)*n*t*b^2*cot^2(phi/2)   [Rutherford eq. 3]");
    L.push("    dP/dOmega = n*t*(b/4)^2 * cosec^4(phi/2)  [Rutherford eq. 5]");
    L.push("  Diffuse (Thomson's atom, in Rutherford's section 5). Compound scattering:");
    L.push("    P(> phi) = exp(-phi^2 / theta_t^2),  theta_t = (pi*b_T/8)*sqrt(pi*n*t)");
    L.push("    b_T uses N_T = 3A corpuscles, Crowther's deduction as cited in Rutherford 1911 s.1.");
    L.push("");
    L.push("CURRENT SETTINGS");
    L.push("  model                 " + (Screens.modelIsSecret(S) ? "withheld" : MODELS[S.cfg.model].name));
    L.push("  target                " + geo.target.name + " (Z " + geo.Z + ", A " + fmt(geo.A, 3) + ")");
    L.push("  alpha energy          " + fmt(geo.E, 4) + " MeV   (beta = " + fmt(geo.beta, 5) + ")");
    L.push("  foil thickness        " + S.cfg.thickness + " nm = " + sig(geo.thickness_cm, 3) + " cm");
    L.push("  areal density n*t     " + sig(geo.nt, 5) + " cm^-2");
    L.push("  b                     " + fmt(geo.b_fm, 4) + " fm");
    L.push("  smallest deflexion    " + fmt(geo.thetaMin * DEG, 4) + " deg");
    L.push("  Thomson theta_t       " + fmt(geo.thetaT * DEG, 4) + " deg");
    L.push("  detector              " + S.cfg.detAngle + " deg, radius " + S.cfg.detWidth +
           " deg, Omega = " + fmt(Atom.solidAngle(S.cfg.detWidth * RAD), 6) + " sr");
    L.push("  efficiency            " + fmt(S.cfg.efficiency, 3));
    L.push("  background rate       " + fmt(S.cfg.background, 2) + " per 1e9 fired");
    L.push("  beam spread           " + fmt(S.cfg.beamSpread, 2) + " deg");
    L.push("  session seed          " + S.session.seed);
    L.push("  single-scattering P(>5 deg) = " + sig(geo.ss5, 4) + "  [" + geo.validity + "]");
    L.push("");
    L.push("THIS SESSION");
    L.push("  mode                  " + S.mode);
    L.push("  exposures             " + s.exposures);
    L.push("  particles fired       " + s.fired);
    L.push("  counts recorded       " + s.detected);
    L.push("  furthest angle looked at    " + (s.maxAngleSearched === null ? "none" : s.maxAngleSearched + " deg"));
    L.push("  furthest angle with a count " + (s.maxAngleWithCount === null ? "none" : s.maxAngleWithCount + " deg"));
    L.push("  counts past " + LARGE_ANGLE_DEG + " deg      " + s.largeAngleCounts);
    L.push("  counts past " + BACKSCATTER_DEG + " deg     " + s.backscatterCounts);
    L.push("");
    L.push("WHERE RANDOMNESS ENTERS");
    L.push("  Three places, all seeded: the binomial draw of particles into the detector aperture;");
    L.push("  the binomial draw of those the screen records; and the Poisson background. The");
    L.push("  acceptance itself is computed by quadrature, so counting statistics are exact.");
    L.push("  Exposure k of a session seeded S uses a generator derived from (S, k).");
    L.push("");
    L.push("WHAT THIS CANNOT ESTABLISH");
    L.push("  the quantum structure of the atom; electron orbitals; nuclear substructure;");
    L.push("  an exact reconstruction of an apparatus whose dimensions are only partly recorded.");
    L.push("");
    L.push("OMITTED: multiple scattering, energy loss in the foil, nuclear recoil, electron");
    L.push("  screening, all quantum mechanics, and the nuclear force at small impact parameter.");
    download("inside-the-atom-methods-" + stamp() + ".txt", L.join("\n"), "text/plain");
  }

  /* ================================================================
     click delegation
     ================================================================ */
  function onClick(e) {
    var t = e.target.closest("[data-act],[data-preset],[data-model],[data-screen],[data-mode],[data-predict],[data-choose]");
    if (!t) return;

    if (t.hasAttribute("data-mode")) { api.start(t.getAttribute("data-mode")); return; }
    if (t.hasAttribute("data-screen")) { api.go(t.getAttribute("data-screen")); return; }

    if (t.hasAttribute("data-model") && !Screens.modelIsSecret(S)) {
      S.cfg.model = t.getAttribute("data-model");
      api.afterSettingsChange("Model set to " + MODELS[S.cfg.model].name);
      return;
    }
    if (t.hasAttribute("data-predict")) {
      S.prediction = t.getAttribute("data-predict");
      api.rerender(); return;
    }
    if (t.hasAttribute("data-choose")) {
      S.draftChoice = t.getAttribute("data-choose");
      api.rerender(); return;
    }
    if (t.hasAttribute("data-preset") && t.getAttribute("data-act") !== "apply-preset") {
      previewPreset(t.getAttribute("data-preset")); return;
    }

    var act = t.getAttribute("data-act");
    switch (act) {
      case "apply-preset":     applyPreset(t.getAttribute("data-preset")); break;
      case "close-modal":      closeModal(); break;
      case "toggle-advanced":  S.advanced = !S.advanced; api.rerender(); break;
      case "reseed":           api.reseed(); break;
      case "clear-z":          S.cfg.zOverride = null; api.afterSettingsChange("Z override cleared"); break;

      case "traj-up":          S.view.trajDensity = clamp(S.view.trajDensity + 10, 0, 100); api.resample(); break;
      case "traj-down":        S.view.trajDensity = clamp(S.view.trajDensity - 10, 0, 100); api.resample(); break;

      case "sweep-log":        S.view.sweepLog = true;  api.rerender(); break;
      case "sweep-lin":        S.view.sweepLog = false; api.rerender(); break;
      case "dist-logy":        S.view.logY = true;  api.rerender(); break;
      case "dist-liny":        S.view.logY = false; api.rerender(); break;
      case "dist-logx":        S.view.logX = !S.view.logX; api.rerender(); break;
      case "dist-ruth":        S.view.showRuth = !S.view.showRuth; api.rerender(); break;
      case "dist-thom":        S.view.showThom = !S.view.showThom; api.rerender(); break;

      case "guided-next":      api.guidedStep(1); break;
      case "guided-prev":      api.guidedStep(-1); break;

      case "run-compare":      api.runCompare(); break;
      case "commit":           api.commitBlind(); break;
      case "new-blind":        api.start("blind", true); break;

      case "export-config":    exportConfig(); break;
      case "export-obs":       exportObservations(); break;
      case "export-dist":      exportDistribution(); break;
      case "export-compare":   exportCompare(); break;
      case "export-methods":   exportMethods(); break;
      case "print":            api.printReport(); break;
      default: break;
    }
  }

  /* ================================================================
     input delegation
     ================================================================ */
  function onInput(e) {
    var el = e.target;

    if (el.id === "confRange") {
      S.draftConfidence = parseInt(el.value, 10);
      var lbl = $("confVal"); if (lbl) lbl.textContent = S.draftConfidence + "%";
      return;
    }
    if (el.id === "cTarget") { S.cfg.target = el.value; api.afterSettingsChange(); return; }
    if (el.id === "cSeedNum") {
      var v = parseInt(el.value, 10);
      if (isFinite(v) && v >= 1) { S.cfg.seed = v; S.session.seed = v; api.afterSettingsChange(); }
      return;
    }
    if (el.id === "cZ") {
      var z = parseFloat(el.value);
      S.cfg.zOverride = (isFinite(z) && z > 0) ? clamp(z, 1, 120) : null;
      api.afterSettingsChange();
      return;
    }

    var key = el.getAttribute && el.getAttribute("data-key");
    if (!key) return;
    var raw = parseFloat(el.value);
    if (!isFinite(raw)) return;
    var c = CONTROLS[key];

    if (key === "speed") { S.view.speed = raw; api.softUpdate(); return; }
    if (key === "trajDensity") { S.view.trajDensity = raw; api.resample(); return; }

    S.cfg[key] = c.log ? Math.round(Math.pow(10, raw)) : raw;
    if (key === "seed") S.session.seed = S.cfg.seed;
    api.afterSettingsChange();
  }

  /* ================================================================
     keyboard
     ================================================================ */
  var KEYMAP = {
    " ": "expose", "Enter": null,
    "ArrowLeft": "det-", "ArrowRight": "det+",
    "ArrowDown": "detw-", "ArrowUp": "detw+",
    "1": "bench", "2": "counts", "3": "distribution",
    "4": "ledger", "5": "compare", "6": "conclude", "7": "notes",
    "s": "sweep", "S": "sweep",
    "r": "reset", "R": "reset",
    "e": "expose", "E": "expose",
    "?": "help", "/": "help"
  };

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var el = document.activeElement;
    var typing = el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable);

    if (e.key === "Escape") {
      if ($("veil").classList.contains("on")) { closeModal(); e.preventDefault(); }
      return;
    }
    if ($("veil").classList.contains("on")) return;
    /* Shortcuts belong to the instrument, not to the mode chooser. */
    if (!$("app").classList.contains("on")) return;

    /* Arrow keys inside a slider belong to the slider. */
    if (typing && /^Arrow/.test(e.key)) return;
    if (typing && e.key !== " ") return;
    if (typing && e.key === " " && el.tagName.toLowerCase() === "input" &&
        el.type === "range") return;

    var act = KEYMAP[e.key];
    if (!act) return;

    switch (act) {
      case "expose": api.expose(); break;
      case "sweep":  api.runSweep(); break;
      case "reset":  api.confirmReset(); break;
      case "det-":   S.cfg.detAngle = clamp(S.cfg.detAngle - (e.shiftKey ? 10 : 1), 0, 180); api.afterSettingsChange(); break;
      case "det+":   S.cfg.detAngle = clamp(S.cfg.detAngle + (e.shiftKey ? 10 : 1), 0, 180); api.afterSettingsChange(); break;
      case "detw-":  S.cfg.detWidth = clamp(S.cfg.detWidth - 0.5, 1, 20); api.afterSettingsChange(); break;
      case "detw+":  S.cfg.detWidth = clamp(S.cfg.detWidth + 0.5, 1, 20); api.afterSettingsChange(); break;
      case "help":   showHelp(); break;
      default:
        api.go(act);
    }
    e.preventDefault();
  }

  function showHelp() {
    modal("Keyboard", "Everything, from the keyboard",
      '<div class="tablewrap"><table class="data"><tbody>' + [
        ["Space or E", "Run one exposure at the current detector setting"],
        ["S", "Run a full detector sweep"],
        ["← →", "Move the detector one degree · hold Shift for ten"],
        ["↑ ↓", "Widen or narrow the detector aperture"],
        ["1 – 7", "Apparatus · Counts · Distribution · Evidence · Models · Conclusion · Assumptions"],
        ["R", "Reset the session"],
        ["T", "Switch between the day and night themes"],
        ["? or /", "This list"],
        ["Tab", "Every control, in reading order, with a visible focus ring"]
      ].map(function (r) {
        return '<tr><td class="n" style="width:120px"><b>' + r[0] + '</b></td><td>' + r[1] + '</td></tr>';
      }).join("") + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:12px">The Pause control in the bar at the top of the page ' +
      'stops the apparatus animation. It is on already if your system asks for reduced motion, and in ' +
      'that state the apparatus draws a static sample of paths instead of animating them. Nothing that ' +
      'is measured or exported depends on the animation.</p>');
  }

  function attach() {
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onInput);
    document.addEventListener("keydown", onKey);
    $("veil").addEventListener("click", function (e) { if (e.target === $("veil")) closeModal(); });
  }

  return {
    bind: bind, attach: attach, modal: modal, closeModal: closeModal,
    showHelp: showHelp, download: download, stamp: stamp,
    exportConfig: exportConfig, exportObservations: exportObservations,
    exportDistribution: exportDistribution, exportCompare: exportCompare,
    exportMethods: exportMethods
  };
})();
