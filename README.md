# T'Smoakt website

Snelle, statische website voor GitHub Pages. Er is geen buildstap nodig.

## Prijzen beheren

De website leest het aanbod uit `data/prices.json`. Dit bestand kan rechtstreeks worden aangepast, of automatisch uit een Google Sheet worden bijgewerkt.

Maak een Google Sheet met exact deze kolommen op de eerste rij:

`id,title,price,description,image,active`

- `id`: unieke korte naam, bijvoorbeeld `burgers`
- `image`: `burgers`, `bbq`, `paella`, `steak` of `tapas`
- `active`: `true` of `false`

Publiceer het werkblad via **Bestand → Delen → Publiceren op internet** als CSV. Voeg daarna in GitHub onder **Settings → Secrets and variables → Actions → Variables** de variabele `GOOGLE_SHEET_CSV_URL` toe met de gepubliceerde CSV-link.

De workflow synchroniseert elke ochtend automatisch. Via **Actions → Prijzen uit Google Sheet bijwerken → Run workflow** kan dit ook meteen.

## Publiceren via GitHub Pages

Stel in **Settings → Pages** als bron **Deploy from a branch** in, met branch `main` en map `/ (root)`. Het bestand `CNAME` koppelt de site aan `www.tsmoakt.be`. Configureer daarnaast de DNS-records volgens de GitHub Pages-documentatie.

## Lokaal bekijken

Start vanuit deze map een eenvoudige webserver, bijvoorbeeld `python3 -m http.server 8080`, en open `http://localhost:8080`.
