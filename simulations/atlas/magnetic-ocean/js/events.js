"use strict";
/* =====================================================================
   THE MAGNETIC OCEAN — events.js

   All input handling, by delegation from the document, so that rebuilding
   a panel never leaves a dead control behind.

   Everything the mouse can do, the keyboard can do. The profile cursor
   moves with the arrow keys once the chart has focus, the exact value at
   the cursor is written into the readout as text rather than only into a
   tooltip, and the commit dialogue is an ordinary form.
   ===================================================================== */

var Events = (function () {

  function $(id) { return document.getElementById(id); }

  function wire() {
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKey);

    var prof = $("profCv");
    prof.addEventListener("pointermove", onProfileMove);
    prof.addEventListener("pointerdown", onProfileMove);
    prof.addEventListener("pointerleave", function () {
      App.S.hoverIndex = null; Screens.drawScopes(); Screens.updateLiveReadout();
    });
    prof.addEventListener("keydown", onProfileKey);
    prof.addEventListener("focus", function () {
      if (App.S.hoverIndex === null) {
        var tr = App.S.active || App.S.transects[App.S.viewTransect];
        App.S.hoverIndex = tr ? Math.floor(tr.n / 2) : null;
        Screens.drawScopes(); Screens.updateLiveReadout();
      }
    });

    $("veil").addEventListener("click", function (e) {
      if (e.target === $("veil")) Screens.closeModal();
    });
  }

  /* ---------------- clicks ---------------------------------------- */
  function onClick(e) {
    if (!e.target || !e.target.closest) return;
    var t = e.target.closest("[data-launch],[data-act],[data-view],[data-adopt]");
    if (!t) return;

    if (t.dataset.launch) { App.launch(t.dataset.launch); return; }
    if (t.dataset.view !== undefined && t.dataset.view !== "") {
      App.S.viewTransect = +t.dataset.view;
      App.S.hoverIndex = null;
      Screens.renderInspector(); Screens.drawScopes();
      return;
    }
    if (t.dataset.adopt !== undefined && t.dataset.adopt !== "") {
      var c = App.S.candidates[+t.dataset.adopt];
      if (c && c.fitted && c.fitted.axisKm !== undefined) {
        App.S.wb.axisKm = Math.round(c.fitted.axisKm * 100) / 100;
        App.S.wb.rateL = Math.round(c.fitted.halfRateLeftCmYr * 1000) / 1000;
        App.S.wb.rateR = Math.round(c.fitted.halfRateRightCmYr * 1000) / 1000;
        App.S.wb.symmetric = (c.key === "symmetric");
        App.updateFit();
        Screens.renderRail(); Screens.renderInspector(); Screens.drawScopes();
        Screens.toast("Adopted the numbers from " + c.label.toLowerCase() + ".", "ok");
      }
      return;
    }

    var a = t.dataset.act;
    if (!a) return;
    if (t.tagName === "BUTTON") e.preventDefault();

    switch (a) {
      case "begin":       App.beginSurvey(); break;
      case "pause":
        if (!App.S.active) break;
        App.S.running = !App.S.running;
        Screens.renderTop();
        Screens.say(App.S.running ? "Survey resumed." : "Survey paused.");
        break;
      case "step":        App.stepOnce(); break;
      case "restart":     App.resetRun(true); Screens.renderAll(); Screens.toast("Restarted on seed " + App.S.seed + ". The same seafloor, the same noise.", "ok"); break;
      case "newseed":     App.resetRun(false); Screens.renderAll(); Screens.toast("New seed " + App.S.seed + ".", "ok"); break;
      case "resetctl":    resetControls(); break;
      case "export":      App.exportObservations(); break;
      case "commit":      Screens.showCommit(); break;
      case "docommit":    doCommit(); break;
      case "report":      Screens.showReport(); break;
      case "guide":       Screens.showGuide(); break;
      case "guidenext":   Screens.showGuide(App.S.guidedStep + 1); break;
      case "guideprev":   Screens.showGuide(App.S.guidedStep - 1); break;
      case "explain1":    Screens.showExplain(1); break;
      case "explain2":    Screens.showExplain(2); break;
      case "closemodal":  Screens.closeModal(); break;
      case "fitsym":      App.startFit(false); Screens.say("Fitting a symmetric model."); break;
      case "fitasym":     App.startFit(true); Screens.say("Fitting an asymmetric model."); break;
      case "compare":     App.startComparison(); Screens.say("Scoring four candidate explanations."); break;
      case "home":        document.body.classList.remove("launched"); window.scrollTo(0, 0); break;
    }
  }

  /* ---------------- sliders and numbers --------------------------- */
  function onInput(e) {
    var el = e.target;

    if (el.dataset.ctl) {
      var key = el.dataset.ctl;
      App.S.survey[key] = parseFloat(el.value);
      var v = $("v_" + key);
      if (v) v.textContent = Screens.fmtCtl(key, App.S.survey[key]);
      App.recomputeViews();
      if (key === "noiseNt") App.S.noiseBand = App.S.survey.noiseNt;
      Screens.renderTop();
      Screens.drawScopes();
      clearTimeout(el._t);
      el._t = setTimeout(function () { Screens.renderRail(); }, 260);
      return;
    }

    if (el.dataset.wb) {
      var k = el.dataset.wb;
      if (k === "axisKm") { App.S.wb.axisKm = parseFloat(el.value); setV("v_w_axis", App.S.wb.axisKm.toFixed(2) + " km"); }
      if (k === "rateL")  { App.S.wb.rateL = parseFloat(el.value);  setV("v_w_rl", App.S.wb.rateL.toFixed(2) + " cm/yr"); }
      if (k === "rateR")  { App.S.wb.rateR = parseFloat(el.value);  setV("v_w_rr", App.S.wb.rateR.toFixed(2) + " cm/yr"); }
      App.updateFit();
      Screens.drawScopes();
      clearTimeout(el._t);
      el._t = setTimeout(function () { Screens.renderInspector(); }, 200);
      return;
    }

    if (el.dataset.lab) {
      var lk = el.dataset.lab;
      App.S.survey[lk] = parseFloat(el.value);
      App.S.worldSpec[lk] = parseFloat(el.value);
      App.S.world = MagOcean.makeWorld(App.S.worldSpec);
      setV("v_L_" + lk, parseFloat(el.value).toFixed(CONTROLS[lk].step < 1 ? 1 : 0) + " " + CONTROLS[lk].unit);
      /* the laboratory rebuilds any line already run, because the world
         it was collected over has just changed underneath it */
      if (App.S.transects.length) {
        for (var i = 0; i < App.S.transects.length; i++) {
          App.S.transects[i] = MagOcean.runTransect(App.S.world, App.S.transects[i].survey, App.S.seed, i);
        }
        App.updateFit();
      }
      App.recomputeViews();
      Screens.drawScopes();
      clearTimeout(el._t);
      el._t = setTimeout(function () { Screens.renderInspector(); }, 200);
      return;
    }
  }

  function setV(id, text) { var e = $(id); if (e) e.textContent = text; }

  function onChange(e) {
    var el = e.target;
    if (el.dataset.act === "mode") { App.launch(el.value); return; }
    if (el.dataset.act === "preset") { App.applyPreset(el.value); Screens.renderAll(); return; }
    if (el.dataset.act === "seed") {
      var s = parseInt(el.value, 10);
      if (isFinite(s) && s > 0) { App.S.seed = s >>> 0; App.resetRun(true); Screens.renderAll(); }
      return;
    }
    if (el.dataset.act === "sounder") {
      App.S.sounded = el.value === "on";
      Screens.renderRail(); Screens.drawScopes();
      return;
    }
    if (el.dataset.wb === "symmetric") {
      App.S.wb.symmetric = el.value === "1";
      if (App.S.wb.symmetric) App.S.wb.rateR = App.S.wb.rateL;
      App.updateFit();
      Screens.renderRail(); Screens.renderInspector(); Screens.drawScopes();
      return;
    }
    if (el.dataset.wb === "chronology") {
      App.S.wb.chronology = el.value;
      App.updateFit();
      Screens.renderRail(); Screens.renderInspector(); Screens.drawScopes();
      return;
    }
  }

  /* Read the commitment form and hand it to the model. Nothing here
     defaults to the workbench values silently: the form was pre-filled
     from them, and whatever the operator left in the boxes is what gets
     recorded. */
  function doCommit() {
    var axis = parseFloat($("cm_axis").value);
    var rl = parseFloat($("cm_rl").value);
    var rr = parseFloat($("cm_rr").value);
    var symRaw = $("cm_sym").value;
    if (!isFinite(axis) || !isFinite(rl) || !isFinite(rr) || rl <= 0 || rr <= 0) {
      Screens.toast("An axis position and two positive half rates are needed before this can be committed.", "bad");
      return;
    }
    var claim = {
      axisKm: axis,
      halfRateLeftCmYr: rl,
      halfRateRightCmYr: rr,
      symmetric: symRaw === "1" ? true : (symRaw === "0" ? false : -1),
      chronology: $("cm_chron").value,
      model: $("cm_model").value,
      confidence: parseInt($("cm_conf").value, 10),
      rationale: $("cm_why").value.slice(0, 600)
    };
    Screens.closeModal();
    App.commit(claim);
  }

  function resetControls() {
    var d = controlDefaults();
    for (var k in d) if (CONTROLS[k] && !CONTROLS[k].hidden) App.S.survey[k] = d[k];
    App.recomputeViews();
    Screens.renderAll();
    Screens.toast("Survey controls returned to their defaults. The hidden world is unchanged.", "ok");
  }

  /* ---------------- the profile cursor ---------------------------- */
  function indexFromX(px) {
    var S = App.S;
    var tr = S.active || S.transects[S.viewTransect];
    if (!tr) return null;
    var cv = $("profCv");
    var w = cv.clientWidth, padL = 46, padR = 12;
    var frac = (px - padL) / (w - padL - padR);
    frac = Math.max(0, Math.min(1, frac));
    var upto = S.active ? Math.max(1, Math.floor(S.cursor) + 1) : tr.n;
    return Math.min(upto - 1, Math.round(frac * (tr.n - 1)));
  }

  function onProfileMove(e) {
    var r = e.currentTarget.getBoundingClientRect();
    App.S.hoverIndex = indexFromX(e.clientX - r.left);
    Screens.drawScopes();
    Screens.updateLiveReadout();
  }

  function onProfileKey(e) {
    var S = App.S;
    var tr = S.active || S.transects[S.viewTransect];
    if (!tr) return;
    var step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") { S.hoverIndex = Math.max(0, (S.hoverIndex || 0) - step); }
    else if (e.key === "ArrowRight") { S.hoverIndex = Math.min(tr.n - 1, (S.hoverIndex || 0) + step); }
    else if (e.key === "Home") { S.hoverIndex = 0; }
    else if (e.key === "End") { S.hoverIndex = tr.n - 1; }
    else return;
    e.preventDefault();
    Screens.drawScopes();
    Screens.updateLiveReadout();
    Screens.say(Screens.cursorText());
  }

  /* ---------------- page keyboard --------------------------------- */
  function onKey(e) {
    if (e.key === "Escape" && $("veil").classList.contains("on")) { Screens.closeModal(); return; }
    var el = document.activeElement;
    if (el && /^(input|textarea|select)$/i.test(el.tagName)) return;
    if (el && el.id === "profCv") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!document.body.classList.contains("launched")) return;

    if (e.key === " ") {
      e.preventDefault();
      if (App.S.active) { App.S.running = !App.S.running; Screens.renderTop(); }
      else App.beginSurvey();
      return;
    }
    if (e.key === "s" || e.key === "S") { App.stepOnce(); return; }
    if (e.key === "r" || e.key === "R") { App.resetRun(true); Screens.renderAll(); return; }
    if (e.key === "n" || e.key === "N") { App.resetRun(false); Screens.renderAll(); return; }
    if (e.key === "e" || e.key === "E") { App.exportObservations(); return; }
    if (e.key === "?") { Screens.showExplain(1); return; }
  }

  return { wire: wire };
})();
