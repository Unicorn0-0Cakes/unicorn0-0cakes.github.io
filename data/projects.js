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

   ─────────────────────────────────────────────────────────────────────
   THIS FILE IS PUBLIC. It is served to every visitor at /data/projects.js
   and is readable by anyone.

   DO NOT store private repository names, credentials, client-sensitive
   data, secrets, unpublished commercial figures, or confidential project
   metadata here. "unlisted" controls RENDERING ONLY — it is not privacy,
   not access control, and not a secret. If something must not be read by
   the public, it must not be in this file at all.
   ─────────────────────────────────────────────────────────────────────

   ADDING A PROJECT
     Append a record. Required: id, title, category, portfolioStatus,
     visibility, summary. Everything else is optional and renders only if
     present — a link with a null value is never drawn, so there are no
     dead "Live demo" buttons pointing at things that do not exist.

   portfolioStatus  — WHAT THE WORK IS. Exactly one of:
     "showcase"   complete enough to represent professionally
     "prototype"  functional or meaningful, still evolving
     "research"   exploration is the point; the outcome is a finding
     "workshop"   small, worth showing, not a major piece

   visibility       — WHETHER IT RENDERS. Exactly one of:
     "public"     appears in its wing, the counts, the map and search
     "unlisted"   never rendered anywhere. The record is kept so the
                  decision is written down rather than lost, and so the
                  reason survives. Flip to "public" to publish.

     These are two different questions and they used to be one field.
     A piece of work does not stop being a prototype because it is
     unlisted, and "unlisted" was never a status a visitor should read.

   treatment        — which card plate is used. diagram | scope | viz |
                      ui | image | flow | lanes | territory | quadrant |
                      none.
                      Purely visual; does not affect the metadata
                      structure.

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
    visibility: "public",
    featured: true,
    featuredNote: "Start here",
    treatment: "scope",
    year: "2026",
    summary: "Twelve populations of E. coli, one transfer a day, fifty thousand generations. Fitness is never reported to you — it is an assay you have to run against something you were careful enough to freeze.",
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
    visibility: "public",
    featured: true,
    featuredNote: "Most immediately legible",
    treatment: "scope",
    year: "2026",
    summary: "Calhoun's mouse-utopia study, alive: unlimited resources, limited space. A colony rises and collapses through Growth, Breakdown and Collapse, with terrain, predators and prey on one scope.",
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
    visibility: "public",
    treatment: "scope",
    year: "2026",
    summary: "Eight people, seven biomes, one atmosphere with nowhere to go. Built around the first closure's documented anomaly — oxygen fell while carbon dioxide failed to rise to match. Causal diagnosis, not resource accumulation.",
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
    visibility: "public",
    treatment: "scope",
    year: "2026",
    summary: "Everyone holds their own resources; survival depends on a system nobody is obliged to maintain. The question is not whether the society survived but what kind did, and what that cost.",
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
    visibility: "public",
    treatment: "scope",
    year: "2026",
    summary: "Built around the two metrics its parent simulation could not move. Detection delay and governance quality behaved there as white noise. This one measures the noise floor instead of assuming it.",
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
    visibility: "public",
    treatment: "scope",
    year: "2026",
    summary: "Fire alpha particles through thin foil and measure where they emerge. Most pass straight through; a rare few carry the evidence that changes the model — and exposures cost.",
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
    visibility: "public",
    treatment: "scope",
    year: "2026",
    summary: "Nothing here shows you a charge. You measure a droplet's fall, and the elementary unit appears only as a spacing that keeps recurring. The accepted value stays sealed until you lock your analysis.",
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
    visibility: "public",
    treatment: "scope",
    year: "2026",
    summary: "The stripes are buried in basalt under the ocean. All you get is a noisy trace collected behind a moving ship. Reconstruct the seafloor history that produced it, on a finite budget.",
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
    visibility: "public",
    featured: true,
    featuredNote: "Deepest apparatus",
    treatment: "scope",
    year: "2026",
    summary: "Three societies of a hundred thousand, five hundred years, the same disasters in each. Matched seeds, effect sizes fixed before the runs, and no single number allowed to explain a person.",
    question: "Does the rule a society uses to allocate work, housing and office change how long its people live?",
    role: "Design, experimental protocol, model, implementation",
    tech: ["JavaScript", "Agent-based model", "Matched-seed design", "Checksummed runs"],
    evidence: "Uncalibrated prototype",
    chips: ["500 simulated years", "Preregistered effect sizes", "Reproducible"],
    links: { live: SIM_BASE + "cce/cce.html", methods: SIM_BASE + "cce/methods.html", source: GH + "simulations/tree/main/cce" }
  },
  {
    id: "ferry-terminal",
    title: "Ferry Terminal",
    category: "simulations",
    portfolioStatus: "prototype",
    visibility: "public",
    treatment: "scope",
    year: "2026",
    summary: "A single berth, a fixed timetable, and a queue that is only served in batches. Vehicles pile up between sailings; a departure clears as many as fit and leaves the rest for the next one. Measure who waited, how long, and who never sailed — and watch the answer change once you stop counting only the vehicles that made it aboard.",
    question: "When a queue is only served at scheduled departures, who waits, how long, and who never sails at all?",
    role: "Design, queueing model, implementation",
    tech: ["JavaScript", "Discrete-event simulation", "Bulk-service queueing model"],
    evidence: "Uncalibrated prototype",
    basis: "After Hanssen, Jørgensen & Larsen, 2020",
    chips: ["Timetable-coupled arrivals", "Denied-boarding carry-over", "Survivorship-corrected waiting time"],
    links: { live: SIM_BASE + "ferry-terminal/ferry-terminal.html", methods: SIM_BASE + "ferry-terminal/methods.html", source: GH + "simulations/tree/main/ferry-terminal" }
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
    visibility: "public",
    featured: true,
    featuredNote: "Most complete system",
    treatment: "diagram",
    diagramStages: 4,
    year: "2026",
    summary: "Four surfaces — CV core, HTTP API, browser client, desktop build — over one idea: recover a printable key profile from a photograph. The desktop path extrudes a real silhouette. Bitting extraction is unfinished, and the code says so.",
    question: "How much of a physical object can be recovered from a single ordinary photograph?",
    role: "Whole system — CV work, API, web client, desktop app, build & release, documentation",
    tech: ["Python", "FastAPI", "OpenCV", "NumPy", "JavaScript", "GitHub Actions", "Keygen"],
    chips: ["Four delivery surfaces", "Silhouette → mesh", "Core extraction unfinished"],
    caseStudy: "/software/key-to-stl/",
    links: { live: null, source: GH + "key-to-stl", docs: GH + "key-to-stl/blob/main/DOCS.md" },
    linkNote: "No public demo: the hosted service is licence-gated, and the hosted conversion path is not finished."
  },
  {
    id: "bayou-vendor-records",
    plateCap: "Four-lane attention model",
    title: "Bayou Vendor Records",
    category: "software",
    portfolioStatus: "prototype",
    visibility: "public",
    treatment: "lanes",
    year: "2026",
    summary: "A vendor-record system for property managers whose sharpest design decision is a refusal. It records that a document arrived and the date given for it; it will not say whether the document is sufficient — and the field names are written so nobody can later read it as though it did.",
    question: "How do you build a compliance-adjacent tool that is useful without pretending to be the compliance decision?",
    role: "Product concept, record-state model, workflow architecture, boundary design, UX, copy, commercial offer, deployment",
    tech: ["Polsia", "Records model", "Workflow design"],
    techNote: "Built and directed on an agentic development platform (Polsia). The repository is private and the implementation stack was not independently verified, so no framework or library is named here or on the case study.",
    chips: ["Receipt status, not sufficiency", "Four-lane Weekly Rundown", "Boundary gate on intake"],
    metricsNote: "Pilot stage. Every figure on the live product is composed sample data and is labelled as such there. No adoption, retention or time-saved figure is recorded, because none has been measured.",
    caseStudy: "/software/bayou-vendor-records/",
    links: { live: "https://bayou-vendor-records.polsia.app" },
    linkNote: "Live pilot only. The repository is private and is deliberately not named in this public file."
  },
  {
    id: "territoryone",
    plateCap: "One contractor per ZIP",
    title: "TerritoryOne",
    category: "software",
    portfolioStatus: "prototype",
    visibility: "public",
    treatment: "territory",
    year: "2026",
    summary: "A territory-routing prototype: homeowner requests are validated, checked against recent duplicates, resolved to a ZIP-based territory and assigned to the one contractor who owns it. Exclusivity as an inventory constraint rather than a slogan. The live site runs on synthetic demo data and says so.",
    question: "If a lead can be sold to five contractors, what exactly did any of them buy?",
    role: "Product concept, system rules, territory model, workflow architecture, UX direction, commercial model, deployment",
    tech: ["Polsia", "Routing rules", "Territory model"],
    techNote: "Built and directed on an agentic development platform (Polsia). No public repository exists and the implementation stack was not independently verified, so no framework or library is named here or on the case study.",
    chips: ["One contractor per ZIP range", "Duplicate check before handoff", "Synthetic demo data"],
    metricsNote: "Demonstration only. No paying contractors, live traffic, lead volume or conversion figure exists to report, and none is implied.",
    caseStudy: "/software/territoryone/",
    links: { live: "https://territoryone.polsia.app" },
    linkNote: "Working demo only. No public repository exists, so no source link is offered — a live deployment is not evidence that source should be linked."
  },
  {
    id: "cube-timer",
    plateCap: "Runs offline",
    title: "CUBE//TIMER",
    category: "software",
    portfolioStatus: "showcase",
    visibility: "public",
    treatment: "ui",
    year: "2026",
    summary: "A terminal-style speedcubing console: six puzzles, WCA inspection, full averages, and a year of practice drawn as a matrix. Every so often it asks for something specific \u2014 a time to beat, three clean in a row, the timer going dark \u2014 with the target read off your own recent solves.",
    question: "What does a practice tool look like when the practice history is the point, not the stopwatch?",
    role: "Design and build",
    tech: ["HTML", "CSS", "JavaScript", "Web Audio", "localStorage"],
    chips: ["Zero dependencies", "Offline", "Six puzzles", "365-day matrix"],
    /* Every number here was counted out of the source, not estimated.
       Scrambles are random-MOVE with redundant-turn filtering, which is the
       right tool for practice and is NOT the random-state generation the WCA
       requires for competition \u2014 so the description says "WCA inspection",
       which it implements exactly, and never "WCA scrambles". */
    metrics: [
      { k: "Puzzles scrambled", v: "6" },
      { k: "Runtime dependencies", v: "0" }
    ],
    metricsNote: "Counted from data/projects.js's sibling source at projects/cube-timer/. Six scramble generators (3x3, 2x2, 4x4, 5x5, Pyraminx, Skewb); no library is loaded at runtime.",
    links: { live: "/projects/cube-timer/", source: GH + "unicorn0-0cakes.github.io/tree/main/projects/cube-timer" }
  },
  {
    id: "docket",
    plateCap: "Brain dump → matrix",
    title: "Docket",
    category: "software",
    /* Prototype: every MVP path works and was exercised end to end in a
       headless browser before it shipped, but it has not yet carried a
       real working week. Promote to showcase once it has. */
    portfolioStatus: "prototype",
    visibility: "public",
    treatment: "quadrant",
    year: "2026",
    summary: "A work to-do list that sorts itself. Paste everything on your mind; plain rules read each line for deadlines, blockers and \u201cif I have time\u201d and file it into an Eisenhower matrix, flagging the guesses for review. Finished work earns points you spend on breaks you defined.",
    question: "Can a to-do list lower the cost of deciding what matters, instead of just storing it?",
    role: "Design and build",
    tech: ["HTML", "CSS", "JavaScript", "localStorage", "Web Audio"],
    chips: ["No account", "Tasks never leave the browser", "Rule-based sorting, no AI API", "JSON backup"],
    metricsNote: "No usage figures exist and none are implied. The classifier is deterministic and its whole rule set is readable in projects/docket/classify.js.",
    links: { live: "/projects/docket/", source: GH + "unicorn0-0cakes.github.io/tree/main/projects/docket" }
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
    visibility: "public",
    featured: true,
    featuredNote: "Measured, not asserted",
    treatment: "viz",
    year: "2025",
    summary: "Four-class facial expression recognition with VGG16 transfer learning. The interesting part is the reporting — the model lands in the low seventies, and the write-up says so.",
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
    visibility: "public",
    treatment: "viz",
    year: "2025",
    summary: "Four architectures on Street View House Numbers, compared on accuracy and on what each cost to train. The deepest CNN was abandoned: restarts for memory, and hyperparameter search became impractical.",
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
    visibility: "public",
    treatment: "viz",
    year: "2025",
    summary: "Predictive maintenance on NASA's C-MAPSS FD001 set, scoped deliberately small. Ridge regression rather than a deep network, so sensor-drift analysis and RUL labelling stay the visible work.",
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
    visibility: "public",
    treatment: "none",
    year: "2025",
    summary: "A Rubik's Cube solver moved from Processing to Lua for the Roblox runtime — a search algorithm carried between two very different environments.",
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
    visibility: "public",
    treatment: "none",
    year: "2025",
    summary: "A dataset and processing script for archiving chatbot conversation records as plain CSV. Data plumbing rather than modelling.",
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
    visibility: "public",
    featured: true,
    featuredNote: "Unfinished, on purpose, in writing",
    treatment: "diagram",
    diagramTiered: true,
    year: "2026",
    summary: "A proposed three-tier pipeline for finding unrecorded archaeological sites: wide-area scan, boundary delineation, characterisation. The architecture is built; the training loop is not, and the README says so in its first line.",
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
    id: "lantern-reply",
    plateCap: "Intake → approval → delivery",
    title: "Lantern Reply",
    category: "design",
    /* Showcase, and the only self-created commercial product in this
       wing. Filed under Design because the designed artefact is the
       service — what is asked, in what order, what is held back for
       approval, and which claims are ruled out — not the website. */
    portfolioStatus: "showcase",
    visibility: "public",
    featured: true,
    featuredNote: "A product, not a client brief",
    treatment: "flow",
    year: "2026",
    summary: "A local-visibility service for independent HVAC companies, built as a workflow rather than a promise: four intake fields, a manual review across five fixed dimensions, exactly three prioritised actions — and a monthly engagement in which nothing is published until the owner has approved the wording.",
    question: "What does a small contractor actually buy when they buy help with Google?",
    role: "Product concept, service architecture, workflow, UX, copy system, positioning, commercial offer, deployment",
    tech: ["Polsia", "Service design", "Product strategy"],
    techNote: "Built and directed on an agentic development platform (Polsia). The repository is private and the implementation stack was not independently verified, so no framework or library is named here or on the case study.",
    chips: ["Free tier stops at three actions", "Approval before publication", "Refusal list published"],
    metricsNote: "No ranking, lead, revenue or customer figure appears anywhere for this project. The product tells its own customers it does not guarantee them; the portfolio does not claim them on its behalf.",
    caseStudy: "/design/lantern-reply/",
    links: { live: "https://www.lanternreply.com" },
    linkNote: "Live product only. The repository is private and is deliberately not named in this public file."
  },
  {
    id: "coastline-crane",
    title: "Coastline Crane",
    category: "design",
    portfolioStatus: "showcase",
    visibility: "public",
    treatment: "image",
    year: "2026",
    summary: "Identity and a single-page site for an industrial crane repair business. The brief was trust on first contact: an operator with a broken machine needs to know someone answers the phone.",
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
    visibility: "public",
    treatment: "image",
    year: "2024–25",
    summary: "Product and editorial imagery for fine and estate jewellery. The constraint is that a stone has to read correctly — facet, metal and setting all have to survive the crop.",
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
    visibility: "public",
    treatment: "image",
    year: "2024–25",
    summary: "Virtual staging for listings across Louisiana and Texas, interiors and exteriors. Each property was staged more than one way, so an agent could pick the read that matched the buyer.",
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
    /* Unlisted after review. On inspection these are a one-page brand
       guideline sheet for my own former studio positioning — logo, type
       specimen, palette swatches, tagline, brand values — not an
       identity study for a client, and generated largely by a
       brand-kit tool. It also advertises a positioning this site has
       retired. Recorded here so the decision is written down. */
    portfolioStatus: "workshop",
    visibility: "unlisted",
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
    visibility: "public",
    treatment: "none",
    year: "2025",
    summary: "A terminal slot machine in Python. Kept because the repository holds three numbered versions of it, and the diff between them records learning to structure a program.",
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
    visibility: "public",
    treatment: "none",
    year: "2025",
    summary: "An early scraper for café menu and review data. One module, unfinished, listed rather than dressed up as a product.",
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
    visibility: "public",
    treatment: "diagram",
    year: "2026",
    summary: "The design system behind the Simulations atlas, and now this portfolio. Two authored themes rather than a palette and its inverse, plus a catalogue schema whose evidence field makes overclaiming awkward.",
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
    visibility: "public",
    treatment: "none",
    year: "2025",
    summary: "A filmmaking sandbox for Roblox — scene creator, camera rig, timeline editor — scoped to an alpha feature set. A design document, not a build: the systems are specified, nothing is implemented.",
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
    portfolioStatus: "workshop",
    visibility: "unlisted",
    summary: "Anonymised internal administrative training material. Public on GitHub, but organisational rather than technical, and the anonymisation deserves a second read before it is surfaced on a portfolio.",
    links: { source: GH + "admin-training" }
  },
  {
    id: "legacy-portfolio",
    title: "Portfolio (planning repository)",
    category: "workshop",
    portfolioStatus: "workshop",
    visibility: "unlisted",
    summary: "An outline of repositories that might be created, written in the second person. A planning document, superseded by this site. Kept in git history; not linked.",
    links: { source: GH + "Portfolio" }
  }
];

/* ---------------------------------------------------------------------
   SELECTED WORK — the homepage set, in display order.
   ---------------------------------------------------------------------
   A curatorial decision, not a sort, and deliberately not "the nine most
   recent commits". Nothing here is chosen automatically; changing this
   list is the only way to change the homepage.

   WHY THESE NINE
     Three instruments   flask, universe-25, cce — the largest body of
                         work, and the clearest statement of method.
     One model           facial-emotion-detection — the numbers are
                         reported with what they cost and what they miss,
                         and they were read out of stored notebook output.
     One system          key-to-stl — the only project shown across four
                         delivery surfaces.
     One research piece  multimodal-archaeology — proposed, not claimed;
                         it is here precisely because it says so.
     One product         lantern-reply — a service conceived, scoped,
                         priced and deployed here rather than briefed by a
                         client. It is the only evidence on this page of
                         commercial execution: an offer, a workflow, a
                         boundary and a live domain.
     Two visual pieces   jewelry-visualization for craft, coastline-crane
                         for a client-facing build carried end to end —
                         identity, copy and responsive front-end.

   WHAT CHANGED, AND WHY
     svhn-digit-recognition left this set when lantern-reply joined it, to
     hold the list at nine. It is the more redundant of the two AI/ML
     entries: both are notebooks from the same repository making the same
     methodological point, and SVHN is the one whose headline accuracy is
     quoted from the author's own write-up rather than re-verified from
     stored output. It remains public and unchanged in the AI + ML wing.

   WHAT IS DELIBERATELY ABSENT
     Games               nothing playable exists yet. Studio Royale is a
                         design document, and a homepage slot would imply
                         otherwise. It enters when something runs.
     Workshop            by definition too small for this set.
     bayou-vendor-       both are prototypes running on labelled sample or
     records,            synthetic data. They belong in the Software wing,
     territoryone        where the status badge is read alongside them. A
                         homepage slot each would present three products
                         as equally mature when only one of them is.
     cube-timer,         both are real and both are linked from their
     orbital-design-     wings; neither adds range the nine do not
     system              already cover.

   Balance is checked against the wings, not enforced. Strong research is
   never dropped to make the category histogram look even.
   ------------------------------------------------------------------ */
const SELECTED = [
  "flask",
  "key-to-stl",
  "lantern-reply",
  "multimodal-archaeology",
  "facial-emotion-detection",
  "universe-25",
  "cce",
  "jewelry-visualization",
  "coastline-crane"
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
    desc: "Visual systems, client work, and one product of my own — jewellery, property, industrial identity, and a service designed end to end." },
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
