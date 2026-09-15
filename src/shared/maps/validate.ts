import { BOULDER_RADIUS, BOULDER_SPAWN_CLEARANCE, EYE_STAND, PLAYER_WIDTH, RAMP_MAX_SLOPE_DEG, STAND_HEIGHT, STEP_HEIGHT, WAYPOINT_SPAWN_MAX_DIST, WAYPOINT_SWEEP_STEP, ZIP_CLEARANCE } from "../constants.ts";
import { mirrorX } from "./helpers.ts";
import { rampHeightAt, rampSlopeDegrees } from "./ramps.ts";
import type { Boulder, Box, MapData, Prop, Ramp, SpawnPoint, Vec3Tuple, Volume, ZipLine } from "./types.ts";

const EPSILON = 1e-6;

function sameTuple(a: Vec3Tuple, b: Vec3Tuple): boolean {
  return a.every((value, index) => Math.abs(value - b[index]!) <= EPSILON);
}

function sameBox(a: Box, b: Box): boolean {
  return sameTuple(a.min, b.min) && sameTuple(a.max, b.max) && a.material === b.material && a.tags.join() === b.tags.join();
}

function sameRamp(a: Ramp, b: Ramp): boolean { return sameBox(a, b) && a.up === b.up; }
function sameVolume(a: Volume, b: Volume): boolean { return sameTuple(a.min, b.min) && sameTuple(a.max, b.max) && a.kind === b.kind && a.flood === b.flood; }
function sameZip(a: ZipLine, b: ZipLine): boolean { return sameTuple(a.from, b.from) && sameTuple(a.to, b.to); }
function sameProp(a: Prop, b: Prop): boolean { return a.kind === b.kind && sameTuple(a.pos, b.pos) && Math.abs(a.yaw - b.yaw) <= EPSILON && a.scale === b.scale && a.seed === b.seed; }
function sameBoulder(a: Boulder, b: Boulder): boolean {
  const samePath = (left: readonly Vec3Tuple[], right: readonly Vec3Tuple[]) => left.length === right.length && left.every((point, index) => sameTuple(point, right[index]!));
  return sameTuple(a.lever, b.lever) && (samePath(a.path, b.path) || samePath(a.path, [...b.path].reverse()))
    && a.alcoves.length === b.alcoves.length && a.alcoves.every((alcove) => b.alcoves.some((candidate) => sameTuple(alcove.min, candidate.min) && sameTuple(alcove.max, candidate.max)));
}

function expandedBox(box: { min: Vec3Tuple; max: Vec3Tuple }, amount: number): Box {
  return { id: "expanded", min: [box.min[0] - amount, box.min[1] - amount, box.min[2] - amount], max: [box.max[0] + amount, box.max[1] + amount, box.max[2] + amount], material: "stone", tags: ["solid"] };
}

function pointSegmentDistance(point: Vec3Tuple, from: Vec3Tuple, to: Vec3Tuple): number {
  const dx = to[0] - from[0]; const dy = to[1] - from[1]; const dz = to[2] - from[2];
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const alpha = lengthSquared <= EPSILON ? 0 : Math.max(0, Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy + (point[2] - from[2]) * dz) / lengthSquared));
  return Math.hypot(point[0] - from[0] - dx * alpha, point[1] - from[1] - dy * alpha, point[2] - from[2] - dz * alpha);
}

function overlapsSpawn(box: Box, spawn: SpawnPoint): boolean {
  const radius = PLAYER_WIDTH / 2;
  return spawn.pos[0] + radius > box.min[0] && spawn.pos[0] - radius < box.max[0]
    && spawn.pos[2] + radius > box.min[2] && spawn.pos[2] - radius < box.max[2]
    && spawn.pos[1] + STAND_HEIGHT > box.min[1] && spawn.pos[1] < box.max[1] - 0.05;
}

function hasGround(boxes: readonly Box[], spawn: SpawnPoint): boolean {
  return boxes.some((box) => box.tags.includes("solid")
    && spawn.pos[0] >= box.min[0] && spawn.pos[0] <= box.max[0]
    && spawn.pos[2] >= box.min[2] && spawn.pos[2] <= box.max[2]
    && spawn.pos[1] - box.max[1] >= -EPSILON && spawn.pos[1] - box.max[1] <= 0.05 + EPSILON);
}

function segmentHitsBox(from: Vec3Tuple, to: Vec3Tuple, box: Box): boolean {
  let near = 0;
  let far = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = to[axis]! - from[axis]!;
    if (Math.abs(delta) <= EPSILON) {
      if (from[axis]! < box.min[axis]! || from[axis]! > box.max[axis]!) return false;
      continue;
    }
    const a = (box.min[axis]! - from[axis]!) / delta;
    const b = (box.max[axis]! - from[axis]!) / delta;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return false;
  }
  return far > EPSILON && near < 1 - EPSILON;
}

function graphConnected(map: MapData): boolean {
  if (map.waypoints.length === 0) return false;
  const byId = new Map(map.waypoints.map((point) => [point.id, point]));
  const visited = new Set<string>();
  const stack = [map.waypoints[0]!.id];
  while (stack.length > 0) {
    const id = stack.pop()!; if (visited.has(id)) continue; visited.add(id);
    for (const link of byId.get(id)?.links ?? []) if (byId.has(link.to) && !visited.has(link.to)) stack.push(link.to);
  }
  return visited.size === map.waypoints.length;
}

function walkReaches(map: MapData, startId: string, goalId: string): boolean {
  const byId = new Map(map.waypoints.map((point) => [point.id, point])), visited = new Set<string>(), stack = [startId];
  while (stack.length > 0) { const id = stack.pop()!; if (id === goalId) return true; if (visited.has(id)) continue; visited.add(id); for (const link of byId.get(id)?.links ?? []) if (link.kind === "walk") stack.push(link.to); }
  return false;
}

function walkClear(map: MapData, from: Vec3Tuple, to: Vec3Tuple): boolean {
  const solids = map.boxes.filter((box) => box.tags.includes("solid"));
  const radius = PLAYER_WIDTH / 2;
  const distance = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const samples = Math.max(1, Math.ceil(distance / WAYPOINT_SWEEP_STEP));
  let feet = from[1];
  for (let index = 0; index <= samples; index += 1) {
    const alpha = index / samples;
    const x = from[0] + (to[0] - from[0]) * alpha;
    const z = from[2] + (to[2] - from[2]) * alpha;
    let ground = Number.NEGATIVE_INFINITY;
    for (const box of solids) {
      const overlaps = x + radius > box.min[0] && x - radius < box.max[0] && z + radius > box.min[2] && z - radius < box.max[2];
      if (overlaps && box.max[1] <= feet + STEP_HEIGHT + EPSILON) ground = Math.max(ground, box.max[1]);
    }
    for (const ramp of map.ramps) {
      const surface = rampHeightAt(ramp, x, z);
      if (surface !== null && surface <= feet + STEP_HEIGHT + EPSILON) ground = Math.max(ground, surface);
    }
    if (!Number.isFinite(ground) || Math.abs(ground - feet) > STEP_HEIGHT + EPSILON) return false;
    feet = ground;
    for (const box of solids) {
      const overlaps = x + radius > box.min[0] && x - radius < box.max[0] && z + radius > box.min[2] && z - radius < box.max[2];
      if (overlaps && box.max[1] > feet + EPSILON && box.min[1] < feet + STAND_HEIGHT - EPSILON) return false;
    }
  }
  return Math.abs(feet - to[1]) <= STEP_HEIGHT + EPSILON;
}

export function validateMap(map: MapData): string[] {
  const errors: string[] = [];
  const solids = map.boxes.filter((box) => box.tags.includes("solid"));
  for (const box of map.boxes) {
    if (box.min.some((value, axis) => value >= box.max[axis]!)) errors.push(`box dimensions: ${box.id}`);
    if (box.min.some((value, axis) => value < map.bounds.min[axis]! - EPSILON)
      || box.max.some((value, axis) => value > map.bounds.max[axis]! + EPSILON)) errors.push(`box bounds: ${box.id}`);
  }
  for (const ramp of map.ramps) {
    if (ramp.min.some((value, axis) => value >= ramp.max[axis]!)) errors.push(`ramp dimensions: ${ramp.id}`);
    if (rampSlopeDegrees(ramp) > RAMP_MAX_SLOPE_DEG + EPSILON) errors.push(`ramp slope: ${ramp.id}`);
    const axis = ramp.up.endsWith("x") ? 0 : 2;
    const cross = axis === 0 ? (ramp.min[2] + ramp.max[2]) / 2 : (ramp.min[0] + ramp.max[0]) / 2;
    for (const high of [false, true]) {
      const coordinate = high === ramp.up.startsWith("+") ? ramp.max[axis] : ramp.min[axis];
      const x = axis === 0 ? coordinate : cross; const z = axis === 2 ? coordinate : cross;
      const height = rampHeightAt(ramp, x, z)!;
      const supported = solids.some((box) => x >= box.min[0] - EPSILON && x <= box.max[0] + EPSILON && z >= box.min[2] - EPSILON && z <= box.max[2] + EPSILON && Math.abs(box.max[1] - height) <= STEP_HEIGHT + EPSILON);
      if (!supported) errors.push(`ramp end: ${ramp.id}`);
    }
  }
  for (const volume of map.volumes) {
    const grounded = solids.some((box) => volume.min[0] < box.max[0] && volume.max[0] > box.min[0] && volume.min[2] < box.max[2] && volume.max[2] > box.min[2] && Math.abs(volume.min[1] - box.max[1]) <= STEP_HEIGHT + EPSILON);
    if (!grounded) errors.push(`volume ground: ${volume.id}`);
  }
  for (const zip of map.zipLines) {
    if (zip.from[1] <= zip.to[1] + EPSILON) errors.push(`zip direction: ${zip.id}`);
    if (solids.some((box) => {
      const expanded = expandedBox(box, ZIP_CLEARANCE);
      const fromSupport = zip.from[0] >= expanded.min[0] && zip.from[0] <= expanded.max[0] && zip.from[2] >= expanded.min[2] && zip.from[2] <= expanded.max[2] && Math.abs(zip.from[1] - box.max[1]) <= ZIP_CLEARANCE + EPSILON;
      const toSupport = zip.to[0] >= expanded.min[0] && zip.to[0] <= expanded.max[0] && zip.to[2] >= expanded.min[2] && zip.to[2] <= expanded.max[2] && Math.abs(zip.to[1] - box.max[1]) <= ZIP_CLEARANCE + EPSILON;
      return !fromSupport && !toSupport && segmentHitsBox(zip.from, zip.to, expanded);
    })) errors.push(`zip clearance: ${zip.id}`);
  }
  for (const boulder of map.boulders) {
    if (boulder.path.length < 2) errors.push(`boulder path: ${boulder.id}`);
    for (let index = 1; index < boulder.path.length; index += 1) {
      const from = boulder.path[index - 1]!; const to = boulder.path[index]!;
      if (solids.some((box) => box.max[1] > Math.max(from[1], to[1]) - BOULDER_RADIUS + EPSILON && segmentHitsBox(from, to, expandedBox(box, BOULDER_RADIUS)))) errors.push(`boulder collider: ${boulder.id}`);
      for (const alcove of boulder.alcoves) if (segmentHitsBox(from, to, expandedBox(alcove, BOULDER_RADIUS + PLAYER_WIDTH / 2))) errors.push(`boulder alcove: ${boulder.id}`);
      for (const spawn of [...map.spawns.sun, ...map.spawns.moon]) if (pointSegmentDistance(spawn.pos, from, to) < BOULDER_SPAWN_CLEARANCE - EPSILON) errors.push(`boulder spawn: ${boulder.id}`);
    }
  }
  if (map.spawns.sun.length > 0 && map.spawns.moon.length > 0) {
    for (const box of solids) {
      const mirrored = mirrorX(box, "mirror");
      if (!solids.some((candidate) => sameBox(mirrored, candidate))) errors.push(`mirror symmetry: ${box.id}`);
    }
    for (const ramp of map.ramps) if (!map.ramps.some((candidate) => sameRamp(mirrorX(ramp, "mirror"), candidate))) errors.push(`mirror symmetry: ${ramp.id}`);
    for (const volume of map.volumes) if (!map.volumes.some((candidate) => sameVolume(mirrorX(volume, "mirror"), candidate))) errors.push(`mirror symmetry: ${volume.id}`);
    for (const zip of map.zipLines) if (!map.zipLines.some((candidate) => sameZip(mirrorX(zip, "mirror"), candidate))) errors.push(`mirror symmetry: ${zip.id}`);
    for (const boulder of map.boulders) if (!map.boulders.some((candidate) => sameBoulder(mirrorX(boulder, "mirror"), candidate))) errors.push(`mirror symmetry: ${boulder.id}`);
    for (const prop of map.props) if (!map.props.some((candidate) => sameProp(mirrorX(prop), candidate))) errors.push(`mirror symmetry: prop ${prop.kind}`);
  }
  for (const spawn of [...map.spawns.sun, ...map.spawns.moon]) {
    if (solids.some((box) => overlapsSpawn(box, spawn))) errors.push(`spawn overlap: ${spawn.pos.join(",")}`);
    if (!hasGround(solids, spawn)) errors.push(`spawn ground: ${spawn.pos.join(",")}`);
  }
  const stairBoxes = solids.filter((box) => box.tags.includes("stairs"));
  const groups = new Map<string, Box[]>();
  for (const box of stairBoxes) {
    const key = box.id.replace(/-\d+$/, "");
    const group = groups.get(key) ?? [];
    group.push(box);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const heights = group.map((box) => box.max[1]).sort((a, b) => a - b);
    for (let index = 1; index < heights.length; index += 1) {
      if (heights[index]! - heights[index - 1]! > STEP_HEIGHT + EPSILON) errors.push(`stair height: ${key}`);
    }
  }
  if (!graphConnected(map)) errors.push("waypoint graph: disconnected");
  if (map.id === "sun-temple" && !walkReaches(map, "sun-spawn-0", "altar")) errors.push("altar walk: unreachable");
  if (map.id === "canopy") for (const id of ["sun-west-low", "sun-west-high", "center-low", "center-high", "sun-north-deck", "sun-south-deck"]) if (!walkReaches(map, "sun-spawn-0", id)) errors.push(`deck walk: ${id}`);
  const byId = new Map(map.waypoints.map((point) => [point.id, point]));
  for (const point of map.waypoints) for (const link of point.links) {
    const target = byId.get(link.to);
    if (!target) errors.push(`waypoint link: ${point.id} -> ${link.to}`);
    else if (link.kind === "walk" && !walkClear(map, point.pos, target.pos)) errors.push(`waypoint walk: ${point.id} -> ${link.to}`);
  }
  for (const spawn of [...map.spawns.sun, ...map.spawns.moon]) {
    const spawnEye: Vec3Tuple = [spawn.pos[0], spawn.pos[1] + EYE_STAND, spawn.pos[2]];
    const covered = map.waypoints.some((point) => {
      if (Math.hypot(point.pos[0] - spawn.pos[0], point.pos[1] - spawn.pos[1], point.pos[2] - spawn.pos[2]) > WAYPOINT_SPAWN_MAX_DIST) return false;
      const pointEye: Vec3Tuple = [point.pos[0], point.pos[1] + EYE_STAND, point.pos[2]];
      return !solids.some((box) => segmentHitsBox(spawnEye, pointEye, box));
    });
    if (!covered) errors.push(`spawn waypoint: ${spawn.pos.join(",")}`);
  }
  for (const sun of map.spawns.sun) {
    const sunEye: Vec3Tuple = [sun.pos[0], sun.pos[1] + EYE_STAND, sun.pos[2]];
    for (const moon of map.spawns.moon) {
      const moonEye: Vec3Tuple = [moon.pos[0], moon.pos[1] + EYE_STAND, moon.pos[2]];
      if (!solids.some((box) => segmentHitsBox(sunEye, moonEye, box))) errors.push(`spawn line of sight: ${sun.pos.join(",")} -> ${moon.pos.join(",")}`);
    }
  }
  return [...new Set(errors)];
}
