/* =====================================================================
   THE FALLING CHARGE — competing models
   ---------------------------------------------------------------------
   STATUS: NOT IMPLEMENTED. This file exists so that the interface can
   report honestly that model comparison is unavailable, rather than
   showing an empty chart or a placeholder number.

   The design is in docs/MODEL_COMPARISON.md. The reason it is not built
   is recorded in docs/RISK_REGISTER.md R-S6: the most serious risk in
   this whole simulation is that Model Q wins because the code was
   written by someone who believes it. The falsification gate — feeding
   the comparison continuous synthetic data and checking that it does NOT
   select quantisation — has to be built and passed BEFORE the feature
   ships. Shipping it untested would be worse than leaving it out.
   ===================================================================== */
(function (root) {
  "use strict";
  const isNode = (typeof module !== "undefined" && module.exports);

  const STATUS = {
    implemented: false,
    reason: "Model comparison is Milestone 4. It is withheld until the " +
            "two-sided falsification gate in docs/MODEL_COMPARISON.md passes: " +
            "the machinery must fail to select the quantised model when it is " +
            "given continuously distributed synthetic charges.",
    affects: ["RQ2", "H2"],
    designedIn: "docs/MODEL_COMPARISON.md"
  };

  function compare() {
    return {
      ok: false,
      status: STATUS,
      message: "Model comparison is not implemented in this build. " +
               "RQ2 and hypothesis H2 cannot be addressed by this instrument."
    };
  }

  const API = { STATUS: STATUS, compare: compare };
  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.models = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
