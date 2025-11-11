# D3: World of Bits

## Game Design Vision

World of Bits is a location-aware crafting game played on a grid laid over the real world. Each cell can hold at most one token. Players can only interact with cells near their location, picking up one token at a time and combining equal-value tokens to build stronger ones. The long-term goal is to move through real space, manage limited reach, and climb up to a high-value token without ever breaking the one-token-in-hand rule.

## Technologies

- TypeScript for game logic
- Leaflet for the interactive map UI
- Luck-based deterministic token spawning with `_luck.ts`
- Minimal HTML built in `main.ts`, shared styles in `style.css`
- Deno + Vite for building
- GitHub Actions + GitHub Pages for deployment

## D3.a: Core mechanics (token collection and crafting)

Key technical challenge: assemble a Leaflet map UI with a visible grid and deterministic token spawning.
Key gameplay challenge: players can collect and craft tokens from nearby cells to make a sufficiently high-value token.

### D3.a Steps

- [x] Remove original starter interaction code and rebuild `main.ts` around our own structure
- [x] Create basic layout containers in code (`controlPanel`, `statusPanel`, `map`)
- [x] Put a Leaflet map on screen centered on the classroom location
- [x] Draw a rectilinear grid of cells over the map using a fixed cell size
- [x] Use `luck(...)` to give each cell a consistent initial token state (0 or 1)
- [x] Make cell contents visible without clicking (labels / colors)
- [x] Add a clear marker for the player’s fixed position
- [x] Limit interactions so only nearby cells (about 3 cells away) are usable
- [x] Implement one-token inventory UI (hand visible at all times)
- [x] Picking up: clicking a nearby cell with a token moves that token into hand and clears the cell
- [x] Placing: clicking a nearby empty cell while holding a token drops it there
- [x] Crafting: clicking a nearby cell with a token of equal value consumes that cell token and upgrades the held token to double value
- [x] Detect when held token reaches the target value (e.g. 16) and show a win message
- [x] Light tuning of visuals so nearby / non-nearby cells are easy to read
- [x] Small playtest pass: can I reasonably reach the target token from the starting area?

## D3.b: Globe-spanning gameplay

Key technical challenge: Can you set up your implementation to support gameplay anywhere in the real world, not just locations near our classroom?
Key gameplay challenge: Can players craft an even higher value token by moving to other locations to get access to additional crafting materials?

### D3.b Steps

- [x] Add buttons to move player N/S/E/W by one grid step
- [x] Represent grid cells using earth-spanning coordinates anchored at (0,0)
- [x] Compute cell indices (i,j) from lat/lng and back to bounds
- [x] Use `moveend` to spawn/despawn cells so grid fills the visible map
- [x] Keep map scroll independent of player; only nearby cells are interactive
- [x] Make cells “memoryless” by dropping their state when they leave the visible region
- [x] Increase required victory threshold above D3.a (e.g. 32)
- [x] Verify player can craft up to the new threshold by moving and farming tokens

## D3.c: Object persistence

Key technical challenge: Can your software accurately remember the state of map cells even when they scroll off the screen?
Key gameplay challenge: Can you fix a gameplay bug where players can farm tokens by moving into and out of a region repeatedly to get access to fresh resources?

### D3.c Steps

- [x] Introduce persistent `Map<CellKey, CellState>` keyed by cell coordinates
- [x] Store only modified cells (Flyweight-style) to save memory
- [x] Stop deleting modified cell state when cells scroll off-screen
- [x] On each `moveend`, rebuild visible cells from deterministic base + stored state
- [x] Ensure modified cells reappear with correct tokens when they come back into view
- [x] Confirm farming exploit is now prevented by persistent cell memory (within a session)

## D3.d: Gameplay across real-world space and time

Key technical challenges: Can your software remember game state even when the page is closed? Is the player character’s in-game movement controlled by the real-world geolocation of their device?
Key gameplay challenge: Can the user test the game with multiple gameplay sessions, some involving real-world movement and some involving simulated movement?

### D3.d Steps

- [ ] Hook in real geolocation for player marker
- [ ] Store game state in persistent storage so closing / reopening keeps progress
- [ ] Support multiple sessions and simple simulated movement for testing
