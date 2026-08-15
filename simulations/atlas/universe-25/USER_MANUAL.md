# Universe 25 Simulation - User Manual

## Introduction

Welcome to the Universe 25 Simulation, a digital recreation of John B. Calhoun's famous behavioral experiment from the 1960s-70s. This simulation allows you to observe how population density affects social behavior in a "mouse utopia" with unlimited resources but limited space.

## Installation

### System Requirements
- Python 3.6 or higher
- 2GB RAM minimum
- 500MB free disk space

### Required Packages
- pygame
- numpy
- matplotlib

### Installation Steps
1. Ensure Python 3.6+ is installed on your system
2. Install the required packages using pip:
   ```
   pip install pygame numpy matplotlib
   ```
3. Extract the Universe25 simulation files to a directory of your choice

## Running the Simulation

1. Open a terminal or command prompt
2. Navigate to the Universe25 directory
3. Run the simulation with:
   ```
   python main.py
   ```

## User Interface

The simulation window is divided into three main sections:

### 1. Simulation Grid (Left)
- Displays the environment and mice
- Each colored dot represents a mouse
- Colors indicate mouse mental states:
  - Green: Normal
  - Yellow: Stressed
  - Red: Aggressive
  - Blue: Withdrawn
  - Purple: Beautiful One (withdrawn, well-groomed)
- Gray dots represent dead mice

### 2. Statistics Panel (Right)
- Shows current simulation statistics
- Displays phase information
- Shows population counts and demographics
- Displays average trait values
- Shows selected mouse information when a mouse is clicked
- Contains population and mental state graphs

### 3. Control Panel (Bottom)
- Contains buttons to control the simulation

## Controls

### Buttons
- **Pause/Play**: Toggles between pausing and running the simulation
- **Speed**: Cycles through simulation speeds (1x, 2x, 5x, 10x, 20x)
- **Reset**: Resets the simulation to initial conditions

### Mouse Interaction
- **Click on a mouse**: Selects the mouse and displays its detailed information in the statistics panel
- **Click on empty space**: Deselects the current mouse

## Understanding the Simulation

### Phases
The simulation progresses through four distinct phases:

1. **Exploration & Settlement (Green)**
   - Initial small population explores the environment
   - Healthy social interactions and reproduction
   - Balanced territorial behavior

2. **Rapid Population Growth (Cyan)**
   - Population increases exponentially
   - Social structures form
   - Early signs of crowding appear

3. **Social Breakdown (Yellow)**
   - Population reaches critical density
   - Aggressive behaviors increase
   - Maternal neglect rises
   - "Beautiful Ones" begin to appear
   - Birth rate starts to decline

4. **Collapse (Red)**
   - Birth rate plummets
   - Social roles dissolve
   - Even as population declines, behaviors don't recover
   - Population trends toward extinction

### Mouse Traits and Behaviors

Each mouse has the following traits (0-100 scale):
- **Aggression**: Tendency to attack other mice
- **Sociability**: Desire for social interaction
- **Parenting**: Ability to care for offspring
- **Grooming**: Time spent on self-care

These traits influence the mouse's behavior and role in the society:
- **Normal**: Regular mice with balanced behaviors
- **Aggressors**: Frequently attack others and disrupt social structures
- **Withdrawn/"Beautiful Ones"**: Avoid all social contact, focus on grooming, don't reproduce
- **Neglectful Parents**: Abandon offspring, contributing to population decline

### Statistics and Graphs

The simulation provides two main graphs:
1. **Population Graph**: Shows the total population over time
2. **Mental States Graph**: Shows the percentage of mice in each mental state over time

Additional statistics displayed include:
- Current tick (time unit)
- Population count
- Population density
- Gender distribution
- Age distribution (juveniles vs. adults)
- Death count
- Average trait values

## Interpreting Results

As you observe the simulation, pay attention to:

1. **Phase Transitions**: Note when and why the simulation moves from one phase to another
2. **Behavioral Changes**: Observe how mouse behaviors change as density increases
3. **Population Dynamics**: Watch the birth and death rates throughout the simulation
4. **Social Breakdown**: Notice the emergence of "Beautiful Ones" and the collapse of parenting behaviors
5. **Point of No Return**: Identify if/when the population reaches a point where recovery becomes impossible

## Troubleshooting

### Common Issues

1. **Simulation runs slowly**
   - Try reducing the window size
   - Close other applications to free up system resources
   - Use a lower simulation speed

2. **Graphs not displaying**
   - Ensure matplotlib is properly installed
   - Try restarting the simulation

3. **Crashes on startup**
   - Verify all required packages are installed
   - Check Python version (3.6+ required)

### Contact Support

If you encounter issues not covered in this manual, please contact support at:
[support@universe25simulation.com](mailto:support@universe25simulation.com)

## Educational Use

This simulation is designed for educational purposes and can be used to explore:
- Population dynamics and carrying capacity
- Effects of overcrowding on social behavior
- The paradox of material abundance without purpose
- Social structures and their breakdown

Teachers and educators are encouraged to use this simulation as a teaching tool for subjects related to sociology, psychology, ecology, and urban planning.

## License

This project is open source and available for educational purposes.
