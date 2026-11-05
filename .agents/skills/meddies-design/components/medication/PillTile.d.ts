/** Medication identity tile: tinted rounded square + simple pill glyph. Each medication keeps its tone/shape everywhere. */
export interface PillTileProps {
  tone?: 'butter' | 'blush' | 'peach' | 'plum' | 'mist';
  /** round tablet · scored (outlined tablet) · capsule · square · ring (as-needed / outline). */
  shape?: 'round' | 'scored' | 'capsule' | 'square' | 'ring';
  /** 46 in lists, 52 in hero and sheet headers. */
  size?: number;
  /** Override tile background, e.g. "#fff" when placed on a blush surface. */
  background?: string;
}
export declare function PillTile(props: PillTileProps): JSX.Element;
