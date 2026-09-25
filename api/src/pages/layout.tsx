import type { Child } from 'hono/jsx';
import type { Race } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { translator } from '@sivoov/shared';
import { styles } from './styles';
import { FONTS_URL, THEME_COLOR } from './tokens';

type Props = { title: string; description?: string; locale: Locale; race?: Race; path: string; children: Child };

export const ORGANIZERS_PATH = '/organisateurs';

export const Layout = ({ title, description, locale, race, path, children }: Props) => {
  const t = translator(locale);
  const other = locale === 'fr' ? 'en' : 'fr';
  const themeVars = race ? `--race-primary:${race.theme.primary};--race-on-primary:${race.theme.onPrimary};` : '';
  return (
    <html lang={locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {description ? <meta name="description" content={description} /> : null}
        <meta name="theme-color" content={race?.theme.primary ?? THEME_COLOR} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href={FONTS_URL} />
        <style dangerouslySetInnerHTML={{ __html: styles }} />
      </head>
      <body style={themeVars}>
        <div class="wrap">
          <header class="topbar">
            <a class="brand" href="/">
              Sivoov <span>Run</span>
            </a>
            <nav class="topnav">
              <a href={ORGANIZERS_PATH} aria-current={path === ORGANIZERS_PATH ? 'page' : undefined}>
                {t('site.nav.organizers')}
              </a>
              <a class="lang" href={`${path}?lang=${other}`} hreflang={other}>
                {t('site.otherLanguage')}
              </a>
            </nav>
          </header>
          {children}
          <footer>
            <span>{t('landing.poweredBy')}</span>
            <span class="footer-links">
              <a href="/org">{t('site.footer.organizerSpace')}</a>
              <a href="https://sivoov.app">sivoov.app</a>
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
};
