// deno-lint-ignore-file
// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

/**
 * World of Bits — D3.d
 * - Movement Facade (buttons or geolocation)
 * - Persist state via localStorage across page loads
 */

// Config

const START_LAT = 36.9914;
const START_LNG = -122.0609;

const CELL_SIZE = 0.00025;
const INTERACTION_RADIUS = 3;
const TARGET_TOKEN_VALUE = 32;
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

// Persistence keys
const STORAGE = {
  VERSION: "wob_v1",
  PLAYER: "wob_v1_playerCell",
  HELD: "wob_v1_heldToken",
  CELLS: "wob_v1_cellStates",
  MODE: "wob_v1_movementMode",
};

// DOM scaffolding

const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
controlPanelDiv.innerHTML = `
  <h1>World of Bits</h1>
  <p>
    Choose movement mode. With Geolocation, your device position controls the player.
    With Buttons, use N/S/E/W to step one cell.
  </p>
  <div id="movementBar">
    <label for="movement-select">Movement:</label>
    <select id="movement-select">
      <option value="geolocation">Geolocation</option>
      <option value="buttons">Buttons</option>
    </select>
    <button id="new-game">New Game</button>
  </div>
  <div id="moveControls" style="display:none">
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
  i: number;
  j: number;
}

interface CellState {
  value: number;
}

function latToRow(lat: number): number {
  return Math.floor(lat / CELL_SIZE);
}
function lngToCol(lng: number): number {
  return Math.floor(lng / CELL_SIZE);
}
function latLngToCellCoord(lat: number, lng: number): CellCoord {
  return { i: latToRow(lat), j: lngToCol(lng) };
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
function cellCenterLatLng(c: CellCoord): [number, number] {
  const b = cellToBounds(c);
  const lat = (b[0][0] + b[1][0]) / 2;
  const lng = (b[0][1] + b[1][1]) / 2;
  return [lat, lng];
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

// Leaflet map + player
const map = leaflet.map(mapDiv).setView([START_LAT, START_LNG], 18);
leaflet
  .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 20,
  })
  .addTo(map);

// State (loaded from storage if present)
let playerCell: CellCoord = latLngToCellCoord(START_LAT, START_LNG);
let heldToken: number | null = null;

// Persistent marker
const playerMarker = leaflet
  .circleMarker(cellCenterLatLng(playerCell), {
    radius: 7,
    weight: 2,
    color: "#000000",
    fillColor: "#ffffff",
    fillOpacity: 1,
  })
  .addTo(map);

// Persistence
const cellStates = new Map<CellKey, CellState>();

function saveState(): void {
  try {
    localStorage.setItem(STORAGE.PLAYER, JSON.stringify(playerCell));
    localStorage.setItem(STORAGE.HELD, JSON.stringify(heldToken));
    const arr: Array<[CellKey, CellState["value"]]> = [];
    for (const [k, v] of cellStates.entries()) arr.push([k, v.value]);
    localStorage.setItem(STORAGE.CELLS, JSON.stringify(arr));
  } catch {}
}

function loadState(): void {
  try {
    const p = localStorage.getItem(STORAGE.PLAYER);
    if (p) playerCell = JSON.parse(p);
    const h = localStorage.getItem(STORAGE.HELD);
    if (h) heldToken = JSON.parse(h);

    const raw = localStorage.getItem(STORAGE.CELLS);
    cellStates.clear();
    if (raw) {
      const arr = JSON.parse(raw) as Array<[CellKey, number]>;
      for (const [k, val] of arr) cellStates.set(k, { value: val });
    }
  } catch {
    cellStates.clear();
    heldToken = null;
  }
}

// New Game
(document.getElementById("new-game") as HTMLButtonElement).onclick = () => {
  localStorage.removeItem(STORAGE.PLAYER);
  localStorage.removeItem(STORAGE.HELD);
  localStorage.removeItem(STORAGE.CELLS);
  location.reload();
};

// Base + getters/setters
function baseTokenValue(c: CellCoord): number {
  const roll = luck(`cell:${c.i},${c.j}:token`);
  return roll < BASE_TOKEN_PROBABILITY ? 1 : 0;
}

function getCellValue(c: CellCoord): number {
  const key = coordKey(c);
  const override = cellStates.get(key);
  if (override !== undefined) return override.value;
  return baseTokenValue(c);
}

function setCellValue(c: CellCoord, value: number): void {
  const key = coordKey(c);
  const base = baseTokenValue(c);
  if (value === base) {
    cellStates.delete(key);
  } else {
    cellStates.set(key, { value });
  }
  refreshCellVisual(key);
  saveState();
}

// Visible grid
const cellRects = new Map<CellKey, leaflet.Rectangle>();
const cellLabels = new Map<CellKey, leaflet.Marker>();

function refreshVisibleGrid(): void {
  const bounds = map.getBounds();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  const minI = Math.floor(south / CELL_SIZE) - 1;
  const maxI = Math.floor(north / CELL_SIZE) + 1;
  const minJ = Math.floor(west / CELL_SIZE) - 1;
  const maxJ = Math.floor(east / CELL_SIZE) + 1;

  const shouldExist = new Set<CellKey>();

  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const coord: CellCoord = { i, j };
      const key = coordKey(coord);
      shouldExist.add(key);

      if (!cellRects.has(key)) {
        const rectBounds = cellToBounds(coord);
        const near = isNearPlayer(coord, playerCell);

        const rect = leaflet.rectangle(rectBounds, {
          weight: near ? 1.4 : 0.6,
          color: near ? COLORS.nearBorder : COLORS.farBorder,
          fillColor: near ? COLORS.nearFill : COLORS.farFill,
          fillOpacity: near ? OPACITY.emptyNear : OPACITY.emptyFar,
        });

        rect.addTo(map);
        rect.on("click", () => handleCellClick(coord));
        cellRects.set(key, rect);
      }

      refreshCellVisual(key);
    }
  }

  for (const [key, rect] of cellRects.entries()) {
    if (!shouldExist.has(key)) {
      rect.removeFrom(map);
      cellRects.delete(key);
      const label = cellLabels.get(key);
      if (label) {
        label.removeFrom(map);
        cellLabels.delete(key);
      }
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

  const existing = cellLabels.get(key);
  if (existing) {
    existing.removeFrom(map);
    cellLabels.delete(key);
  }
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
    updateStatus("That cell is too far away.");
    return;
  }
  const cellValue = getCellValue(coord);

  if (heldToken === null) {
    if (cellValue > 0) {
      heldToken = cellValue;
      setCellValue(coord, 0);
      saveState();
      updateStatus(`Picked up value ${cellValue}.`);
    } else {
      updateStatus("No token to pick up.");
    }
    return;
  }

  if (cellValue === 0) {
    const placed = heldToken!;
    setCellValue(coord, placed);
    heldToken = null;
    saveState();
    updateStatus(`Placed ${placed}.`);
    return;
  }

  if (cellValue === heldToken) {
    const newValue = heldToken! * 2;
    setCellValue(coord, 0);
    heldToken = newValue;
    saveState();
    updateStatus(`Crafted ${newValue}!`);
    return;
  }

  updateStatus(`Mismatch: cell ${cellValue}, hand ${heldToken}.`);
}

// Movement Facade
type MoveToCallback = (cell: CellCoord) => void;

interface MovementController {
  start(): void;
  stop(): void;
  getName(): string;
}

class ButtonMovementController implements MovementController {
  private onMoveTo: MoveToCallback;
  private getPlayer: () => CellCoord;
  private handlers: Array<() => void> = [];
  constructor(onMoveTo: MoveToCallback, getPlayer: () => CellCoord) {
    this.onMoveTo = onMoveTo;
    this.getPlayer = getPlayer;
  }
  start(): void {
    const mc = document.getElementById("moveControls") as HTMLDivElement;
    mc.style.display = "flex";
    const n = document.getElementById("move-n") as HTMLButtonElement;
    const s = document.getElementById("move-s") as HTMLButtonElement;
    const w = document.getElementById("move-w") as HTMLButtonElement;
    const e = document.getElementById("move-e") as HTMLButtonElement;

    const doMove = (di: number, dj: number) => {
      const p = this.getPlayer();
      this.onMoveTo({ i: p.i + di, j: p.j + dj });
    };

    n.onclick = () => doMove(1, 0);
    s.onclick = () => doMove(-1, 0);
    w.onclick = () => doMove(0, -1);
    e.onclick = () => doMove(0, 1);

    this.handlers = [
      () => (n.onclick = null),
      () => (s.onclick = null),
      () => (w.onclick = null),
      () => (e.onclick = null),
    ];
  }
  stop(): void {
    const mc = document.getElementById("moveControls") as HTMLDivElement;
    mc.style.display = "none";
    this.handlers.forEach((h) => h());
    this.handlers = [];
  }
  getName(): string {
    return "Buttons";
  }
}

class GeoMovementController implements MovementController {
  private onMoveTo: MoveToCallback;
  private watchId: number | null = null;
  constructor(onMoveTo: MoveToCallback) {
    this.onMoveTo = onMoveTo;
  }
  start(): void {
    const mc = document.getElementById("moveControls") as HTMLDivElement;
    mc.style.display = "none";
    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const cell = latLngToCellCoord(latitude, longitude);
        this.onMoveTo(cell);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    );
  }
  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
  }
  getName(): string {
    return "Geolocation";
  }
}

// Facade wiring
let controller: MovementController | null = null;

function activateController(mode: "geolocation" | "buttons") {
  if (controller) controller.stop();

  if (mode === "geolocation") {
    controller = new GeoMovementController(movePlayerToCell);
  } else {
    controller = new ButtonMovementController(
      movePlayerToCell,
      () => playerCell,
    );
  }
  controller.start();
  try {
    localStorage.setItem(STORAGE.MODE, mode);
  } catch {}
}

// Movement select + query string (fixed: no any)
type MovementMode = "geolocation" | "buttons";

const movementSelect = document.getElementById(
  "movement-select",
) as HTMLSelectElement;
const query = new URLSearchParams(location.search);

const qsModeRaw = query.get("movement");
const savedModeRaw = localStorage.getItem(STORAGE.MODE);

const qsMode: MovementMode | null =
  qsModeRaw === "geolocation" || qsModeRaw === "buttons" ? qsModeRaw : null;

const savedMode: MovementMode | null =
  savedModeRaw === "geolocation" || savedModeRaw === "buttons"
    ? savedModeRaw
    : null;

const initialMode: MovementMode = qsMode ?? savedMode ?? "geolocation";

movementSelect.value = initialMode;
movementSelect.onchange = () => {
  const mode = movementSelect.value as MovementMode;
  activateController(mode);
};

// Player movement
function movePlayerToCell(next: CellCoord): void {
  if (next.i === playerCell.i && next.j === playerCell.j) return;

  playerCell = next;
  const center = cellCenterLatLng(playerCell);
  playerMarker.setLatLng(center);
  map.panTo(center);

  saveState();
  refreshVisibleGrid();
  updateStatus("Moved.");
}

// Rebuild grid on map movement
map.on("moveend", () => refreshVisibleGrid());

// Init
loadState();
playerMarker.setLatLng(cellCenterLatLng(playerCell));
map.panTo(cellCenterLatLng(playerCell));
refreshVisibleGrid();
updateStatus("Welcome back—your progress is loaded.");

activateController(initialMode);
