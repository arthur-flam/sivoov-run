import type { Locale } from '@sivoov/shared';

/** Who runs Sivoov Run and where to write, from the Worker's vars: a line is left out rather than shown blank. */
export type Operator = { name?: string; address?: string; email?: string };

type Section = { title: string; body: string[] };
type Copy = { title: string; updated: string; operator: (o: Operator) => string; sections: Section[] };

/**
 * The privacy page, one text per language. It says what the code does and nothing more: when
 * the app or the Worker starts collecting or sending something new, this page changes with it.
 */
const COPY: Record<Locale, Copy> = {
  fr: {
    title: 'Confidentialité',
    updated: 'Mise à jour le 29 septembre 2026.',
    operator: (o) =>
      [
        `Sivoov Run est édité par ${o.name ?? 'Sivoov'}${o.address ? `, ${o.address}` : ''}.`,
        o.email ? `Pour toute question sur vos données\u00a0: ${o.email}.` : '',
      ].join(' '),
    sections: [
      {
        title: 'Ce que l’organisateur nous confie',
        body: [
          'Quand vous prenez un dossard virtuel, l’organisateur de la course nous transmet votre nom, votre prénom, votre email, votre dossard, votre distance et, pour la médaille, votre adresse postale. L’organisateur reste responsable de ces données\u00a0; nous les utilisons pour son compte, pour vous connecter, vous faire courir et publier vos résultats.',
        ],
      },
      {
        title: 'Ce que l’app enregistre pendant votre course',
        body: [
          'Votre position GPS, chaque seconde, seulement entre le départ et l’arrivée d’une course que vous lancez, écran verrouillé compris. Elle sert à mesurer votre distance et votre temps, et à déclencher les annonces aux bons endroits du parcours.',
          'À la fin de la course, l’app envoie le parcours enregistré, votre temps, vos passages, les annonces jouées et un journal technique (niveau de batterie, modèle et version du téléphone, version de l’app) pour vérifier la mesure et corriger les problèmes.',
          'À chaque connexion, nous notons la date de votre dernière visite et le modèle de votre téléphone, pour que l’organisateur sache qui a bien installé l’app.',
        ],
      },
      {
        title: 'Les annonces personnelles',
        body: [
          'Certaines annonces vous appellent par votre prénom ou votre dossard, ou annoncent votre temps. Leur texte peut être écrit par une intelligence artificielle (Claude d’Anthropic, ou Llama sur Cloudflare Workers AI) et leur voix produite par ElevenLabs ou Google Gemini. Pour l’écrire, l’IA reçoit votre prénom, votre nom, votre dossard, votre ville et la météo du moment\u00a0; la voix ne reçoit que le texte à dire. Aucun de ces services ne reçoit votre email ni votre position.',
          'Pour parler de la météo, l’app envoie une position arrondie à environ un kilomètre\u00a0; nous la transmettons à Open-Meteo et ne la conservons pas.',
        ],
      },
      {
        title: 'Vos photos de course',
        body: [
          'Si vous envoyez un selfie depuis la page « Vos photos de course », nous l’envoyons, avec les photos du lieu choisies par l’organisateur, votre dossard et le nom de la course, à Google (modèle d’image Gemini, via Cloudflare) pour créer une image de vous dans la course. Vous l’acceptez à chaque envoi ; la page réduit la photo et en retire la position avant l’envoi.',
          'Votre selfie et l’image créée restent privés : seuls vous les voyez, jusqu’à ce que vous choisissiez de montrer l’image sur votre page de résultat. Vous pouvez la retirer ou la supprimer à tout moment.',
        ],
      },
      {
        title: 'Ce qui est public',
        body: ['Les résultats d’une course et votre certificat affichent votre prénom, votre nom, votre dossard et votre temps officiel, comme les résultats d’une course sur route, et les photos de course que vous choisissez de montrer.'],
      },
      {
        title: 'Où sont vos données',
        body: [
          'Le site, la base de données, les fichiers et les emails passent par Cloudflare. Les mises à jour de l’app passent par Expo, sans donnée personnelle. Les pages chargent leurs polices chez Google Fonts. Il n’y a ni publicité, ni mesure d’audience, ni revente de données.',
        ],
      },
      {
        title: 'Combien de temps',
        body: [
          'Un code de connexion expire au bout de 15 minutes, une connexion au bout de 180 jours. Vos courses et leurs parcours sont gardés tant que la course et ses résultats sont en ligne, ou jusqu’à ce que vous les supprimiez.',
        ],
      },
      {
        title: 'Vos droits',
        body: [
          'Dans l’app, « Supprimer mes données », en bas de l’écran de votre course, efface tout de suite vos courses, leurs parcours GPS, vos annonces personnelles écrites pour vous, vos photos et les images faites avec, et vos connexions. Votre inscription (nom, email, dossard, adresse) reste chez l’organisateur\u00a0: écrivez-lui, ou à nous, pour la retirer.',
          'Vous pouvez aussi nous demander l’accès à vos données, leur correction ou leur export, et vous plaindre auprès de la CNIL (cnil.fr).',
        ],
      },
      {
        title: 'Organisateurs',
        body: ['L’espace organisateur enregistre l’email des membres de l’équipe d’une course, pour les connecter par code, et les messages envoyés par le formulaire de la page organisateurs, pour y répondre.'],
      },
    ],
  },
  en: {
    title: 'Privacy',
    updated: 'Updated 29 September 2026.',
    operator: (o) =>
      [`Sivoov Run is published by ${o.name ?? 'Sivoov'}${o.address ? `, ${o.address}` : ''}.`, o.email ? `For any question about your data: ${o.email}.` : ''].join(' '),
    sections: [
      {
        title: 'What the organizer gives us',
        body: [
          'When you take a virtual bib, the race organizer sends us your name, email, bib, distance and, for the medal, your postal address. The organizer remains responsible for this data; we use it on their behalf, to sign you in, let you run and publish your results.',
        ],
      },
      {
        title: 'What the app records during your run',
        body: [
          'Your GPS position, every second, only between the start and the finish of a run you start, screen locked included. It measures your distance and time, and plays the announcements at the right places on the course.',
          'At the finish, the app sends the recorded route, your time, your splits, the announcements played and a technical log (battery level, phone model and version, app version) so we can check the measurement and fix problems.',
          'Each time you sign in, we note the date of your last visit and your phone model, so the organizer knows who installed the app.',
        ],
      },
      {
        title: 'Personal announcements',
        body: [
          'Some announcements call you by your first name or bib, or say your time. Their text may be written by an artificial intelligence (Anthropic’s Claude, or Llama on Cloudflare Workers AI) and their voice made by ElevenLabs or Google Gemini. To write it, the AI receives your first and last name, bib, town and the current weather; the voice only receives the words to say. None of these services receives your email or your position.',
          'To mention the weather, the app sends a position rounded to about a kilometre; we pass it to Open-Meteo and do not keep it.',
        ],
      },
      {
        title: 'Your race photos',
        body: [
          'If you send a selfie from the “Your race photos” page, we send it, with the organizer’s photos of the place, your bib and the race’s name, to Google (the Gemini image model, through Cloudflare) to make a picture of you in the race. You agree each time you send one; the page shrinks the photo and strips where it was taken before sending.',
          'Your selfie and the picture made stay private: only you see them, until you choose to show the picture on your result page. You can hide or delete it at any time.',
        ],
      },
      {
        title: 'What is public',
        body: ['A race’s results and your certificate show your first and last name, bib and official time, like the results of a road race, and the race photos you choose to show.'],
      },
      {
        title: 'Where your data is',
        body: [
          'The site, the database, the files and the emails run on Cloudflare. App updates come through Expo, with no personal data. The pages load their fonts from Google Fonts. There is no advertising, no audience measurement and no sale of data.',
        ],
      },
      {
        title: 'How long',
        body: ['A sign-in code expires after 15 minutes, a sign-in after 180 days. Your runs and their routes are kept while the race and its results are online, or until you delete them.'],
      },
      {
        title: 'Your rights',
        body: [
          'In the app, “Delete my data”, at the bottom of your race screen, erases at once your runs, their GPS routes, the announcements written for you, your photos and the pictures made from them, and your sign-ins. Your entry (name, email, bib, address) stays with the organizer: write to them, or to us, to remove it.',
          'You can also ask us for access to your data, its correction or an export, and complain to the CNIL (cnil.fr), the French data protection authority.',
        ],
      },
      {
        title: 'Organizers',
        body: ['The organizer area records the email of each member of a race team, to sign them in by code, and the messages sent through the organizers page form, to answer them.'],
      },
    ],
  },
};

export const privacyTitle = (locale: Locale): string => COPY[locale].title;

export const PrivacyPage = ({ locale, operator }: { locale: Locale; operator: Operator }) => {
  const copy = COPY[locale];
  return (
    <section class="prose">
      <h1>{copy.title}</h1>
      <p>{copy.operator(operator)}</p>
      {copy.sections.map((s) => (
        <>
          <h2>{s.title}</h2>
          {s.body.map((p) => (
            <p>{p}</p>
          ))}
        </>
      ))}
      <p class="hint">{copy.updated}</p>
    </section>
  );
};
