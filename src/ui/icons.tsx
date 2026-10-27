/** Small inline SVG icons (no icon font needed, works offline). */
import type { ReactElement } from 'react'

const paths: Record<string, ReactElement> = {
  learn: <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3zm-7 9.2v4L12 20l7-3.8v-4L12 16l-7-3.8z" />,
  mic: <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />,
  micOff: <path d="M19 11h-2a4.9 4.9 0 0 1-.7 2.5l1.4 1.4A6.9 6.9 0 0 0 19 11zM15 11V5a3 3 0 0 0-5.9-.8L15 10.1V11zM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.2 2.7l1.6 1.6A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1a6.9 6.9 0 0 0 3.2-1.3l3.5 3.5 1.3-1.3L4.3 3z" />,
  practice: <path d="M12 3v10.6A4 4 0 1 0 14 17V7h4V3h-6z" />,
  settings: <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />,
  back: <path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z" />,
  chevron: <path d="m9 6-1.4 1.4 4.6 4.6-4.6 4.6L9 18l6-6z" />,
  play: <path d="M8 5v14l11-7z" />,
  stop: <path d="M7 7h10v10H7z" />,
  restart: <path d="M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" />,
  listen: <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />,
  star: <path d="m12 17.3 6.2 3.7-1.6-7L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2 7.4 14l-1.6 7z" />,
  check: <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />,
  metronome: <path d="M10.2 2h3.6l4.6 18.3A1.4 1.4 0 0 1 17 22H7a1.4 1.4 0 0 1-1.4-1.7L10.2 2zm1.5 2-1.9 8.6 3.6-3.5 1.4 1.4-5.6 5.6L8.4 20h7.2L12.3 4h-.6z" />,
  quiz: <path d="M11 18h2v-2h-2v2zm1-16a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 4 0c0 2-3 1.8-3 5h2c0-2.3 3-2.5 3-5a4 4 0 0 0-4-4z" />,
  keyboard: <path d="M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v12h3v-5H6V6H4zm5 0v7H8v5h3v-5h-1V6H9zm5 0v7h-1v5h3v-5h-1V6h-1zm5 0h-2v7h-1v5h3V6z" />,
  upload: <path d="M5 20h14v-2H5v2zm4-6h6V8h4l-7-7-7 7h4v6z" />,
  trash: <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />,
  help: <path d="M11 18h2v-2h-2v2zm1-16a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 4 0c0 2-3 1.8-3 5h2c0-2.3 3-2.5 3-5a4 4 0 0 0-4-4z" />,
  loop: <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />,
  wave: <path d="M3 13h2v-2H3v2zm4 4h2V7H7v10zm4 4h2V3h-2v18zm4-4h2V7h-2v10zm4-6v2h2v-2h-2z" />,
  piano: <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h2.5v-5H7V5H5zm4 0v9h-.5v5h3v-5H11V5H9zm4 0v9h-.5v5h3v-5H15V5h-2zm4 0v9h-.5v5H19V5h-2z" />,
  plus: <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />,
  minus: <path d="M19 13H5v-2h14z" />,
}

export type IconName = keyof typeof paths

export function Icon({ name, title }: { name: IconName; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {paths[name]}
    </svg>
  )
}
