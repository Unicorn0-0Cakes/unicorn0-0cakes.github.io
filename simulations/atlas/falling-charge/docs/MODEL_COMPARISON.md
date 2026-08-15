# Competing models

Version 0.1.0-milestone1. **Status: specified, not implemented.** This document
is the design that Milestone 4 will build. Nothing in the current build performs
model comparison, and the interface says so rather than showing an empty chart.

---

## Model Q — quantised charge

```
qᵢ = nᵢ e + εᵢ ,   nᵢ ∈ ℤ \ {0} ,   εᵢ ~ N(0, σ_qᵢ²)
```

Free parameters: `e` (1). The `nᵢ` are discrete nuisance parameters, not free
continuous parameters — which is exactly the thing a naïve parameter count gets
wrong. See §4.

## Model C — continuous charge

```
qᵢ ~ f(·) ,  f a continuous density on the observed range
```

Implemented as a Gaussian mixture with `K` components fitted by EM, or as a
kernel density estimate, with the effective number of parameters counted
honestly.

## Model F — mixed / fractional

Synthetic challenge only (`DROPLET_MODEL.md` §6). A fraction `f` of droplets
follow a non-integer process. Fitting it requires `e`, `f`, and the anomalous
distribution's parameters.

---

## Comparison methods

1. **Likelihood.** Marginal likelihood over the integer assignments, so Model Q
   is not given the assignments for free:

   ```
   L_Q = Π_i  Σ_n  P(n) · N(qᵢ ; n e, σ_qᵢ²)
   ```

   This is the honest formulation. Conditioning on a single best assignment
   overstates Model Q's fit, which is the most likely way to rig this
   comparison in Q's favour.

2. **AIC / BIC**, with the parameter count for Model Q including the prior over
   `n` if one is fitted.

3. **Held-out prediction.** Fit on `N−k` droplets, evaluate predictive density
   on the held-out `k`. This is the least riggable comparison and is the one
   the interface will foreground.

4. **Posterior predictive checks.** Simulate datasets from each fitted model and
   compare the distribution of nearest-lattice residuals.

5. **Residual structure.** Under Q with the right `e`, residuals should be
   unstructured in `n`, `r`, `V`, `T`, `p` and time. Structure is evidence
   against the *current* Q fit, not necessarily against quantisation.

## Guarding against a rigged comparison

The most serious risk in this whole simulation is that Model Q wins because the
code was written by someone who believes it (`RISK_REGISTER.md` R-S6). The
mitigation is a **two-sided test**, which is a required part of Milestone 4's
acceptance:

> Generate datasets from Model C with matched marginal spread. If the comparison
> machinery selects Model Q on continuous data at a rate materially above the
> nominal false-positive rate, the machinery is broken and the feature does not
> ship.

## Reportable conclusions

The interface must be able to say all of these:

- strong support for quantisation
- moderate support
- **inconclusive** — the data do not distinguish the models
- apparent support for the continuous model — which, on quantised data,
  correctly indicates that the measurements were too poor to see the ladder

No conclusion is described as a success or failure.
