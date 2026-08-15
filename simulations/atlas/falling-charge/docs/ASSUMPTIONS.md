# Inferred assumptions

Assumptions made where the specification was silent, and unresolved decisions
that a reviewer should overrule if they disagree. Written before the code, kept
current with it.

---

## Physical assumptions

1. Droplets are spherical, rigid, and of constant radius during an observation.
2. The field between the plates is uniform.
3. Air is dry and behaves as an ideal gas.
4. Oil density is constant with temperature.
5. Droplets do not interact — no coalescence, no mutual Coulomb force, no image
   charge with the plates.
6. Terminal velocity is reached quickly enough that the transient is not
   measured; the interface enforces a `20 τ` settling wait, so this is arranged
   rather than assumed.
7. Brownian motion is isotropic and uncorrelated between steps.
8. The hidden charge model is exactly `q = n e` (except in the opt-in
   falsification scenario).

## Statistical assumptions

9. Per-measurement charge uncertainties are approximately Gaussian. Not checked;
   the Monte Carlo output could be inspected for skew and is not.
10. Measurements on different droplets are independent — **false in one
    respect**: they share the session's instrument errors, which is precisely the
    systematic component and is handled separately, not as a correlation.
11. The candidate-lattice objective's `Δχ² = 1` interval is a valid 68 %
    interval. This assumes local quadratic behaviour, which fails near the
    sub-multiple minima. The bootstrap is reported alongside for this reason.

## Decisions taken where the specification allowed a choice

12. **`index.html` rather than `falling-charge.html`.** The specification asks
    for `index.html`; the repository convention is `<folder>/<folder>.html`. The
    specification wins, and the catalogue href points at the folder. Both work
    on GitHub Pages.
13. **No ES-module imports.** Modules attach to a global `FC` namespace, matching
    `flask/` and `biosphere/` and keeping `file://` working without a server.
14. **Combined fall-and-rise as the primary charge inversion**, rather than
    balanced suspension. Better conditioned; balance is still available and is
    a special case of the same formula.
15. **Exponential integrator rather than RK4.** The ODE is linear in `v`;
    the exponential update is exact and unconditionally stable, which matters
    near balance. Documented in `PHYSICS_MODEL.md` §5.
16. **Monte Carlo rather than analytic uncertainty propagation** as the default,
    because the radius inversion is implicit.
17. **Allen & Raabe 1982 as the default slip coefficients**, because they were
    fitted to oil droplets in a Millikan apparatus.
18. **Physics on the main thread.** Measured cost does not justify a worker yet;
    the module boundaries keep the option open.

## Unresolved decisions, flagged for review

19. **How much should the instrument warn?** Warning about unsuitable droplets
    is helpful teaching and is also a form of automation that removes the
    reasoning (R-U2 vs R-U5). Currently: guided mode warns, blind mode states
    facts (`Kn`, focus, duration) without recommending.
20. **Should the candidate-lattice sub-multiple minima be labelled?** Currently
    they are shown but not named, so a user can walk into the historically
    correct trap. A reviewer might reasonably want them annotated.
21. **`n_max = 25`.** Arbitrary. Too low and legitimately highly charged
    droplets are excluded; too high and the degenerate small-`e` region reopens.
22. **The 80/20 negative/positive split** and the whole droplet-population model
    are invented (`PARAMETER_REGISTER.md` §7).
24. **The lattice-selection penalty.** `χ²(e) + 2N ln(Q/e)` assumes a uniform
    prior over the integer charge states available in a data set spanning
    `[0, Q]`. A different prior — say one that penalises large `|n|` more
    strongly, which the physics arguably justifies — would give a different
    penalty and could shift `ê`. This is the single most consequential
    statistical choice in the build. See `LIMITATIONS.md` L-14.
25. **`Q = max|qᵢ|` as the range in the penalty.** Convenient and data-driven,
    but it makes the penalty depend on the single largest measured charge,
    which is also the highest-leverage point. Not obviously right.
26. **Whether historical mode should exist at all** in its current unsourced
    form, or be withheld until the 1913 apparatus parameters are read from the
    primary text. Currently it exists and is labelled *period-inspired*.
