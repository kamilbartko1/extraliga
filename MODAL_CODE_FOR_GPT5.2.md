# KOMPLETNÝ KÓD PRE UMIESŤANIE MODALU - AKTUÁLNY STAV

## 1️⃣ HTML - Štruktúra modalu

```html
<!-- VIP Tip Analysis Modal -->
<div id="vip-tip-analysis-overlay" class="modal-overlay" onclick="closeVipTipAnalysis(event)" style="display: none;">
  <div class="modal-content" id="vip-tip-analysis-modal"></div>
</div>
```

## 2️⃣ CSS - Štýly pre modal a umiestnenie

```css
/* Modal Overlay */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.80);
  backdrop-filter: blur(5px);
  z-index: 99999;
}

/* Modal Content Box */
.modal-content {
  position: fixed; /* 🔥 KĽÚČOVÉ */
  left: 50%;
  transform: translateX(-50%);
  max-height: 80vh;
  background: linear-gradient(165deg, #0c1b29, #061018);
  border-radius: 20px;
  padding: 30px 30px 35px 30px;
  width: 90%;
  max-width: 580px;
  color: #d9f3ff;
  box-shadow: 0 0 25px rgba(0, 234, 255, 0.25);
  animation: modalFadeIn 0.25s ease;
  overflow-y: auto;
  line-height: 1.55;
  border: 1px solid rgba(0,255,255,0.15);
}

/* Animácie */
/* ✅ ŽIADEN translateX / translateY - používame scale a opacity */
@keyframes modalFadeIn {
  from {
    opacity: 0;
    scale: 0.96;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Close Button */
.close-modal-btn {
  margin-top: 25px;
  background: #00eaff;
  font-size: 1.05rem;
  color: #000;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
  width: 100%;
}

.close-modal-btn:hover {
  background: #00b7ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 234, 255, 0.3);
}
```

## 3️⃣ JavaScript - Funkcie pre umiestnenie modalu

### Funkcia 1: showVipTipAnalysis (pre analýzu hráčov)

```javascript
async function showVipTipAnalysis(playerName, teamCode, oppCode, event) {
  const modal = document.getElementById("vip-tip-analysis-modal");
  const overlay = document.getElementById("vip-tip-analysis-overlay");
  if (!modal || !overlay || !event) return;
  
  // Show loading
  modal.innerHTML = `<p style="text-align:center;color:#00eaff;padding:40px;">${t("common.loading")}</p>`;
  overlay.style.display = "block";

  const modalContent = overlay.querySelector(".modal-content");
  const btnRect = event.currentTarget.getBoundingClientRect();

  // Funkcia na nastavenie pozície modalu
  const setModalPosition = () => {
    const MODAL_MARGIN = 12;
    const MODAL_WIDTH = modalContent.offsetWidth || 560;
    const MODAL_HEIGHT = modalContent.offsetHeight || 400;

    let top = btnRect.bottom + MODAL_MARGIN;
    let left = btnRect.left + btnRect.width / 2;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    /* 🔽 Ak je málo miesta dole → otvor NAD tlačidlom */
    if (top + MODAL_HEIGHT > viewportHeight) {
      top = btnRect.top - MODAL_HEIGHT - MODAL_MARGIN;
    }

    /* 🔒 Clamp do viewportu */
    top = Math.max(20, Math.min(top, viewportHeight - MODAL_HEIGHT - 20));
    left = Math.max(
      MODAL_WIDTH / 2 + 10,
      Math.min(left, viewportWidth - MODAL_WIDTH / 2 - 10)
    );

    modalContent.style.top = `${top}px`;
    modalContent.style.left = `${left}px`;
    modalContent.style.transform = "translateX(-50%)";
  };

  // Nastav pozíciu po zobrazení modalu (použij requestAnimationFrame pre správne rozmery)
  requestAnimationFrame(() => {
    requestAnimationFrame(setModalPosition);
  });

  // ... zvyšok kódu pre načítanie dát a zobrazenie obsahu ...
  
  // Po nastavení obsahu modalu ešte raz uprav pozíciu (výška sa mohla zmeniť)
  // Toto sa volá na konci funkcie po nastavení modal.innerHTML
  requestAnimationFrame(() => {
    requestAnimationFrame(setModalPosition);
  });
}
```

### Funkcia 2: showVipTotalAnalysis (pre analýzu under/over)

```javascript
async function showVipTotalAnalysis(homeCode, awayCode, predictedTotal, reco, line, confidence, event) {
  const modal = document.getElementById("vip-tip-analysis-modal");
  const overlay = document.getElementById("vip-tip-analysis-overlay");
  if (!modal || !overlay || !event) return;
  
  // Show loading
  modal.innerHTML = `<p style="text-align:center;color:#00eaff;padding:40px;">${t("common.loading")}</p>`;
  overlay.style.display = "block";

  const modalContent = overlay.querySelector(".modal-content");
  const btnRect = event.currentTarget.getBoundingClientRect();

  // Funkcia na nastavenie pozície modalu
  const setModalPosition = () => {
    const MODAL_MARGIN = 12;
    const MODAL_WIDTH = modalContent.offsetWidth || 560;
    const MODAL_HEIGHT = modalContent.offsetHeight || 400;

    let top = btnRect.bottom + MODAL_MARGIN;
    let left = btnRect.left + btnRect.width / 2;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    /* 🔽 Ak je málo miesta dole → otvor NAD tlačidlom */
    if (top + MODAL_HEIGHT > viewportHeight) {
      top = btnRect.top - MODAL_HEIGHT - MODAL_MARGIN;
    }

    /* 🔒 Clamp do viewportu */
    top = Math.max(20, Math.min(top, viewportHeight - MODAL_HEIGHT - 20));
    left = Math.max(
      MODAL_WIDTH / 2 + 10,
      Math.min(left, viewportWidth - MODAL_WIDTH / 2 - 10)
    );

    modalContent.style.top = `${top}px`;
    modalContent.style.left = `${left}px`;
    modalContent.style.transform = "translateX(-50%)";
  };

  // Nastav pozíciu po zobrazení modalu (použij requestAnimationFrame pre správne rozmery)
  requestAnimationFrame(() => {
    requestAnimationFrame(setModalPosition);
  });

  // ... zvyšok kódu pre načítanie dát a zobrazenie obsahu ...
  
  // Po nastavení obsahu modalu ešte raz uprav pozíciu (výška sa mohla zmeniť)
  // Toto sa volá na konci funkcie po nastavení modal.innerHTML
  requestAnimationFrame(() => {
    requestAnimationFrame(setModalPosition);
  });
}
```

### Funkcia 3: closeVipTipAnalysis (zatvorenie modalu)

```javascript
function closeVipTipAnalysis(e) {
  // Zatvor len ak klik bol na overlay, nie na content
  if (!e || e.target.id === "vip-tip-analysis-overlay") {
    const overlay = document.getElementById("vip-tip-analysis-overlay");
    if (overlay) overlay.style.display = "none";
  }
}
```

## 4️⃣ HTML - Použitie v tlačidlách

```html
<!-- Pre analýzu hráča -->
<button class="vip-tip-analysis-btn" onclick="showVipTipAnalysis('${playerNameEscaped}', '${pick.teamCode}', '${oppCode}', event)">
  Analýza
</button>

<!-- Pre analýzu under/over -->
<button class="vip-tip-analysis-btn" onclick="showVipTotalAnalysis('${g.homeCode}', '${g.awayCode}', ${g.total}, '${g.reco}', ${g.line}, ${g.confidence}, event)">
  Analýza
</button>
```

## 📝 Dôležité poznámky:

1. **`position: fixed`** na `.modal-content` je kľúčové - umožňuje presné umiestnenie vzhľadom na viewport
2. **`event.currentTarget`** namiesto `event.target` - zaisťuje, že získame správne tlačidlo aj keď klikneme na vnútorný element
3. **Dvojitý `requestAnimationFrame`** - zaisťuje, že modal má správne rozmery pred výpočtom pozície
4. **`inset: 0`** na overlay - moderný spôsob ako nastaviť `top: 0; left: 0; width: 100%; height: 100%`
5. **Clamp do viewportu** - zaisťuje, že modal je vždy viditeľný, aj keď je tlačidlo na okraji obrazovky
6. **Automatické posunutie nad tlačidlo** - ak nie je miesto dole, modal sa otvorí nad tlačidlom
7. **Dvojité volanie `setModalPosition`** - raz po zobrazení modalu, druhýkrát po načítaní obsahu (výška sa môže zmeniť)
