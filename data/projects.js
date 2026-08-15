/* =====================================================================
   CC / PORTFOLIO — THE REGISTRY
   ---------------------------------------------------------------------
   This file is the single source of truth for everything the portfolio
   displays. It is an ALLOWLIST.

   Nothing appears on this site unless it has a record here. A repository
   being public on GitHub does not put it on the portfolio, and no page
   ever queries the GitHub API at runtime — if a repository is renamed,
   made private, or deleted, the site keeps working and simply shows what
   this file says.

   ADDING A PROJECT
     Append a record. Required: id, title, category, portfolioStatus,
     summary. Everything else is optional and renders only if present —
     a link with a null value is never drawn, so there are no dead
     "Live demo" buttons pointing at things that do not exist.

   portfolioStatus  — the honesty control. Exactly one of:
     "showcase"   complete enough to represent professionally
     "prototype"  functional or meaningful, still evolving
     "research"   exploration is the point; the outcome is a finding
     "workshop"   small, worth showing, not a major piece
     "hidden"     NEVER RENDERED. Kept here so the decision is recorded
                  rather than lost. Flip to another status to publish.

   treatment        — which card plate is used. diagram | scope | ui |
                      art | image | none. Purely visual; does not affect
                      the metadata structure.

   A NOTE ON NUMBERS
     No metric appears in this file unless it was read out of the
     project's own notebook or documentation. Where a project has no
     verified numbers, it has no numbers. Do not add estimates.
   ===================================================================== */

const SIM_BASE = "https://unicorn0-0cakes.github.io/simulations/";
const GH       = "https://github.com/Unicorn0-0Cakes/";

const PROJECTS = [

  /* ═══════════════════════════════════════════════════════════════════
     SIMULATIONS — nine instruments. The portfolio presents them; the
     atlas runs them. Each record deep-links into the live catalogue.
     ═══════════════════════════════════════════════════════════════ */
  {
    id: "flask",
    title: "Evolution in a Flask",
    category: "simulations",
    portfolioStatus: "showcase",
    featured: true,
    featuredNote: "Start here",
    treatment: "scope",
    year: "2026",
    summary: "Twelve populations of E. coli in the same thin sugar medium, one transfer a day, fifty thousand generations of nothing else happening. Fitness is never reported to you — it is a competition assay you have to set up against something you were careful enough to freeze.",
    question: "Run the same environment twelve times over — does evolution repeat itself?",
    role: "Design, model, implementation, calibration",
    tech: ["JavaScript", "Canvas", "Monod kinetics", "Muller plots"],
    evidence: "Calibrated research model",
    basis: "After the LTEE, 1988– (Lenski)",
    chips: ["Twelve parallel worlds", "Measurement costs time", "Replay experiments"],
    links: { live: SIM_BASE + "flask/flask.html", methods: SIM_BASE + "flask/methods.html", source: GH + "simulations/tree/main/flask" }
  },
  {
    id: "universe-25",
    title: "Universe 25",
    category: "simulations",
    portfolioStatus: "showcase",
    featured: true,
    featuredNote: "Most immediately legible",
    treatment: "scope",
    year: "2026",
    summary: "A living recreation of Calhoun's mouse-utopia density study — unlimited resources, limited space. A colony rises and collapses through Growth, Breakdown and Collapse, with terrain, water, predators and prey all interacting on one scope.",
    question: "Can abundance without space collapse a society — and can predation prevent it?",
    role: "Design, agent model, implementation",
    tech: ["JavaScript", "Agent-based model", "Canvas"],
    evidence: "Exploratory agent-based model",
    basis: "After Calhoun, 1968–72",
    chips: ["Mice & predators", "Terrain & water", "Live charts"],
    links: { live: SIM_BASE + "universe-25/universe25.html", methods: SIM_BASE + "universe-25/methods.html", source: GH + "simulations/tree/main/universe-25" }
  },
  {
    id: "biosphere",
    title: "Biosphere: Closed World",
    category: "simulations",
    portfolioStatus: "showcase",
    treatment: "scope",
    year: "2026",
    summary: "Eight people, seven biomes and one atmosphere with nowhere to go, sealed inside three acres of glass. Built around the documented anomaly of the first Biosphere 2 closure: oxygen falling steadily while carbon dioxide failed to rise to match. The mechanic is causal diagnosis, not resource accumulation.",
    question: "Why is oxygen disappearing when carbon dioxide is not rising to match?",
    role: "Design, systems model, implementation",
    tech: ["JavaScript", "Differential equations", "Carbon ledger"],
    evidence: "Calibrated research model",
    basis: "After Biosphere 2, 1991–93",
    chips: ["Causal diagnosis", "Hypothesis workbench", "Carbon & oxygen budget"],
    links: { live: SIM_BASE + "biosphere/biosphere.html", methods: SIM_BASE + "biosphere/methods.html", source: GH + "simulations/tree/main/biosphere" }
  },
  {
    id: "commons",
    title: "The Commons",
    category: "simulations",
    portfolioStatus: "showcase",
    treatment: "scope",
    year: "2026",
    summary: "Everyone holds their own resources, but survival depends on a shared system nobody is obliged to maintain. The interesting question is not whether the society survived — it is what kind survived, and what survival cost it.",
    question: "Can a shared system nobody is obliged to maintain survive the incentive not to?",
    role: "Design, agent model, implementation",
    tech: ["JavaScript", "Public-goods game", "Agent-based model"],
    evidence: "Exploratory agent-based model",
    basis: "After Ostrom, Fehr & Gächter, Axelrod",
    chips: ["Emergent behaviour", "Trust & rumour", "Write the rules"],
    links: { live: SIM_BASE + "commons/commons.html", methods: SIM_BASE + "commons/methods.html", source: GH + "simulations/tree/main/commons" }
  },
  {
    id: "sentinel",
    plateCap: "Global sensitivity screen",
    title: "Sentinel: The Oversight Experiment",
    category: "simulations",
    portfolioStatus: "prototype",
    treatment: "scope",
    year: "2026",
    summary: "A spin-off built around the two metrics its parent simulation could not move. Detection delay and governance quality behaved as white noise there — both structurally severed from anything the experiment varied. This one measures the noise floor instead of assuming it.",
    question: "Why did adding more oversight change nothing?",
    role: "Design, sensitivity analysis, implementation",
    tech: ["JavaScript", "Global sensitivity analysis", "Statistical model"],
    evidence: "Uncalibrated prototype",
    chips: ["Decoy-validated ranking", "Bistable capture cascade", "Runs in the page"],
    links: { live: SIM_BASE + "sentinel/sentinel.html", methods: SIM_BASE + "sentinel/methods.html", source: GH + "simulations/tree/main/sentinel" }
  },
  {
    id: "inside-the-atom",
    title: "Inside the Atom",
    category: "simulations",
    portfolioStatus: "prototype",
    treatment: "scope",
    year: "2026",
    summary: "Fire alpha particles through thin foil and measure where they emerge. Most pass straight through. A rare few carry the evidence that changes the model — and you have to decide where it is worth spending exposures to find them.",
    question: "Can the paths of scattered particles reveal structures too small to see?",
    role: "Design, physics model, implementation",
    tech: ["JavaScript", "Rutherford scattering", "Seeded trials"],
    evidence: null,
    basis: "After Geiger, Marsden & Rutherford, 1909–13",
    chips: ["Model comparison", "Detector sweep", "Finite beam budget"],
    links: { live: SIM_BASE + "inside-the-atom/inside-the-atom.html", methods: SIM_BASE + "inside-the-atom/methods.html", source: GH + "simulations/tree/main/inside-the-atom" }
  },
  {
    id: "falling-charge",
    title: "The Falling Charge",
    category: "simulations",
    portfolioStatus: "prototype",
    treatment: "scope",
    year: "2026",
    summary: "Nothing in the apparatus shows you a charge. You measure how fast a droplet falls and how that changes under a field, and the elementary unit appears only as a spacing that keeps recurring. The accepted value stays sealed until you lock your analysis.",
    question: "Can an invisible unit of charge be recovered from the motion of falling oil droplets?",
    role: "Design, measurement model, implementation",
    tech: ["JavaScript", "Blind analysis", "Brownian noise model"],
    evidence: "Uncalibrated prototype",
    basis: "After Millikan, 1913",
    chips: ["Preregistered exclusions", "Nothing is ever deleted", "Commit before you see"],
    links: { live: SIM_BASE + "falling-charge/index.html", methods: SIM_BASE + "falling-charge/methods.html", source: GH + "simulations/tree/main/falling-charge" }
  },
  {
    id: "magnetic-ocean",
    title: "The Magnetic Ocean",
    category: "simulations",
    portfolioStatus: "prototype",
    treatment: "scope",
    year: "2026",
    summary: "The stripes are not shown to you. They are buried in basalt beneath the ocean, and all you receive is a noisy magnetic trace collected behind a moving ship. Reconstruct the seafloor history that produced it, on a finite survey budget.",
    question: "Can a noisy magnetic trace reveal the hidden motion and age of an ocean floor?",
    role: "Design, inference model, implementation",
    tech: ["JavaScript", "Signal inference", "Polarity timescale data"],
    evidence: "Uncalibrated prototype",
    basis: "After Vine & Matthews, 1963",
    chips: ["Hidden-stripe inference", "Spreading-rate reconstruction", "Seeded survey noise"],
    links: { live: SIM_BASE + "magnetic-ocean/magnetic-ocean.html", methods: SIM_BASE + "magnetic-ocean/methods.html", source: GH + "simulations/tree/main/magnetic-ocean" }
  },
  {
    id: "cce",
    plateCap: "Matched-seed contrast",
    title: "The Cognitive Civilization Experiment",
    category: "simulations",
    portfolioStatus: "research",
    featured: true,
    featuredNote: "Deepest apparatus",
    treatment: "scope",
    year: "2026",
    summary: "Three societies of a hundred thousand people, five hundred years, the same disasters in each. A research instrument rather than a game — matched seeds, effect sizes fixed before the runs, and a model built so that no single number is allowed to explain a person.",
    question: "Does the rule a society uses to allocate work, housing and office change how long its people live?",
    role: "Design, experimental protocol, model, implementation",
    tech: ["JavaScript", "Agent-based model", "Matched-seed design", "Checksummed runs"],
    evidence: "Uncalibrated prototype",
    chips: ["500 simulated years", "Preregistered effect sizes", "Reproducible"],
    links: { live: SIM_BASE + "cce/cce.html", methods: SIM_BASE + "cce/methods.html", source: GH + "simulations/tree/main/cce" }
  },

  /* ═══════════════════════════════════════════════════════════════════
     SOFTWARE & TOOLS
     ═══════════════════════════════════════════════════════════════ */
  {
    id: "key-to-stl",
    plateCap: "Photograph → mesh",
    title: "Key → STL",
    category: "software",
    /* Prototype, not showcase. The engineering around it is finished —
       four surfaces, CI, documentation — but the bitting extraction at
       the centre is still placeholder logic, and calling the whole
       thing "showcase" would be exactly the overclaim this registry
       exists to prevent. */
    portfolioStatus: "prototype",
    featured: true,
    featuredNote: "Most complete system",
    treatment: "diagram",
    diagramStages: 4,
    year: "2026",
    summary: "Four delivery surfaces — CV core, HTTP API, browser client and desktop build — over one idea: recover a printable profile from a photograph. The desktop path thresholds, traces and extrudes a real silhouette. The hosted path validates licences and returns a placeholder mesh; the bitting extraction is not finished, and the code says so.",
    question: "How much of a physical object can be recovered from a single ordinary photograph?",
    role: "Whole system — CV work, API, web client, desktop app, build & release, documentation",
    tech: ["Python", "FastAPI", "OpenCV", "NumPy", "JavaScript", "GitHub Actions", "Keygen"],
    chips: ["Four delivery surfaces", "Silhouette → mesh", "Core extraction unfinished"],
    caseStudy: "/software/key-to-stl/",
    links: { live: null, source: GH + "key-to-stl", docs: GH + "key-to-stl/blob/main/DOCS.md" },
    linkNote: "No public demo: the hosted service is licence-gated, and the hosted conversion path is not finished."
  },
  {
    id: "cube-timer",
    plateCap: "Runs offline",
    title: "Cube Timer",
    category: "software",
    portfolioStatus: "prototype",
    treatment: "ui",
    year: "2025",
    summary: "A speedcubing timer that runs entirely in the page — inspection countdown, solve history, session statistics, no account and no network. Built because every timer worth using is either a login wall or an app install.",
    role: "Design and build",
    tech: ["HTML", "CSS", "JavaScript"],
    chips: ["Zero dependencies", "Offline", "Solve history"],
    links: { live: "/projects/cube-timer/", source: GH + "unicorn0-0cakes.github.io/tree/main/projects/cube-timer" }
  },

  /* ═══════════════════════════════════════════════════════════════════
     AI / MACHINE LEARNING
     ═══════════════════════════════════════════════════════════════ */
  {
    id: "facial-emotion-detection",
    plateCap: "FER · four classes",
    title: "Facial Emotion Detection",
    category: "ai-ml",
    portfolioStatus: "showcase",
    featured: true,
    featuredNote: "Measured, not asserted",
    treatment: "viz",
    year: "2025",
    summary: "Four-class facial expression recognition using VGG16 transfer learning. The interesting part is not the architecture, it is the reporting: the model lands in the low seventies and the write-up says so, alongside the class imbalance that partly explains it.",
    question: "Which architecture balances accuracy against the cost of training it?",
    role: "Dataset analysis, architecture selection, training, evaluation, write-up",
    tech: ["Python", "TensorFlow/Keras", "VGG16", "Transfer learning", "MLflow-style run logging"],
    metrics: [
      { k: "Test accuracy", v: "72.66%" },
      { k: "Precision", v: "75.27%" },
      { k: "Recall", v: "72.66%" },
      { k: "F1", v: "72.80%" },
      { k: "Validation accuracy", v: "70.77%" }
    ],
    metricsNote: "Figures as reported in the project notebook, March 2025.",
    chips: ["4 classes", "Transfer learning", "Class imbalance documented"],
    caseStudy: "/ai-ml/facial-emotion-detection/",
    links: { source: GH + "machine-learning", notebook: GH + "machine-learning/blob/main/Final_CCantrelle_2025_Facial_Emotion_Detector.ipynb" }
  },
  {
    id: "svhn-digit-recognition",
    plateCap: "SVHN · four architectures",
    title: "SVHN Digit Recognition",
    category: "ai-ml",
    portfolioStatus: "showcase",
    treatment: "viz",
    year: "2025",
    summary: "Four architectures on Street View House Numbers — two dense networks, two convolutional — compared not only on accuracy but on what each one cost to train. The deepest CNN was abandoned: it needed restarts for memory and made hyperparameter search impractical.",
    question: "Where does added depth stop paying for itself?",
    role: "Architecture comparison, training, analysis, write-up",
    tech: ["Python", "TensorFlow/Keras", "CNN", "Dropout", "Batch normalisation", "Leaky ReLU"],
    metricsNote: "The notebook's own write-up reports the best CNN at roughly 97% accuracy. Stored cell outputs were cleared, so that figure is quoted from the author's analysis rather than re-verified here.",
    chips: ["4 architectures compared", "Cost-aware model choice", "Overfitting analysis"],
    caseStudy: "/ai-ml/svhn-digit-recognition/",
    links: { source: GH + "machine-learning", notebook: GH + "machine-learning/blob/main/CCantrelle2025_High_Code_SVHN_Digit_Recognition.ipynb" }
  },
  {
    id: "turbofan-rul",
    plateCap: "NASA C-MAPSS FD001",
    title: "Turbofan Remaining Useful Life",
    category: "ai-ml",
    portfolioStatus: "prototype",
    treatment: "viz",
    year: "2025",
    summary: "Predictive maintenance on NASA's C-MAPSS FD001 engine degradation set, deliberately scoped as a minimal viable model. Ridge regression rather than a deep network, so that the sensor-drift analysis and the RUL labelling are the visible work.",
    question: "How much of remaining useful life is recoverable from a linear model and honest preprocessing?",
    role: "Preprocessing, RUL labelling, EDA, modelling",
    tech: ["Python", "pandas", "scikit-learn", "Ridge regression", "Matplotlib", "Seaborn"],
    metricsNote: "Notebook outputs were cleared before commit; no evaluation figures are reported here because none could be verified.",
    chips: ["NASA C-MAPSS FD001", "Sensor drift analysis", "Deliberately minimal"],
    links: { source: GH + "machine-learning", notebook: GH + "machine-learning/blob/main/turbofan_engine_failure_prediction_CMAPSS.ipynb" }
  },
  {
    id: "cube-ai",
    title: "Cube AI",
    category: "ai-ml",
    portfolioStatus: "workshop",
    treatment: "none",
    year: "2025",
    summary: "A Rubik's Cube solver ported to Lua for the Roblox runtime, alongside the original Processing version. An exercise in moving a search algorithm between two very different environments.",
    role: "Lua port and cube-state module",
    tech: ["Lua", "Roblox", "Processing/Java", "BFS / DFS / heuristic search"],
    chips: ["Search algorithms", "Cross-runtime port"],
    attribution: "Based on Code Bullet's original RubiksCubeAI in Processing. The Processing version in this repository is his work, retained for comparison; the Lua port is mine.",
    links: { source: GH + "machine-learning/tree/main/Cube-AI", upstream: "https://github.com/Code-Bullet/RubiksCubeAI" }
  },
  {
    id: "chatbot-archive",
    title: "Chatbot Interaction Archive",
    category: "ai-ml",
    portfolioStatus: "workshop",
    treatment: "none",
    year: "2025",
    summary: "A small dataset and processing script for archiving and analysing chatbot conversation records in a structured, plain-CSV format. Data plumbing rather than modelling.",
    role: "Schema, dataset, processing script",
    tech: ["Python", "pandas", "CSV"],
    chips: ["Dataset + script", "No model"],
    links: { source: GH + "machine-learning/tree/main/ChatGPT-Agent-Archive" }
  },

  /* ═══════════════════════════════════════════════════════════════════
     RESEARCH
     ═══════════════════════════════════════════════════════════════ */
  {
    id: "multimodal-archaeology",
    plateCap: "Three-tier pipeline",
    title: "Multimodal Archaeological Site Detection",
    category: "research",
    portfolioStatus: "research",
    featured: true,
    featuredNote: "Unfinished, on purpose, in writing",
    treatment: "diagram",
    diagramTiered: true,
    year: "2026",
    summary: "A proposed three-tier pipeline for locating unrecorded archaeological sites: wide-area satellite scan, high-resolution boundary delineation, then multimodal characterisation. The architecture, configuration and model cards are built. The training loop is not, and the README says so in its first line.",
    question: "Could a staged detector triage satellite, LiDAR and archival text faster than survey alone — and how would you know?",
    role: "Architecture, configuration system, model cards, pipeline orchestration, documentation",
    tech: ["Python", "YOLOv8", "SegFormer", "Swin Transformer", "PyTorch", "MLflow", "GDAL/Rasterio", "YAML"],
    implemented: [
      "Three-stage pipeline structure and orchestration script",
      "YAML configuration management, per-model and global",
      "Draft architecture definitions for all three models",
      "Preprocessing scaffolding for Sentinel imagery, LiDAR and text",
      "Model cards documenting intended architecture and rationale"
    ],
    notImplemented: [
      "No dataset has been acquired, licensed or processed end to end",
      "The training script uses placeholder data and dummy declining loss values",
      "No checkpoint has been produced from real training",
      "Evaluation is not connected to held-out data or ground truth",
      "No detection, segmentation or classification metrics exist for this project"
    ],
    chips: ["Conceptual prototype", "Three model cards", "Next milestone defined"],
    caseStudy: "/research/multimodal-archaeology/",
    links: { source: GH + "multimodal-archaeology-research-framework", docs: GH + "multimodal-archaeology-research-framework/tree/main/docs" }
  },

  /* ═══════════════════════════════════════════════════════════════════
     DESIGN
     ═══════════════════════════════════════════════════════════════ */
  {
    id: "coastline-crane",
    title: "Coastline Crane",
    category: "design",
    portfolioStatus: "showcase",
    treatment: "image",
    year: "2026",
    summary: "Identity and a single-page site for an industrial crane repair and parts business. The brief was trust on first contact: an operator with a broken machine needs to know within seconds that this is a real company that answers the phone.",
    role: "Identity, art direction, copy, build",
    tech: ["HTML", "CSS", "Responsive layout"],
    chips: ["Identity", "Single-page site", "Industrial / municipal"],
    image: "/assets/images/work/coastline-crane-logo.webp",
    imageAlt: "The Coastline Crane logo: a red mobile crane beside the company name, over the strapline Serving the Gulf Coast",
    imageFit: "contain",
    links: { source: GH + "coastline-crane" }
  },
  {
    id: "jewelry-visualization",
    title: "Fine Jewelry Visualization",
    category: "design",
    portfolioStatus: "showcase",
    treatment: "image",
    year: "2024–25",
    summary: "Product and editorial imagery for fine and estate jewellery — bridal, pendants, drop earrings, turquoise collections, full sets worn on figure. The constraint is that a stone has to read correctly: facet, metal and setting all have to survive the crop.",
    role: "Art direction, visualization, post-production",
    tech: ["3D visualization", "Compositing", "Retouching"],
    chips: ["Product & editorial", "Estate & bridal", "Stone-first framing"],
    image: "/assets/images/work/jewelry-luxury-set-showcase.webp",
    imageAlt: "A model on a coastal cliff wearing a matched green-stone collar necklace and drop earrings",
    gallery: [
      { src: "/assets/images/work/jewelry-bridal-visualization.webp", alt: "An emerald-cut solitaire ring on a pavé band, lit against black with a radiating starburst" },
      { src: "/assets/images/work/jewelry-pendant-visualization.webp", alt: "A cushion-cut yellow diamond pendant in a double halo, on a fine chain against pale teal" },
      { src: "/assets/images/work/jewelry-earring-artistry.webp", alt: "A diamond drop earring photographed in profile on a model" },
      { src: "/assets/images/work/jewelry-ring-collection.webp", alt: "Three turquoise-and-silver rings arranged on red rock" },
      { src: "/assets/images/work/jewelry-luxury-enviroment.webp", alt: "A pair of pear-cut yellow diamond drop earrings on cream silk" }
    ],
    links: {}
  },
  {
    id: "estate-staging",
    title: "Virtual Staging",
    category: "design",
    portfolioStatus: "showcase",
    treatment: "image",
    year: "2024–25",
    summary: "Virtual staging for residential listings across Louisiana and Texas — vacant and dated interiors furnished digitally, and exteriors refreshed. Each property was staged in more than one direction so an agent could choose the read that matched the buyer.",
    role: "Art direction, staging, compositing",
    tech: ["3D staging", "Compositing", "Photo restoration"],
    chips: ["Six properties", "Multiple treatments each", "Interior & exterior"],
    image: "/assets/images/work/estate-primary_suite_retreat_nola-staged-a.webp",
    imageAlt: "A primary bedroom digitally staged with a bed, dark feature wall and warm lamplight",
    compare: { before: "/assets/images/work/estate-waterfront_nola-before.webp", after: "/assets/images/work/estate-waterfront_nola-staged-a.webp", label: "Waterfront, New Orleans" },
    gallery: [
      { src: "/assets/images/work/estate-cut_off_front_refresh-staged-a.webp", alt: "Exterior front refresh, staged" },
      { src: "/assets/images/work/estate-golden_medow_backyard-staged-a.webp", alt: "Backyard staged with landscaping and furniture" },
      { src: "/assets/images/work/estate-dallas_rental-staged-a.webp", alt: "Dallas rental interior, staged" },
      { src: "/assets/images/work/estate-houston_rental-staged-a.webp", alt: "Houston rental interior, staged" },
      { src: "/assets/images/work/estate-greatroom-before.webp", alt: "Waterfront great room before staging" }
    ],
    links: {}
  },
  {
    id: "brand-dna",
    title: "Studio brand sheet",
    category: "design",
    /* Hidden after review. On inspection these are a one-page brand
       guideline sheet for my own former studio positioning — logo, type
       specimen, palette swatches, tagline, brand values — not an
       identity study for a client, and generated largely by a
       brand-kit tool. It also advertises a positioning this site has
       retired. Recorded here so the decision is written down. */
    portfolioStatus: "hidden",
    year: "2025",
    summary: "A one-page brand guideline sheet for my own studio: logo lockup, type specimen, three-colour palette, tagline and brand values.",
    links: {}
  },

  /* ═══════════════════════════════════════════════════════════════════
     WORKSHOP — small, finished-enough, honestly labelled
     ═══════════════════════════════════════════════════════════════ */
  {
    id: "slot-machine",
    title: "Text Slot Machine",
    category: "workshop",
    portfolioStatus: "workshop",
    treatment: "none",
    year: "2025",
    summary: "A terminal slot machine in Python — deposits, multi-line bets, payout logic, balance management. Kept because the repository holds three numbered versions of it, and the diff between them is a decent record of learning to structure a program.",
    role: "Build",
    tech: ["Python"],
    chips: ["Three versioned iterations", "Terminal"],
    links: { source: GH + "Portfolio/tree/main/python/slot-machine" }
  },
  {
    id: "cafeiq",
    title: "CafeIQ",
    category: "workshop",
    portfolioStatus: "workshop",
    treatment: "none",
    year: "2025",
    summary: "An early scraper for collecting menu, review and trend data on local cafés. One module, unfinished, listed here rather than dressed up as a product.",
    role: "Build",
    tech: ["Python", "Web scraping"],
    chips: ["Single module", "Unfinished"],
    links: { source: GH + "Portfolio/tree/main/saas/CafeIQ" }
  },
  {
    id: "orbital-design-system",
    title: "Orbital",
    category: "workshop",
    portfolioStatus: "workshop",
    treatment: "diagram",
    year: "2026",
    summary: "The design system behind the Simulations atlas, and now behind this portfolio. Two complete themes rather than a palette and its inverse — a 1974 field manual and a 3am phosphor console — plus a catalogue schema whose evidence field makes overclaiming visibly awkward.",
    role: "Design and implementation",
    tech: ["CSS custom properties", "Design tokens", "Progressive enhancement"],
    chips: ["Two authored themes", "Token-driven worlds", "Evidence badges"],
    links: { source: GH + "simulations/blob/main/assets/orbital.css" }
  },

  /* ═══════════════════════════════════════════════════════════════════
     GAMES — the wing is built; the shelf is nearly empty, and the site
     says so rather than padding it. See /games/.
     ═══════════════════════════════════════════════════════════════ */
  {
    id: "studio-royale",
    title: "Studio Royale",
    category: "games",
    portfolioStatus: "workshop",
    treatment: "none",
    year: "2025",
    summary: "A filmmaking sandbox for Roblox — scene creator, camera rig, script and timeline editors — scoped to an alpha feature set. This is a design document, not a build: the systems are specified and the release checklist exists, but nothing has been implemented.",
    role: "Game design, systems specification, scope definition",
    tech: ["Roblox", "Lua"],
    chips: ["Design document", "Not implemented", "Alpha scope defined"],
    links: { source: GH + "Portfolio/blob/main/Roblox-Dev/Release/Alpha/studio-royale-alpha.md" }
  },

  /* ═══════════════════════════════════════════════════════════════════
     HIDDEN — recorded decisions. These never render.
     ═══════════════════════════════════════════════════════════════ */
  {
    id: "admin-training",
    title: "Admin Training Programme",
    category: "workshop",
    portfolioStatus: "hidden",
    summary: "Anonymised internal administrative training material. Public on GitHub, but organisational rather than technical, and the anonymisation deserves a second read before it is surfaced on a portfolio.",
    links: { source: GH + "admin-training" }
  },
  {
    id: "legacy-portfolio",
    title: "Portfolio (planning repository)",
    category: "workshop",
    portfolioStatus: "hidden",
    summary: "An outline of repositories that might be created, written in the second person. A planning document, superseded by this site. Kept in git history; not linked.",
    links: { source: GH + "Portfolio" }
  }
];

/* ---------------------------------------------------------------------
   SELECTED WORK — the homepage set, in display order.
   A curatorial decision, not a sort. Eight projects chosen to show the
   range and the throughline: three instruments, two models, one system,
   one research proposal, one visual piece. Deliberately not "the eight
   most recent commits".
   ------------------------------------------------------------------ */
const SELECTED = [
  "flask",
  "key-to-stl",
  "multimodal-archaeology",
  "facial-emotion-detection",
  "universe-25",
  "cce",
  "svhn-digit-recognition",
  "jewelry-visualization"
];

/* ---------------------------------------------------------------------
   THE WINGS
   `nav: false` builds the wing and leaves it reachable by URL without
   advertising it. Games is set that way until there is a game in it.
   ------------------------------------------------------------------ */
/* A category's URL is "/" + id + "/" unless it declares an explicit `path`.
   Simulations is the one exception: the standalone atlas repository already
   publishes a GitHub Pages project site at /simulations/, and a project site
   takes precedence over a same-named directory in a user site. The wing
   therefore lives at /simulation/ — singular, matching the discipline name
   used on the homepage — and the atlas keeps the URL it already had. */
const CATEGORIES = [
  { id: "simulations", name: "Simulations",  nav: true,  path: "/simulation/",  accent: "--rf-orange",
    tagline: "An atlas of scientific instruments",
    desc: "Working models of documented experiments. Set the conditions, run the world, read what comes out." },
  { id: "ai-ml",       name: "AI + ML",      nav: true,  accent: "--rf-indigo",
    tagline: "Models, datasets, and what they actually scored",
    desc: "Vision and prediction problems, reported with the numbers that were measured and the ones that were not." },
  { id: "software",    name: "Software",     nav: true,  accent: "--rf-teal",
    tagline: "Tools built to be used",
    desc: "Applications and utilities that solve a specific problem for a specific person, end to end." },
  { id: "research",    name: "Research",     nav: true,  accent: "--rf-violet",
    tagline: "Questions in progress",
    desc: "Work where the investigation is the output. Implemented and proposed are labelled separately." },
  { id: "games",       name: "Games",        nav: true,  accent: "--rf-oxide",
    tagline: "Systems you play from inside",
    desc: "Mechanics, interaction and art direction as one design problem." },
  { id: "design",      name: "Design",       nav: true,  accent: "--rf-gold",
    tagline: "Identity, interface and image",
    desc: "Visual systems and client work — jewellery, property, and industrial identity." },
  { id: "workshop",    name: "Workshop",     nav: true,  accent: "--rf-moss",
    tagline: "Small things, kept honest",
    desc: "One-day experiments, sketches and utilities. Shown without a case study, because they do not need one." }
];

const STATUS_COPY = {
  showcase:  { label: "Showcase",  desc: "Complete enough to represent professionally." },
  prototype: { label: "Prototype", desc: "Functional or meaningful experimental work that is still evolving." },
  research:  { label: "Research",  desc: "Exploratory work where the investigation is the primary objective." },
  workshop:  { label: "Workshop",  desc: "A smaller experiment, worth showing, not presented as a major piece." }
};

if (typeof window !== "undefined") {
  window.PROJECTS = PROJECTS;
  window.SELECTED = SELECTED;
  window.CATEGORIES = CATEGORIES;
  window.STATUS_COPY = STATUS_COPY;
}
if (typeof module !== "undefined") {
  module.exports = { PROJECTS, SELECTED, CATEGORIES, STATUS_COPY };
}
