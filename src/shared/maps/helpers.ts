import type { Box, InkName, Vec3Tuple } from "./types.ts";

export function mirrorX(box: Box, newId: string): Box {
  return {
    ...box,
    id: newId,
    min: [-box.max[0], box.min[1], box.min[2]],
    max: [-box.min[0], box.max[1], box.max[2]],
    tags: [...box.tags],
  };
}

export type StairsOptions = {
  idPrefix: string;
  start: Vec3Tuple;
  dir: "+x" | "-x" | "+z" | "-z";
  steps: number;
  rise: number;
  run: number;
  width: number;
  ink: InkName;
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
    result.push({ id: `${options.idPrefix}-${index + 1}`, min, max, ink: options.ink, tags: ["solid", "stairs"] });
  }
  return result;
}
