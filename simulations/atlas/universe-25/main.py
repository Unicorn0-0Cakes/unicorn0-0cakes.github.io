
from simulation import Simulation
from visualizer import Visualizer

if __name__ == "__main__":
    sim = Simulation(100, 100, 10)
    visualizer = Visualizer(sim)
    visualizer.run()
