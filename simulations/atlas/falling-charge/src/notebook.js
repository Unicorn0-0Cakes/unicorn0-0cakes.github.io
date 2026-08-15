/* =====================================================================
   THE FALLING CHARGE — the laboratory notebook
   ---------------------------------------------------------------------
   Append-only. Entries are never edited or removed; a correction is a
   new entry. docs/DATA_MODEL.md.
   ===================================================================== */
(function (root) {
  "use strict";
  const isNode = (typeof module !== "undefined" && module.exports);

  const AUTO_KINDS = {
    session_start:      "Session started",
    calibration_update: "Calibration updated",
    preregistration:    "Exclusion rules preregistered",
    protocol_amendment: "PROTOCOL AMENDMENT",
    atomise:            "Atomiser fired",
    droplet_selected:   "Droplet selected",
    droplet_lost:       "Droplet left the observation region",
    voltage_change:     "Voltage changed",
    polarity_change:    "Polarity reversed",
    field_toggle:       "Field switched",
    ionisation_pulse:   "Ionisation pulse fired",
    charge_jump:        "Charge changed",
    track_start:        "Measurement started",
    track_stop:         "Measurement stopped",
    measurement_derived:"Measurement derived",
    accepted:           "Observation accepted",
    accepted_caution:   "Observation accepted with caution",
    rejected:           "Observation rejected",
    unresolved:         "Observation left unresolved",
    dataset_locked:     "Dataset locked",
    analysis_lock:      "ANALYSIS LOCKED",
    truth_reveal:       "GROUND TRUTH REVEALED",
    truth_read:         "Truth vault read",
    note:               "Note"
  };

  function create() {
    return { entries: [], counter: 0 };
  }

  function add(nb, kind, opts) {
    opts = opts || {};
    nb.counter++;
    const entry = {
      entryId: "N-" + String(nb.counter).padStart(4, "0"),
      at: new Date().toISOString(),
      simTime: opts.simTime === undefined ? null : opts.simTime,
      kind: kind,
      label: AUTO_KINDS[kind] || kind,
      auto: opts.auto !== false,
      dropletId: opts.dropletId || null,
      measId: opts.measId || null,
      text: opts.text || "",
      settings: opts.settings || null,
      fields: Object.assign({
        observation: "", prediction: "", interpretation: "",
        uncertaintyConcern: ""
      }, opts.fields || {})
    };
    nb.entries.push(entry);
    return entry;
  }

  /** A manual note. The one entry kind the user authors directly. */
  function note(nb, text, opts) {
    return add(nb, "note", Object.assign({ auto: false, text: text }, opts || {}));
  }

  function filter(nb, pred) { return nb.entries.filter(pred); }

  function toJSON(nb) {
    return JSON.stringify({ entries: nb.entries, count: nb.entries.length }, null, 2);
  }

  function toText(nb) {
    return nb.entries.map(function (e) {
      const t = (e.simTime === null) ? "" : "  t=" + e.simTime.toFixed(1) + "s";
      const extra = [e.fields.observation, e.fields.prediction,
                     e.fields.interpretation, e.fields.uncertaintyConcern]
        .filter(Boolean).join(" | ");
      return "[" + e.entryId + "] " + e.at + t + "  " + e.label +
             (e.dropletId ? " (" + e.dropletId + ")" : "") +
             (e.text ? " — " + e.text : "") +
             (extra ? "\n        " + extra : "");
    }).join("\n");
  }

  const API = { AUTO_KINDS: AUTO_KINDS, create: create, add: add,
                note: note, filter: filter, toJSON: toJSON, toText: toText };
  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.notebook = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
