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

## World of Bits – D3.b Completed

Expanded gameplay across a globe-spanning grid.\
Players can move their character across the map, collect tokens from new regions, and craft higher-value tokens.

### D3.b Features

- Global rectilinear grid anchored at (0,0)
- Movement buttons (N, S, E, W) simulate walking one cell at a time
- Dynamic cell spawning/despawning as the player moves
- Memoryless cells reset when off-screen (farming allowed)
- Target token threshold to 32 for new win condition
- Fixed north/south inversion for accurate geographic movement
