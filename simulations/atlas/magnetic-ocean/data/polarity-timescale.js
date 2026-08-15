"use strict";
/* =====================================================================
   THE MAGNETIC OCEAN — data/polarity-timescale.js

   The published geomagnetic polarity chronology used by the instrument,
   and nothing else. Kept in its own file so that every boundary age can
   be read, checked against its source, and changed without touching the
   forward model.

   ---------------------------------------------------------------------
   WHAT THIS IS

   A list of NORMAL-polarity intervals for the last 5.23 Ma, in millions
   of years before present. Everything not listed is reversed. The list
   is transcribed from a single published table:

     Ocean Drilling Program, Leg 207 Initial Reports, Chapter 2,
     Table T7, "Magnetic polarity timescale for the Late Cretaceous and
     Cenozoic".
     https://www-odp.tamu.edu/publications/207_IR/chap_02/c2_t7.htm

   That table is itself a compilation, and it names the source of each
   interval. Those attributions are carried through here in the `src`
   field of every record so that no age in this file is anonymous:

     S90  Shackleton, N.J., Berger, A. & Peltier, W.R. (1990). An
          alternative astronomical calibration of the lower Pleistocene
          timescale based on ODP Site 677. Trans. R. Soc. Edinburgh
          Earth Sci. 81, 251-261.
     H91  Hilgen, F.J. (1991). Astronomical calibration of Gauss to
          Matuyama sapropels in the Mediterranean and implication for
          the geomagnetic polarity time scale. Earth Planet. Sci. Lett.
          104, 226-244.
     S95  Shackleton, N.J., Crowhurst, S., Hagelberg, T., Pisias, N.G. &
          Schneider, D.A. (1995). A new late Neogene time scale:
          application to Leg 138 sites. Proc. ODP Sci. Results 138,
          73-101.
     CK95 Cande, S.C. & Kent, D.V. (1995). Revised calibration of the
          geomagnetic polarity timescale for the Late Cretaceous and
          Cenozoic. J. Geophys. Res. 100, 6093-6095.
          doi:10.1029/94JB03098

   ---------------------------------------------------------------------
   WHAT THIS IS NOT

   It is not the current best estimate of the polarity timescale. Later
   compilations — Ogg (2020) in Geologic Time Scale 2020 being the
   obvious one — revise several of these boundaries by a few tens of
   thousands of years, and the Matuyama-Brunhes boundary in particular
   is quoted at 0.773 Ma there against 0.780 Ma here. Those differences
   are far below anything a single noisy transect in this instrument can
   resolve, but they are real, and the methods page says so rather than
   pretending this file is definitive.

   Ages are boundary ESTIMATES with their own uncertainty, which this
   file does not carry. Treating them as exact is a simplification, and
   it is one the instrument's limitations section names explicitly.
   ===================================================================== */

/* Normal-polarity intervals, youngest first. `t0` is the young end and
   `t1` the old end, both in Ma. The present day (t = 0) falls inside
   C1n, the Brunhes: the field is normal now. */
var GPTS_NORMAL_INTERVALS = [
  { chron: "C1n",     name: "Brunhes",       t0: 0.000, t1: 0.780, src: "S90"  },
  { chron: "C1r.1n",  name: "Jaramillo",     t0: 0.990, t1: 1.070, src: "S90"  },
  { chron: "C1r.2n",  name: "Cobb Mountain", t0: 1.201, t1: 1.211, src: "S90"  },
  { chron: "C2n",     name: "Olduvai",       t0: 1.770, t1: 1.950, src: "S90"  },
  { chron: "C2r.1n",  name: "Reunion",       t0: 2.140, t1: 2.150, src: "CK95" },
  { chron: "C2An.1n", name: "Gauss (1n)",    t0: 2.581, t1: 3.040, src: "S90/H91" },
  { chron: "C2An.2n", name: "Gauss (2n)",    t0: 3.110, t1: 3.220, src: "H91"  },
  { chron: "C2An.3n", name: "Gauss (3n)",    t0: 3.330, t1: 3.580, src: "H91"  },
  { chron: "C3n.1n",  name: "Cochiti",       t0: 4.180, t1: 4.290, src: "H91"  },
  { chron: "C3n.2n",  name: "Nunivak",       t0: 4.480, t1: 4.620, src: "H91"  },
  { chron: "C3n.3n",  name: "Sidufjall",     t0: 4.800, t1: 4.890, src: "H91"  },
  { chron: "C3n.4n",  name: "Thvera",        t0: 4.980, t1: 5.230, src: "H91/S95" }
];

/* The reversed intervals between them carry the traditional chron
   names, which are the ones a reader is most likely to recognise. The
   boundaries are implied by the table above, so nothing new is asserted
   here — this is a naming aid, not a second data source. */
var GPTS_CHRON_NAMES = [
  { t0: 0.000, t1: 0.780, name: "Brunhes",  polarity:  1 },
  { t0: 0.780, t1: 2.581, name: "Matuyama", polarity: -1 },
  { t0: 2.581, t1: 3.580, name: "Gauss",    polarity:  1 },
  { t0: 3.580, t1: 5.230, name: "Gilbert",  polarity: -1 }
];

var GPTS_PUBLISHED = {
  id: "gpts-odp207-t7",
  label: "Published chronology (0–5.23 Ma)",
  short: "Published",
  synthetic: false,
  spanMa: 5.230,
  citation: "ODP Leg 207 Initial Reports, Ch. 2, Table T7, after Shackleton et al. (1990), " +
            "Hilgen (1991), Shackleton et al. (1995) and Cande & Kent (1995).",
  url: "https://www-odp.tamu.edu/publications/207_IR/chap_02/c2_t7.htm",
  normalIntervals: GPTS_NORMAL_INTERVALS,
  chrons: GPTS_CHRON_NAMES
};

if (typeof window !== "undefined") {
  window.GPTS_PUBLISHED = GPTS_PUBLISHED;
  window.GPTS_NORMAL_INTERVALS = GPTS_NORMAL_INTERVALS;
  window.GPTS_CHRON_NAMES = GPTS_CHRON_NAMES;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GPTS_PUBLISHED: GPTS_PUBLISHED,
    GPTS_NORMAL_INTERVALS: GPTS_NORMAL_INTERVALS,
    GPTS_CHRON_NAMES: GPTS_CHRON_NAMES
  };
}
