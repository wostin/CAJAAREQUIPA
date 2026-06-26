// src/components/Icon.jsx
// Sistema de íconos SVG profesionales (estilo banca: trazo limpio, stroke 1.6)
// Uso: <Icon name="home" size={20} color="#0D2461" />
// Reemplaza los emojis por gráficos vectoriales nítidos y consistentes.

const PATHS = {
  // Navegación principal
  home:        'M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10',
  card:        'M2 7h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20M6 15h4',
  list:        'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  receipt:     'M4 3v18l2-1.2 2 1.2 2-1.2 2 1.2 2-1.2 2 1.2 2-1.2 2 1.2V3l-2 1.2L16 3l-2 1.2L12 3l-2 1.2L8 3 6 4.2zM8 8h8M8 12h8M8 16h5',
  money:       'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  trophy:      'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 4H4v2a3 3 0 0 0 3 3M17 4h3v2a3 3 0 0 1-3 3',
  // Core
  chart:       'M3 3v18h18M7 16V9M12 16V5M17 16v-6',
  inbox:       'M4 13h4l2 3h4l2-3h4M4 13 6 5h12l2 8M4 13v6h16v-6',
  star:        'M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 16.8 6.6 19.6l1-6L3.3 9.4l6-.9z',
  clipboard:   'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 12h6M9 16h4',
  alert:       'M12 3 2 20h20L12 3zM12 9v5M12 17.5v.5',
  building:    'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 21V9h4a1 1 0 0 1 1 1v11M7 8h2M7 12h2M7 16h2M19 13h.01M19 17h.01M2 21h20',
  users:       'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 11a3 3 0 0 0 0-6M22 21v-1a5 5 0 0 0-4-4.9',
  // Acciones / UI
  transfer:    'M4 8h13l-3-3M20 16H7l3 3',
  bell:        'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  search:      'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  clock:       'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  power:       'M12 3v9M6.4 6.4a8 8 0 1 0 11.2 0',
  close:       'M18 6 6 18M6 6l12 12',
  check:       'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.1l-3-3',
  arrowRight:  'M5 12h14M13 6l6 6-6 6',
  arrowUp:     'M12 19V5M6 11l6-6 6 6',
  arrowDown:   'M12 5v14M6 13l6 6 6-6',
  plus:        'M12 5v14M5 12h14',
  shield:      'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3zM9 12l2 2 4-4',
  lock:        'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4',
  user:        'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1',
  bank:        'M3 10 12 3l9 7M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18M2 10h20',
  wallet:      'M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7V6a2 2 0 0 1 2-2h11M17 13h.01',
  // Servicios
  water:       'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  bolt:        'M13 2 4 14h6l-1 8 9-12h-6z',
  wifi:        'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M2 9a15 15 0 0 1 20 0',
  phone:       'M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  tv:          'M3 5h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 21h8M12 18v3',
  flame:       'M12 22a7 7 0 0 0 7-7c0-3-2-5-3-7-1.5 1-2 2-2.5 2C13 7 13 4 10 2c.5 3-1.5 4.5-3 6.5A7 7 0 0 0 5 15a7 7 0 0 0 7 7z',
  gov:         'M3 21h18M5 21V10M19 21V10M3 10l9-6 9 6M9 21v-6h6v6',
  settings:    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 0 1 4 0v.1A1.6 1.6 0 0 0 17 4.6l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  eye:         'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:      'M9.9 5.1A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a13 13 0 0 1-2.2 2.7M6.6 6.6A13 13 0 0 0 2 12s4 7 10 7a9.5 9.5 0 0 0 5.4-1.6M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2',
  download:    'M12 3v12M7 11l5 5 5-5M4 21h16',
  calendar:    'M3 5h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM2 9h20M8 3v4M16 3v4',
  trendUp:     'M3 17l6-6 4 4 8-8M15 7h6v6',
  pin:         'M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  doc:         'M14 2H6a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7zM14 2v5h5M9 13h6M9 17h6',
  gift:        'M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8M2 7h20v5H2zM12 7v14M12 7S9 2 6.5 4 8 7 12 7zM12 7s3-5 5.5-3S16 7 12 7z',
  // Extras para migración completa
  calculator:  'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 11h2M11 11h2M14 11h2M8 15h2M11 15h2M14 15h2v2',
  edit:        'M11 4H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
  store:       'M3 9 4.5 4h15L21 9M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 21v-6h6v6',
  hammer:      'M14 7l5 5M3 21l9-9M14 7l3-3a2.8 2.8 0 0 1 4 4l-3 3M14 7l-3 3',
  sun:         'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon:        'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  pause:       'M8 5h3v14H8zM13 5h3v14h-3z',
  cart:        'M3 4h2l2.4 12.4a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 8H6M9 21h.01M18 21h.01',
  smartphone:  'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  laptop:      'M4 6h16a1 1 0 0 1 1 1v9H3V7a1 1 0 0 1 1-1zM2 18h20l-1 2H3z',
  send:        'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  briefcase:   'M3 8h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3',
  megaphone:   'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 8a4 4 0 0 1 0 8M18 5a8 8 0 0 1 0 14',
  medal:       'M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8.5 12 7 21l5-3 5 3-1.5-9',
};

export default function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.7, fill = false, style = {} }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill ? color : 'none'}
      stroke={fill ? 'none' : color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block', ...style }}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
