"use strict";
const T = require("./harness.js");
const U = require("../src/units.js");
const P = require("../src/physics.js");

module.exports = function () {
  T.suite("Units and constants");

  T.ok(U.SI.e === 1.602176634e-19, "elementary charge is the exact SI value");
  T.ok(U.SI.kB === 1.380649e-23, "Boltzmann constant is the exact SI value");
  T.ok(U.SI.g === 9.80665, "standard gravity is the defined value");
  T.near(U.SI.R, U.SI.NA * U.SI.kB, 1e-9, "R equals NA times kB");

  /* dimensional consistency: every quantity built from SI parts */
  const r = 5e-7, T0 = 293.15, p0 = 101325, rhoOil = 886;
  const eta = P.viscosity(T0), rhoAir = P.airDensity(p0, T0);

  T.ok(eta > 1e-5 && eta < 3e-5, "viscosity is in Pa s and plausible for air");
  T.ok(rhoAir > 0.5 && rhoAir < 2, "air density is in kg/m³ and plausible");
  T.ok(P.meanFreePath(p0, T0) > 1e-8 && P.meanFreePath(p0, T0) < 2e-7,
       "mean free path is in metres and of order 10⁻⁸");

  const W = P.effectiveWeight(r, rhoOil, rhoAir);
  T.ok(W > 0 && W < 1e-12, "effective weight is in newtons and tiny");

  /* E = V/d : volts per metre */
  T.near(Math.abs(P.fieldY(120, 6e-3)), 20000, 1e-12, "field of 120 V over 6 mm is 20 kV/m");
  T.ok(P.fieldY(120, 6e-3) < 0, "positive plate voltage gives a downward field");

  /* force = charge times field */
  const F = U.SI.e * Math.abs(P.fieldY(120, 6e-3));
  T.ok(F > 0 && F < 1e-14, "qE is in newtons and comparable to the weight");

  /* drag coefficient has units of kg/s */
  const b = P.dragCoefficient(r, eta, 1);
  T.near(b, 6 * Math.PI * eta * r, 1e-12, "drag coefficient is 6πηr when C_c = 1");

  /* pressure and temperature scaling */
  T.ok(P.airDensity(2 * p0, T0) > P.airDensity(p0, T0), "density rises with pressure");
  T.ok(P.viscosity(T0 + 40) > P.viscosity(T0), "air viscosity rises with temperature");
  T.ok(P.meanFreePath(p0 / 2, T0) > P.meanFreePath(p0, T0),
       "mean free path grows at lower pressure");

  /* significant figures — safeguard 27.5 */
  const s = U.formatWithUncertainty(1.6134e-19, 4.1e-21, "C");
  T.ok(/1\.61/.test(s) && /0\.04/.test(s), "estimate is rounded to the uncertainty: " + s);
  T.ok(!/1\.6134/.test(s), "no false precision is printed");
  const s2 = U.formatWithUncertainty(1.6134e-19, 1.3e-21, "C");
  T.ok(/0\.013/.test(s2), "a leading-1 uncertainty keeps two figures: " + s2);
};
