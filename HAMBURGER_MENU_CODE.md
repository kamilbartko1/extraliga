# KOMPLETNÝ KÓD PRE HAMBURGER MENU

## HTML (index.html)
```html
<!-- 📱 MOBILNÉ MENU - HAMBURGER -->
<button 
  class="mobile-menu-toggle" 
  id="mobileMenuToggle"
  aria-label="Otvoriť menu"
  aria-expanded="false"
  aria-controls="mobileMenuPanel"
>
  <span class="hamburger-icon">
    <span></span>
    <span></span>
    <span></span>
  </span>
</button>
```

## CSS (style.css) - KOMPLETNÝ KÓD

```css
/* ===============================
   📱 HAMBURGER MENU - KOMPLETNÝ KÓD
   =============================== */

/* Hamburger tlačidlo - 3D štvorček */
.mobile-menu-toggle {
  display: none; /* skryté na desktop */
  position: absolute !important;
  top: 50% !important;
  left: 1rem !important;
  transform: translateY(-50%) !important;
  z-index: 1002 !important;
  background: linear-gradient(135deg, 
    rgba(0, 183, 255, 0.4) 0%,
    rgba(0, 234, 255, 0.3) 50%,
    rgba(0, 150, 220, 0.35) 100%) !important;
  border: 2px solid rgba(0, 234, 255, 0.7) !important;
  border-top-color: rgba(255, 255, 255, 0.4) !important;
  border-left-color: rgba(255, 255, 255, 0.3) !important;
  border-bottom-color: rgba(0, 100, 180, 0.9) !important;
  border-right-color: rgba(0, 100, 180, 0.9) !important;
  border-radius: 12px !important;
  padding: 0.7rem !important;
  cursor: pointer !important;
  transition: all 0.3s ease !important;
  box-shadow: 
    0 10px 25px rgba(0, 234, 255, 0.6) !important,
    0 5px 12px rgba(0, 0, 0, 0.5) !important,
    inset 0 3px 6px rgba(255, 255, 255, 0.25) !important,
    inset 0 -3px 6px rgba(0, 0, 0, 0.4) !important,
    0 0 0 1px rgba(0, 234, 255, 0.3) !important;
  width: 48px !important;
  height: 48px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.mobile-menu-toggle:hover {
  background: linear-gradient(135deg, 
    rgba(0, 183, 255, 0.5) 0%,
    rgba(0, 234, 255, 0.4) 50%,
    rgba(0, 150, 220, 0.45) 100%) !important;
  border-color: rgba(0, 234, 255, 1) !important;
  box-shadow: 
    0 12px 30px rgba(0, 234, 255, 0.8) !important,
    0 6px 15px rgba(0, 0, 0, 0.6) !important,
    inset 0 3px 8px rgba(255, 255, 255, 0.35) !important,
    inset 0 -3px 8px rgba(0, 0, 0, 0.5) !important,
    0 0 0 2px rgba(0, 234, 255, 0.4) !important;
  transform: translateY(-50%) scale(1.12) translateY(-2px) !important;
}

.mobile-menu-toggle:focus {
  outline: 2px solid #00eaff !important;
  outline-offset: 2px !important;
}

/* Hamburger ikona - tri čiary (nerovnomerné) */
.hamburger-icon {
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-between !important;
  width: 24px !important;
  height: 18px !important;
  position: relative !important;
}

.hamburger-icon span {
  display: block !important;
  background: linear-gradient(180deg, 
    rgba(255, 255, 255, 1) 0%,
    #00eaff 25%,
    #00b7ff 75%,
    rgba(0, 150, 220, 1) 100%) !important;
  border-radius: 4px !important;
  transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
  box-shadow: 
    0 4px 8px rgba(0, 234, 255, 0.6) !important,
    0 2px 4px rgba(0, 0, 0, 0.4) !important,
    inset 0 2px 4px rgba(255, 255, 255, 0.4) !important,
    inset 0 -2px 4px rgba(0, 0, 0, 0.3) !important;
  position: relative !important;
}

/* Vrchná čiara - VÄČŠIA */
.hamburger-icon span:nth-child(1) {
  height: 5px !important;
  width: 100% !important;
  transform-origin: center !important;
}

/* Stredná čiara - MENŠIA */
.hamburger-icon span:nth-child(2) {
  height: 3px !important;
  width: 70% !important;
  margin-left: auto !important;
  transform-origin: center !important;
}

/* Spodná čiara - VÄČŠIA */
.hamburger-icon span:nth-child(3) {
  height: 5px !important;
  width: 100% !important;
  transform-origin: center !important;
}

/* Animácia pri otvorení (X) */
.mobile-menu-toggle[aria-expanded="true"] .hamburger-icon span:nth-child(1) {
  transform: rotate(45deg) translate(7px, 7px) !important;
  width: 100% !important;
  height: 5px !important;
  box-shadow: 
    0 4px 10px rgba(0, 234, 255, 0.7) !important,
    inset 0 2px 4px rgba(255, 255, 255, 0.4) !important;
}

.mobile-menu-toggle[aria-expanded="true"] .hamburger-icon span:nth-child(2) {
  opacity: 0 !important;
  transform: scale(0) !important;
}

.mobile-menu-toggle[aria-expanded="true"] .hamburger-icon span:nth-child(3) {
  transform: rotate(-45deg) translate(6px, -6px) !important;
  width: 100% !important;
  height: 5px !important;
  box-shadow: 
    0 4px 10px rgba(0, 234, 255, 0.7) !important,
    inset 0 2px 4px rgba(255, 255, 255, 0.4) !important;
}

/* Mobile zobrazenie */
@media (max-width: 768px) {
  .mobile-menu-toggle {
    display: flex !important;
    position: absolute !important;
    top: 50% !important;
    left: 1rem !important;
    transform: translateY(-50%) !important;
    z-index: 1002 !important;
  }
}

/* Desktop - skryť */
@media (min-width: 769px) {
  .mobile-menu-toggle {
    display: none !important;
  }
}
```

## DÔLEŽITÉ POZNÁMKY:

1. **Všetky vlastnosti majú `!important`** - zabezpečí prepísanie akýchkoľvek konfliktov
2. **Nerovnomerné čiary**: Vrchná a spodná 5px, stredná 3px
3. **3D efekt**: Viacvrstvové box-shadow, gradienty, rôzne farby borderov
4. **Pozícia**: `absolute` v headeri, nie `fixed` - scrolluje sa s headerom
5. **Štvorček**: 48x48px s výrazným 3D efektom

