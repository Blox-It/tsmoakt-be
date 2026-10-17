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

Stel in **Settings → Pages** als bron **Deploy from a branch** in, met branch `main` en map `/ (root)`. Het bestand `CNAME` koppelt de site aan `www.tsmoakt.be`. Configureer daarnaast de DNS-records volgens de GitHub Pages-documentatie.

## Lokaal bekijken

Start vanuit deze map een eenvoudige webserver, bijvoorbeeld `python3 -m http.server 8080`, en open `http://localhost:8080`.

## Kerstbestelling (`/kerst/`)

Standalone bestelformulier op `www.tsmoakt.be/kerst/`, in de stijl van de kerstfolder. Menu, prijzen en afhaalmomenten staan in `data/kerst-2026.json`. Zet `orderDeadline` (bv. `"2026-12-20T23:59:00+01:00"`) om het formulier na die datum automatisch te sluiten.

Bestellingen komen als nieuw dossier (status *Nieuw*) in Firestore `tsmoakt_requests` en verschijnen zo in de admin. Het formulier mag daar alleen aanmaken, niet lezen. Daarvoor moet de regel `isValidPublicOrder` uit `firebase/tsmoakt-firestore.rules.txt` gepubliceerd zijn in de Firebase-console (Firestore → Regels).
