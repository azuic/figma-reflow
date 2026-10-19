export type Point = { x: number; y: number };
export type Matrix = [[number, number, number], [number, number, number]];
export type Polygon = Point[];
export type Fragment = { text: string; x: number; y: number; width: number; slotWidth: number };
export type Snapshot = {
  revision: number; styleKey: string; text: string; fontSize: number;
  width: number; height: number; lineHeight: number; padding: number; polygons: Polygon[];
};
export const LIMITS = { characters: 12000, obstacles: 40, rows: 400, fragments: 800, measurements: 12000 };
