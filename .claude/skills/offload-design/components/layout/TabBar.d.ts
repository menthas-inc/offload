/** Bottom navigation, 64px. Three or four destinations, glyph over a 10px label. */
export interface TabBarItem { value: string; label: string; icon: string }
export interface TabBarProps {
  items: TabBarItem[];
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
export declare function TabBar(props: TabBarProps): JSX.Element;
