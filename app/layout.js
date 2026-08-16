import './globals.css';
import './improvements.css';

export const metadata = {
  title: 'RADAR - CRM EDITORAS',
  description: 'CRM interno de prospecção editorial da Radar',
};

export default function RootLayout({ children }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
