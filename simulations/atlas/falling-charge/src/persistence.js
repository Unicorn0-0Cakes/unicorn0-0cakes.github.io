/* =====================================================================
   THE FALLING CHARGE — storage, immutability, and the truth vault
   ---------------------------------------------------------------------
   Two jobs, both safeguards rather than conveniences.

   1. THE TRUTH VAULT. Hidden ground truth lives in a closure-scoped Map.
      Reading it before the reveal throws. Every read is logged with the
      reason that was given for it. docs/ARCHITECTURE.md §4.

   2. NO DELETE PATH. Raw observations and measurements can be added and
      their DECISION can change, but nothing can be removed. There is no
      remove() in this file. docs/EXCLUSION_POLICY.md §4.

   Persistence is currently in-memory with a localStorage snapshot.
   IndexedDB is specified but NOT implemented — docs/LIMITATIONS.md L-8.
   ===================================================================== */
(function (root) {
  "use strict";
  const isNode = (typeof module !== "undefined" && module.exports);

  const KEY = "falling-charge-session";

  function createStore(experiment) {
    /* ---- the vault. Nothing outside this closure holds the Map. ---- */
    const vault = new Map();
    const readLog = [];
    let revealed = false;

    const truth = {
      set: function (id, obj) { vault.set(id, obj); },
      /** Present only so the forward model can evolve truth. Not a read. */
      mutable: function (id) { return vault.get(id); },
      has: function (id) { return vault.has(id); },
      size: function () { return vault.size; },
      /**
       * The ONLY way to read ground truth for display. Throws before the
       * reveal, and logs every successful read.
       */
      read: function (id, reason) {
        if (!revealed) {
          throw new Error(
            "Ground truth is sealed until the analysis is locked and the " +
            "reveal is performed. Attempted read of '" + id +
            "' for reason: " + (reason || "(none given)"));
        }
        readLog.push({ at: new Date().toISOString(), id: id, reason: reason || "" });
        return vault.get(id);
      },
      readAll: function (reason) {
        if (!revealed) throw new Error("Ground truth is sealed.");
        readLog.push({ at: new Date().toISOString(), id: "*", reason: reason || "" });
        return Array.from(vault.values());
      },
      isRevealed: function () { return revealed; },
      reveal: function () { revealed = true; return true; },
      readLog: function () { return readLog.slice(); }
    };

    /* ---- the collections. Append-only. ------------------------------ */
    const store = {
      experiment: experiment,
      truth: truth,

      droplets: [],
      rawObservations: [],
      derivedMeasurements: [],
      protocols: [],
      calibrations: [],
      analyses: [],

      addDroplet: function (d) { store.droplets.push(d); return d; },

      addObservation: function (o) {
        /* frozen at creation in measurement.js; frozen again here */
        store.rawObservations.push(Object.freeze(o));
        return o;
      },

      addMeasurement: function (m) { store.derivedMeasurements.push(m); return m; },

      getObservation: function (id) {
        return store.rawObservations.find(function (o) { return o.obsId === id; });
      },
      getMeasurement: function (id) {
        return store.derivedMeasurements.find(function (m) { return m.measId === id; });
      },

      accepted: function () {
        return store.derivedMeasurements.filter(function (m) {
          return m.status === "accepted" || m.status === "accepted_caution";
        });
      },
      rejected: function () {
        return store.derivedMeasurements.filter(function (m) { return m.status === "rejected"; });
      },
      unresolved: function () {
        return store.derivedMeasurements.filter(function (m) { return m.status === "unresolved"; });
      },

      /* ---- protocol versions. Amendments preserve the previous. ---- */
      addProtocol: function (rules, reason, ctx) {
        const prev = store.protocols[store.protocols.length - 1];
        if (prev && (!reason || reason.trim().length < 20)) {
          throw new Error(
            "Changing the exclusion rules after collection has begun " +
            "requires a written explanation of at least 20 characters. " +
            "The previous rules are preserved.");
        }
        const p = Object.freeze({
          version: store.protocols.length + 1,
          createdAt: new Date().toISOString(),
          rules: Object.freeze(Object.assign({}, rules)),
          previous: prev ? prev.version : null,
          previousRules: prev ? prev.rules : null,
          reason: reason || null,
          measurementsAtTime: store.derivedMeasurements.length,
          estimateViewedBefore: ctx ? !!ctx.estimateViewed : false
        });
        store.protocols.push(p);
        return p;
      },
      currentProtocol: function () {
        return store.protocols[store.protocols.length - 1] || null;
      },
      protocolVersion: function () { return store.protocols.length; },

      addCalibration: function (rec) {
        store.calibrations.push(Object.freeze(JSON.parse(JSON.stringify(rec))));
        return rec;
      },
      currentCalibration: function () {
        return store.calibrations[store.calibrations.length - 1] || null;
      },
      calibrationVersion: function () { return store.calibrations.length; },

      /* ---- analyses. Locking is irreversible. ---------------------- */
      addAnalysis: function (a) {
        const obj = Object.assign({
          analysisId: "A-" + String(store.analyses.length + 1).padStart(4, "0"),
          createdAt: new Date().toISOString(),
          locked: false,
          outcomeAware: revealed
        }, a);
        store.analyses.push(obj);
        return obj;
      },
      lockAnalysis: function (a) {
        if (a.locked) throw new Error("This analysis is already locked.");
        a.lockedAt = new Date().toISOString();
        a.locked = true;
        deepFreeze(a);
        return a;
      },
      lockedAnalysis: function () {
        return store.analyses.find(function (a) { return a.locked && !a.outcomeAware; }) || null;
      }
    };

    return store;
  }

  function deepFreeze(o) {
    if (o === null || typeof o !== "object" || Object.isFrozen(o)) return o;
    Object.getOwnPropertyNames(o).forEach(function (k) {
      try { deepFreeze(o[k]); } catch (e) { /* getters */ }
    });
    return Object.freeze(o);
  }

  /* ---- snapshot. localStorage, not IndexedDB. L-8. ------------------ */

  function snapshot(store) {
    return {
      experiment: store.experiment,
      droplets: store.droplets,
      rawObservations: store.rawObservations,
      derivedMeasurements: store.derivedMeasurements,
      protocols: store.protocols,
      calibrations: store.calibrations,
      analyses: store.analyses,
      revealed: store.truth.isRevealed(),
      savedAt: new Date().toISOString(),
      warning: "Snapshot does NOT include the truth vault. A restored " +
               "session cannot be revealed."
    };
  }

  function save(store) {
    if (typeof localStorage === "undefined") return { ok: false, reason: "no localStorage" };
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot(store)));
      return { ok: true };
    } catch (e) {
      /* quota is a real failure mode for a long session — L-8 */
      return { ok: false, reason: String(e && e.message) };
    }
  }

  function load() {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clear() {
    if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
  }

  const API = { createStore: createStore, snapshot: snapshot,
                save: save, load: load, clear: clear, deepFreeze: deepFreeze, KEY: KEY };
  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.persistence = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
