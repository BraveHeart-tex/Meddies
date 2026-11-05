import type { IconName } from '../core/Icon';
/** 48px rounded text input; use icon="search" for search. */
export interface TextFieldProps {
  label?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  icon?: IconName;
  hint?: string;
  type?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
export declare function TextField(props: TextFieldProps): JSX.Element;
