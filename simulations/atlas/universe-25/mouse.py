import random
import numpy as np

class Mouse:
    """
    Represents a mouse agent in the Universe 25 simulation.
    Each mouse has basic needs, social traits, and states that evolve based on
    interactions and environmental conditions.
    """
    
    # Class constants
    MAX_AGE = 1000  # Maximum lifespan in simulation ticks
    ADULT_AGE = 200  # Age at which reproduction becomes possible
    HUNGER_RATE = 0.5  # Rate at which hunger increases per tick
    ENERGY_RATE = 0.3  # Rate at which energy decreases per tick
    
    # Mouse states
    STATES = {
        'NORMAL': 0,
        'STRESSED': 1,
        'WITHDRAWN': 2,
        'AGGRESSIVE': 3,
        'BEAUTIFUL_ONE': 4
    }
    
    # Social roles
    ROLES = {
        'NORMAL': 0,
        'AGGRESSOR': 1,
        'WITHDRAWN': 2,
        'NEGLECTFUL_PARENT': 3,
        'BEAUTIFUL_ONE': 4
    }
    
    def __init__(self, x, y, simulation, parent1=None, parent2=None):
        """
        Initialize a new mouse with position and optional parent information.
        
        Args:
            x (int): X-coordinate in the grid
            y (int): Y-coordinate in the grid
            simulation: Reference to the main simulation
            parent1 (Mouse, optional): First parent for trait inheritance
            parent2 (Mouse, optional): Second parent for trait inheritance
        """
        self.x = x
        self.y = y
        self.simulation = simulation
        self.age = 0
        self.is_alive = True
        self.gender = random.choice(['male', 'female'])
        
        # Basic needs (0-100)
        self.hunger = 0
        self.energy = 100
        self.reproduction_drive = 0
        
        # Set traits based on parents or random if no parents
        if parent1 and parent2:
            # Inherit traits with slight mutation
            self.aggression = self._inherit_trait(parent1.aggression, parent2.aggression)
            self.sociability = self._inherit_trait(parent1.sociability, parent2.sociability)
            self.parenting = self._inherit_trait(parent1.parenting, parent2.parenting)
            self.grooming = self._inherit_trait(parent1.grooming, parent2.grooming)
        else:
            # Random traits for initial population
            self.aggression = random.randint(20, 40)
            self.sociability = random.randint(60, 80)
            self.parenting = random.randint(60, 80)
            self.grooming = random.randint(40, 60)
        
        # Current state
        self.mental_state = self.STATES['NORMAL']
        self.physical_health = 100
        self.social_role = self.ROLES['NORMAL']
        
        # Reproduction tracking
        self.pregnancy_timer = 0
        self.is_pregnant = False
        self.children = []
        self.parent1 = parent1
        self.parent2 = parent2
        
        # Behavior tracking
        self.last_mating_time = 0
        self.last_interaction_time = 0
        self.nest_location = None
        self.target_location = None
        
    def _inherit_trait(self, trait1, trait2):
        """
        Inherit a trait from parents with slight mutation.
        
        Args:
            trait1 (float): Trait value from first parent
            trait2 (float): Trait value from second parent
            
        Returns:
            float: Inherited trait value
        """
        # Average parents' traits with random variation
        base = (trait1 + trait2) / 2
        mutation = random.uniform(-10, 10)
        result = base + mutation
        
        # Ensure trait stays within bounds
        return max(0, min(100, result))
    
    def update(self):
        """
        Update the mouse state for one simulation tick.
        Handles aging, needs, state transitions, and actions.
        
        Returns:
            bool: True if mouse is still alive, False if it died
        """
        if not self.is_alive:
            return False
            
        # Age the mouse
        self.age += 1
        
        # Update basic needs
        self.hunger = min(100, self.hunger + self.HUNGER_RATE)
        self.energy = max(0, self.energy - self.ENERGY_RATE)
        
        # Handle reproduction drive based on age
        if self.age >= self.ADULT_AGE:
            if self.gender == 'female' and not self.is_pregnant:
                self.reproduction_drive = min(100, self.reproduction_drive + 0.2)
            elif self.gender == 'male':
                self.reproduction_drive = min(100, self.reproduction_drive + 0.3)
        
        # Check for death conditions
        if self.age >= self.MAX_AGE or self.hunger >= 100 or self.physical_health <= 0:
            self.is_alive = False
            return False
            
        # Update pregnancy if applicable
        if self.is_pregnant:
            self.pregnancy_timer += 1
            if self.pregnancy_timer >= 100:  # Pregnancy duration
                self._give_birth()
        
        # Update mental state based on population density
        self._update_mental_state()
        
        # Determine and perform action
        self._perform_action()
        
        return True
    
    def _update_mental_state(self):
        """
        Update the mouse's mental state based on population density and interactions.
        """
        # Calculate local density (number of mice in surrounding cells)
        local_density = self.simulation.get_local_density(self.x, self.y)
        density_factor = self.simulation.get_density_factor()
        
        # Adjust mental state based on density
        if density_factor < 0.3:
            # Low density - normal behavior
            target_state = self.STATES['NORMAL']
        elif density_factor < 0.6:
            # Medium density - some stress
            if random.random() < 0.3:
                target_state = self.STATES['STRESSED']
            else:
                target_state = self.STATES['NORMAL']
        elif density_factor < 0.8:
            # High density - stress or withdrawal
            if self.sociability > 70:
                target_state = self.STATES['STRESSED']
            elif self.grooming > 70:
                target_state = self.STATES['WITHDRAWN']
            elif self.aggression > 70:
                target_state = self.STATES['AGGRESSIVE']
            else:
                target_state = self.STATES['STRESSED']
        else:
            # Extreme density - withdrawal or aggression
            if self.grooming > 60:
                if random.random() < 0.4:
                    target_state = self.STATES['BEAUTIFUL_ONE']
                else:
                    target_state = self.STATES['WITHDRAWN']
            elif self.aggression > 50:
                target_state = self.STATES['AGGRESSIVE']
            else:
                target_state = self.STATES['WITHDRAWN']
        
        # Gradually transition to target state
        if self.mental_state != target_state:
            if random.random() < 0.1:  # 10% chance to change state each tick
                self.mental_state = target_state
                
                # Update social role based on mental state
                if self.mental_state == self.STATES['AGGRESSIVE']:
                    self.social_role = self.ROLES['AGGRESSOR']
                elif self.mental_state == self.STATES['WITHDRAWN']:
                    self.social_role = self.ROLES['WITHDRAWN']
                elif self.mental_state == self.STATES['BEAUTIFUL_ONE']:
                    self.social_role = self.ROLES['BEAUTIFUL_ONE']
                    # Beautiful Ones have high grooming
                    self.grooming = min(100, self.grooming + 10)
                elif self.parenting < 30:
                    self.social_role = self.ROLES['NEGLECTFUL_PARENT']
                else:
                    self.social_role = self.ROLES['NORMAL']
    
    def _perform_action(self):
        """
        Determine and perform the mouse's action for this tick based on needs and state.
        """
        # Priority 1: Eat if hungry
        if self.hunger > 70:
            self._find_food()
            return
            
        # Priority 2: Sleep if tired
        if self.energy < 30:
            self._sleep()
            return
            
        # Priority 3: Reproduction if conditions are right
        if (self.reproduction_drive > 70 and 
            self.age >= self.ADULT_AGE and 
            self.mental_state not in [self.STATES['WITHDRAWN'], self.STATES['BEAUTIFUL_ONE']]):
            self._seek_mate()
            return
            
        # Priority 4: Social interaction or state-specific behavior
        if self.mental_state == self.STATES['NORMAL']:
            if random.random() < 0.3:
                self._socialize()
            else:
                self._explore()
        elif self.mental_state == self.STATES['STRESSED']:
            if random.random() < 0.5:
                self._explore()
            else:
                self._hide()
        elif self.mental_state == self.STATES['AGGRESSIVE']:
            self._attack()
        elif self.mental_state == self.STATES['WITHDRAWN']:
            self._hide()
        elif self.mental_state == self.STATES['BEAUTIFUL_ONE']:
            self._groom()
    
    def _find_food(self):
        """
        Find and consume food to reduce hunger.
        """
        # In this simulation, food is always available
        self.hunger = max(0, self.hunger - 30)
        
        # Move to a random adjacent cell
        self._move_randomly()
    
    def _sleep(self):
        """
        Sleep to regain energy.
        """
        self.energy = min(100, self.energy + 20)
        
        # Sleeping mice don't move
        pass
    
    def _seek_mate(self):
        """
        Look for a suitable mate to reproduce.
        """
        # Check if reproduction is possible based on population density
        density_factor = self.simulation.get_density_factor()
        if density_factor > 0.7:
            # High density reduces mating probability
            if random.random() < 0.7:  # 70% chance to skip mating in high density
                self._move_randomly()
                return
        
        # Find potential mates
        potential_mates = self.simulation.find_potential_mates(self)
        
        if potential_mates:
            mate = random.choice(potential_mates)
            self._mate_with(mate)
        else:
            # No suitable mates found, move randomly
            self._move_randomly()
    
    def _mate_with(self, other_mouse):
        """
        Mate with another mouse.
        
        Args:
            other_mouse (Mouse): The mouse to mate with
        """
        # Reset reproduction drive
        self.reproduction_drive = 0
        other_mouse.reproduction_drive = 0
        
        # Record mating time
        current_time = self.simulation.current_tick
        self.last_mating_time = current_time
        other_mouse.last_mating_time = current_time
        
        # Only females can get pregnant
        if self.gender == 'female':
            self.is_pregnant = True
            self.pregnancy_timer = 0
            self.mate = other_mouse
        elif other_mouse.gender == 'female':
            other_mouse.is_pregnant = True
            other_mouse.pregnancy_timer = 0
            other_mouse.mate = self
    
    def _give_birth(self):
        """
        Give birth to offspring after pregnancy.
        """
        self.is_pregnant = False
        self.pregnancy_timer = 0
        
        # Determine number of offspring based on density and parenting
        density_factor = self.simulation.get_density_factor()
        base_litter_size = 4
        
        # Reduce litter size in higher densities
        if density_factor < 0.3:
            litter_size = base_litter_size
        elif density_factor < 0.6:
            litter_size = max(1, base_litter_size - 1)
        else:
            litter_size = max(1, base_litter_size - 2)
        
        # Neglectful parents have smaller litters
        if self.parenting < 30:
            litter_size = max(1, litter_size - 1)
        
        # Create offspring
        for _ in range(litter_size):
            # Check if there's space for the offspring
            if self.simulation.get_density_factor() > 0.9:
                # Too crowded, some offspring don't survive
                if random.random() < 0.7:
                    continue
                    
            # Create new mouse at same location as parent
            baby = Mouse(self.x, self.y, self.simulation, self, self.mate)
            
            # Add to simulation and parent's children list
            success = self.simulation.add_mouse(baby)
            if success:
                self.children.append(baby)
                
                # Neglectful parents may abandon offspring
                if self.parenting < 30 and random.random() < 0.5:
                    baby.physical_health -= 20  # Abandoned babies start with lower health
    
    def _socialize(self):
        """
        Socialize with nearby mice.
        """
        # Find nearby mice
        nearby_mice = self.simulation.get_nearby_mice(self.x, self.y)
        
        if nearby_mice:
            # Interact with a random nearby mouse
            other_mouse = random.choice(nearby_mice)
            
            # Record interaction
            current_time = self.simulation.current_tick
            self.last_interaction_time = current_time
            other_mouse.last_interaction_time = current_time
            
            # Positive interaction increases sociability slightly
            self.sociability = min(100, self.sociability + 0.1)
            
            # Move toward the other mouse
            self._move_toward(other_mouse.x, other_mouse.y)
        else:
            # No nearby mice, move randomly
            self._move_randomly()
    
    def _explore(self):
        """
        Explore the environment by moving randomly.
        """
        self._move_randomly()
    
    def _hide(self):
        """
        Hide from others, typically in withdrawn state.
        """
        # Withdrawn mice prefer less populated areas
        least_crowded_dir = self.simulation.find_least_crowded_direction(self.x, self.y)
        
        if least_crowded_dir:
            dx, dy = least_crowded_dir
            self._move_to(self.x + dx, self.y + dy)
        else:
            # No clear direction, stay put
            pass
    
    def _attack(self):
        """
        Attack nearby mice (aggressive behavior).
        """
        # Find nearby mice
        nearby_mice = self.simulation.get_nearby_mice(self.x, self.y)
        
        if nearby_mice:
            # Attack a random nearby mouse
            target = random.choice(nearby_mice)
            
            # Calculate damage based on aggression
            damage = self.aggression * 0.2
            
            # Apply damage to target
            target.physical_health = max(0, target.physical_health - damage)
            
            # Move toward the target
            self._move_toward(target.x, target.y)
        else:
            # No nearby mice to attack, move randomly
            self._move_randomly()
    
    def _groom(self):
        """
        Self-grooming behavior, typical of Beautiful Ones.
        """
        # Grooming increases physical health slightly
        self.physical_health = min(100, self.physical_health + 0.2)
        
        # Beautiful Ones don't move much
        if random.random() < 0.2:  # 20% chance to move
            self._move_randomly()
    
    def _move_randomly(self):
        """
        Move to a random adjacent cell.
        """
        dx = random.choice([-1, 0, 1])
        dy = random.choice([-1, 0, 1])
        self._move_to(self.x + dx, self.y + dy)
    
    def _move_toward(self, target_x, target_y):
        """
        Move one step toward a target location.
        
        Args:
            target_x (int): Target X-coordinate
            target_y (int): Target Y-coordinate
        """
        dx = 0
        dy = 0
        
        if self.x < target_x:
            dx = 1
        elif self.x > target_x:
            dx = -1
            
        if self.y < target_y:
            dy = 1
        elif self.y > target_y:
            dy = -1
            
        self._move_to(self.x + dx, self.y + dy)
    
    def _move_to(self, new_x, new_y):
        """
        Move to a specific cell if possible.
        
        Args:
            new_x (int): New X-coordinate
            new_y (int): New Y-coordinate
        """
        # Check if the new position is within bounds
        if self.simulation.is_valid_position(new_x, new_y):
            self.x = new_x
            self.y = new_y
    
    def get_color(self):
        """
        Get the color representing this mouse's state for visualization.
        
        Returns:
            tuple: RGB color value
        """
        if not self.is_alive:
            return (100, 100, 100)  # Gray for dead mice
            
        if self.mental_state == self.STATES['NORMAL']:
            return (0, 150, 0)  # Green for normal
        elif self.mental_state == self.STATES['STRESSED']:
            return (200, 200, 0)  # Yellow for stressed
        elif self.mental_state == self.STATES['AGGRESSIVE']:
            return (200, 0, 0)  # Red for aggressive
        elif self.mental_state == self.STATES['WITHDRAWN']:
            return (0, 0, 200)  # Blue for withdrawn
        elif self.mental_state == self.STATES['BEAUTIFUL_ONE']:
            return (200, 0, 200)  # Purple for beautiful ones
        
        return (150, 150, 150)  # Default gray
    
    def get_info(self):
        """
        Get detailed information about this mouse for display.
        
        Returns:
            dict: Mouse information
        """
        state_names = {v: k for k, v in self.STATES.items()}
        role_names = {v: k for k, v in self.ROLES.items()}
        
        return {
            'id': id(self),
            'age': self.age,
            'gender': self.gender,
            'position': (self.x, self.y),
            'hunger': self.hunger,
            'energy': self.energy,
            'reproduction_drive': self.reproduction_drive,
            'aggression': self.aggression,
            'sociability': self.sociability,
            'parenting': self.parenting,
            'grooming': self.grooming,
            'mental_state': state_names[self.mental_state],
            'physical_health': self.physical_health,
            'social_role': role_names[self.social_role],
            'is_pregnant': self.is_pregnant,
            'children_count': len(self.children),
            'is_alive': self.is_alive
        }
