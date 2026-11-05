/** Quiet confirmation after saving — states what was recorded, offers Undo. Replaces celebrations. */
export interface ToastProps {
  message: string;
  icon?: 'check' | 'skipped';
  actionLabel?: string;
  onAction?: () => void;
  visible?: boolean;
  style?: React.CSSProperties;
}
export declare function Toast(props: ToastProps): JSX.Element;
