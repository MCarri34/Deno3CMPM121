// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

import "leaflet/dist/leaflet.css";
import "./style.css";

import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

/**
 * D3.a + D3.b - World of Bits
 * Core mechanics + globe-spanning gameplay
 */

// Config

// Start near the classroom for convenience
const START_LAT = 36.9914;
const START_LNG = -122.0609;

// Grid + gameplay tuning
const CELL_SIZE = 0.00025; // degrees per cell, anchored at (0,0)
const INTERACTION_RADIUS = 3; // cells
const TARGET_TOKEN_VALUE = 32; // higher than D3.a
const BASE_TOKEN_PROBABILITY = 0.18;

// Visuals
const COLORS = {
  nearBorder: "#222",
  farBorder: "#bbbbbb",
  nearFill: "#ffe5e5",
  farFill: "#f8f8f8",
  tokenFill: "#ff7f7fff",
};
const OPACITY = {
  emptyNear: 0.22,
  emptyFar: 0.04,
  token: 0.55,
};

// DOM scaffolding

const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
controlPanelDiv.innerHTML = `
  <h1>World of Bits</h1>
  <p>
    Use the movement buttons to move your character by one cell.
    Click nearby cells to pick up tokens, drop them, or combine equal values.
    You can only hold one token at a time.
  </p>
  <div id="moveControls">
    <button id="move-n">N</button>
    <div>
      <button id="move-w">W</button>
      <button id="move-e">E</button>
    </div>
    <button id="move-s">S</button>
  </div>
`;
document.body.appendChild(controlPanelDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.appendChild(statusPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.appendChild(mapDiv);

// Types + helpers

type CellKey = string;

interface CellCoord {
  i: number; // row index
  j: number; // col index
}

interface CellState {
  value: number; // 0 means empty
}

// Convert between lat/lng and cell indices (anchored at Null Island)
function latToRow(lat: number): number {
  return Math.floor(lat / CELL_SIZE);
}

function lngToCol(lng: number): number {
  return Math.floor(lng / CELL_SIZE);
}

function latLngToCellCoord(lat: number, lng: number): CellCoord {
  return {
    i: latToRow(lat),
    j: lngToCol(lng),
  };
}

function cellToBounds(c: CellCoord): [[number, number], [number, number]] {
  const south = c.i * CELL_SIZE;
  const north = (c.i + 1) * CELL_SIZE;
  const west = c.j * CELL_SIZE;
  const east = (c.j + 1) * CELL_SIZE;
  return [
    [south, west],
    [north, east],
  ];
}

function coordKey(c: CellCoord): CellKey {
  return `${c.i},${c.j}`;
}

function keyToCoord(key: CellKey): CellCoord {
  const [i, j] = key.split(",").map(Number);
  return { i, j };
}

function isNearPlayer(c: CellCoord, player: CellCoord): boolean {
  const di = Math.abs(c.i - player.i);
  const dj = Math.abs(c.j - player.j);
  return di <= INTERACTION_RADIUS && dj <= INTERACTION_RADIUS;
}

// Leaflet map setup

const map = leaflet.map(mapDiv).setView([START_LAT, START_LNG], 18);

leaflet
  .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 20,
  })
  .addTo(map);

// Player starts at the cell containing START_LAT/LNG
let playerCell: CellCoord = latLngToCellCoord(START_LAT, START_LNG);

// Player marker lives at the center of their current cell
const playerMarker = leaflet.circleMarker(cellCenterLatLng(playerCell), {
  radius: 7,
  weight: 2,
  color: "#000000",
  fillColor: "#ffffff",
  fillOpacity: 1,
}).addTo(map);

function cellCenterLatLng(c: CellCoord): [number, number] {
  const bounds = cellToBounds(c);
  const lat = (bounds[0][0] + bounds[1][0]) / 2;
  const lng = (bounds[0][1] + bounds[1][1]) / 2;
  return [lat, lng];
}

// Cell state and visuals

// Ephemeral state for visible cells only (memoryless behavior)
const cellStates = new Map<CellKey, CellState>();
const cellRects = new Map<CellKey, leaflet.Rectangle>();
const cellLabels = new Map<CellKey, leaflet.Marker>();

// Deterministic base value (0 or 1) from luck, based only on (i,j)
function baseTokenValue(c: CellCoord): number {
  const roll = luck(`cell:${c.i},${c.j}:token`);
  return roll < BASE_TOKEN_PROBABILITY ? 1 : 0;
}

// Current value: if we have a temporary override, use it; else base
function getCellValue(c: CellCoord): number {
  const key = coordKey(c);
  const state = cellStates.get(key);
  if (state) return state.value;
  return baseTokenValue(c);
}

// Set cell value; this only applies while cell is visible.
// Once the cell scrolls out of view and despawns, we drop this.
function setCellValue(c: CellCoord, value: number): void {
  const key = coordKey(c);
  cellStates.set(key, { value });
  refreshCellVisual(key);
}
// Visible grid management (spawn/despawn on moveend)

function refreshVisibleGrid(): void {
  const bounds = map.getBounds();

  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  // Compute range of cell indices covering the visible area
  const minI = Math.floor(south / CELL_SIZE) - 1;
  const maxI = Math.floor(north / CELL_SIZE) + 1;
  const minJ = Math.floor(west / CELL_SIZE) - 1;
  const maxJ = Math.floor(east / CELL_SIZE) + 1;

  const shouldExist = new Set<CellKey>();

  // Create or update all cells in the visible region
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const coord: CellCoord = { i, j };
      const key = coordKey(coord);
      shouldExist.add(key);

      if (!cellRects.has(key)) {
        // Create new rectangle
        const bounds = cellToBounds(coord);
        const near = isNearPlayer(coord, playerCell);

        const rect = leaflet.rectangle(bounds, {
          weight: near ? 1.4 : 0.6,
          color: near ? COLORS.nearBorder : COLORS.farBorder,
          fillColor: near ? COLORS.nearFill : COLORS.farFill,
          fillOpacity: near ? OPACITY.emptyNear : OPACITY.emptyFar,
        });

        rect.addTo(map);
        rect.on("click", () => handleCellClick(coord));
        cellRects.set(key, rect);
      }

      // Ensure visuals (including token labels) are up to date
      refreshCellVisual(key);
    }
  }

  // Despawn cells that are no longer visible (forget their state)
  for (const [key, rect] of cellRects.entries()) {
    if (!shouldExist.has(key)) {
      rect.removeFrom(map);
      cellRects.delete(key);

      const label = cellLabels.get(key);
      if (label) {
        label.removeFrom(map);
        cellLabels.delete(key);
      }

      // Forget cell state when off-screen: farming bug allowed (D3.b behavior)
      cellStates.delete(key);
    }
  }
}

function refreshCellVisual(key: CellKey): void {
  const rect = cellRects.get(key);
  if (!rect) return;

  const coord = keyToCoord(key);
  const value = getCellValue(coord);
  const near = isNearPlayer(coord, playerCell);
  const isEmpty = value === 0;

  const fillColor = isEmpty
    ? (near ? COLORS.nearFill : COLORS.farFill)
    : COLORS.tokenFill;

  const fillOpacity = isEmpty
    ? (near ? OPACITY.emptyNear : OPACITY.emptyFar)
    : OPACITY.token;

  rect.setStyle({
    fillColor,
    fillOpacity,
    color: near ? COLORS.nearBorder : COLORS.farBorder,
    weight: near ? 1.4 : 0.6,
  });

  // Remove old label
  const existing = cellLabels.get(key);
  if (existing) {
    existing.removeFrom(map);
    cellLabels.delete(key);
  }

  // Add label for token cells
  if (value > 0) {
    const center = rect.getBounds().getCenter();
    const label = leaflet.marker(center, {
      icon: leaflet.divIcon({
        className: "token-label",
        html: `<span>${value}</span>`,
      }),
      interactive: false,
    });
    label.addTo(map);
    cellLabels.set(key, label);
  }
}
// Inventory + crafting

let heldToken: number | null = null;

function updateStatus(message?: string): void {
  const heldText = heldToken === null
    ? "Empty hand"
    : `Holding token value ${heldToken}`;

  const win = heldToken !== null && heldToken >= TARGET_TOKEN_VALUE
    ? `You crafted a token of value ${heldToken}.`
    : "";

  statusPanelDiv.innerHTML = `
    <p><strong>Hand:</strong> ${heldText}</p>
    ${win ? `<p><strong>Goal:</strong> ${win}</p>` : ""}
    ${message ? `<p>${message}</p>` : ""}
  `;
}

function handleCellClick(coord: CellCoord): void {
  if (!isNearPlayer(coord, playerCell)) {
    updateStatus(
      "That cell is too far away. Only cells near your marker are usable.",
    );
    return;
  }

  const cellValue = getCellValue(coord);

  // 1. Hand empty → try pickup
  if (heldToken === null) {
    if (cellValue > 0) {
      heldToken = cellValue;
      setCellValue(coord, 0);
      updateStatus(`Picked up token value ${cellValue}.`);
    } else {
      updateStatus("No token in this cell to pick up.");
    }
    return;
  }

  // 2. Drop onto empty cell
  if (cellValue === 0) {
    const placedValue = heldToken!;
    setCellValue(coord, placedValue);
    heldToken = null;
    updateStatus(`Placed token value ${placedValue} into this cell.`);
    return;
  }

  // 3. Craft when equal
  if (cellValue === heldToken) {
    const newValue = heldToken! * 2;
    setCellValue(coord, 0); // consume cell token
    heldToken = newValue;
    updateStatus(`Crafted token value ${newValue}. It is now in your hand.`);
    return;
  }

  // 4. Mismatch
  updateStatus(
    `Cell has ${cellValue}, your hand has ${heldToken}. Values must match to craft.`,
  );
}
// Player movement controls

function movePlayer(di: number, dj: number): void {
  playerCell = {
    i: playerCell.i + di,
    j: playerCell.j + dj,
  };

  const center = cellCenterLatLng(playerCell);
  playerMarker.setLatLng(center);

  // Optionally recenter map on player move
  map.panTo(center);

  // Recompute which cells are near / far after movement
  refreshVisibleGrid();
  updateStatus("Moved to a new cell. Nearby cells updated.");
}

// Hook up buttons
(document.getElementById("move-n") as HTMLButtonElement).onclick = () =>
  movePlayer(1, 0);
(document.getElementById("move-s") as HTMLButtonElement).onclick = () =>
  movePlayer(-1, 0);
(document.getElementById("move-w") as HTMLButtonElement).onclick = () =>
  movePlayer(0, -1);
(document.getElementById("move-e") as HTMLButtonElement).onclick = () =>
  movePlayer(0, 1);

// Map movement: spawn/despawn on moveend

map.on("moveend", () => {
  refreshVisibleGrid();
});

// Init
refreshVisibleGrid();
updateStatus(
  "Use the movement buttons to explore. Click nearby cells to collect and craft.",
);
