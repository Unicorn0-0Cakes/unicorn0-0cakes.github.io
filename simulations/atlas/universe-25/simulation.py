import numpy as np
import random

class Simulation:
    """
    Main simulation class for Universe 25.
    Manages the environment, mice population, and simulation progression.
    """
    
    # Simulation phases
    PHASES = {
        'EXPLORATION': 0,
        'GROWTH': 1,
        'BREAKDOWN': 2,
        'COLLAPSE': 3
    }
    
    def __init__(self, width, height, initial_population=10):
        """
        Initialize the simulation with grid dimensions and initial population.
        
        Args:
            width (int): Width of the simulation grid
            height (int): Height of the simulation grid
            initial_population (int): Number of mice to start with
        """
        self.width = width
        self.height = height
        self.grid = np.zeros((height, width), dtype=int)
        self.mice = []
        self.dead_mice = []
        self.current_tick = 0
        self.current_phase = self.PHASES['EXPLORATION']
        
        # Statistics tracking
        self.population_history = []
        self.births_history = []
        self.deaths_history = []
        self.state_distribution_history = []
        self.role_distribution_history = []
        
        # Phase transition thresholds
        self.phase_thresholds = {
            'GROWTH': 0.2,      # 20% of capacity
            'BREAKDOWN': 0.6,   # 60% of capacity
            'COLLAPSE': 0.8     # 80% of capacity
        }
        
        # Maximum theoretical capacity (mice per cell)
        self.max_density = 0.8  # Max 0.8 mice per cell on average
        self.max_capacity = int(width * height * self.max_density)
        
        # Create initial population
        self._create_initial_population(initial_population)
    
    def _create_initial_population(self, count):
        """
        Create the initial mouse population.
        
        Args:
            count (int): Number of mice to create
        """
        for _ in range(count):
            # Place mice randomly in the grid
            x = random.randint(0, self.width - 1)
            y = random.randint(0, self.height - 1)
            
            # Create mouse with no parents (first generation)
            from mouse import Mouse
            mouse = Mouse(x, y, self)
            
            # Add to simulation
            self.add_mouse(mouse)
    
    def add_mouse(self, mouse):
        """
        Add a mouse to the simulation.
        
        Args:
            mouse: Mouse object to add
            
        Returns:
            bool: True if mouse was added successfully, False otherwise
        """
        # Check if we're at capacity
        if len(self.mice) >= self.max_capacity:
            return False
            
        self.mice.append(mouse)
        return True
    
    def update(self):
        """
        Update the simulation for one time step.
        Updates all mice, handles births/deaths, and updates statistics.
        
        Returns:
            dict: Statistics for this tick
        """
        self.current_tick += 1
        
        # Update all mice
        new_mice = []  # For mice born during this tick
        
        for mouse in self.mice[:]:  # Copy list to allow modification during iteration
            if mouse.is_alive:
                still_alive = mouse.update()
                if not still_alive:
                    self.mice.remove(mouse)
                    self.dead_mice.append(mouse)
            else:
                self.mice.remove(mouse)
                self.dead_mice.append(mouse)
        
        # Add any new mice born during this tick
        self.mice.extend(new_mice)
        
        # Update phase based on population density
        self._update_phase()
        
        # Update statistics
        stats = self._update_statistics()
        
        return stats
    
    def _update_phase(self):
        """
        Update the simulation phase based on population density.
        """
        density_factor = self.get_density_factor()
        
        # Phase transitions
        if self.current_phase == self.PHASES['EXPLORATION']:
            if density_factor >= self.phase_thresholds['GROWTH']:
                self.current_phase = self.PHASES['GROWTH']
        elif self.current_phase == self.PHASES['GROWTH']:
            if density_factor >= self.phase_thresholds['BREAKDOWN']:
                self.current_phase = self.PHASES['BREAKDOWN']
        elif self.current_phase == self.PHASES['BREAKDOWN']:
            if density_factor >= self.phase_thresholds['COLLAPSE']:
                self.current_phase = self.PHASES['COLLAPSE']
    
    def _update_statistics(self):
        """
        Update simulation statistics.
        
        Returns:
            dict: Current statistics
        """
        # Count mice in each state and role
        from mouse import Mouse
        state_counts = {state: 0 for state in Mouse.STATES.values()}
        role_counts = {role: 0 for role in Mouse.ROLES.values()}
        
        for mouse in self.mice:
            state_counts[mouse.mental_state] += 1
            role_counts[mouse.social_role] += 1
        
        # Calculate percentages
        total_mice = len(self.mice)
        state_percentages = {state: (count / total_mice * 100 if total_mice > 0 else 0) 
                            for state, count in state_counts.items()}
        role_percentages = {role: (count / total_mice * 100 if total_mice > 0 else 0) 
                           for role, count in role_counts.items()}
        
        # Update history
        self.population_history.append(total_mice)
        self.state_distribution_history.append(state_percentages)
        self.role_distribution_history.append(role_percentages)
        
        # Calculate births and deaths since last tick
        births = 0  # Would need to track this during mouse updates
        deaths = len(self.dead_mice) - sum(self.deaths_history) if self.deaths_history else 0
        
        self.births_history.append(births)
        self.deaths_history.append(deaths)
        
        # Return current statistics
        return {
            'tick': self.current_tick,
            'population': total_mice,
            'density_factor': self.get_density_factor(),
            'phase': self.current_phase,
            'state_distribution': state_percentages,
            'role_distribution': role_percentages,
            'births': births,
            'deaths': deaths
        }
    
    def get_density_factor(self):
        """
        Calculate the current population density factor (0.0 to 1.0).
        
        Returns:
            float: Density factor
        """
        return len(self.mice) / self.max_capacity if self.max_capacity > 0 else 0
    
    def get_local_density(self, x, y, radius=2):
        """
        Calculate local population density around a point.
        
        Args:
            x (int): X-coordinate
            y (int): Y-coordinate
            radius (int): Radius to check
            
        Returns:
            int: Number of mice in the area
        """
        count = 0
        for mouse in self.mice:
            if (abs(mouse.x - x) <= radius and 
                abs(mouse.y - y) <= radius):
                count += 1
        return count
    
    def find_potential_mates(self, mouse):
        """
        Find potential mates for a mouse.
        
        Args:
            mouse: Mouse looking for a mate
            
        Returns:
            list: List of potential mate mice
        """
        potential_mates = []
        
        for other in self.mice:
            # Skip self, same gender, or non-adults
            if (other is mouse or 
                other.gender == mouse.gender or 
                other.age < other.ADULT_AGE or
                not other.is_alive):
                continue
                
            # Skip mice that are withdrawn or beautiful ones
            if (other.mental_state == other.STATES['WITHDRAWN'] or
                other.mental_state == other.STATES['BEAUTIFUL_ONE']):
                continue
                
            # Check if close enough
            if (abs(other.x - mouse.x) <= 1 and 
                abs(other.y - mouse.y) <= 1):
                potential_mates.append(other)
        
        return potential_mates
    
    def get_nearby_mice(self, x, y, radius=1):
        """
        Get mice near a location.
        
        Args:
            x (int): X-coordinate
            y (int): Y-coordinate
            radius (int): Search radius
            
        Returns:
            list: Nearby mice
        """
        nearby = []
        for mouse in self.mice:
            if mouse.is_alive and (abs(mouse.x - x) <= radius and abs(mouse.y - y) <= radius):
                if mouse.x != x or mouse.y != y:  # Exclude mouse at exact position
                    nearby.append(mouse)
        return nearby
    
    def find_least_crowded_direction(self, x, y):
        """
        Find the direction with fewest mice.
        
        Args:
            x (int): X-coordinate
            y (int): Y-coordinate
            
        Returns:
            tuple: Direction as (dx, dy) or None
        """
        directions = [(-1, -1), (-1, 0), (-1, 1), 
                     (0, -1),           (0, 1),
                     (1, -1),  (1, 0),  (1, 1)]
        
        min_count = float('inf')
        best_dir = None
        
        for dx, dy in directions:
            new_x, new_y = x + dx, y + dy
            
            # Check if position is valid
            if not self.is_valid_position(new_x, new_y):
                continue
                
            # Count mice at this position
            count = 0
            for mouse in self.mice:
                if mouse.x == new_x and mouse.y == new_y:
                    count += 1
            
            if count < min_count:
                min_count = count
                best_dir = (dx, dy)
        
        return best_dir
    
    def is_valid_position(self, x, y):
        """
        Check if a position is within the grid bounds.
        
        Args:
            x (int): X-coordinate
            y (int): Y-coordinate
            
        Returns:
            bool: True if position is valid
        """
        return 0 <= x < self.width and 0 <= y < self.height
    
    def get_phase_name(self):
        """
        Get the current phase name.
        
        Returns:
            str: Phase name
        """
        phase_names = {v: k for k, v in self.PHASES.items()}
        return phase_names[self.current_phase]
    
    def get_statistics(self):
        """
        Get comprehensive statistics about the simulation.
        
        Returns:
            dict: Statistics
        """
        # Calculate average traits
        avg_aggression = 0
        avg_sociability = 0
        avg_parenting = 0
        avg_grooming = 0
        
        if self.mice:
            avg_aggression = sum(m.aggression for m in self.mice) / len(self.mice)
            avg_sociability = sum(m.sociability for m in self.mice) / len(self.mice)
            avg_parenting = sum(m.parenting for m in self.mice) / len(self.mice)
            avg_grooming = sum(m.grooming for m in self.mice) / len(self.mice)
        
        # Count by gender
        males = sum(1 for m in self.mice if m.gender == 'male')
        females = sum(1 for m in self.mice if m.gender == 'female')
        
        # Count by age group
        from mouse import Mouse
        juveniles = sum(1 for m in self.mice if m.age < Mouse.ADULT_AGE)
        adults = sum(1 for m in self.mice if m.age >= Mouse.ADULT_AGE)
        
        return {
            'population': len(self.mice),
            'dead_count': len(self.dead_mice),
            'density_factor': self.get_density_factor(),
            'phase': self.get_phase_name(),
            'tick': self.current_tick,
            'gender_ratio': {'male': males, 'female': females},
            'age_groups': {'juvenile': juveniles, 'adult': adults},
            'avg_traits': {
                'aggression': avg_aggression,
                'sociability': avg_sociability,
                'parenting': avg_parenting,
                'grooming': avg_grooming
            }
        }
