# PRAVIDLÁ PRE PREKLADY

## DÔLEŽITÉ: VŠETKY TEXTY MUSIA BYŤ PRELOŽENÉ DO ANGLIČTINY

**PRAVIDLO:** Každý text, ktorý sa zobrazuje používateľovi, MUSÍ mať preklad do angličtiny v I18N objekte.

### Postup:
1. **Vždy** pridaj text do `I18N.sk` (slovenčina)
2. **Vždy** pridaj text do `I18N.en` (angličtina)
3. **Vždy** použij funkciu `t("key")` namiesto hardcoded textu
4. **Nikdy** nepoužívaj hardcoded texty v HTML alebo JavaScripte

### Príklady:
```javascript
// ❌ ZLE - hardcoded text
const text = "Ahoj svet";

// ✅ SPRÁVNE - použitie prekladu
const text = t("greeting.hello");
```

### Kde kontrolovať:
- Všetky modaly
- Všetky správy
- Všetky nápisy
- Všetky tooltips
- Všetky error messages
- Všetky success messages
