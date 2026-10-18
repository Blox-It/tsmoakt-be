# T'Smoakt website

Statische website voor GitHub Pages. `python3 build.py` bouwt alle publieke pagina’s naar `_site/`. Python 3.13 of nieuwer volstaat; de build gebruikt alleen de standaardbibliotheek.

## Inhoud en prijzen beheren

De build leest categorieën en formules uit losse JSON-bestanden en zet de inhoud en prijzen rechtstreeks in HTML. Het kerstformulier leest daarnaast de eigen menudata voor de interactieve bestelling. Regels kunnen toegevoegd, verwijderd, gesorteerd of met `active=false` verborgen worden.

Maak één Google Spreadsheet met tabbladen voor `Categorieën`, `Burgers`, `BBQ`, `Paella`, `Steak` en `Tapas`. Formuletabbladen gebruiken deze kolommen:

`order,group,title,description,price,unit,homepagePrice,active`

- Elke rij is één formule of prijsregel.
- `order` bepaalt de volgorde.
- `group` is optioneel, bijvoorbeeld `Kinderen` of `Optie`.
- `active` is `true` of `false`.
- `homepagePrice=true` laat deze regel meetellen voor de automatisch berekende vanafprijs op de homepage.

Publiceer de spreadsheet en voeg in GitHub de repositoryvariabele `GOOGLE_SHEET_ID` toe. Vul daarna in `data/sheets.json` per tabblad de echte `gid` in. De workflow zet ieder tabblad om naar zijn eigen JSON-bestand.

De workflow synchroniseert elke ochtend automatisch. Via **Actions → Prijzen uit Google Sheet bijwerken → Run workflow** kan dit ook meteen. **Start na een geslaagde prijsimport ook Actions → Website publiceren → Run workflow**, zodat de nieuwe JSON-prijzen in de statische HTML komen. Commits met het standaard GitHub Actions-token starten geen volgende push-workflow; de prijsimport heeft geen extra publicatierechten gekregen.

## Publiceren via GitHub Pages

Publicatie loopt via **GitHub Actions** (`.github/workflows/deploy-pages.yml`) bij elke push naar `main`. In **Settings → Pages** staat het eigen domein `tsmoakt.be`; `www.tsmoakt.be` verwijst hiernaar door. HTTPS is ingeschakeld. Een `CNAME`-bestand is bij deze publicatiemethode niet nodig.

## Lokaal bekijken

Bouw en controleer eerst vanuit deze map:

```sh
python3 build.py
python3 -m unittest discover -s tests -v
python3 scripts/check_site.py
node --check site.js
node --check category.js
node --check kerst/kerst.js
python3 -m http.server 8080 --directory _site
```

Open daarna `http://localhost:8080`. Serveer `_site/`, niet de bronmap. De publicatieworkflow voert dezelfde controles uit voordat ze `_site/` uploadt.

## SEO en bronbestanden

- `build.py`: gedeelde navigatie, footer, metadata, statische formulepagina’s, redirects, sitemap en robots.txt.
- `site.json`: canoniek domein, bedrijfsgegevens, routes, bevestigde Google-verificatiecode en oud-naar-nieuwlinks. Het werkgebied is voorlopig conservatief beschreven; voeg pas bevestigde regio’s toe.
- `index.html`: bron voor de inhoud van de homepage; de build vult onder meer de formulekaarten en contacthulp aan.
- `site.js`: toegankelijke mobiele navigatie en het online contactformulier. Geen voorleesfunctie.
- `data/categories.json` en `data/formulas-*.json`: cateringteksten en prijzen. `priceLabel` is historisch; de echte vanafprijs komt uit actieve regels met `homepagePrice=true`, zodat kinderprijzen en extra’s niet automatisch de hoofdprijs worden.
- `kerst/index.html`, `kerst/kerst.js`, `kerst/kerst.css` en `data/kerst-2026.json`: kerstbestelling. De build zet ook het menu en de prijzen vooraf in de HTML, zodat deze zonder JavaScript leesbaar blijven.
- `privacy.html` en `voorwaarden.html`: inhoud van de juridische pagina’s; de build past de gedeelde opmaak toe.

De oude WordPress-adressen `/hamburgers/`, `/bbq/`, `/paella/` en `/steak/` blijven de canonieke formulepagina’s. Oudere querylinks via `category.html?slug=...` blijven werken. Andere verhuisde pagina’s krijgen een directe HTML-redirect en een canonical, omdat GitHub Pages geen eigen HTTP 301-regels ondersteunt. De 404-pagina helpt bezoekers terug naar het aanbod.

`sitemap.xml` bevat alleen de actieve canonieke pagina’s. Admin, tijdelijk verborgen tapas en foutpagina’s krijgen `noindex`; dit is geen toegangsbeveiliging. De bestaande Firebase-authenticatie blijft verantwoordelijk voor de admin. Alleen publieke assets/data en de adminclient worden gepubliceerd, geen functions, scripts, tests of repositorybestanden.

De Google-verificatiecode is overgenomen van de oude website. Dien `https://tsmoakt.be/sitemap.xml` in bij de geverifieerde Search Console-property en controleer daar indexering en eventuele migratiefouten. Een correcte technische inrichting garandeert geen positie in zoekresultaten. Structured data bevat alleen bekende bedrijfsgegevens, diensten en broodkruimels; geen verzonnen beoordelingen of openingstijden.

Lettertypes worden lokaal geladen (`assets/fonts/`, licentie meegeleverd); foto’s hebben responsive WebP-varianten. Controleer bij inhoudswijzigingen ook mobiel, toetsenbordbediening, contrast en het bestelproces. Gebruik bij geautomatiseerde besteltests uitsluitend de bestaande `window.tsmoaktSaveOrder`-teststub, zodat er geen echte dossiers of mails ontstaan.

## Cateringaanvragen via de homepage

Het formulier roept de Firebase callable `cateringAanvraag` aan. De server valideert alle velden en maakt een dossier met `source: website-contact` en status `todo` in `tsmoakt_requests`. Publieke bezoekers krijgen geen lees- of wijzigrechten. De bestaande Firestore-regels hoeven hiervoor niet verruimd te worden.

Een UUID per aanvraag voorkomt dubbele dossiers bij dubbel klikken of hernemen na een netwerkfout. Dezelfde code met andere inhoud wordt geweigerd. De server begrenst aanvragen op vijf nieuwe dossiers per IP-adres/tijdsvenster van vijftien minuten; alleen een hash per tijdsvenster wordt opgeslagen, geen ruw IP-adres. Tellers staan in `tsmoakt_contact_limits`; oude tellers kunnen periodiek door een beheerder verwijderd worden.

Na ontvangst verschijnen het aanvraagnummer en de bevestiging op de website. De klant ontvangt een kopie, info@tsmoakt.be krijgt de melding. De klantmail bevestigt ontvangst, geen definitieve reservatie.

## Mailverwerking en herstel

De bestaande naam `kerstbestellingMails` blijft behouden, maar de functie behandelt nu zowel `website-contact` als `bestelformulier-kerst-2026`. De bronfilter voorkomt mails voor gewone handmatige adminmutaties. Elke ontvanger heeft een eigen marker in `tsmoakt_mails` en een eigen dossierstatus (`mail_klant`/`mail_info`).

- Tijdelijke fouten worden automatisch hernomen via Firestore-events, maximaal acht verzendpogingen per ontvanger binnen het retryvenster van het platform.
- Een transactioneel vastgelegde claim van drie minuten voorkomt gelijktijdige dubbele verzending. Een verlopen claim kan hernomen worden; een geslaagde ontvanger wordt overgeslagen.
- De status wordt pas `verstuurd` wanneer de SMTP-server de mail heeft aangenomen. Dit garandeert geen inboxplaatsing. SMTP biedt ook geen exact-eenmaalgarantie als de server een mail aanneemt net voordat het opslaan van de verzendstatus mislukt; een vaste Message-ID beperkt de impact maar vervangt geen provider-idempotentie.
- Bij blijvende fouten toont het dossier `mislukt — opnieuw versturen nodig`. Alleen de aangemelde beheerder kan via de knop **Mislukte mails opnieuw versturen** de callable `herneemAanvraagMails` gebruiken. Reeds verstuurde mails blijven overgeslagen. Corrigeer zo nodig eerst het e-mailadres en sla het dossier op.

Backendwijzigingen worden eerst met `firebase deploy --only functions --project tsmoakt-432c8` gepubliceerd. Pas daarna de website publiceren. GitHub Pages publiceert zelf geen Firebase-functies. De Firebase-predeploy draait de Node-tests.

Tests: `npm ci --prefix functions`, `cp data/kerst-2026.json functions/kerst-2026.json`, `npm test --prefix functions`. De integratietests vereisen een lokale Firestore-emulator en het project `demo-tsmoakt`; zonder emulator worden alleen die drie tests overgeslagen. Test de website met `window.tsmoaktSubmitContact` als lokale stub en het kerstformulier met `window.tsmoaktSaveOrder` om echte mails te vermijden.

## Kerstbestelling (`/kerst/`)

Standalone bestelformulier op `https://tsmoakt.be/kerst/`, in de stijl van de kerstfolder. Links vanaf de hoofdwebsite voegen `?van=website` toe; alleen dan verschijnt de terugbalk. De gewone rechtstreekse kerstlink blijft zonder die balk. De canonical blijft altijd `/kerst/`. Menu, prijzen en afhaalmomenten staan in `data/kerst-2026.json`. Zet `orderDeadline` (bv. `"2026-12-20T23:59:00+01:00"`) om het formulier na die datum automatisch te sluiten.

Bestellingen komen als nieuw dossier (status *Nieuw*) in Firestore `tsmoakt_requests` en verschijnen zo in de admin. Het formulier mag daar alleen aanmaken, niet lezen. Daarvoor moet de regel `isValidPublicOrder` uit `firebase/tsmoakt-firestore.rules.txt` gepubliceerd zijn in de Firebase-console (Firestore → Regels).

### Mails bij een kerstbestelling

Bij elke nieuwe kerstbestelling verstuurt de Cloud Function `kerstbestellingMails` (`functions/`) twee mails via de SMTP van lesley@tsmoakt.be (Vimexx, `mail.tsmoakt.be:465`): een bevestiging voor de klant (antwoorden gaat naar info@) en een melding voor info@tsmoakt.be (antwoorden gaat naar de klant). De prijzen in de mails komen uit `data/kerst-2026.json`, niet uit de browser; wijkt een prijs af, dan staat er een waarschuwing in de mail naar info@. Het resultaat (`mail_klant`, `mail_info`) komt op het dossier in `tsmoakt_requests`.

Eenmalig instellen:

1. Zet het Firebase-project `tsmoakt-432c8` op het **Blaze**-plan (nodig voor functies).
2. Vanuit deze map: `npm install -g firebase-tools`, `firebase login`, `firebase functions:secrets:set SMTP_PASSWORD` (wachtwoord van lesley@), `cd functions && npm install && cd ..`, `firebase deploy --only functions`.

De browser kan zelf geen mails versturen.

## Foto's en tijdelijk verborgen aanbod

De burger-, BBQ- en paellafoto’s en de galerij Onze realisaties gebruiken eigen foto’s, aangeleverd door T'Smoakt (oktober 2026), lokaal opgeslagen in `assets/photos/`. De steakfoto blijft stockfotografie. Bronnen, fotografen en licentie staan in `assets/photos/SOURCES.txt`.

De losse tapasformule staat tijdelijk op `active: false` in `data/categories.json`. Daardoor verdwijnt ze uit het aanbod en toont een rechtstreekse link dat de formule tijdelijk niet beschikbaar is. Om ze opnieuw te tonen, zet je dit veld op `true`. Mocht de Google Sheet-synchronisatie later geactiveerd worden, neem dezelfde instelling over in het tabblad Categorieën. Het tapasgerecht in de kerstbestelling staat hier los van.

Het feestdagenblok op de homepage en de menuknop verwijzen naar het bestaande `/kerst/`-formulier. De promotietekst noemt de afhaaldagen uit `data/kerst-2026.json`; werk die tekst mee bij als de afhaaldagen wijzigen. Verwijder het seizoensblok en de menulinks na de campagne.

## CRM-producten en websitekoppelingen

`node scripts/import-products.mjs` toont welke websiteproducten en formulekoppelingen ontbreken. Met `--apply` worden ze in één Firestore-commit toegevoegd, met controle op gelijktijdige wijzigingen. Vereist de bestaande Firebase CLI-login en geïnstalleerde `firebase-tools`. De import maakt geen dossiers aan en verstuurt geen mails.

De actieve cateringformules en elk afzonderlijk kerstgerecht worden verkoopproducten. Portievarianten behouden hun eigen ID, prijs en eenheid. Aankoopprijzen en leveranciers blijven leeg. Bestaande producten, prijzen, deactivaties en aangepaste koppelingen worden behouden; opnieuw uitvoeren maakt geen duplicaten. Websiteformules hebben vaste `id`-velden: behoud die ook bij een eventuele Sheet-import of naamswijziging.

Onder **Formules → Bewerken → Gekoppelde producten** kun je de koppeling aanpassen, ook voor Kerst 2026. Eén portie of formule koppelt standaard aan één verkoopproduct; dit is geen uitgewerkte ingrediëntenreceptuur. CRM-aanpassingen publiceren de websiteprijzen niet automatisch.

Kerstbestellingen met nog lege productselecties worden in de CRM op basis van hun gerecht-ID aan de producten gekoppeld. Bij opslaan worden deze regels vastgelegd; bewust verwijderde regels keren niet terug. De oorspronkelijke bestelregels blijven bewaard. Controletests: `node --test tests/catalog.test.mjs`.

## Afgewezen dossiers wissen

De kolom **Afgewezen** bevat **Alles verwijderen** met een bevestigingsvenster en het volledige aantal, ongeacht een zoekfilter. Annuleren wist niets. Alleen de bij het openen geselecteerde dossiers die op het moment van de transactie nog afgewezen zijn, worden verwijderd. Nieuw afgewezen dossiers vereisen een nieuwe bevestiging. De actie wist de dossierdocumenten definitief; producten, formules, leveranciers en medewerkers blijven behouden.

Transacties verwerken maximaal 200 dossiers tegelijk. Bij een fout meldt de CRM hoeveel dossiers al verwijderd zijn; opnieuw proberen vereist opnieuw bevestiging. Tests: `node --test tests/delete-rejected.test.mjs`; de extra integratietest draait alleen met `FIRESTORE_EMULATOR_HOST` tegen `demo-tsmoakt`.
