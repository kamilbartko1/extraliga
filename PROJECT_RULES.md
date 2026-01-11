# PRAVIDLÁ PROJEKTU - NHLPRO PREMIUM

## ⚠️ KRITICKÉ PRAVIDLÁ (VŽDY DODRŽIAVAŤ)

### 1. COMMIT MESSAGES
- **VŠETKY commit messages MUSIA byť v SLOVENČINE BEZ DIAKRITIKY**
- Príklady:
  - ✅ "Opravene zobrazovanie modalu"
  - ✅ "Pridana funkcionalita pre premium sekciu"
  - ❌ "Opravené zobrazovanie modálu" (s diakritikou)
  - ❌ "Fixed modal display" (angličtina)

### 2. JAZYK KÓDU A KOMENTÁROV
- Komentáre v kóde môžu byť v slovenčine alebo angličtine
- Premenné a funkcie v angličtine (štandard)

### 3. PREKLADY
- Všetky nové texty pre používateľov MUSIA mať preklady do slovenčiny (SK) aj angličtiny (EN)
- Používa sa i18n systém v `app.js` (I18N.sk a I18N.en)

### 4. ODSTRANOVANIE STARÉHO KÓDU
- Pri každej úprave MUSÍM odstrániť starý, nahradený kód
- NIKDY nenechávať duplicitný alebo nepotrebný kód

### 5. MODALY A POZICOVANIE
- Modaly sa MUSIA zobrazovať v strede VIEWPORTU, nie celej sekcie
- Používať `position: fixed` s `display: flex`, `align-items: center`, `justify-content: center`
- Modal overlay MUSÍ byť mimo premium sekcie v HTML (pre správne `position: fixed`)

### 6. RESPONZÍVNOSŤ
- Všetky zmeny MUSIA fungovať na mobile aj desktop
- Testovať na rôznych veľkostiach obrazoviek

## 📝 POZNÁMKY
- Tento súbor MUSÍ byť čítaný na začiatku každej relácie
- Ak niečo nie je jasné, vždy sa opýtať používateľa


### 7. AUTO-COMMIT & PUSH
- Po každej úprave kódu automaticky vykonať `git commit` a `git push`
- Používať pravidlá pre správy z bodu 1

### 8. KONTROLA VÝSLEDKOV
- **VŽDY po zmene kódu MUSÍM skontrolovať správny výsledok na live stránke www.nhlpro.sk**
- Stránka je dostupná online, takže výsledok sa dá overiť
- Ak výsledok nie je správny, VŽDY to prerobiť a opraviť
- NIKDY nenechávať nefunkčný alebo nesprávne zobrazujúci sa kód
- Ak nie je možné výsledok skontrolovať priamo, musím sa pokúsiť logicky overiť správnosť zmien v kóde
