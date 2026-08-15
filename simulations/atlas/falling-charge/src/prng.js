/* =====================================================================
   THE FALLING CHARGE — deterministic pseudorandom number generation
   ---------------------------------------------------------------------
   sfc32, seeded through a cyrb128 string hash. Integer arithmetic only,
   so the state sequence is identical on every JavaScript engine.

   Streams are named and independent: changing how many droplets exist
   must not shift the Brownian numbers, and looking at a droplet later
   must not change its trajectory. See docs/REPRODUCIBILITY.md.

   Gaussians use Box-Muller with the spare cached PER STREAM, so drawing
   an odd number of normals never desynchronises anything.
   ===================================================================== */
(function (root) {
  "use strict";

  /* ---- cyrb128: string -> four 32-bit seeds ---------------------- */
  function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }

  /* ---- sfc32 ------------------------------------------------------ */
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  /* ---- a stream --------------------------------------------------- */
  function Stream(seedString) {
    const s = cyrb128(seedString);
    this._next = sfc32(s[0], s[1], s[2], s[3]);
    this._spare = null;
    this._count = 0;
    this.name = seedString;
  }

  /** Uniform on [0,1). */
  Stream.prototype.uniform = function () {
    this._count++;
    return this._next();
  };

  /** Uniform on [lo, hi). */
  Stream.prototype.range = function (lo, hi) {
    return lo + (hi - lo) * this.uniform();
  };

  /** Integer on [lo, hi] inclusive. */
  Stream.prototype.int = function (lo, hi) {
    return lo + Math.floor(this.uniform() * (hi - lo + 1));
  };

  /** Standard normal, mean 0 variance 1. Box-Muller with cached spare. */
  Stream.prototype.normal = function () {
    if (this._spare !== null) {
      const v = this._spare;
      this._spare = null;
      return v;
    }
    let u, v, s;
    do {
      u = this.uniform() * 2 - 1;
      v = this.uniform() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const f = Math.sqrt(-2 * Math.log(s) / s);
    this._spare = v * f;
    return u * f;
  };

  /** Normal with given mean and standard deviation. */
  Stream.prototype.gauss = function (mu, sigma) {
    return mu + sigma * this.normal();
  };

  /** true with probability p. */
  Stream.prototype.bernoulli = function (p) {
    return this.uniform() < p;
  };

  /** Index into a weight array, proportional to the weights. */
  Stream.prototype.weighted = function (weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let x = this.uniform() * total;
    for (let i = 0; i < weights.length; i++) {
      x -= weights[i];
      if (x <= 0) return i;
    }
    return weights.length - 1;
  };

  /** Pick one element of an array uniformly. */
  Stream.prototype.pick = function (arr) {
    return arr[this.int(0, arr.length - 1)];
  };

  /** How many raw uniforms this stream has produced. Diagnostic only. */
  Stream.prototype.draws = function () { return this._count; };

  /* ---- the registry ------------------------------------------------ */
  /**
   * A set of named streams derived from one seed. Asking for the same
   * name twice returns the same stream; asking for a name that has not
   * been used creates it deterministically from the seed.
   */
  function Streams(seed) {
    this.seed = String(seed);
    this._streams = new Map();
  }

  Streams.prototype.get = function (name) {
    let s = this._streams.get(name);
    if (!s) {
      s = new Stream(this.seed + ":" + name);
      this._streams.set(name, s);
    }
    return s;
  };

  /** Drop a per-droplet stream once its droplet is gone, to bound memory. */
  Streams.prototype.release = function (name) {
    this._streams.delete(name);
  };

  /** The stream design, for the export manifest. */
  Streams.prototype.design = function () {
    const out = {};
    this._streams.forEach(function (s, name) { out[name] = s.draws(); });
    return { seed: this.seed, generator: "sfc32/cyrb128", streams: out };
  };

  const API = { Stream: Stream, Streams: Streams, cyrb128: cyrb128, sfc32: sfc32 };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.FC = root.FC || {};
  root.FC.prng = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
