# MODAL KÓD PRE GPT-5.2 - VIP Analysis Modal

## HTML

```html
<!-- VIP Tip Analysis Modal -->
<div id="vip-tip-analysis-overlay" class="modal-overlay" onclick="closeVipTipAnalysis(event)" style="display: none;">
  <div class="modal-content" id="vip-tip-analysis-modal"></div>
</div>
```

## CSS

```css
/* Modal Overlay */
.modal-overlay {
  display: none;
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background: rgba(0,0,0,0.80);
  backdrop-filter: blur(5px);
  z-index: 99999 !important;
  animation: fadeIn 0.3s ease;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Modal Content Box */
.modal-content {
  background: linear-gradient(165deg, #0c1b29, #061018);
  border-radius: 20px;
  padding: 30px 30px 35px 30px;
  width: 90%;
  max-width: 580px;
  color: #d9f3ff;
  box-shadow: 0 0 25px rgba(0, 234, 255, 0.25);
  animation: modalUp 0.35s ease;
  max-height: 80vh;
  overflow-y: auto;
  line-height: 1.55;
  border: 1px solid rgba(0,255,255,0.15);
}

/* Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes modalUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
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

## JavaScript - Funkcia pre otvorenie modalu s dynamickou pozíciou

```javascript
// Funkcia na otvorenie modalu pri tlačidle
function openModalAtButton(modalId, overlayId, event) {
  const modal = document.getElementById(modalId);
  const overlay = document.getElementById(overlayId);
  if (!modal || !overlay) return;
  
  // Zobraz overlay
  overlay.style.display = "flex";
  
  // Získaj pozíciu tlačidla, na ktoré sa kliklo
  if (event && event.target) {
    const buttonRect = event.target.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;
    
    // Vypočítaj pozíciu modalu - priamo pod tlačidlom
    let modalTop = buttonRect.bottom + scrollY + 10; // 10px pod tlačidlom
    let modalLeft = buttonRect.left + scrollX + (buttonRect.width / 2); // Stred tlačidla
    
    // V mobile: ak by modal bol mimo obrazovky, uprav pozíciu
    if (window.innerWidth <= 768) {
      // Centruj modal horizontálne v mobile
      modalLeft = window.innerWidth / 2;
      
      // Ak je tlačidlo príliš nízko, posuň modal vyššie (ale stále viditeľný)
      const maxTop = scrollY + window.innerHeight - 100; // 100px rezerva odspodu
      if (modalTop > maxTop) {
        modalTop = buttonRect.top + scrollY - 20; // 20px nad tlačidlom
      }
      
      // Minimálne 20px od vrchu
      const minTop = scrollY + 20;
      if (modalTop < minTop) {
        modalTop = minTop;
      }
    } else {
      // Desktop: ak by modal bol mimo obrazovky vpravo, uprav
      const maxLeft = window.innerWidth - 300; // 300px šírka modalu
      if (modalLeft > maxLeft) {
        modalLeft = maxLeft;
      }
      
      // Ak by modal bol mimo obrazovky vľavo
      if (modalLeft < 150) {
        modalLeft = 150;
      }
      
      // Ak je tlačidlo príliš nízko, posuň modal vyššie
      const maxTop = scrollY + window.innerHeight - 200; // 200px rezerva
      if (modalTop > maxTop) {
        modalTop = buttonRect.top + scrollY - 20; // 20px nad tlačidlom
      }
    }
    
    // Nastav pozíciu modalu
    const modalContent = overlay.querySelector('.modal-content');
    if (modalContent) {
      modalContent.style.position = "absolute";
      modalContent.style.top = `${modalTop}px`;
      modalContent.style.left = `${modalLeft}px`;
      modalContent.style.transform = "translateX(-50%)";
      modalContent.style.marginTop = "0";
    }
  } else {
    // Fallback: ak nie je event, použij stred obrazovky
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
  }
}

// Funkcia na zatvorenie modalu
function closeVipTipAnalysis(e) {
  // Zatvor len ak klik bol na overlay, nie na content
  if (!e || e.target.id === "vip-tip-analysis-overlay") {
    const overlay = document.getElementById("vip-tip-analysis-overlay");
    if (overlay) overlay.style.display = "none";
  }
}
```

## Príklad použitia v HTML

```html
<!-- Tlačidlo, ktoré otvorí modal -->
<button class="vip-tip-analysis-btn" onclick="openModalAtButton('vip-tip-analysis-modal', 'vip-tip-analysis-overlay', event)">
  Analýza
</button>
```

## Poznámky

- Modal sa otvára presne pri tlačidle, na ktoré sa klikne
- V mobile je modal vycentrovaný horizontálne
- Ak by modal bol mimo obrazovky, automaticky sa posunie tak, aby bol viditeľný
- Modal sa zatvára kliknutím na overlay (pozadie), nie na obsah modalu

