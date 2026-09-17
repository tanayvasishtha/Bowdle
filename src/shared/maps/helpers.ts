import type { Boulder, Box, Breakable, Geyser, Herb, MaterialName, Prop, Ramp, RampDirection, SwingAnchor, Vec3Tuple, Volume, ZipLine } from "./types.ts";

type Mirrorable = Box | Ramp | Volume | ZipLine | Boulder | Prop | SwingAnchor | Geyser | Breakable | Herb;
export function mirrorX(value: Ramp, newId: string): Ramp;
export function mirrorX(value: Box, newId: string): Box;
export function mirrorX(value: Volume, newId: string): Volume;
export function mirrorX(value: ZipLine, newId: string): ZipLine;
export function mirrorX(value: Boulder, newId: string): Boulder;
export function mirrorX(value: Prop, newId?: string): Prop;
export function mirrorX(value: SwingAnchor, newId: string): SwingAnchor;
export function mirrorX(value: Geyser, newId: string): Geyser;
export function mirrorX(value: Breakable, newId: string): Breakable;
export function mirrorX(value: Herb, newId: string): Herb;
export function mirrorX(value: Mirrorable, newId = "mirror"): Mirrorable {
  if ("path" in value) return { ...value, id: newId, path: value.path.map((point) => [-point[0], point[1], point[2]]), lever: [-value.lever[0], value.lever[1], value.lever[2]], alcoves: value.alcoves.map((alcove) => ({ min: [-alcove.max[0], alcove.min[1], alcove.min[2]], max: [-alcove.min[0], alcove.max[1], alcove.max[2]] })) };
  if ("from" in value) return { ...value, id: newId, from: [-value.from[0], value.from[1], value.from[2]], to: [-value.to[0], value.to[1], value.to[2]] };
  if ("sway" in value) return { ...value, id: newId, pos: [-value.pos[0], value.pos[1], value.pos[2]] };
  if ("hp" in value && "box" in value) return { ...value, id: newId, box: { min: [-value.box.max[0], value.box.min[1], value.box.min[2]], max: [-value.box.min[0], value.box.max[1], value.box.max[2]] } };
  if ("launch" in value && "radius" in value && "pos" in value) return { ...value, id: newId, pos: [-value.pos[0], value.pos[1], value.pos[2]] };
  if ("pos" in value && !("kind" in value)) return { ...value, id: newId, pos: [-value.pos[0], value.pos[1], value.pos[2]] };
  if ("pos" in value) return { ...value, pos: [-value.pos[0], value.pos[1], value.pos[2]], yaw: -value.yaw };
  if ("kind" in value) return { ...value, id: newId, min: [-value.max[0], value.min[1], value.min[2]], max: [-value.min[0], value.max[1], value.max[2]] };
  if ("up" in value) {
    const up: RampDirection = value.up === "+x" ? "-x" : value.up === "-x" ? "+x" : value.up;
    return { ...value, id: newId, min: [-value.max[0], value.min[1], value.min[2]], max: [-value.min[0], value.max[1], value.max[2]], up, tags: [...value.tags] };
  }
  return { ...value, id: newId, min: [-value.max[0], value.min[1], value.min[2]], max: [-value.min[0], value.max[1], value.max[2]], tags: [...value.tags] };
}

export type StairsOptions = {
  idPrefix: string;
  start: Vec3Tuple;
  dir: "+x" | "-x" | "+z" | "-z";
  steps: number;
  rise: number;
  run: number;
  width: number;
  material: MaterialName;
};

export function stairs(options: StairsOptions): Box[] {
  const result: Box[] = [];
  for (let index = 0; index < options.steps; index += 1) {
    const height = options.rise * (index + 1);
    const along = options.run * index;
    const [x, y, z] = options.start;
    let min: Vec3Tuple;
    let max: Vec3Tuple;
    if (options.dir === "+x") {
      min = [x + along, y, z];
      max = [x + along + options.run, y + height, z + options.width];
    } else if (options.dir === "-x") {
      min = [x - along - options.run, y, z];
      max = [x - along, y + height, z + options.width];
    } else if (options.dir === "+z") {
      min = [x, y, z + along];
      max = [x + options.width, y + height, z + along + options.run];
    } else {
      min = [x, y, z - along - options.run];
      max = [x + options.width, y + height, z - along];
    }
    result.push({ id: `${options.idPrefix}-${index + 1}`, min, max, material: options.material, tags: ["solid", "stairs"] });
  }
  return result;
}
