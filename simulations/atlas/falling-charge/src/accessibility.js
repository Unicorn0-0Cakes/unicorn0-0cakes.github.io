/* =====================================================================
   THE FALLING CHARGE — accessibility helpers
   ---------------------------------------------------------------------
   docs/ACCESSIBILITY.md. Note the honest gap recorded there: none of this
   has been tested with real assistive technology.
   ===================================================================== */
(function (root) {
  "use strict";
  const isNode = (typeof module !== "undefined" && module.exports);

  const state = { reducedMotion: false, highContrast: false, textScale: 1 };

  function init(doc) {
    if (!doc || !doc.documentElement) return state;
    try {
      state.reducedMotion = !!(root.matchMedia &&
        root.matchMedia("(prefers-reduced-motion: reduce)").matches);
      state.highContrast = !!(root.matchMedia &&
        root.matchMedia("(prefers-contrast: more)").matches);
    } catch (e) {}
    apply(doc);
    return state;
  }

  function apply(doc) {
    const el = doc.documentElement;
    el.classList.toggle("fc-reduced-motion", state.reducedMotion);
    el.classList.toggle("fc-high-contrast", state.highContrast);
    el.style.setProperty("--fc-text-scale", String(state.textScale));
  }

  function setReducedMotion(v, doc) { state.reducedMotion = !!v; apply(doc); }
  function setHighContrast(v, doc) { state.highContrast = !!v; apply(doc); }
  function setTextScale(v, doc) {
    state.textScale = Math.min(1.4, Math.max(0.85, Number(v) || 1));
    apply(doc);
  }

  /** Announce to screen readers without stealing focus. */
  function announce(doc, msg) {
    const live = doc.getElementById("fcLive");
    if (!live) return;
    live.textContent = "";
    root.setTimeout(function () { live.textContent = msg; }, 30);
  }

  /**
   * The chamber's alt text, regenerated as the state changes. A user who
   * cannot see the canvas can still run the experiment from this plus the
   * numeric readout.
   */
  function chamberLabel(world, A) {
    const vis = world.droplets.filter(function (d) { return d.visible; }).length;
    const sel = world.droplets.find(function (d) { return d.id === world.selectedId; });
    const V = A.displayedVoltage(world);
    let s = "Observation chamber. " + vis + " droplet" + (vis === 1 ? "" : "s") + " visible. ";
    if (sel) {
      const mm = (sel.y * 1000).toFixed(2);
      const v = sel.vy * 1e6;
      const dir = Math.abs(v) < 0.5 ? "approximately stationary"
                : (v > 0 ? "rising at " + v.toFixed(1) : "falling at " + (-v).toFixed(1)) +
                  " micrometres per second";
      s += "Selected droplet " + sel.id + ", " + mm + " millimetres above the lower plate, " +
           dir + ". Focus quality " + Math.round(sel.focus * 100) + " per cent. ";
    } else {
      s += "No droplet selected. ";
    }
    s += world.instrument.fieldOn
      ? "Field on, " + V.toFixed(1) + " volts, upper plate " +
        (world.instrument.polarity > 0 ? "positive" : "negative") + "."
      : "Field off.";
    return s;
  }

  const API = { state: state, init: init, apply: apply,
                setReducedMotion: setReducedMotion, setHighContrast: setHighContrast,
                setTextScale: setTextScale, announce: announce,
                chamberLabel: chamberLabel };
  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.accessibility = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
