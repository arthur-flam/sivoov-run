import type { Child } from 'hono/jsx';
import type { Race } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { styles } from './styles';

type Props = { title: string; description?: string; locale: Locale; race?: Race; path: string; children: Child };

const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400;1,9..144,500&family=DM+Sans:wght@400;500;600&family=Barlow+Condensed:wght@600;700&display=swap';

export const Layout = ({ title, description, locale, race, path, children }: Props) => {
  const other = locale === 'fr' ? 'en' : 'fr';
  const themeVars = race ? `--race-primary:${race.theme.primary};--race-on-primary:${race.theme.onPrimary};` : '';
  return (
    <html lang={locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {description ? <meta name="description" content={description} /> : null}
        <meta name="theme-color" content={race?.theme.primary ?? '#faf9f7'} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href={FONTS} />
        <style dangerouslySetInnerHTML={{ __html: styles }} />
      </head>
      <body style={themeVars}>
        <div class="wrap">
          <header class="topbar">
            <a class="brand" href="/">
              Sivoov <span>Run</span>
            </a>
            <a class="lang" href={`${path}?lang=${other}`} hreflang={other}>
              {other === 'en' ? 'English' : 'Français'}
            </a>
          </header>
          {children}
          <footer>
            <span>{locale === 'fr' ? 'Une expérience Sivoov' : 'A Sivoov experience'}</span>
            <span>
              <a href="https://sivoov.app">sivoov.app</a>
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
};
