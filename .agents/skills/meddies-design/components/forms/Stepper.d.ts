/** Labelled quantity stepper with 44px −/+ buttons. */
export interface StepperProps {
  label?: string;
  value?: number;
  /** Singular unit, e.g. "tablet", "capsule". */
  unit?: string;
  unitPlural?: string;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  style?: React.CSSProperties;
}
export declare function Stepper(props: StepperProps): JSX.Element;
