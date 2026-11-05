import type { IconName } from './Icon';

/** Square/round icon-only button. Always 44px+ and always labelled. */
export interface IconButtonProps {
  icon: IconName;
  /** Required accessible label (also the tooltip). */
  label: string;
  /** surface = white round w/ border (header); sunken = cream rounded square (stepper); primary = berry round. */
  variant?: 'surface' | 'sunken' | 'primary';
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
