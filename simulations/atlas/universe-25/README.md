# Universe 25 Simulation

A simulation game based on John B. Calhoun's famous behavioral experiment from the 1960s-70s that explores how population density affects social behavior in a "mouse utopia" with unlimited resources but limited space.

## 🌐 Published site

`index.html` is the landing page — a card grid of simulations that links straight through to each one (currently `universe25.html`). It's built to expand: add another entry to the `SIMULATIONS` array in `index.html` and a new card appears automatically.

To publish on **GitHub Pages**: push these files, then in the repo go to **Settings → Pages** and set the source to your default branch, root folder. The site serves `index.html` at the repo root; a `.nojekyll` file is included so Pages serves everything as-is. Your live URL will be `https://<username>.github.io/<repo>/`.

## ▶ Easiest way to run it: `universe25.html`

Just **double-click `universe25.html`** — it opens in any web browser with no install, no Python, nothing to set up. It's a single self-contained file, so you can also email it, drop it on a USB stick, or later host it on a website for anyone to use.

The dashboard includes a live animated grid (mice colored by mental state), real-time population and mental-state charts, a phase tracker with dramatic on-screen callouts as the society hits Growth → Breakdown → Collapse, adjustable starting population and world size, scenario presets, and a click-to-inspect any creature inspector.

### Predators & Prey

The world now includes a **predator species (cats)** alongside the mice. Predators stay dormant until the colony establishes, then hunt: they stalk the nearest mouse, pounce when adjacent, gain food energy from each kill, breed when well-fed, and starve when prey run short. Mice sense nearby predators and flee — but in a crowded crush, escape often fails, tying predation back to the density theme. Both species are tracked on the population chart (blue = mice, orange = predators).

The emergent result is a genuine predator-prey balance: with the right predator pressure, hunting holds mouse density *below* the behavioral-sink threshold and can stave off the Universe 25 collapse entirely — the colony and its hunters oscillate and coexist. Too many predators, and the mice are hunted to extinction; too few (or the "Classic (no cats)" preset), and the original overcrowding collapse plays out. Use the **Predators** slider and the **Predator & Prey / Classic / Instant Crowding / Wide Open** presets to explore the outcomes.

### Terrain: vegetation, water bodies & a flowing river

The map is now real terrain. **Vegetation** grows in green patches of varying size that animals walk through and graze on. **Water** forms bodies of varying size — tiny puddles up to full lakes — that are **impassable**: animals can't enter them, only drink from the edges, so lakes act as barriers that shape movement, hunting, and escape routes. A winding **river** flows across the map with a central "ford" so it never fully splits the colony off. **Mice need both food and water; cats need mice (for food) and water (for drinking).** Animals route around water automatically (via distance-field pathfinding) and weaken then die if they can't reach what they need in time.

Two controls govern resources:

- **Infinite vs Finite.** Infinite keeps everything pristine and full (Calhoun's original premise — the constraint is space, not resources). Finite makes it a living system: **vegetation depletes as it's eaten, then regrows and spreads**; standing ponds slowly **recede**; and the **river has a steady inflow but can be drawn down by overuse** — a big, thirsty colony drains it toward empty, while a smaller one lets it refill. A live "% full" readout tracks the river.
- **River On/Off**, plus the **Food & water bodies** slider for how many of each to generate.

The emergent lesson is striking: in finite mode **without predators, the colony overshoots, strips the vegetation and drinks the river dry, and collapses** — the tragedy of unchecked growth. **With predators holding the population below the land's carrying capacity, the river stays full and the ecosystem sustains.** Predation, crowding, and resource limits all interact. Click any animal to see its hunger and thirst.

**Vegetation is cover.** Only mice can enter the grass — predators can't follow, and a mouse that slips into vegetation can't be caught. This makes the green patches a refuge, but mice still have to break into the open to reach water, where the cats hunt. It also has a twist: good cover lets the colony escape predation and boom — straight into overcrowding collapse. Escape the cats, meet the behavioral sink.

### Fish & Birds (optional modes)

Two more species can be switched on independently:

- **Fish** live and breed only in the water and can't leave it — if their pool dries up in finite mode, they're stranded and die. They don't need anything to survive, but their numbers are drawn down by **both cats and birds** hunting them at the water's edge (only a fraction of attempts land, so stocks persist rather than being wiped out). Fish give cats an alternative to hunting mice — handy when the mice are hiding in the grass.
- **Birds** nest and live in the **vegetation**, and only leave the grass to chase a mouse that's come within range — swooping fast to run down fleeing prey, then returning to cover. They eat mice (and snatch the occasional fish beside the grass) but **do not touch cats**. Birds require prey to survive: with mice and fish around they persist and breed; when their prey collapses, so do they. Like the cats, they stay dormant until the colony establishes so they don't wipe out the founders. Mice flee birds as they do cats — and since birds live in the grass, cover from cats is no longer safe from above.

Each is a separate on/off toggle. **All four populations — mice, cats, fish, and birds — are tracked on the population-over-time chart** (cats, fish, and birds share a secondary scale), shown as live counts in the metrics, and clickable in the inspector.

### Interface

- **Click any animal** for a floating info popup with live stats (state, age, health, hunger, thirst, traits; for cats, food reserve and kills). Close it with the ×.
- **Fullscreen** button (in the control bar or the ⛶ at the corner of the view) expands the simulation to fill the screen.
- **Resolution** — four world sizes that change how many animals fit: **Burrow** (small), **Colony** (the standard size), **City** (large), and **Metropolis** (x-large, ~8,000 mouse capacity).

> Note: the original Python/pygame version (`main.py`) was incomplete — `visualizer.py` was missing its `update()` and `draw()` methods, so it crashed on launch. The web dashboard is the working, easy-to-use version. The Python files are kept for reference.

---


## About the Experiment

Universe 25 was a real behavioral experiment conducted by ethologist John B. Calhoun. The experiment involved creating a "mouse utopia" - an environment with unlimited food, water, and nesting material, but with physical space constraints. Despite the abundance of resources, the mouse society eventually collapsed due to behavioral changes triggered by increasing population density.

The experiment became a metaphor for:
- Urban overpopulation
- Social alienation
- Psychological deterioration from loss of purpose or structure

## Simulation Features

This simulation recreates the key aspects of the Universe 25 experiment:

- **Environment**: A bounded space with abundant resources
- **Mice Agents**: Individual mice with traits, needs, and behaviors
- **Population Dynamics**: Birth, death, and social interactions
- **Density Effects**: Behavioral changes based on population density
- **Phase Progression**: The four phases observed in the original experiment
  - Exploration & Settlement
  - Rapid Population Growth
  - Social Breakdown
  - Collapse

## How to Run

1. Ensure you have Python 3.6+ installed
2. Install required packages:
   ```
   pip install pygame numpy matplotlib
   ```
3. Run the simulation:
   ```
   python main.py
   ```


---

## 🛠 Optional: Use a Virtual Environment (Recommended)

To isolate dependencies and avoid package conflicts, you can use the included setup script.

### 🧪 To run the script:

1. Save the script below as `setup_env.sh` in your project folder  
2. In Terminal, make it executable:
   ```
   chmod +x setup_env.sh
   ```
3. Then run it:
   ```
   ./setup_env.sh
   ```

This will:
- Install Python 3.10 via `pyenv` (if not already installed)
- Create a virtual environment called `env`
- Install `pygame`, `numpy`, and `matplotlib`

### 🧭 Afterwards:
To reactivate the environment in a new terminal session:
```
source env/bin/activate
```

Want a version tailored for multiple projects, custom Python versions, or named environments? Feel free to ask!


## Controls

- **Pause/Play**: Pause or resume the simulation
- **Speed**: Cycle through simulation speeds (1x, 2x, 5x, 10x, 20x)
- **Reset**: Reset the simulation to initial conditions
- **Mouse Selection**: Click on a mouse to view its detailed information

## Simulation Phases

### Phase 1: Exploration & Settlement
- Small initial population explores the environment
- Healthy social interactions and reproduction
- Balanced territorial behavior

### Phase 2: Rapid Population Growth
- Population increases exponentially
- Social structures form
- Early signs of crowding appear

### Phase 3: Social Breakdown
- Population reaches critical density
- Aggressive behaviors increase
- Maternal neglect rises
- "Beautiful Ones" (withdrawn, well-groomed, non-reproductive mice) begin to appear
- Birth rate starts to decline

### Phase 4: Collapse
- Birth rate plummets
- Social roles dissolve
- Even as population declines, behaviors don't recover
- Population trends toward extinction

## Mouse Behaviors

Mice in the simulation exhibit various behaviors based on their traits and the environment:

- **Normal**: Regular mice with balanced behaviors
- **Aggressors**: Frequently attack others and disrupt social structures
- **Withdrawn/"Beautiful Ones"**: Avoid all social contact, focus on grooming, don't reproduce
- **Neglectful Parents**: Abandon offspring, contributing to population decline

## Statistics and Visualization

The simulation provides real-time statistics and visualizations:

- Population count and density
- Gender and age distribution
- Mental state distribution
- Trait averages (aggression, sociability, parenting, grooming)
- Population graph over time
- Mental state distribution graph

## Educational Value

This simulation can be used to explore concepts such as:
- Population dynamics and carrying capacity
- Effects of overcrowding on social behavior
- The paradox of material abundance without purpose
- Social structures and their breakdown

## Code Structure

- `main.py`: Entry point for the simulation
- `mouse.py`: Defines the Mouse class with behaviors and traits
- `simulation.py`: Manages the environment and population dynamics
- `visualizer.py`: Handles the graphical interface and statistics

## Credits

This simulation is based on John B. Calhoun's Universe 25 experiment, which was conducted at the National Institute of Mental Health (NIMH) from 1968 to 1972.
Gamified by Unicorn0_0Cakes in 2025.

## License

This project is open source and available for educational purposes.
MIT License
