import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';
import './globals.css';
import './improvements.css';
import './wave2.css';
import './wave3.css';
import './tooltip-modal-fix.css';
import './final-polish.css';
import './fullcalendar-radar.css';

export const metadata = {
  title: 'RADAR - CRM EDITORAS',
  description: 'CRM interno de prospecção editorial da Radar',
};

export default function RootLayout({ children }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
