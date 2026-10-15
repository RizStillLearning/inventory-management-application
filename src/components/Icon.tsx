const paths = {
  dashboard: 'M4 13h6V4H4zm0 7h6v-5H4zm10 0h6v-9h-6zm0-16v5h6V4z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm10 3-5-5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17 19 7',
  alert: 'M12 4 2.5 20h19zM12 10v4M12 17h.01',
  stop: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8',
  arrowIn: 'M12 4v12m0 0-5-5m5 5 5-5M5 20h14',
  arrowOut: 'M12 16V4m0 0L7 9m5-5 5 5M5 20h14',
  adjust: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  chevron: 'M9 6l6 6-6 6',
  sort: 'M8 9l4-4 4 4M8 15l4 4 4-4',
  sortUp: 'M8 14l4-4 4 4',
  sortDown: 'M8 10l4 4 4-4',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7L20 8.6M20 4v4.6h-4.6',
  dot: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
