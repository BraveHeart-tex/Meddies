import type { IconName } from './Icon';

/**
 * Meddies button. One primary (berry) per view; secondary is white with a warm border.
 * @startingPoint section="Core" subtitle="Primary, secondary, soft and ghost buttons" viewport="700x300"
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** primary = berry fill; secondary = white + border; soft = blush fill; ghost = text only. */
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost';
  /** sm 36px · md 46px · lg 52px (default) · xl 56px (sheet CTA). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: IconName;
  pill?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;
