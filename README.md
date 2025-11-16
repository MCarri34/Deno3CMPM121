# CMPM 121 D3 Project

## World of Bits - D3.a (Completed)

Core mechanics for _World of Bits_, a map-based crafting game built with Leaflet.
Players pick up tokens from nearby cells and combine equal ones to craft higher-value tokens.

### D3.a Features

- Leaflet map centered on Center of Campus
- Deterministic token spawning using `luck`
- One-token inventory system with visible hand status
- Equal-value crafting doubles token value
- Tuned visuals: clear contrast between nearby and far cells
- Token color: `#ff7f7fff`
- Playtested: players can reach the target tokens within the starting area

## World of Bits - D3.b Completed

Expanded gameplay across a globe-spanning grid.\
Players can move their character across the map, collect tokens from new regions, and craft higher-value tokens.

### D3.b Features

- Global rectilinear grid anchored at (0,0)
- Movement buttons (N, S, E, W) simulate walking one cell at a time
- Dynamic cell spawning/despawning as the player moves
- Memoryless cells reset when off-screen (farming allowed)
- Target token threshold to 32 for new win condition
- Fixed north/south inversion for accurate geographic movement

## World of Bits - D3.c Completed

Cells now persist their state while playing, using memory-efficient design patterns.\
Modified cells remember their token values even when scrolled off-screen, preventing farming exploits.

### D3.c Features

- Persistent `Map<CellKey, CellState>` for storing only changed cells
- **Flyweight pattern:** unmodified cells use deterministic generation, saving memory
- **Memento pattern:** modified cells are restored from stored state when revisited
- Grid display rebuilt dynamically from persistent data each move
- Prevents infinite token farming by preserving cell memory
- State persistence works within a session (page reload resets progress)

## World of Bits - D3.d Completed

The game now supports real-world movement and persistent progress.\
Players can move by physically walking around or by using the button-based simulator, and all game state is saved automatically across sessions.

### D3.d Features

- Geolocation-based movement using `navigator.geolocation.watchPosition`
- Option to switch between geolocation and button-based movement at runtime
- Movement system encapsulated using a `MovementController` interface (Facade pattern)
- All game state (player cell, held token, modified cells) saved in `localStorage`
- Game automatically reloads previous progress on startup
- New Game button clears saved data and restarts the world
- Fully supports multi-session play using both real-world and simulated movement
