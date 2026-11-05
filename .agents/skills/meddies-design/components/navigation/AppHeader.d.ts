/** Screen header: optional eyebrow (date), display title (greeting / page name), optional subtitle, and a right-side action (Settings or Add). */
export interface AppHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Custom right-side node; overrides onSettings. */
  action?: React.ReactNode;
  /** Renders the Settings icon button. */
  onSettings?: () => void;
  style?: React.CSSProperties;
}
export declare function AppHeader(props: AppHeaderProps): JSX.Element;
