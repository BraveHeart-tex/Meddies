/** Single-select row of 48px chips. Preferred over pickers for quick choices (e.g. intake time: Now / As scheduled / Other). */
export interface ChipGroupProps {
  options: { value: string; label: string; grow?: boolean }[];
  value?: string;
  onChange?: (value: string) => void;
  /** Accessible group label. */
  label?: string;
  style?: React.CSSProperties;
}
export declare function ChipGroup(props: ChipGroupProps): JSX.Element;
