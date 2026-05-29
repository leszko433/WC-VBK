# VBK-AI
För AI-gruppen på VBK.
Säg till Emil om det är några frågor kring upplägg, hur branches fungerar, om man vill ha hjälp med en pull request osv.

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
