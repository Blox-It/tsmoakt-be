# T'Smoakt website

Snelle, statische website voor GitHub Pages. Er is geen buildstap nodig.

## Inhoud en prijzen beheren

De website leest categorieën en formules uit losse JSON-bestanden. Regels kunnen toegevoegd, verwijderd, gesorteerd of met `active=false` verborgen worden.

Maak één Google Spreadsheet met tabbladen voor `Categorieën`, `Burgers`, `BBQ`, `Paella`, `Steak` en `Tapas`. Formuletabbladen gebruiken deze kolommen:

`order,group,title,description,price,unit,homepagePrice,active`

- Elke rij is één formule of prijsregel.
- `order` bepaalt de volgorde.
- `group` is optioneel, bijvoorbeeld `Kinderen` of `Optie`.
- `active` is `true` of `false`.
- `homepagePrice=true` laat deze regel meetellen voor de automatisch berekende vanafprijs op de homepage.

Publiceer de spreadsheet en voeg in GitHub de repositoryvariabele `GOOGLE_SHEET_ID` toe. Vul daarna in `data/sheets.json` per tabblad de echte `gid` in. De workflow zet ieder tabblad om naar zijn eigen JSON-bestand.

De workflow synchroniseert elke ochtend automatisch. Via **Actions → Prijzen uit Google Sheet bijwerken → Run workflow** kan dit ook meteen.

## Publiceren via GitHub Pages

Publicatie loopt via **GitHub Actions** (`.github/workflows/deploy-pages.yml`) bij elke push naar `main`. In **Settings → Pages** staat het eigen domein `tsmoakt.be`; `www.tsmoakt.be` verwijst hiernaar door. HTTPS is ingeschakeld. Een `CNAME`-bestand is bij deze publicatiemethode niet nodig.

## Lokaal bekijken

Start vanuit deze map een eenvoudige webserver, bijvoorbeeld `python3 -m http.server 8080`, en open `http://localhost:8080`.

## Kerstbestelling (`/kerst/`)

Standalone bestelformulier op `www.tsmoakt.be/kerst/`, in de stijl van de kerstfolder. Menu, prijzen en afhaalmomenten staan in `data/kerst-2026.json`. Zet `orderDeadline` (bv. `"2026-12-20T23:59:00+01:00"`) om het formulier na die datum automatisch te sluiten.

Bestellingen komen als nieuw dossier (status *Nieuw*) in Firestore `tsmoakt_requests` en verschijnen zo in de admin. Het formulier mag daar alleen aanmaken, niet lezen. Daarvoor moet de regel `isValidPublicOrder` uit `firebase/tsmoakt-firestore.rules.txt` gepubliceerd zijn in de Firebase-console (Firestore → Regels).

### Mails bij een kerstbestelling

Bij elke nieuwe kerstbestelling verstuurt de Cloud Function `kerstbestellingMails` (`functions/`) twee mails via de SMTP van lesley@tsmoakt.be (Vimexx, `mail.tsmoakt.be:465`): een bevestiging voor de klant (antwoorden gaat naar info@) en een melding voor info@tsmoakt.be (antwoorden gaat naar de klant). De prijzen in de mails komen uit `data/kerst-2026.json`, niet uit de browser; wijkt een prijs af, dan staat er een waarschuwing in de mail naar info@. Het resultaat (`mail_klant`, `mail_info`) komt op het dossier in `tsmoakt_requests`.

Eenmalig instellen:

1. Zet het Firebase-project `tsmoakt-432c8` op het **Blaze**-plan (nodig voor functies).
2. Vanuit deze map: `npm install -g firebase-tools`, `firebase login`, `firebase functions:secrets:set SMTP_PASSWORD` (wachtwoord van lesley@), `cd functions && npm install && cd ..`, `firebase deploy --only functions`.

De browser kan zelf geen mails versturen.

## Foto's en tijdelijk verborgen aanbod

De homepage en actieve formulepagina's gebruiken echte stockfoto's, lokaal opgeslagen in `assets/photos/`. Bronnen, fotografen en licentie staan in `assets/photos/SOURCES.txt`.

De losse tapasformule staat tijdelijk op `active: false` in `data/categories.json`. Daardoor verdwijnt ze uit het aanbod en leidt een rechtstreekse link terug naar het aanbod. Om ze opnieuw te tonen, zet je dit veld op `true`. Mocht de Google Sheet-synchronisatie later geactiveerd worden, neem dezelfde instelling over in het tabblad Categorieën. Het tapasgerecht in de kerstbestelling staat hier los van.

Het feestdagenblok op de homepage en de menuknop verwijzen naar het bestaande `/kerst/`-formulier. De promotietekst noemt de afhaaldagen uit `data/kerst-2026.json`; werk die tekst mee bij als de afhaaldagen wijzigen. Verwijder het seizoensblok en de menulinks na de campagne.
