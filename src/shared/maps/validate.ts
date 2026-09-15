import { EYE_STAND, PLAYER_WIDTH, STAND_HEIGHT, STEP_HEIGHT, WAYPOINT_SPAWN_MAX_DIST, WAYPOINT_SWEEP_STEP } from "../constants.ts";
import { mirrorX } from "./helpers.ts";
import type { Box, MapData, SpawnPoint, Vec3Tuple } from "./types.ts";

const EPSILON = 1e-6;

function sameTuple(a: Vec3Tuple, b: Vec3Tuple): boolean {
  return a.every((value, index) => Math.abs(value - b[index]!) <= EPSILON);
}

function sameBox(a: Box, b: Box): boolean {
  return sameTuple(a.min, b.min) && sameTuple(a.max, b.max) && a.tags.join() === b.tags.join();
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
  if (map.id === "notebook") {
    for (const box of solids) {
      const mirrored = mirrorX(box, "mirror");
      if (!solids.some((candidate) => sameBox(mirrored, candidate))) errors.push(`mirror symmetry: ${box.id}`);
    }
  }
  for (const spawn of [...map.spawns.red, ...map.spawns.green]) {
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
  const byId = new Map(map.waypoints.map((point) => [point.id, point]));
  for (const point of map.waypoints) for (const link of point.links) {
    const target = byId.get(link.to);
    if (!target) errors.push(`waypoint link: ${point.id} -> ${link.to}`);
    else if (link.kind === "walk" && !walkClear(map, point.pos, target.pos)) errors.push(`waypoint walk: ${point.id} -> ${link.to}`);
  }
  for (const spawn of [...map.spawns.red, ...map.spawns.green]) {
    const spawnEye: Vec3Tuple = [spawn.pos[0], spawn.pos[1] + EYE_STAND, spawn.pos[2]];
    const covered = map.waypoints.some((point) => {
      if (Math.hypot(point.pos[0] - spawn.pos[0], point.pos[1] - spawn.pos[1], point.pos[2] - spawn.pos[2]) > WAYPOINT_SPAWN_MAX_DIST) return false;
      const pointEye: Vec3Tuple = [point.pos[0], point.pos[1] + EYE_STAND, point.pos[2]];
      return !solids.some((box) => segmentHitsBox(spawnEye, pointEye, box));
    });
    if (!covered) errors.push(`spawn waypoint: ${spawn.pos.join(",")}`);
  }
  for (const red of map.spawns.red) {
    const redEye: Vec3Tuple = [red.pos[0], red.pos[1] + EYE_STAND, red.pos[2]];
    for (const green of map.spawns.green) {
      const greenEye: Vec3Tuple = [green.pos[0], green.pos[1] + EYE_STAND, green.pos[2]];
      if (!solids.some((box) => segmentHitsBox(redEye, greenEye, box))) errors.push(`spawn line of sight: ${red.pos.join(",")} -> ${green.pos.join(",")}`);
    }
  }
  return [...new Set(errors)];
}
