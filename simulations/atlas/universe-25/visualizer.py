
import pygame
import sys
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.backends.backend_agg import FigureCanvasAgg
from simulation import Simulation
from mouse import Mouse

class Visualizer:
    BACKGROUND_COLOR = (240, 240, 240)
    GRID_COLOR = (200, 200, 200)
    TEXT_COLOR = (0, 0, 0)
    BUTTON_COLOR = (180, 180, 180)
    BUTTON_HOVER_COLOR = (150, 150, 150)
    BUTTON_TEXT_COLOR = (0, 0, 0)

    PHASE_COLORS = {
        0: (100, 200, 100),
        1: (100, 200, 200),
        2: (200, 200, 100),
        3: (200, 100, 100)
    }

    def __init__(self, simulation, width=1200, height=800, cell_size=8):
        self.simulation = simulation
        self.width = width
        self.height = height
        self.cell_size = cell_size
        self.fullscreen = False

        pygame.init()
        self.screen = pygame.display.set_mode((width, height), pygame.RESIZABLE)
        pygame.display.set_caption("Universe 25 Simulation")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont('Arial', 16)
        self.title_font = pygame.font.SysFont('Arial', 24, bold=True)

        self.grid_width = simulation.width * cell_size
        self.grid_height = simulation.height * cell_size
        self.grid_surface = pygame.Surface((self.grid_width, self.grid_height))

        self.stats_width = 400
        self.stats_height = self.height
        self.stats_surface = pygame.Surface((self.stats_width, self.stats_height))

        self.control_height = 60
        self.control_width = self.grid_width
        self.control_surface = pygame.Surface((self.control_width, self.control_height))

        self.graph_width = int(self.stats_width * 0.95)
        self.graph_height = int(self.height * 0.35)

        self.buttons = []
        self._create_buttons()

        self.speed = 1
        self.paused = False
        self.selected_mouse = None

        self.population_graph = None
        self.state_graph = None

    def _create_buttons(self):
        button_width = 100
        button_height = 30
        padding = 10

        self.buttons.append({
            'rect': pygame.Rect(padding, 15, button_width, button_height),
            'text': 'Pause',
            'action': self.toggle_pause
        })
        self.buttons.append({
            'rect': pygame.Rect(padding*2 + button_width, 15, button_width, button_height),
            'text': 'Speed: 1x',
            'action': self.cycle_speed
        })
        self.buttons.append({
            'rect': pygame.Rect(padding*3 + button_width*2, 15, button_width, button_height),
            'text': 'Reset',
            'action': self.reset_simulation
        })
        self.buttons.append({
            'rect': pygame.Rect(padding*4 + button_width*3, 15, button_width, button_height),
            'text': 'Fullscreen',
            'action': self.toggle_fullscreen
        })

    def toggle_pause(self):
        self.paused = not self.paused
        self.buttons[0]['text'] = 'Play' if self.paused else 'Pause'

    def cycle_speed(self):
        speeds = [1, 2, 5, 10, 20]
        idx = speeds.index(self.speed)
        self.speed = speeds[(idx + 1) % len(speeds)]
        self.buttons[1]['text'] = f"Speed: {self.speed}x"

    def reset_simulation(self):
        width = self.simulation.width
        height = self.simulation.height
        self.simulation = Simulation(width, height, 10)
        self.selected_mouse = None

    def toggle_fullscreen(self):
        """Toggle fullscreen mode."""
        self.fullscreen = not getattr(self, 'fullscreen', False)
        if self.fullscreen:
            display_info = pygame.display.Info()
            self.width, self.height = display_info.current_w, display_info.current_h
            self.screen = pygame.display.set_mode((self.width, self.height), pygame.FULLSCREEN)
        else:
            self.width, self.height = 1200, 800
            self.screen = pygame.display.set_mode((self.width, self.height), pygame.RESIZABLE)

        # Recalculate layout
        self.grid_width = self.simulation.width * self.cell_size
        self.grid_height = self.simulation.height * self.cell_size
        self.stats_height = self.height
        self.control_width = self.width
        self.graph_width = int(self.stats_width * 0.95)
        self.graph_height = int(self.height * 0.35)

        self.grid_surface = pygame.Surface((self.grid_width, self.grid_height))
        self.stats_surface = pygame.Surface((self.stats_width, self.stats_height))
        self.control_surface = pygame.Surface((self.control_width, self.control_height))

    def run(self):
        while True:
            self.update()
            self.draw()
            pygame.display.flip()
