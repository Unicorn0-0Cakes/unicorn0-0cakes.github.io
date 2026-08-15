/* =====================================================================
   THE FALLING CHARGE — the instrument
   ---------------------------------------------------------------------
   State machine (docs/STATE_MACHINE.md), fixed-timestep loop
   (docs/PHYSICS_MODEL.md §5.3) and the four interface regions
   (docs/UX_FLOW.md).
   ===================================================================== */
(function (root) {
  "use strict";

  const FC = root.FC;
  const U = FC.units, P = FC.physics, DR = FC.droplets, A = FC.apparatus,
        M = FC.measurement, CAL = FC.calibration, UN = FC.uncertainty,
        AN = FC.analysis, MOD = FC.models, NB = FC.notebook,
        PS = FC.persistence, CH = FC.charts, REP = FC.reporting,
        ACC = FC.accessibility, PRNG = FC.prng;

  const DT = 2e-3;               // simulated seconds per physics step
  const MAX_STEPS = 240;

  const S = {
    phase: "SETUP",
    world: null, store: null, streams: null, nb: null,
    errors: null, cal: null, rules: null,
    track: null, pendingFall: {}, lastDerived: null,
    analysis: null, revealInfo: null,
    speed: 5, paused: false,
    tab: "notebook", residualAxis: "n",
    estimateViewed: false,
    mode: "blind", profile: "modern",
    seed: "millikan-1913",
    acc: 0, lastT: 0, raf: null,
    toastTimer: null
  };

  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  /* =================================================================
     PALETTE — read from the shared design tokens
     ============================================================== */
  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = function (n, f) { return (cs.getPropertyValue(n) || "").trim() || f; };
    return {
      scope: v("--rf-scope", "#0B0906"),
      scopeLit: v("--fc-scope-lit", "#12100c"),
      beam: v("--fc-beam", "rgba(255,220,150,.045)"),
      field: v("--fc-field", "rgba(120,190,255,.38)"),
      brass1: v("--fc-brass1", "#8a7038"),
      brass2: v("--fc-brass2", "#c9a959"),
      brass3: v("--fc-brass3", "#6d5828"),
      rule: v("--rf-line", "#43382A"),
      ink: v("--rf-ink", "#F4E6C8"),
      muted: v("--rf-muted", "#8B7B5E"),
      droplet: v("--fc-droplet", "#ffe9bd"),
      selected: v("--rf-orange", "#FF8A3D"),
      dropletCore: v("--fc-dropcore", "rgba(255,240,205,.95)"),
      dropletEdge: v("--fc-dropedge", "rgba(255,220,150,0)"),
      reticleMaj: v("--fc-reticle", "rgba(210,235,255,.55)"),
      reticleMin: v("--fc-reticle-min", "rgba(210,235,255,.22)"),
      path: v("--rf-teal", "#4FD6C4"),
      gate: v("--rf-amber", "#FFC24A"),
      point: v("--rf-teal", "#4FD6C4"),
      fit: v("--rf-orange", "#FF8A3D"),
      zero: v("--rf-muted", "#8B7B5E"),
      gridSoft: v("--rf-line-soft", "#2C241A")
    };
  }

  /* =================================================================
     SESSION
     ============================================================== */

  function startSession(opts) {
    S.mode = opts.mode; S.profile = opts.profile; S.seed = opts.seed;

    DR.resetIds(); M.resetIds();
    S.streams = new PRNG.Streams(S.seed);
    S.errors = A.drawSessionErrors(S.streams.get("apparatus"), S.profile);

    const rhoOil = (S.profile === "historical") ? U.OIL.historical.rho : U.OIL.modern.rho;

    S.world = A.createWorld({
      profile: S.profile, errors: S.errors, rhoOil: rhoOil,
      slipModel: opts.slipModel || "allen-raabe-1982",
      brownian: true, integrator: "exponential"
    });

    const experiment = {
      experimentId: "FC-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") +
                    "-" + S.seed.slice(0, 6).toUpperCase(),
      seed: S.seed, mode: S.mode, apparatusProfile: S.profile,
      createdAt: new Date().toISOString(),
      dropletConfig: DR.DEFAULTS, syntheticChargeModel: null
    };
    S.store = PS.createStore(experiment);
    S.nb = NB.create();
    S.cal = CAL.createRecord(S.world);
    S.rules = Object.assign({}, M.DEFAULT_RULES);
    S.analysis = null; S.revealInfo = null; S.estimateViewed = false;
    S.track = null; S.pendingFall = {}; S.lastDerived = null;

    NB.add(S.nb, "session_start", {
      simTime: 0,
      text: "Mode " + S.mode + ", apparatus " + S.profile + ", seed " + S.seed +
            ", slip model " + S.world.physics.slipModel
    });

    S.phase = "CALIBRATION";
    $("home").style.display = "none";
    $("app").style.display = "grid";
    S.tab = "calibration";
    sizeCanvases();
    renderAll();
    loop(performance.now());
    ACC.announce(document, "Session started. Calibration required before collection.");
  }

  /* the context object every engine module receives */
  function ctx() {
    return {
      streams: S.streams, truthVault: S.store.truth, eHidden: U.SI.e,
      errors: S.errors, dropletConfig: DR.DEFAULTS, synthetic: null,
      calibrationVersion: S.store.calibrationVersion(),
      protocolVersion: S.store.protocolVersion(),
      estimateViewed: S.estimateViewed,
      onEvent: function (kind, id, data) {
        if (kind === "charge_jump") {
          NB.add(S.nb, "charge_jump", { simTime: S.world.t, dropletId: id,
            text: "Ionisation event, Δn = " + (data.deltaN > 0 ? "+" : "") + data.deltaN +
                  " (the new charge is not disclosed)" });
        } else if (kind === "droplet_lost" && id === S.world.selectedId) {
          NB.add(S.nb, "droplet_lost", { simTime: S.world.t, dropletId: id });
        }
      }
    };
  }

  /* =================================================================
     THE LOOP — fixed physics step, variable rendering
     ============================================================== */

  function loop(now) {
    S.raf = requestAnimationFrame(loop);
    const wall = Math.min((now - S.lastT) / 1000, 0.25);
    S.lastT = now;
    if (!S.paused && S.world && S.phase !== "SETUP") {
      S.acc += wall * S.speed;
      let steps = Math.floor(S.acc / DT);
      if (steps > MAX_STEPS) {
        S.world.counters.droppedTime += (steps - MAX_STEPS) * DT;
        steps = MAX_STEPS;
      }
      S.acc -= steps * DT;
      const c = ctx();
      for (let i = 0; i < steps; i++) {
        A.step(S.world, DT, c);
        if (S.track) M.sample(S.track, S.world, c);
      }
      if (steps) { drawStage(); updateLive(); }
    }
  }

  /* =================================================================
     CANVASES
     ============================================================== */

  function sizeCanvases() {
    ["chamberCv", "scopeCv"].forEach(function (id) {
      const cv = $(id); if (!cv) return;
      const r = cv.parentElement.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(160, Math.floor(r.width * dpr));
      cv.height = Math.max(160, Math.floor((id === "chamberCv" ? 400 : 300) * dpr));
      cv.style.width = "100%";
      cv.style.height = (id === "chamberCv" ? 400 : 300) + "px";
      cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    drawStage();
  }

  function drawStage() {
    if (!S.world) return;
    const pal = palette();
    const c1 = $("chamberCv"), c2 = $("scopeCv");
    if (c1) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      A.drawChamber(c1.getContext("2d"), S.world,
        { x: 0, y: 0, w: c1.width / dpr, h: c1.height / dpr }, pal);
      c1.setAttribute("aria-label", ACC.chamberLabel(S.world, A));
    }
    if (c2) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      A.drawScope(c2.getContext("2d"), S.world,
        { x: 0, y: 0, w: c2.width / dpr, h: c2.height / dpr }, pal, S.track);
    }
  }

  /* =================================================================
     LIVE READOUTS
     ============================================================== */

  function updateLive() {
    const w = S.world; if (!w) return;
    const sel = w.droplets.find(function (d) { return d.id === w.selectedId; });
    $("bbClock").textContent = U.clock(w.t);
    $("bbCount").textContent = w.droplets.filter(function (d) { return d.visible; }).length +
      " visible / " + w.counters.generated + " made";
    $("bbPhase").textContent = S.phase;

    const V = A.displayedVoltage(w);
    $("roVolt").textContent = w.instrument.fieldOn ? V.toFixed(1) + " V" : "field off";
    $("roField").textContent = w.instrument.fieldOn
      ? U.disp.kVperM(Math.abs(V) / w.geom.plateGap).toFixed(1) + " kV/m " +
        (V > 0 ? "downward" : "upward")
      : "0";
    $("roTemp").textContent = A.readTemperature(w, S.errors).toFixed(1) + " K";
    $("roPress").textContent = (A.readPressure(w, S.errors) / 1000).toFixed(2) + " kPa";
    $("roPol").textContent = w.instrument.polarity > 0
      ? "+ upper / − lower" : "− upper / + lower";

    $("roSel").textContent = sel ? sel.id : "—";
    $("roPos").textContent = sel ? (sel.y * 1000).toFixed(3) + " mm" : "—";
    $("roVel").textContent = sel
      ? (sel.vy * 1e6).toFixed(2) + " µm/s " + (sel.vy < 0 ? "(falling)" : sel.vy > 0 ? "(rising)" : "")
      : "—";
    $("roFocus").textContent = sel ? Math.round(sel.focus * 100) + " %" : "—";

    if (S.track) {
      $("roTrack").textContent = (w.t - S.track.tStart).toFixed(1) + " s · " +
        S.track.samples.length + " pts · " + S.track.kind;
    }
  }

  /* =================================================================
     ACTIONS
     ============================================================== */

  function guardCollecting() {
    if (S.phase === "CALIBRATION") {
      toast("Calibrate the apparatus first — every entry needs a status.");
      return false;
    }
    if (S.phase === "PREREGISTER") {
      toast("Preregister the exclusion rules before collecting data.");
      return false;
    }
    if (S.phase === "LOCKED" || S.phase === "REVEALED" || S.phase === "ANALYSIS") {
      toast("The dataset is locked. No further collection in this experiment.");
      return false;
    }
    return true;
  }

  const act = {
    atomise: function () {
      if (!guardCollecting()) return;
      const ids = A.atomise(S.world, ctx(), 26);
      NB.add(S.nb, "atomise", { simTime: S.world.t,
        text: ids.length + " droplets introduced through the aperture" });
      renderDesk();
      ACC.announce(document, ids.length + " droplets sprayed.");
    },

    selectNext: function (dir) {
      const vis = S.world.droplets.filter(function (d) { return d.visible; });
      if (!vis.length) { toast("No droplets visible. Try the atomiser, or adjust focus."); return; }
      let i = vis.findIndex(function (d) { return d.id === S.world.selectedId; });
      i = (i < 0) ? 0 : (i + dir + vis.length) % vis.length;
      S.world.selectedId = vis[i].id;
      NB.add(S.nb, "droplet_selected", { simTime: S.world.t, dropletId: vis[i].id });
      drawStage(); updateLive(); renderMeasurePanel();
    },

    fieldToggle: function () {
      if (!guardCollecting()) return;
      if (S.track) { toast("Stop the current track before changing the field."); return; }
      S.world.instrument.fieldOn = !S.world.instrument.fieldOn;
      settle();
      NB.add(S.nb, "field_toggle", { simTime: S.world.t,
        text: S.world.instrument.fieldOn
          ? "Field ON at " + A.displayedVoltage(S.world).toFixed(1) + " V"
          : "Field OFF (relay open, exactly zero volts)" });
      drawStage(); updateLive(); renderControls(); renderMeasurePanel();
    },

    polarity: function () {
      if (S.track) { toast("Stop the current track before reversing polarity."); return; }
      S.world.instrument.polarity *= -1;
      settle();
      NB.add(S.nb, "polarity_change", { simTime: S.world.t,
        text: "Upper plate now " + (S.world.instrument.polarity > 0 ? "positive" : "negative") });
      drawStage(); updateLive(); renderControls();
    },

    setVoltage: function (v) {
      if (S.track) { toast("Stop the current track before changing the voltage."); return; }
      S.world.instrument.vDial = Math.max(0, Math.min(600, v));
      settle();
      NB.add(S.nb, "voltage_change", { simTime: S.world.t,
        text: "Dial " + S.world.instrument.vDial.toFixed(1) + " V, displayed " +
              A.displayedVoltage(S.world).toFixed(1) + " V" });
      drawStage(); updateLive(); renderControls();
    },

    setFine: function (v) {
      S.world.instrument.vFine = Math.max(-5, Math.min(5, v));
      settle();
      drawStage(); updateLive(); renderControls();
    },

    setFocus: function (v) {
      S.world.instrument.focalPlane = v;
      drawStage(); updateLive();
    },

    ionise: function () {
      if (!guardCollecting()) return;
      const hits = A.ionisePulse(S.world, ctx(), 0.25);
      NB.add(S.nb, "ionisation_pulse", { simTime: S.world.t,
        text: "Pulse fired. " + hits.length + " visible droplet(s) changed charge." });
      toast("Ionisation pulse: " + hits.length + " droplet(s) affected.");
      renderDesk();
    },

    track: function () {
      if (!guardCollecting()) return;
      if (S.track) { stopTrack(); return; }
      const t = M.startTrack(S.world, ctx());
      if (t.error) { toast(t.error); return; }
      S.track = t;
      NB.add(S.nb, "track_start", { simTime: S.world.t, dropletId: t.dropletId,
        text: t.kind + " measurement opened" });
      renderControls(); renderMeasurePanel();
      ACC.announce(document, "Tracking started, " + t.kind + ".");
    },

    lockDataset: function () {
      if (S.store.derivedMeasurements.length < 2) {
        toast("At least two measurements are needed before locking."); return;
      }
      S.phase = "ANALYSIS";
      NB.add(S.nb, "dataset_locked", { simTime: S.world.t,
        text: S.store.derivedMeasurements.length + " measurements, " +
              S.store.accepted().length + " accepted, " +
              S.store.unresolved().length + " unresolved" });
      S.tab = "analysis";
      runAnalysis();
      renderAll();
    },

    lockAnalysis: function () {
      if (!S.analysis) { toast("Run the analysis first."); return; }
      const a = S.store.addAnalysis({
        methodName: "candidate-lattice + weighted regression",
        methodVersion: "1.0",
        inputMeasurementIds: S.analysis.ids,
        excludedIds: S.store.derivedMeasurements
          .filter(function (m) { return m.status !== "accepted" && m.status !== "accepted_caution"; })
          .map(function (m) { return m.measId; }),
        eHat: S.analysis.eHat, uRandom: S.analysis.uncertainty,
        uSystematic: S.analysis.budget ? S.analysis.budget.systematicRelative * S.analysis.eHat : null,
        ci: S.analysis.methodB.ok ? S.analysis.methodB.ci68 : null,
        ciLevel: 0.68,
        chi2: S.analysis.methodB.ok ? S.analysis.methodB.chi2 : null,
        dof: S.analysis.methodB.ok ? S.analysis.methodB.dof : null
      });
      S.store.lockAnalysis(a);
      S.phase = "LOCKED";
      NB.add(S.nb, "analysis_lock", { simTime: S.world.t,
        text: "Primary analysis locked. ê = " +
              U.formatWithUncertainty(S.analysis.eHat, S.analysis.uncertainty, "C") });
      renderAll();
      ACC.announce(document, "Analysis locked. The ground truth can now be revealed.");
    },

    reveal: function () {
      if (S.phase !== "LOCKED") { toast("Lock the analysis before revealing."); return; }
      S.store.truth.reveal();
      S.revealInfo = REP.reveal(S.store, S.analysis, U.SI.e, S.errors);
      S.phase = "REVEALED";
      NB.add(S.nb, "truth_reveal", { simTime: S.world.t,
        text: "Ground truth disclosed. All subsequent analysis is outcome-aware." });
      S.tab = "reveal";
      renderAll();
    }
  };

  function settle() {
    /* Instrument settling, not droplet inertia — the droplet is on its new
       terminal velocity within microseconds. docs/PHYSICS_MODEL.md §3.1 */
    S.world.instrument.settleUntil = S.world.t + 0.4;
  }

  /* ---- stopping a track and deriving ------------------------------- */

  function stopTrack() {
    const obs = M.stopTrack(S.track, S.world, ctx());
    S.store.addObservation(obs);
    NB.add(S.nb, "track_stop", { simTime: S.world.t, dropletId: obs.dropletId,
      text: obs.kind + ", " + obs.samples.length + " samples over " +
            (obs.tEnd - obs.tStart).toFixed(1) + " s" +
            (obs.flags.length ? " — flags: " + obs.flags.join(", ") : "") });
    S.track = null;

    if (obs.kind === "field-off") {
      S.pendingFall[obs.dropletId] = obs;
      toast("Fall observation stored. Apply the field and track again to obtain a charge.");
    } else {
      const fall = S.pendingFall[obs.dropletId];
      if (!fall) {
        toast("No field-off fall observation for " + obs.dropletId +
              ". A charge cannot be derived without one.");
      } else {
        deriveNow(fall, obs);
      }
    }
    renderControls(); renderMeasurePanel(); renderDesk();
  }

  function deriveNow(fallObs, fieldObs) {
    let d;
    try {
      d = M.derive(fallObs, fieldObs, S.cal,
        { slipModel: S.world.physics.slipModel, rhoOil: S.world.physics.rhoOil });
    } catch (e) { toast(e.message); return; }

    const relU = CAL.relativeUncertainties(S.cal);
    const mcStream = S.streams.get("mc:" + fallObs.obsId + fieldObs.obsId);
    const un = UN.propagate(d, relU, mcStream,
      { slipModel: S.world.physics.slipModel, rhoOil: S.world.physics.rhoOil });
    const q = M.quality(d, fallObs, fieldObs, S.world, un.uCharge);
    const fails = M.checkRules(q, S.rules);
    const meas = M.makeMeasurement(d, fallObs, fieldObs, q, fails, un,
      { estimateViewed: S.estimateViewed });
    meas.budget = UN.budget(d, { slipModel: S.world.physics.slipModel,
      rhoOil: S.world.physics.rhoOil }, relU);
    S.store.addMeasurement(meas);
    S.lastDerived = { derived: d, meas: meas };
    NB.add(S.nb, "measurement_derived", { simTime: S.world.t,
      dropletId: meas.dropletId, measId: meas.measId,
      text: "r = " + (meas.radius * 1e6).toFixed(3) + " µm, q = " +
            U.formatWithUncertainty(meas.charge, meas.uCharge, "C") +
            " (" + meas.regime + ")" });
    S.tab = "derived";
    ACC.announce(document, "Measurement " + meas.measId + " derived. A decision is required.");
  }

  function decide(measId, status, reason, note) {
    const m = S.store.getMeasurement(measId);
    if (!m) return;
    try {
      M.decide(m, status, reason, note, { estimateViewed: S.estimateViewed });
    } catch (e) { toast(e.message); return; }
    NB.add(S.nb, status === "rejected" ? "rejected" :
      status === "unresolved" ? "unresolved" :
      status === "accepted_caution" ? "accepted_caution" : "accepted", {
      simTime: S.world.t, dropletId: m.dropletId, measId: m.measId,
      text: (m.rejectionReason ? M.REASON_LABEL[m.rejectionReason] : "") +
            (note ? " — " + note : "") +
            (m.followedPreregRule ? "" : "  [DIVERGES FROM THE PREREGISTERED RULE]")
    });
    renderDesk(); renderMeasurePanel();
  }

  /* =================================================================
     ANALYSIS
     ============================================================== */

  function runAnalysis() {
    const acc = S.store.accepted();
    if (acc.length < 2) { S.analysis = null; return; }
    const r = AN.run(acc, {});
    if (!r.ok) { S.analysis = null; return; }

    const est = AN.estimator({});
    r.boot = UN.bootstrap(acc, est, S.streams.get("bootstrap"), 800);
    r.loo = UN.leaveOneOut(acc, est);
    r.assignmentFor = {};
    acc.forEach(function (m, i) { r.assignmentFor[m.measId] = r.methodA.assignments[i]; });

    /* budget: average the per-measurement budgets, which were computed
       by numerically perturbing this model */
    r.budget = averageBudget(acc);
    r.uSystematic = r.budget ? r.budget.systematicRelative * Math.abs(r.eHat) : null;
    r.uRandomTotal = r.boot.sd;

    /* estimates under the different selection policies, for §18 */
    const all = S.store.derivedMeasurements.filter(function (m) { return isFinite(m.charge); });
    r.policies = [
      { label: "All observations", n: all.length, e: safeEst(est, all) },
      { label: "Accepted (your decisions)", n: acc.length, e: r.eHat },
      { label: "Preregistered rules applied strictly",
        n: all.filter(passesRules).length, e: safeEst(est, all.filter(passesRules)) }
    ];
    r.methodName = "candidate-lattice + weighted regression";
    S.analysis = r;
    S.estimateViewed = true;
  }

  function passesRules(m) { return !m.ruleFails || m.ruleFails.length === 0; }
  function safeEst(est, arr) { return arr.length >= 2 ? est(arr) : NaN; }

  function averageBudget(items) {
    const withB = items.filter(function (m) { return m.budget; });
    if (!withB.length) return null;
    const keys = {};
    withB.forEach(function (m) {
      m.budget.rows.forEach(function (r) {
        if (!keys[r.key]) keys[r.key] = { key: r.key, label: r.label, kind: r.kind,
                                          elasticity: 0, relativeU: 0, contribution: 0, n: 0 };
        const k = keys[r.key];
        if (isFinite(r.elasticity)) k.elasticity += r.elasticity;
        k.relativeU += r.relativeU; k.contribution += r.contribution; k.n++;
      });
    });
    const rows = Object.keys(keys).map(function (k) {
      const o = keys[k];
      return { key: o.key, label: o.label, kind: o.kind,
               elasticity: o.elasticity / o.n, relativeU: o.relativeU / o.n,
               contribution: o.contribution / o.n, variancePct: 0 };
    });
    let sumSq = 0;
    rows.forEach(function (r) { sumSq += r.contribution * r.contribution; });
    rows.forEach(function (r) {
      r.variancePct = sumSq > 0 ? 100 * r.contribution * r.contribution / sumSq : 0;
    });
    rows.sort(function (a, b) { return b.contribution - a.contribution; });
    let ran = 0, sys = 0;
    rows.forEach(function (r) {
      const c2 = r.contribution * r.contribution;
      if (r.kind === "random") ran += c2; else sys += c2;
    });
    return { rows: rows, totalRelative: Math.sqrt(sumSq),
             randomRelative: Math.sqrt(ran), systematicRelative: Math.sqrt(sys),
             dominant: rows.length ? rows[0].label : "—" };
  }

  /* =================================================================
     EXPORT
     ============================================================== */

  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportBundle() {
    const files = REP.bundle(S.store, S.world, S.analysis, S.nb, S.streams, S.revealInfo);
    /* No zip library, so the bundle is delivered as one readable archive
       file with clear separators, plus the CSVs individually. */
    let combined = "";
    Object.keys(files).forEach(function (k) {
      combined += "\n\n===== FILE: " + k + " " +
        "=".repeat(Math.max(0, 60 - k.length)) + "\n\n" + files[k];
    });
    download("falling-charge-" + S.store.experiment.experimentId + "-bundle.txt", combined);
    toast("Bundle exported. Note: no PDF, chart images or checksums in this build.");
  }

  /* =================================================================
     RENDERING
     ============================================================== */

  function renderAll() { renderBench(); renderControls(); renderMeasurePanel(); renderDesk(); updateLive(); drawStage(); }

  function renderBench() {
    $("bbMode").textContent = S.mode.toUpperCase();
    $("bbSeed").textContent = S.seed;
    const rev = S.store && S.store.truth.isRevealed();
    $("bbBlind").textContent = rev ? "GROUND TRUTH DISCLOSED" : "BLIND — accepted value sealed";
    $("bbBlind").className = "fc-seal" + (rev ? " open" : "");
  }

  function renderControls() {
    const w = S.world; if (!w) return;
    $("vDial").value = w.instrument.vDial;
    $("vDialNum").value = w.instrument.vDial.toFixed(1);
    $("vFine").value = w.instrument.vFine;
    $("vFineNum").value = w.instrument.vFine.toFixed(1);
    $("focusSl").value = w.instrument.focalPlane;
    $("focusNum").value = (w.instrument.focalPlane * 1e6).toFixed(0);
    $("btnField").textContent = w.instrument.fieldOn ? "Field ON — switch off" : "Field OFF — switch on";
    $("btnField").setAttribute("aria-pressed", String(w.instrument.fieldOn));
    $("btnTrack").textContent = S.track ? "■ Stop track" : "▶ Start track";
    $("btnTrack").className = "fc-btn " + (S.track ? "warn" : "primary");
  }

  /* ---- the measurement panel, region B's text half ------------------ */
  function renderMeasurePanel() {
    const el = $("measPanel"); if (!el) return;
    const w = S.world;
    const sel = w.droplets.find(function (d) { return d.id === w.selectedId; });
    let h = "";

    if (S.track) {
      const fit = M.fitVelocity(S.track.samples);
      h += '<div class="fc-fit"><b>Tracking — ' + esc(S.track.kind) + '</b><br>' +
        S.track.samples.length + " samples, " +
        (w.t - S.track.tStart).toFixed(1) + " s elapsed<br>";
      if (fit.ok) {
        h += "v&#770; = " + (fit.slope * 1e6).toFixed(3) + " ± " + (fit.se * 1e6).toFixed(3) +
             " µm/s &nbsp; R² = " + fit.r2.toFixed(3) +
             "<br><span class='fc-dim'>quadratic t = " + fit.quadT.toFixed(2) + "</span>";
      } else { h += "<span class='fc-dim'>" + esc(fit.reason) + "</span>"; }
      h += "</div>";
    }

    /* Droplet suitability — observable facts only, no reference to the
       charge or to the estimate. docs/EXCLUSION_POLICY.md, spec §4. */
    if (sel && !S.track) {
      const su = M.suitability(sel, w);
      h += '<div class="fc-suit ' + su.level + '">' +
        '<b>' + (su.level === "good" ? "\u2713" : su.level === "marginal" ? "~" : "\u2715") +
        " " + esc(su.label) + "</b>";
      if (su.reasons.length) {
        h += "<ul>" + su.reasons.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
      }
      if (su.hints.length) {
        h += '<div class="fc-dim">' + su.hints.map(esc).join(" ") + "</div>";
      }
      h += '<div class="fc-dim" style="margin-top:4px">' + esc(su.note) + "</div></div>";
    }

    const pend = sel && S.pendingFall[sel.id];
    h += '<div class="fc-steps"><b>Procedure</b><ol>' +
      '<li class="' + (pend ? "done" : "now") + '">Field <b>off</b>, track the fall → radius</li>' +
      '<li class="' + (pend ? "now" : "wait") + '">Field <b>on</b>, track again → charge</li>' +
      '<li class="wait">Accept, reject with a reason, or leave unresolved</li>' +
      '</ol>' +
      (pend ? '<div class="fc-dim">Fall observation ' + esc(pend.obsId) +
              ' is held for ' + esc(sel.id) + '.</div>'
            : '<div class="fc-dim">A charge cannot be derived from a voltage alone. ' +
              'Both observations are required.</div>') +
      '</div>';

    el.innerHTML = h;
  }

  /* ---- region D: the desk ------------------------------------------ */

  const TABS = [
    ["notebook", "Notebook"], ["raw", "Raw"], ["derived", "Derived"],
    ["calibration", "Calibration"], ["qc", "Quality control"],
    ["analysis", "Analysis"], ["reveal", "Reveal"], ["methods", "Methods"]
  ];

  function renderDesk() {
    const nav = $("deskTabs");
    nav.innerHTML = TABS.map(function (t) {
      return '<button class="fc-tab' + (S.tab === t[0] ? " on" : "") +
        '" data-tab="' + t[0] + '" role="tab" aria-selected="' +
        (S.tab === t[0]) + '">' + t[1] + "</button>";
    }).join("");
    const body = $("deskBody");
    const fn = { notebook: tabNotebook, raw: tabRaw, derived: tabDerived,
                 calibration: tabCalibration, qc: tabQC, analysis: tabAnalysis,
                 reveal: tabReveal, methods: tabMethods }[S.tab];
    body.innerHTML = fn ? fn() : "";
    wireDesk();
  }

  function tabNotebook() {
    const rows = S.nb.entries.slice().reverse().slice(0, 200).map(function (e) {
      return '<tr><td class="mono">' + esc(e.entryId) + "</td><td class='mono'>" +
        (e.simTime === null ? "" : U.clock(e.simTime)) + "</td><td>" +
        esc(e.label) + "</td><td>" + esc(e.dropletId || "") + "</td><td>" +
        esc(e.text) + "</td></tr>";
    }).join("");
    return '<div class="fc-pane">' +
      '<div class="fc-row"><input id="noteIn" class="fc-in grow" ' +
      'placeholder="Add a note — an observation, a prediction, a concern" ' +
      'aria-label="Notebook note">' +
      '<button class="fc-btn" id="btnNote">Add note</button>' +
      '<button class="fc-btn" id="btnExportNb">Export notebook</button></div>' +
      '<p class="fc-dim">' + S.nb.entries.length + ' entries. Automatic entries record ' +
      'every voltage change, selection, ionisation pulse, charge jump, measurement ' +
      'and decision. Entries are append-only; a correction is a new entry.</p>' +
      '<div class="fc-tablewrap"><table class="fc-table"><thead><tr>' +
      "<th>id</th><th>sim time</th><th>event</th><th>droplet</th><th>detail</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></div>";
  }

  function tabRaw() {
    const rows = S.store.rawObservations.map(function (o) {
      return "<tr><td class='mono'>" + esc(o.obsId) + "</td><td class='mono'>" +
        esc(o.dropletId) + "</td><td>" + esc(o.kind) + "</td><td class='num'>" +
        o.tStart.toFixed(1) + "</td><td class='num'>" + (o.tEnd - o.tStart).toFixed(1) +
        "</td><td class='num'>" + o.samples.length + "</td><td class='num'>" +
        o.instrument.vDisplay.toFixed(1) + "</td><td class='num'>" +
        o.instrument.tempRead.toFixed(1) + "</td><td class='num'>" +
        (o.instrument.pressRead / 1000).toFixed(2) + "</td><td>" +
        esc(o.flags.join(" ")) + "</td></tr>";
    }).join("");
    return '<div class="fc-pane"><p class="fc-dim">Raw observations, exactly as recorded. ' +
      'Written once, never modified, never deleted — including for rejected ' +
      'measurements. Voltage and environment are <b>instrument readings</b>, not ' +
      'true values.</p>' +
      '<div class="fc-row"><button class="fc-btn" id="btnCsvRaw">Export raw CSV</button></div>' +
      '<div class="fc-tablewrap"><table class="fc-table"><thead><tr>' +
      "<th>obs</th><th>droplet</th><th>kind</th><th class='num'>t start / s</th>" +
      "<th class='num'>duration / s</th><th class='num'>samples</th>" +
      "<th class='num'>V display</th><th class='num'>T / K</th>" +
      "<th class='num'>p / kPa</th><th>flags</th></tr></thead><tbody>" +
      (rows || "<tr><td colspan='10' class='fc-dim'>No observations yet.</td></tr>") +
      "</tbody></table></div></div>";
  }

  const STATUS_GLYPH = { accepted: "✓", accepted_caution: "~", rejected: "✕",
                         unresolved: "?", candidate: "·" };

  function tabDerived() {
    const rev = S.store.truth.isRevealed();
    const rows = S.store.derivedMeasurements.map(function (m) {
      return "<tr class='" + (m.status === "rejected" ? "rej" : "") + "'>" +
        "<td class='mono'>" + esc(m.measId) + "</td>" +
        "<td class='mono'>" + esc(m.dropletId) + "</td>" +
        "<td>" + esc(m.regime) + "</td>" +
        "<td class='num'>" + (m.radius * 1e6).toFixed(3) + "</td>" +
        "<td class='num'>" + (isFinite(m.uRadius) ? (m.uRadius * 1e6).toFixed(3) : "—") + "</td>" +
        "<td class='num'>" + (m.charge * 1e19).toFixed(3) + "</td>" +
        "<td class='num'>" + (isFinite(m.uCharge) ? (m.uCharge * 1e19).toFixed(3) : "—") + "</td>" +
        "<td class='num'>" + m.environment.Cc.toFixed(4) + "</td>" +
        "<td class='num'>" + m.quality.duration.toFixed(1) + "</td>" +
        "<td>" + (STATUS_GLYPH[m.status] || "") + " " + esc(m.status) +
          (m.rejectionReason ? "<br><span class='fc-dim'>" +
            esc(M.REASON_LABEL[m.rejectionReason]) + "</span>" : "") + "</td>" +
        "</tr>";
    }).join("");

    let panel = "";
    if (S.lastDerived) panel = derivationPanel(S.lastDerived);

    return '<div class="fc-pane">' + panel +
      '<div class="fc-row"><button class="fc-btn" id="btnCsvDer">Export derived CSV</button>' +
      '<button class="fc-btn" id="btnBundle">Export full bundle</button></div>' +
      '<p class="fc-dim">Derived values are recomputable from the raw observations ' +
      'and the method version. Changing the method appends a new row; it never ' +
      'overwrites one. Rejected rows stay in the table.' +
      (rev ? "" : " True radius and charge are sealed until the reveal.") + '</p>' +
      '<div class="fc-tablewrap"><table class="fc-table"><thead><tr>' +
      "<th>meas</th><th>droplet</th><th>regime</th><th class='num'>r / µm</th>" +
      "<th class='num'>± r</th><th class='num'>q / 10⁻¹⁹ C</th><th class='num'>± q</th>" +
      "<th class='num'>C_c</th><th class='num'>dur / s</th><th>status</th>" +
      "</tr></thead><tbody>" +
      (rows || "<tr><td colspan='10' class='fc-dim'>No measurements yet.</td></tr>") +
      "</tbody></table></div></div>";
  }

  /** The panel that refuses to hand over a number without its working. */
  function derivationPanel(ld) {
    const d = ld.derived, m = ld.meas, e = d.environment;
    const undecided = m.status === "candidate";
    const opts = M.REJECTION_REASONS.map(function (r) {
      return '<option value="' + r + '">' + esc(M.REASON_LABEL[r]) + "</option>";
    }).join("");

    return '<div class="fc-derive">' +
      "<h3>" + esc(m.measId) + " — " + esc(m.dropletId) + " — " + esc(d.regime) + "</h3>" +

      '<div class="fc-eqgrid">' +
      '<div class="fc-eq"><div class="fc-eqh">Radius</div>' +
      '<code>' + esc(d.equations.radius) + "</code>" +
      "<div class='fc-sub'>v_f = " + (d.vFall * 1e6).toFixed(3) + " ± " +
        (d.seVFall * 1e6).toFixed(3) + " µm/s &nbsp;·&nbsp; η = " +
        e.eta.toExponential(4) + " Pa s &nbsp;·&nbsp; ρ_oil − ρ_air = " +
        (e.rhoOil - e.rhoAir).toFixed(2) + " kg/m³</div>" +
      "<div class='fc-val'>r = " + (m.radius * 1e6).toFixed(4) + " ± " +
        (isFinite(m.uRadius) ? (m.uRadius * 1e6).toFixed(4) : "—") + " µm</div>" +
      "<div class='fc-sub'>Stokes radius before slip: " + (d.rStokes * 1e6).toFixed(4) +
        " µm &nbsp;·&nbsp; C_c = " + e.Cc.toFixed(4) + " &nbsp;·&nbsp; Kn = " +
        e.Kn.toFixed(4) + "<br>solver: " + esc(d.solver.note) + ", " +
        d.solver.iterations + " iterations, residual " +
        d.solver.residual.toExponential(2) + ", " +
        (d.solver.converged ? "converged" : "<b>DID NOT CONVERGE</b>") + "</div></div>" +

      '<div class="fc-eq"><div class="fc-eqh">Charge</div>' +
      '<code>' + esc(d.equations.charge) + "</code>" +
      "<div class='fc-sub'>v_s = " + (d.vSigned * 1e6).toFixed(3) +
        " µm/s downward-positive &nbsp;·&nbsp; d = " + (e.d * 1000).toFixed(3) +
        " mm &nbsp;·&nbsp; V = " + e.V.toFixed(2) + " V</div>" +
      "<div class='fc-val'>q = " +
        esc(U.formatWithUncertainty(m.charge, m.uCharge, "C")) + "</div>" +
      "<div class='fc-sub'>relative uncertainty " +
        esc(U.relPct(m.charge, m.uCharge)) + ", 68 % — Monte Carlo over your " +
        "declared calibration uncertainties.<br>The velocity errors are " +
        "Brownian-aware: for a diffusing droplet the endpoints are a sufficient " +
        "statistic for the drift, so the error is &radic;(2D/T) and does not " +
        "improve with more samples. Ordinary least squares would have claimed " +
        "roughly a tenth of this.</div></div>" +
      "</div>" +

      '<details class="fc-assume"><summary>Assumptions in force</summary><ul>' +
      d.assumptions.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") +
      "</ul></details>" +

      (m.ruleFails.length
        ? '<div class="fc-flagbox"><b>Preregistered rules flag this measurement:</b> ' +
          m.ruleFails.map(function (f) { return esc(M.REASON_LABEL[f] || f); }).join("; ") +
          '. <span class="fc-dim">The rule does not decide. You do, and your ' +
          'decision is recorded together with whether it followed the rule.</span></div>'
        : '<div class="fc-flagbox ok">No preregistered rule flags this measurement.</div>') +

      (undecided
        ? '<div class="fc-decide"><b>Decision required</b>' +
          '<div class="fc-row">' +
          '<button class="fc-btn ok" data-decide="accepted" data-mid="' + m.measId + '">✓ Accept</button>' +
          '<button class="fc-btn" data-decide="accepted_caution" data-mid="' + m.measId + '">~ Accept with caution</button>' +
          '<button class="fc-btn" data-decide="unresolved" data-mid="' + m.measId + '">? Unresolved</button>' +
          "</div>" +
          '<div class="fc-row"><label class="fc-lab" for="rejReason">Reject, reason required</label>' +
          '<select id="rejReason" class="fc-in"><option value="">— choose a reason —</option>' +
          opts + "</select>" +
          '<input id="rejNote" class="fc-in grow" placeholder="Explanation (required for &quot;other&quot;)" aria-label="Rejection explanation">' +
          '<button class="fc-btn warn" data-decide="rejected" data-mid="' + m.measId + '">✕ Reject</button>' +
          "</div>" +
          '<p class="fc-dim">Nothing is deleted. A rejected measurement stays in ' +
          'the dataset, in the export, in the exclusion-sensitivity analysis, and ' +
          'in the reveal — where you will be shown whether it was in fact sound.</p>' +
          "</div>"
        : '<div class="fc-decide"><b>Decision:</b> ' + (STATUS_GLYPH[m.status] || "") +
          " " + esc(m.status) +
          (m.rejectionReason ? " — " + esc(M.REASON_LABEL[m.rejectionReason]) : "") +
          (m.followedPreregRule === false
            ? ' <span class="fc-warn">[diverges from the preregistered rule — recorded]</span>'
            : "") + "</div>") +
      "</div>";
  }

  function tabCalibration() {
    const rows = CAL.keys(S.cal).map(function (k) {
      const e = S.cal[k];
      return "<tr><td>" + esc(e.label) + "</td><td class='num'>" +
        (e.value === null ? "—" : (typeof e.value === "number" ? e.value.toPrecision(6) : e.value)) +
        "</td><td>" + esc(e.unit) + "</td><td class='num'>" +
        (e.uncertainty === null ? "<b>—</b>" : Number(e.uncertainty).toPrecision(3)) +
        "</td><td>" + esc(e.method || "—") + "</td><td>" + esc(e.source || "—") +
        "</td><td>" + esc(e.status) + "</td><td class='fc-dim'>" +
        esc(e.sensitivity || "") + "</td></tr>";
    }).join("");

    const complete = CAL.isComplete(S.cal);
    return '<div class="fc-pane">' +
      "<h3>Calibration record — version " + S.cal.version + "</h3>" +
      '<p class="fc-dim">Every entry needs a value, a unit, an <b>uncertainty</b>, a ' +
      'method and a status. An entry with no uncertainty is not a calibration and ' +
      'is refused. "Not yet calibrated" is an acceptable, recorded choice — the ' +
      'point is that it is a declared one, and it appears in the report.</p>' +
      '<div class="fc-row">' +
      '<button class="fc-btn" id="btnNameplate">Accept apparatus nameplate</button>' +
      '<button class="fc-btn" id="btnCalScale">Calibrate scale against micrometer</button>' +
      '<button class="fc-btn" id="btnCalVolt">Two-point voltage calibration</button>' +
      (S.phase === "CALIBRATION"
        ? '<button class="fc-btn primary" id="btnCalDone"' + (complete ? "" : " disabled") +
          ">Accept record and preregister →</button>" : "") +
      "</div>" +
      (complete ? "" : '<p class="fc-warn">Collection is blocked until every entry has a status.</p>') +
      '<div class="fc-tablewrap"><table class="fc-table"><thead><tr>' +
      "<th>quantity</th><th class='num'>value</th><th>unit</th><th class='num'>± (1σ)</th>" +
      "<th>method</th><th>source</th><th>status</th><th>why it matters</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></div>";
  }

  function tabQC() {
    const p = S.store.currentProtocol();
    const ruleRows = Object.keys(S.rules).map(function (k) {
      return "<tr><td>" + esc(k) + "</td><td class='num'>" + esc(S.rules[k]) + "</td></tr>";
    }).join("");

    const amendments = S.store.protocols.map(function (pr) {
      return "<tr><td class='num'>v" + pr.version + "</td><td>" + esc(pr.createdAt) +
        "</td><td class='num'>" + pr.measurementsAtTime + "</td><td>" +
        (pr.estimateViewedBefore ? "<b>yes</b>" : "no") + "</td><td>" +
        esc(pr.reason || "(initial registration)") + "</td></tr>";
    }).join("");

    const rej = S.store.rejected();
    const byReason = {};
    rej.forEach(function (m) { byReason[m.rejectionReason] = (byReason[m.rejectionReason] || 0) + 1; });
    const reasonRows = Object.keys(byReason).map(function (r) {
      return "<tr><td>" + esc(M.REASON_LABEL[r] || r) + "</td><td class='num'>" +
        byReason[r] + "</td></tr>";
    }).join("") || "<tr><td colspan='2' class='fc-dim'>No rejections.</td></tr>";

    return '<div class="fc-pane"><h3>Preregistered exclusion rules' +
      (p ? " — protocol v" + p.version : " — not yet registered") + "</h3>" +
      (S.phase === "PREREGISTER"
        ? '<p>Accept these rules, or edit them, before any data are collected. ' +
          'After collection begins, changing them creates a <b>protocol amendment</b> ' +
          'that preserves the previous rules and requires a written reason.</p>' +
          '<div class="fc-row"><button class="fc-btn primary" id="btnPrereg">' +
          "Preregister these rules and begin collecting →</button></div>"
        : '<div class="fc-row"><input id="amendReason" class="fc-in grow" ' +
          'placeholder="Reason for amending the rules (at least 20 characters)" ' +
          'aria-label="Amendment reason">' +
          '<button class="fc-btn warn" id="btnAmend">Amend protocol</button></div>') +
      '<div class="fc-tablewrap"><table class="fc-table"><thead><tr><th>rule</th>' +
      "<th class='num'>value</th></tr></thead><tbody>" + ruleRows + "</tbody></table></div>" +
      "<h3>Protocol history</h3>" +
      '<p class="fc-dim">Amendments are never erased. The column that matters is ' +
      'whether an intermediate estimate had been viewed before the change.</p>' +
      '<div class="fc-tablewrap"><table class="fc-table"><thead><tr><th>version</th>' +
      "<th>at</th><th class='num'>measurements</th><th>estimate seen first?</th><th>reason</th>" +
      "</tr></thead><tbody>" + (amendments || "<tr><td colspan='5' class='fc-dim'>None.</td></tr>") +
      "</tbody></table></div>" +
      "<h3>Rejections by reason</h3>" +
      '<div class="fc-tablewrap"><table class="fc-table"><thead><tr><th>reason</th>' +
      "<th class='num'>count</th></tr></thead><tbody>" + reasonRows + "</tbody></table></div></div>";
  }

  /* ---- analysis tab ------------------------------------------------- */

  function tabAnalysis() {
    const acc = S.store.accepted();
    if (S.phase === "COLLECTING" || S.phase === "PREREGISTER" || S.phase === "CALIBRATION") {
      return '<div class="fc-pane"><h3>Analysis</h3>' +
        "<p>" + acc.length + " accepted measurement" + (acc.length === 1 ? "" : "s") +
        " so far. Lock the dataset when you have enough.</p>" +
        '<p class="fc-dim">Locking is not reversible. Nothing is deleted by it; ' +
        'it fixes which measurements the primary analysis consumed.</p>' +
        '<div class="fc-row"><button class="fc-btn primary" id="btnLockData"' +
        (acc.length >= 2 ? "" : " disabled") + ">Lock dataset and analyse →</button></div>" +
        (acc.length >= 2
          ? '<p class="fc-warn">Viewing an estimate before locking is recorded, ' +
            'because it is the moment after which any exclusion becomes outcome-aware.</p>'
          : "") + "</div>";
    }

    if (!S.analysis) {
      return '<div class="fc-pane"><h3>Analysis</h3><p>At least two accepted ' +
        "measurements are required. There are " + acc.length + ".</p></div>";
    }

    const r = S.analysis, B = r.methodB, Aq = r.methodA;
    const eStr = U.formatWithUncertainty(r.eHat, r.uncertainty, "C");
    const sysStr = r.uSystematic
      ? U.formatWithUncertainty(r.eHat, r.uSystematic, "C") : null;

    let h = '<div class="fc-pane">';

    h += '<div class="fc-result"><div class="fc-resh">Primary estimate</div>' +
      '<div class="fc-resv">ê = ' + esc(eStr) + "</div>" +
      '<div class="fc-sub">random ' + esc(U.relPct(r.eHat, r.uncertainty)) +
      " at 68 % · systematic " +
      (r.budget ? (r.budget.systematicRelative * 100).toFixed(2) + " %" : "not computed") +
      " · dominant source: " + esc(r.budget ? r.budget.dominant : "—") + "</div>" +
      '<div class="fc-sub">bootstrap 68 % interval [' +
      (r.boot.lo * 1e19).toFixed(3) + ", " + (r.boot.hi * 1e19).toFixed(3) +
      "] × 10⁻¹⁹ C over " + r.boot.B + " resamples · reduced χ² = " +
      (B.ok ? B.chi2Reduced.toFixed(2) : "—") + " on " + (B.ok ? B.dof : "—") + " dof</div>" +
      '<p class="fc-warn">Random and systematic are reported separately and are ' +
      'not summed. Only the random part falls as more droplets are measured; ' +
      'the systematic part is the same instrument error on every droplet and ' +
      'no amount of data removes it.</p></div>';

    h += '<div class="fc-charts">' +
      chartBlock("chObj", "Candidate-lattice objective") +
      chartBlock("chQn", "Charge against assigned integer") +
      chartBlock("chLadder", "Quantisation ladder") +
      chartBlock("chDist", "Measured charges") +
      chartBlock("chResid", "Residuals") +
      chartBlock("chLoo", "Exclusion sensitivity") +
      chartBlock("chBudget", "Uncertainty budget") +
      "</div>";

    h += '<h3>Selection policies</h3>' +
      '<p class="fc-dim">The same estimator under different selection rules. ' +
      'No policy is marked correct. A policy that lands closer to any particular ' +
      'number is not thereby better — what matters is whether the rule was fixed ' +
      'in advance.</p>' +
      '<div class="fc-tablewrap"><table class="fc-table"><thead><tr><th>policy</th>' +
      "<th class='num'>n</th><th class='num'>ê / 10⁻¹⁹ C</th></tr></thead><tbody>" +
      r.policies.map(function (p) {
        return "<tr><td>" + esc(p.label) + "</td><td class='num'>" + p.n +
          "</td><td class='num'>" + (isFinite(p.e) ? (p.e * 1e19).toFixed(4) : "—") + "</td></tr>";
      }).join("") + "</tbody></table></div>";

    h += '<h3>Method notes</h3><div class="fc-notes"><p><b>' + esc(Aq.method) +
      "</b> — " + esc(Aq.note) + "</p><p><b>" + esc(B.method) + "</b> — " +
      esc(B.note) + "</p>" +
      "<p><b>Assignment stability.</b> " +
      r.stability.map(function (s) {
        return (s.shift * 100).toFixed(1) + " % shift moves " + s.changed + " assignment(s)";
      }).join("; ") + ".</p>" +
      '<p><b>Not implemented in this build:</b> ' + r.notImplemented.join("; ") +
      ". " + esc(MOD.STATUS.reason) + "</p></div>";

    if (S.phase === "ANALYSIS") {
      h += '<div class="fc-row"><button class="fc-btn primary" id="btnLockAn">' +
        "Lock this analysis →</button></div>" +
        '<p class="fc-dim">Locking freezes the primary result. Only then can the ' +
        'accepted value be revealed, and everything after that is labelled ' +
        'outcome-aware exploratory analysis.</p>';
    } else if (S.phase === "LOCKED") {
      h += '<div class="fc-row"><button class="fc-btn warn" id="btnReveal">' +
        "Reveal the accepted value →</button></div>" +
        '<p class="fc-dim">Irreversible.</p>';
    }

    return h + "</div>";
  }

  function chartBlock(id, title) {
    return '<figure class="fc-chart"><figcaption>' + esc(title) + "</figcaption>" +
      '<canvas id="' + id + '" role="img" aria-label="' + esc(title) + '"></canvas>' +
      '<p class="fc-sum" id="' + id + 'Sum"></p>' +
      '<details><summary>Data table</summary><div id="' + id + 'Tab"></div></details></figure>';
  }

  function drawCharts() {
    if (!S.analysis) return;
    const pal = palette(), r = S.analysis;
    const acc = S.store.accepted();

    paint("chObj", function (g, L) { return CH.objectiveCurve(g, L, pal, r.methodA); });
    paint("chQn", function (g, L) {
      return CH.chargeVsInteger(g, L, pal, r.charges, r.methodA.assignments, r.eHat); });
    paint("chLadder", function (g, L) {
      return CH.ladder(g, L, pal, r.charges, r.methodA.assignments, r.eHat); });
    paint("chDist", function (g, L) {
      return CH.chargeDistribution(g, L, pal, S.store.derivedMeasurements); });
    paint("chResid", function (g, L) {
      const xs = r.methodA.assignments.map(Math.abs);
      return CH.residuals(g, L, pal, xs, r.methodB.residuals, r.sigmas,
        "assigned integer |n|"); });
    paint("chLoo", function (g, L) {
      return CH.exclusionSensitivity(g, L, pal, r.loo, r.eHat); });
    paint("chBudget", function (g, L) {
      return CH.uncertaintyBudget(g, L, pal, r.budget); });
  }

  function paint(id, fn) {
    const cv = $(id); if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const wpx = cv.parentElement.getBoundingClientRect().width || 380;
    cv.width = Math.floor(wpx * dpr); cv.height = Math.floor(230 * dpr);
    cv.style.width = "100%"; cv.style.height = "230px";
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const out = fn(g, { x: 0, y: 0, w: wpx, h: 230 });
    const sum = $(id + "Sum");
    if (sum) sum.textContent = out.summary;
    cv.setAttribute("aria-label", out.summary);
    const tab = $(id + "Tab");
    if (tab && out.table && out.table.head.length) {
      tab.innerHTML = '<div class="fc-tablewrap"><table class="fc-table"><thead><tr>' +
        out.table.head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
        "</tr></thead><tbody>" +
        out.table.rows.slice(0, 400).map(function (row) {
          return "<tr>" + row.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
    }
  }

  /* ---- reveal tab --------------------------------------------------- */

  function tabReveal() {
    if (S.phase !== "REVEALED") {
      return '<div class="fc-pane"><h3>Ground truth</h3>' +
        '<div class="fc-sealed">The accepted value is sealed.</div>' +
        "<p>It becomes available only after the primary analysis is locked. " +
        "This is not a formality: an estimate produced while the answer was " +
        "visible is a different kind of evidence from one produced blind.</p>" +
        '<p class="fc-dim">Current phase: ' + esc(S.phase) + ". " +
        (S.phase === "LOCKED" ? "Use the Analysis tab to reveal."
          : "Lock the dataset, run the analysis, then lock the analysis.") + "</p></div>";
    }

    const R = S.revealInfo, r = S.analysis;
    const b = R.systematicBiases;

    const rows = R.measurements.map(function (x) {
      return "<tr class='" + (x.status === "rejected" ? "rej" : "") + "'>" +
        "<td class='mono'>" + esc(x.measId) + "</td><td class='mono'>" + esc(x.dropletId) +
        "</td><td>" + (STATUS_GLYPH[x.status] || "") + " " + esc(x.status) + "</td>" +
        "<td class='num'>" + (x.trueRadius * 1e6).toFixed(3) + "</td>" +
        "<td class='num'>" + (x.estRadius * 1e6).toFixed(3) + "</td>" +
        "<td class='num'>" + (x.radiusError * 100).toFixed(1) + "</td>" +
        "<td class='num'>" + x.trueN + "</td>" +
        "<td class='num'>" + (x.assignedN === null || x.assignedN === undefined ? "—" : x.assignedN) + "</td>" +
        "<td class='num'>" + (x.trueCharge * 1e19).toFixed(3) + "</td>" +
        "<td class='num'>" + (x.estCharge * 1e19).toFixed(3) + "</td>" +
        "<td class='num'>" + (x.chargeError * 100).toFixed(1) + "</td>" +
        "<td>" + (x.physicallySound === null ? "—" : x.physicallySound ? "sound" : "compromised") + "</td>" +
        "</tr>";
    }).join("");

    return '<div class="fc-pane">' +
      '<div class="fc-result reveal"><div class="fc-resh">Accepted value</div>' +
      '<div class="fc-resv">e = 1.602 176 634 × 10⁻¹⁹ C</div>' +
      '<div class="fc-sub">' + esc(R.acceptedValueNote) + "</div></div>" +

      '<div class="fc-cmp">' +
      cmp("Your estimate", U.formatWithUncertainty(R.estimate, r.uncertainty, "C")) +
      cmp("Absolute error", (R.absoluteError * 1e19).toFixed(4) + " × 10⁻¹⁹ C") +
      cmp("Relative error", (R.relativeError * 100).toFixed(2) + " %") +
      cmp("Inside your 68 % interval", R.insideInterval68 ? "yes" : "no") +
      cmp("Inside your 95 % interval", R.insideInterval95 ? "yes" : "no") +
      "</div>" +

      '<div class="fc-framing">' + esc(R.framing) + "</div>" +

      "<h3>What the apparatus was actually doing</h3>" +
      '<p class="fc-dim">These are the fixed instrument errors drawn at the start ' +
      'of the session. They were the same for every droplet, which is why more ' +
      'measurements could not average them away.</p>' +
      '<div class="fc-tablewrap"><table class="fc-table"><tbody>' +
      biasRow("Voltage gain error", (b.voltageGain * 100).toFixed(3) + " %") +
      biasRow("Voltage offset", b.voltageOffset.toFixed(3) + " V") +
      biasRow("Reticle scale error", (b.reticleScaleGain * 100).toFixed(3) + " %") +
      biasRow("Thermometer bias", b.temperatureBias.toFixed(3) + " K") +
      biasRow("Barometer bias", b.pressureBias.toFixed(1) + " Pa") +
      biasRow("Apparatus tilt", (b.tilt * 180 / Math.PI).toFixed(3) + "°") +
      biasRow("True plate separation", (b.plateGapTrue * 1000).toFixed(4) + " mm" +
        " (you used " + (S.cal.plateGap.value * 1000).toFixed(4) + " mm)") +
      "</tbody></table></div>" +

      "<h3>Your exclusions, against the truth</h3>" +
      '<p class="fc-dim">Rejected but physically sound: ' +
      (R.rejectedButSound.length ? esc(R.rejectedButSound.join(", ")) : "none") +
      ". Accepted but compromised: " +
      (R.acceptedButCompromised.length ? esc(R.acceptedButCompromised.join(", ")) : "none") +
      ". <b>Neither list is a score.</b> Excluding a sound measurement for a stated, " +
      "preregistered reason is good practice, not an error. " +
      R.evaluation.exclusionTransparency.madeAfterViewingEstimate +
      " of your rejections were made after an intermediate estimate had been " +
      "viewed; " + R.evaluation.exclusionTransparency.protocolAmendments +
      " protocol amendment(s) were made.</p>" +

      '<div class="fc-tablewrap"><table class="fc-table"><thead><tr>' +
      "<th>meas</th><th>droplet</th><th>your decision</th><th class='num'>true r / µm</th>" +
      "<th class='num'>est r / µm</th><th class='num'>r err %</th>" +
      "<th class='num'>true n</th><th class='num'>assigned n</th>" +
      "<th class='num'>true q</th><th class='num'>est q</th><th class='num'>q err %</th>" +
      "<th>observation</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +

      '<div class="fc-row"><button class="fc-btn" id="btnBundle2">Export full bundle</button>' +
      '<button class="fc-btn" id="btnSummary">Export session summary</button></div>' +
      '<p class="fc-warn">' + esc(REP.DISCLAIMER) + "</p></div>";
  }

  function cmp(k, v) {
    return '<div class="fc-cmpi"><div class="fc-cmpk">' + esc(k) +
      '</div><div class="fc-cmpv">' + esc(v) + "</div></div>";
  }
  function biasRow(k, v) {
    return "<tr><td>" + esc(k) + "</td><td class='num'>" + esc(v) + "</td></tr>";
  }

  function tabMethods() {
    return '<div class="fc-pane"><h3>Methods, in one screen</h3>' +
      '<div class="fc-notes">' +
      "<p><b>What is being recreated.</b> The experimental inference that " +
      "historically established charge quantisation. <b>Not</b> a measurement of " +
      "the modern SI constant: since 2019 the elementary charge is exact by " +
      "definition and no experiment measures it. The exact value is used here " +
      "only to generate the droplets, and it is sealed until you reveal it.</p>" +
      "<p><b>Forces.</b> Effective weight <code>W = (ρ_oil − ρ_air)(4/3)πr³g</code>, " +
      "electric <code>F = qE</code> with <code>E_y = −V/d</code>, drag " +
      "<code>6πηrv/C_c</code>. Upward-positive throughout: a positive droplet in " +
      "a positive field moves down.</p>" +
      "<p><b>Radius.</b> <code>r²C_c(r) = 9ηv_f / (2g(ρ_oil − ρ_air))</code>, solved " +
      "by bisection because C_c depends on r.</p>" +
      "<p><b>Charge.</b> <code>q = −6πηrd(v_f − v_s)/(C_c V)</code>, one expression " +
      "covering balance, slowed fall and terminal rise.</p>" +
      "<p><b>Slip correction.</b> <code>C_c = 1 + Kn(α + β e^(−γ/Kn))</code>, " +
      "Kn = λ/r, coefficients α=1.155 β=0.471 γ=0.596 from Allen &amp; Raabe's " +
      "re-evaluation of Millikan's own oil-drop data.</p>" +
      "<p><b>Brownian motion.</b> Overdamped diffusion, " +
      "<code>D = k_B T C_c/(6πηr)</code>, displacement <code>N(0, √(2Dh))</code>.</p>" +
      "<p><b>Inference.</b> The objective is <code>χ²(e) + 2N ln(Q/e)</code>. The " +
      "penalty is necessary: a finer lattice has more rungs to hide noise in, so " +
      "raw χ² is minimised by driving e toward zero. The penalty is the plug-in " +
      "marginal likelihood of the quantised model with a uniform prior over " +
      "integer states.</p>" +
      "<p><b>Velocity uncertainty.</b> Brownian residuals are a random walk, so " +
      "tracked positions are correlated and ordinary least squares understates " +
      "the velocity error by a factor of 13 to 50. The endpoints are a " +
      "sufficient statistic for the drift, so the instrument reports " +
      "<code>&radic;(2D/T)</code> with D estimated from the residual " +
      "increments. Adding samples does not help; observing for longer does, " +
      "as &radic;T.</p>" +
      "<p><b>Known limits.</b> Each droplet is measured through a single " +
      "transit, where Millikan reversed the field and averaged over many. That " +
      "caps per-measurement precision at roughly 5 to 10 per cent. The default " +
      "rejection thresholds were recalibrated after the uncertainty fix and are " +
      "still <i>not yet calibrated</i> against anything external.</p>" +
      "<p><b>Not implemented.</b> Model comparison, batch mode, robust and " +
      "likelihood estimators, pairwise charge-step analysis, PDF reports, " +
      "checksums, evaporation, edge fields.</p>" +
      '<p>Full detail: <a href="methods.html">methods page</a> · ' +
      '<a href="docs/PHYSICS_MODEL.md">physics model</a> · ' +
      '<a href="docs/LIMITATIONS.md">limitations</a> · ' +
      '<a href="docs/REFERENCES.md">references</a></p>' +
      "</div></div>";
  }

  /* =================================================================
     WIRING
     ============================================================== */

  function wireDesk() {
    document.querySelectorAll("#deskTabs .fc-tab").forEach(function (b) {
      b.onclick = function () { S.tab = b.dataset.tab; renderDesk(); };
    });
    document.querySelectorAll("[data-decide]").forEach(function (b) {
      b.onclick = function () {
        const st = b.dataset.decide;
        const reason = $("rejReason") ? $("rejReason").value : "";
        const note = $("rejNote") ? $("rejNote").value : "";
        decide(b.dataset.mid, st, reason || null, note);
      };
    });
    on("btnNote", function () {
      const v = $("noteIn").value.trim();
      if (!v) return;
      NB.note(S.nb, v, { simTime: S.world.t, dropletId: S.world.selectedId });
      $("noteIn").value = ""; renderDesk();
    });
    on("btnExportNb", function () {
      download("notebook-" + S.store.experiment.experimentId + ".json", NB.toJSON(S.nb), "application/json");
    });
    on("btnCsvRaw", function () {
      download("raw_observations.csv", REP.rawObservationsCsv(S.store), "text/csv");
    });
    on("btnCsvDer", function () {
      download("derived_measurements.csv", REP.derivedCsv(S.store, S.store.truth.isRevealed()), "text/csv");
    });
    on("btnBundle", exportBundle);
    on("btnBundle2", exportBundle);
    on("btnSummary", function () {
      download("summary.json",
        JSON.stringify(REP.summary(S.store, S.world, S.analysis, S.revealInfo), null, 2),
        "application/json");
    });

    on("btnNameplate", function () {
      CAL.acceptNameplate(S.cal, S.world);
      NB.add(S.nb, "calibration_update", { simTime: S.world.t,
        text: "Apparatus nameplate accepted without independent check " +
              "(recorded as 'not yet calibrated')" });
      renderDesk();
    });
    on("btnCalScale", function () {
      CAL.calibrateScale(S.cal, S.world, S.errors,
        { divisions: 10, micrometerUncertainty: 0.002, readingUncertainty: 0.004 });
      NB.add(S.nb, "calibration_update", { simTime: S.world.t,
        text: "Microscope scale calibrated against the stage micrometer" });
      renderDesk();
    });
    on("btnCalVolt", function () {
      CAL.calibrateVoltage(S.cal, S.world, S.errors, { referenceUncertainty: 0.001 });
      NB.add(S.nb, "calibration_update", { simTime: S.world.t,
        text: "Two-point voltage calibration performed" });
      renderDesk();
    });
    on("btnCalDone", function () {
      S.store.addCalibration(S.cal);
      S.phase = "PREREGISTER"; S.tab = "qc";
      renderAll();
    });
    on("btnPrereg", function () {
      S.store.addProtocol(S.rules, null, { estimateViewed: S.estimateViewed });
      NB.add(S.nb, "preregistration", { simTime: S.world.t,
        text: "Exclusion rules registered as protocol v1" });
      S.phase = "COLLECTING"; S.tab = "notebook";
      renderAll();
      toast("Rules registered. Spray droplets to begin.");
    });
    on("btnAmend", function () {
      const reason = $("amendReason").value;
      try {
        S.store.addProtocol(S.rules, reason, { estimateViewed: S.estimateViewed });
      } catch (e) { toast(e.message); return; }
      NB.add(S.nb, "protocol_amendment", { simTime: S.world.t, text: reason });
      renderDesk();
    });

    on("btnLockData", act.lockDataset);
    on("btnLockAn", act.lockAnalysis);
    on("btnReveal", act.reveal);

    if (S.tab === "analysis" && S.analysis) setTimeout(drawCharts, 0);
  }

  function on(id, fn) { const e = $(id); if (e) e.onclick = fn; }

  function wireControls() {
    on("btnAtomise", act.atomise);
    on("btnPrev", function () { act.selectNext(-1); });
    on("btnNext", function () { act.selectNext(1); });
    on("btnField", act.fieldToggle);
    on("btnPol", act.polarity);
    on("btnIonise", act.ionise);
    on("btnTrack", act.track);
    on("btnReset", function () {
      if (confirm("Reset the apparatus? Droplets are cleared. Data are kept.")) {
        S.world.droplets = []; S.world.selectedId = null; S.track = null;
        drawStage(); updateLive();
      }
    });

    bindPair("vDial", "vDialNum", function (v) { act.setVoltage(v); });
    bindPair("vFine", "vFineNum", function (v) { act.setFine(v); });
    const fs = $("focusSl"), fn = $("focusNum");
    if (fs) fs.oninput = function () {
      act.setFocus(Number(fs.value)); fn.value = (Number(fs.value) * 1e6).toFixed(0);
    };
    if (fn) fn.onchange = function () {
      const v = Number(fn.value) * 1e-6; fs.value = v; act.setFocus(v);
    };

    const sp = $("speedSel");
    if (sp) sp.onchange = function () { S.speed = Number(sp.value); };
    on("btnPause", function () {
      S.paused = !S.paused;
      $("btnPause").textContent = S.paused ? "▶ Resume" : "❚❚ Pause";
      $("btnPause").setAttribute("aria-pressed", String(S.paused));
    });

    on("btnMotion", function () {
      ACC.setReducedMotion(!ACC.state.reducedMotion, document);
      $("btnMotion").setAttribute("aria-pressed", String(ACC.state.reducedMotion));
    });
    on("btnContrast", function () {
      ACC.setHighContrast(!ACC.state.highContrast, document);
      $("btnContrast").setAttribute("aria-pressed", String(ACC.state.highContrast));
    });
    const ts = $("textScale");
    if (ts) ts.onchange = function () { ACC.setTextScale(Number(ts.value), document); };

    const cv = $("chamberCv");
    if (cv) cv.onclick = function (ev) {
      const rect = cv.getBoundingClientRect();
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      let bestId = null, bestD = 22;
      S.world.droplets.forEach(function (d) {
        if (!d.visible) return;
        const p = A.toScreen(S.world, { x: 0, y: 0, w: rect.width, h: rect.height }, d.x, d.y);
        const dist = Math.hypot(p[0] - mx, p[1] - my);
        if (dist < bestD) { bestD = dist; bestId = d.id; }
      });
      if (bestId) {
        S.world.selectedId = bestId;
        NB.add(S.nb, "droplet_selected", { simTime: S.world.t, dropletId: bestId });
        drawStage(); updateLive(); renderMeasurePanel();
      }
    };
  }

  function bindPair(slId, numId, fn) {
    const sl = $(slId), nu = $(numId);
    if (sl) sl.oninput = function () { fn(Number(sl.value)); };
    if (nu) nu.onchange = function () { fn(Number(nu.value)); };
  }

  function keys(ev) {
    if (!S.world || S.phase === "SETUP") return;
    const tag = (ev.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    const k = ev.key;
    if (k === " ") { ev.preventDefault(); $("btnPause").click(); return; }
    const map = {
      "a": act.atomise, "A": act.atomise,
      "f": act.fieldToggle, "F": act.fieldToggle,
      "p": act.polarity, "P": act.polarity,
      "t": act.track, "T": act.track,
      "i": act.ionise, "I": act.ionise,
      "n": function () { act.selectNext(-1); }, "m": function () { act.selectNext(1); },
      "[": function () { act.setVoltage(S.world.instrument.vDial - 5); },
      "]": function () { act.setVoltage(S.world.instrument.vDial + 5); },
      ",": function () { act.setFine(S.world.instrument.vFine - 0.1); },
      ".": function () { act.setFine(S.world.instrument.vFine + 0.1); }
    };
    if (map[k]) { ev.preventDefault(); map[k](); return; }
    if (k >= "1" && k <= "4") {
      S.speed = [1, 2, 5, 10][Number(k) - 1];
      $("speedSel").value = S.speed;
    }
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(function () { t.classList.remove("on"); }, 4200);
    ACC.announce(document, msg);
  }

  /* =================================================================
     BOOT
     ============================================================== */

  function boot() {
    ACC.init(document);
    $("btnStart").onclick = function () {
      startSession({
        mode: $("modeSel").value,
        profile: $("profSel").value,
        seed: $("seedIn").value.trim() || "millikan-1913",
        slipModel: $("slipSel").value
      });
    };
    $("btnSeedRnd").onclick = function () {
      $("seedIn").value = Math.random().toString(36).slice(2, 10);
    };
    wireControls();
    document.addEventListener("keydown", keys);
    window.addEventListener("resize", function () {
      sizeCanvases();
      if (S.tab === "analysis" && S.analysis) drawCharts();
    });
    $("modeSel").onchange = function () {
      const m = $("modeSel").value;
      $("modeNote").textContent = {
        blind: "The preferred scientific mode. The accepted value is sealed until you lock your analysis.",
        guided: "Same physics and the same noise. Extra procedural guidance; nothing is corrected for you.",
        historical: "Period-inspired: coarse voltage, a needle meter, observer reaction time. NOT a reconstruction — the 1913 apparatus parameters are not sourced.",
        modern: "Digital gates, calibrated display, automated tracking, tighter tolerances."
      }[m] || "";
      $("profSel").value = { historical: "historical", modern: "modern",
                             guided: "teaching", blind: "modern" }[m] || "modern";
    };
  }

  /* ------------------------------------------------------------------
     TEST HOOKS.

     tests/test-boot.js drives the interface in a DOM stub, where there is
     no requestAnimationFrame and no real event dispatch. `advanceForTest`
     runs EXACTLY the body of the frame loop, so the test exercises the
     same stepping and sampling path the browser does rather than a
     parallel reimplementation of it — a test that reimplements the thing
     it is testing proves nothing.

     Nothing in the interface calls any of these. */
  function advanceForTest(seconds) {
    const c = ctx();
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) {
      A.step(S.world, DT, c);
      if (S.track) M.sample(S.track, S.world, c);
    }
    drawStage();
    updateLive();
  }

  root.FCApp = {
    boot: boot, state: S,
    renderDesk: renderDesk, renderAll: renderAll,
    advanceForTest: advanceForTest,
    decideForTest: decide
  };

})(typeof globalThis !== "undefined" ? globalThis : this);
