import type { ReactNode, SVGProps } from 'react'

export type AppIconName =
  | 'arrow-left'
  | 'assets'
  | 'cash'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-up'
  | 'check'
  | 'close'
  | 'cloud'
  | 'coin'
  | 'edit'
  | 'expense'
  | 'eye'
  | 'eye-off'
  | 'interest'
  | 'loader'
  | 'loans'
  | 'gold'
  | 'minus'
  | 'more'
  | 'plus'
  | 'refresh'
  | 'savings'
  | 'settings'
  | 'swap'
  | 'warning'

type Props = SVGProps<SVGSVGElement> & {
  name: AppIconName
  size?: number
}

const paths: Record<AppIconName, ReactNode> = {
  'arrow-left': <path d="m15 18-6-6 6-6" />,
  assets: (
    <>
      <path d="M4 8h16v11H4z" />
      <path d="M8 8V5h8v3M8 13h8" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7 9H5v2M17 15h2v-2" />
    </>
  ),
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-up': <path d="m6 15 6-6 6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  cloud: (
    <>
      <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 8.6 4.8 4.8 0 0 0 7 18Z" />
      <path d="m9 14 3-3 3 3M12 11v5" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M15 8.5a4 4 0 1 0 0 7M12 6v2M12 16v2" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </>
  ),
  expense: (
    <>
      <path d="M5 6h14v13H5zM8 3v6M16 3v6M5 10h14" />
      <path d="M9 14h6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  'eye-off': (
    <>
      <path d="m3 3 18 18M10.6 6.1A9 9 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2 2.6M6.4 6.5C3.8 8.1 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 2-.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  interest: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10M9.5 9.2c.6-1 1.7-1.5 2.8-1.5 1.6 0 2.7.9 2.7 2.2S13.9 12 12 12s-2.7.8-2.7 2.1 1.1 2.2 2.8 2.2c1.1 0 2.1-.5 2.7-1.4" />
    </>
  ),
  loader: <path d="M20 12a8 8 0 1 1-2.34-5.66" />,
  loans: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9.5c0-1 1.2-1.8 3-1.8s3 .8 3 1.8-1.2 1.7-3 1.7-3 .8-3 1.8 1.2 1.8 3 1.8 3-.8 3-1.8M12 5.8v12.4" />
    </>
  ),
  gold: (
    <>
      <path d="m7 6-3 12h16L17 6H7Z" />
      <path d="M9 6h6l1 4H8l1-4Z" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  more: (
    <>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.8-2L20 11M4 13l2.1 4a7 7 0 0 0 11.8-2" />,
  savings: (
    <>
      <path d="M4 8h16v11H4zM3 8l9-5 9 5M8 12v4M12 12v4M16 12v4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 14.8 6L14.5 3h-5L9.2 6a8 8 0 0 0-1.7 1.1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A8 8 0 0 0 9.2 18l.3 3h5l.3-3a8 8 0 0 0 1.7-1.1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z" />
    </>
  ),
  swap: <path d="m7 7-3 3 3 3M4 10h13M17 17l3-3-3-3M20 14H7" />,
  warning: (
    <>
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
}

export function AppIcon({ name, size = 24, ...props }: Props) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
