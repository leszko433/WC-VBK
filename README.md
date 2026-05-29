# VBK-AI
För AI-gruppen på VBK.
Säg till Emil om det är några frågor kring upplägg, hur branches fungerar, om man vill ha hjälp med en pull request osv.

---

# VM-tips 2026 ⚽

Webbapp där inbjudna användare skapar konto och tippar fotbolls-VM 2026. Exakt resultat ger mest
poäng. Byggd med **Node.js + Express + SQLite** och en vanilla HTML/CSS/JS-frontend.

## Poängsystem
**Matcher:** rätt utfall (1X2) **+3**, exakt hemmamål **+2**, exakt bortamål **+2** (allt rätt = **7**,
"Perfekt tips").

**Slutspelsträd (slutspel):** två parallella spår enligt reglerna –
1. *Resultat per slot:* samma 3/2/2/7 för varje slutspelsmatch, oavsett vilka lag som spelar den.
2. *Rätt lag (bonus):* poäng för varje lag du placerar i rätt runda. Att pricka en slots vinnare =
   det laget når nästa runda: nå åttondel **6**, kvart **9**, semi **12**, final **15**.
3. *Kvalificering:* **3 p/lag** för varje lag du tippar når slutspelet (16-delsfinal).

Maxpoäng slutspelsträd = 32×3 + 16×6 + 8×9 + 4×12 + 2×15 = **342**.

**Personliga målgörare:** välj upp till 3 spelare som ger **3 p per mål** och **1 p per assist**
(från api-footballs topplistor), låses när turneringen börjar.

Hela regelverket finns på `/rules.html`. Världsmästare (30 p) m.m. rullas ut enligt roadmappen.

## Kom igång (lokalt)
```bash
npm install
cp .env.example .env        # USE_MOCK_DATA=true funkar direkt med exempeldata
npm run seed-admin          # skapar site-admin från ADMIN_* i .env
node scripts/sync.js        # laddar lag + matcher + slutspelsträd (mockdata)
npm start                   # http://localhost:3000
```
Logga in som admin → skapa en liga → skapa en inbjudningskod → registrera spelare med koden →
tippa matcher och slutspelsträd → admin registrerar resultat → poäng och topplista uppdateras
automatiskt.

Exempeldatan (en komplett 48-lags-turnering med slutspelsträd) genereras av
`node scripts/genSeed.js` om du vill bygga om den.

## Live-data (vid driftsättning)
API-anrop sker **bara server-side** (nyckeln exponeras aldrig i webbläsaren). Sätt i `.env`:
```
USE_MOCK_DATA=false
API_FOOTBALL_KEY=<din nyckel från api-football.com>
```
Kör på en server där `v3.football.api-sports.io` är tillåten i nätverket. Kör sedan
`node scripts/sync.js` (eller "Hämta matcher" i admin-vyn) för att hämta riktiga grupper, matcher
och resultat. **Committa aldrig den riktiga nyckeln** – `.env` är gitignorerad.

## Struktur
- `server.js`, `db.js`, `schema.sql` – server, databas, schema
- `lib/scoring.js` – ren matchpoänglogik (enhetstestad i `test/`)
- `lib/bracket.js` – slutspelsträdets två poängspår + kvalificering (enhetstestad)
- `lib/scorers.js` – personliga målgörare: import + poäng (mål 3 p, assist 1 p)
- `lib/apiFootball.js` – api-football-klient (mock/live), `lib/importData.js`, `lib/recompute.js`
- `routes/` – `auth`, `leagues`, `predictions`, `bracket`, `scorers`, `admin`
- `public/` – frontend (`index.html`, `app.js`, `styles.css`, `rules.html`)
- `seed/` – exempeldata i api-footballs format
- `scripts/` – `createAdmin.js`, `sync.js`, `genSeed.js`

Tester: `npm test`.

## Roadmap (samma grund)
- [x] Matchtippning + poäng + topplista
- [x] Slutspelsträd med fast slutspelsnyckel (resultat- + lag-spår) och kvalificering
- [x] 3 personliga målgörare (mål 3 p + assist 1 p), från api-footballs topplistor
- [ ] Två tippningsfönster (för-VM + efter gruppspel) som separata, låsbara faser
- [ ] Turneringsbonusar (världsmästare, skyttekung, assistkung, totalt antal mål)
- [ ] Egna bonusfrågor (ligaadmin, 1–100 p)

---

# Regler
1. Arbeta aldrig direkt i main/master.
2. Skapa alltid en egen branch för varje ändring eller feature.
3. Alla ändringar ska skickas via Pull Request.
4. Ingen får mergea sin egen Pull Request utan godkännande.
5. Minst en annan person måste reviewa och godkänna innan merge. (Allra helst om du arbetar med någon annans kod)
6. Push direkt till main är inte tillåtet.
7. Pull Requests ska ha tydlig titel och beskrivning.
8. Säkerställ att kod bygger och tester passerar innan merge.

# GitHub-guide
Har upptäckt att detta gör AI-verktygen främst själva nuförtiden men lägger en liten guide här för att man ska känna igen vad AIn gör.
## Klona repository

1. Öppna Git Bash i mappen där du vill lägga koden.
2. Gå till repot online.
3. Tryck på den lilla pilen vid `Code`-knappen och kopiera länken.
4. Skriv följande i Git Bash:

```bash
git clone <länk-till-repo>
```

---

## Skapa en ny branch

```bash
git checkout -b "branchnamn"
```

Branchen ska namnges efter det issue den löser, t.ex:

```bash
#2-namechange
```

---

## Byta tillbaka till main

```bash
git checkout main
```

---

## Hämta senaste ändringar

```bash
git pull origin main
```

---

## Committa ändringar och skapa Pull Request

Lägg till filer:

```bash
git add .
```

Skapa commit:

```bash
git commit -m "meddelande"
```

Gör detta innan du stänger ner projektet, annars kan ändringar försvinna.

Pusha branchen:

```bash
git push origin <branchnamn>
```

---

## Skapa Pull Request (PR)

1. Kopiera länken från Git Bash efter push.
2. Öppna Pull Requesten.
3. Lägg till reviewers genom att trycka på kugghjulet till höger.
4. Tilldela dig själv (`Assign yourself`).
5. Skriv en tydlig titel och beskriv vilka ändringar som gjorts.

Ingen får mergea sin egen PR utan att någon annan har godkänt den.

---

## Ta bort en branch

```bash
git branch -d <branchnamn>
```
