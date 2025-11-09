// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

import "leaflet/dist/leaflet.css";
import "./style.css";

import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

/** D3.a - World of Bits: core mechanics */
// Config

// Fixed player location for D3.a
const PLAYER_LAT = 36.9914;
const PLAYER_LNG = -122.0609;

// Grid + gameplay tuning
const CELL_SIZE = 0.00025; // degrees
const GRID_RADIUS = 25; // how many cells out from player to draw
const INTERACTION_RADIUS = 3; // how many cells count as "nearby"
const TARGET_TOKEN_VALUE = 16; // win condition
const BASE_TOKEN_PROBABILITY = 0.18; // chance a cell starts with value 1

// Visuals
const COLORS = {
  nearBorder: "#222", // stronger border for nearby
  farBorder: "#bbbbbb", // softer for far cells
  nearFill: "#ffe5e5", // light pink tint near player
  farFill: "#f8f8f8", // almost white far away
  tokenFill: "#ff7f7fff", // token cells
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
    Click nearby cells to pick up tokens, drop them, or combine equal values.
    You can only hold one token at a time.
  </p>
`;
document.body.appendChild(controlPanelDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.appendChild(statusPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.appendChild(mapDiv);

// Leaflet map setup

const map = leaflet.map(mapDiv).setView([PLAYER_LAT, PLAYER_LNG], 18);

leaflet
  .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 20,
  })
  .addTo(map);

leaflet
  .circleMarker([PLAYER_LAT, PLAYER_LNG], {
    radius: 7,
    weight: 2,
    color: "#000000",
    fillColor: "#ffffff",
    fillOpacity: 1,
  })
  .addTo(map);

// Types + helpers

type CellKey = string;
type CellBounds = [[number, number], [number, number]];

interface CellState {
  value: number; // 0 means empty
}

// Only cells changed by the player are stored here
const cellStates = new Map<CellKey, CellState>();

// Visuals
const cellRects = new Map<CellKey, leaflet.Rectangle>();
const cellLabels = new Map<CellKey, leaflet.Marker>();

// Player's grid position
const playerRow = latToRow(PLAYER_LAT);
const playerCol = lngToCol(PLAYER_LNG);

function latToRow(lat: number): number {
  return Math.floor(lat / CELL_SIZE);
}

function lngToCol(lng: number): number {
  return Math.floor(lng / CELL_SIZE);
}

function cellKey(row: number, col: number): CellKey {
  return `${row},${col}`;
}

function keyToRowCol(key: CellKey): [number, number] {
  const [r, c] = key.split(",").map(Number);
  return [r, c];
}

function makeCellBounds(row: number, col: number): CellBounds {
  const south = row * CELL_SIZE;
  const north = (row + 1) * CELL_SIZE;
  const west = col * CELL_SIZE;
  const east = (col + 1) * CELL_SIZE;
  return [
    [south, west],
    [north, east],
  ];
}

function isCellNearPlayer(row: number, col: number): boolean {
  const dRow = Math.abs(row - playerRow);
  const dCol = Math.abs(col - playerCol);
  return dRow <= INTERACTION_RADIUS && dCol <= INTERACTION_RADIUS;
}

// Token model

// Initial value from luck: either 0 or 1
function baseTokenValue(row: number, col: number): number {
  const roll = luck(`cell:${row},${col}:token`);
  return roll < BASE_TOKEN_PROBABILITY ? 1 : 0;
}

// Current value (includes overrides from player actions)
function getCellValue(row: number, col: number): number {
  const key = cellKey(row, col);
  const override = cellStates.get(key);
  if (override) return override.value;
  return baseTokenValue(row, col);
}

// Set and refresh one cell
function setCellValue(row: number, col: number, value: number): void {
  const key = cellKey(row, col);
  const base = baseTokenValue(row, col);

  if (value === base) {
    cellStates.delete(key);
  } else {
    cellStates.set(key, { value });
  }

  refreshCellVisual(key);
}

// Grid rendering

function createInitialGrid(): void {
  for (
    let row = playerRow - GRID_RADIUS;
    row <= playerRow + GRID_RADIUS;
    row++
  ) {
    for (
      let col = playerCol - GRID_RADIUS;
      col <= playerCol + GRID_RADIUS;
      col++
    ) {
      const key = cellKey(row, col);
      const bounds = makeCellBounds(row, col);
      const near = isCellNearPlayer(row, col);

      const rect = leaflet.rectangle(bounds, {
        weight: near ? 1.4 : 0.6,
        color: near ? COLORS.nearBorder : COLORS.farBorder,
        fillColor: near ? COLORS.nearFill : COLORS.farFill,
        fillOpacity: near ? OPACITY.emptyNear : OPACITY.emptyFar,
      });

      rect.addTo(map);
      rect.on("click", () => handleCellClick(row, col));
      cellRects.set(key, rect);

      refreshCellVisual(key);
    }
  }
}

function refreshCellVisual(key: CellKey): void {
  const rect = cellRects.get(key);
  if (!rect) return;

  const [row, col] = keyToRowCol(key);
  const value = getCellValue(row, col);
  const near = isCellNearPlayer(row, col);

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
  const existingLabel = cellLabels.get(key);
  if (existingLabel) {
    existingLabel.removeFrom(map);
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

function handleCellClick(row: number, col: number): void {
  if (!isCellNearPlayer(row, col)) {
    updateStatus("That cell is too far away. Use cells closer to your marker.");
    return;
  }

  const cellValue = getCellValue(row, col);

  // 1. Hand is empty → try to pick up
  if (heldToken === null) {
    if (cellValue > 0) {
      heldToken = cellValue;
      setCellValue(row, col, 0);
      updateStatus(`Picked up token value ${cellValue}.`);
    } else {
      updateStatus("No token in this cell to pick up.");
    }
    return;
  }

  // From here on: we KNOW heldToken is not null.

  // 2. Drop onto an empty cell
  if (cellValue === 0) {
    const placedValue = heldToken!; // non-null assertion is safe here
    setCellValue(row, col, placedValue);
    heldToken = null;
    updateStatus(`Placed token value ${placedValue} into this cell.`);
    return;
  }

  // 3. Craft when values match
  if (cellValue === heldToken) {
    const newValue = heldToken! * 2;
    setCellValue(row, col, 0); // consume the cell token
    heldToken = newValue; // upgraded token stays in hand
    updateStatus(`Crafted token value ${newValue}. It is now in your hand.`);
    return;
  }

  // 4. Otherwise: mismatch
  updateStatus(
    `Cell has ${cellValue}, your hand has ${heldToken}. Values must match to craft.`,
  );
}

// Init
createInitialGrid();
updateStatus(
  "Click the darker pinkish cells near your marker to start collecting.",
);
