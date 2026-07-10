/* ============ Harvest Empire — SVG icon system ============
   One hidden <svg><defs> sprite injected at boot; every UI icon renders
   through Icons.icon(id, cls, fallbackEmoji). Missing ids gracefully fall
   back to the emoji so the item set (phase 3) can migrate later.        */
'use strict';

window.Icons = (() => {

  // 24×24 grid · filled 2-tone shapes · per-hue dark outlines 1.2–1.5px ·
  // round joins/caps · front-facing · silhouettes read at 16px.
  const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">
  <defs>
    <linearGradient id="gCoin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd75e"/><stop offset="1" stop-color="#f0a41c"/></linearGradient>
    <linearGradient id="gRoof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c65540"/><stop offset="1" stop-color="#a23a28"/></linearGradient>
  </defs>

  <symbol id="i-coin" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10.4" fill="url(#gCoin)" stroke="#8a5b10" stroke-width="1.4"/>
    <circle cx="12" cy="12" r="7.2" fill="none" stroke="#8a5b10" stroke-width="1.2" opacity=".55"/>
    <path d="M12 6.6v10.8M14.6 9.1c-.5-1-1.5-1.5-2.6-1.5-1.4 0-2.6.8-2.6 2.1 0 2.9 5.2 1.5 5.2 4.4 0 1.3-1.2 2.1-2.6 2.1-1.2 0-2.2-.6-2.7-1.6" fill="none" stroke="#8a5b10" stroke-width="1.7" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-fuel" viewBox="0 0 24 24">
    <rect x="4" y="5" width="14" height="15.5" rx="2.4" fill="#d2402c" stroke="#7c2415" stroke-width="1.4"/>
    <path d="M7.5 5V3.6c0-.6.5-1.1 1.1-1.1h4.8c.6 0 1.1.5 1.1 1.1V5" fill="#d2402c" stroke="#7c2415" stroke-width="1.4"/>
    <path d="M7.5 12.7l3.5-4 3.5 4-3.5 4z" fill="#ffd75e" stroke="#7c2415" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M18 8h1.2c.7 0 1.3.6 1.3 1.3v4.2" fill="none" stroke="#7c2415" stroke-width="1.6" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-star" viewBox="0 0 24 24">
    <path d="M12 2.6l2.8 5.9 6.3.8-4.6 4.4 1.2 6.3L12 16.9 6.3 20l1.2-6.3L2.9 9.3l6.3-.8z" fill="url(#gCoin)" stroke="#8a5b10" stroke-width="1.3" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-sun" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5.2" fill="#ffd75e" stroke="#c07f13" stroke-width="1.3"/>
    <g stroke="#e8a520" stroke-width="1.8" stroke-linecap="round">
      <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"/>
    </g>
  </symbol>

  <symbol id="i-shop" viewBox="0 0 24 24">
    <rect x="4.4" y="10.5" width="15.2" height="9.6" rx="1.4" fill="#f3e2c3" stroke="#6d4c2e" stroke-width="1.4"/>
    <path d="M3 6.2L4.6 3.4h14.8L21 6.2v2c0 1.3-1.1 2.4-2.5 2.4S16 9.5 16 8.2c0 1.3-1.1 2.4-2.5 2.4S11 9.5 11 8.2c0 1.3-1.1 2.4-2.5 2.4S6 9.5 6 8.2c0 1.3-1.1 2.4-2.5 2.4S1 9.5 1 8.2v-2z" fill="url(#gRoof)" stroke="#6d2f1f" stroke-width="1.3" stroke-linejoin="round" transform="translate(1 0) scale(.917 1)"/>
    <rect x="6.6" y="13" width="4.6" height="7" rx="1" fill="#8a6440" stroke="#6d4c2e" stroke-width="1.2"/>
    <rect x="13.2" y="13" width="4.4" height="4" rx="1" fill="#bfe0ef" stroke="#6d4c2e" stroke-width="1.2"/>
  </symbol>

  <symbol id="i-close" viewBox="0 0 24 24">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-check" viewBox="0 0 24 24">
    <path d="M4.5 12.8l5 5L19.5 7" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-bang" viewBox="0 0 24 24">
    <path d="M12 4.5v9" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>
    <circle cx="12" cy="18.6" r="2" fill="currentColor"/>
  </symbol>

  <symbol id="i-info" viewBox="0 0 24 24">
    <circle cx="12" cy="5.6" r="2" fill="currentColor"/>
    <path d="M12 10.4v9" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-warning" viewBox="0 0 24 24">
    <path d="M10.6 3.9c.6-1.1 2.2-1.1 2.8 0l8 14.1c.6 1.1-.2 2.4-1.4 2.4H4c-1.2 0-2-1.3-1.4-2.4z" fill="#ffcb45" stroke="#8a5b10" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 8.6v5" stroke="#6d4004" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="12" cy="16.6" r="1.4" fill="#6d4004"/>
  </symbol>

  <symbol id="i-cal" viewBox="0 0 24 24">
    <rect x="3.4" y="5" width="17.2" height="15.4" rx="2.4" fill="#fffdf6" stroke="#6d4c2e" stroke-width="1.4"/>
    <path d="M3.4 9.6h17.2" stroke="#6d4c2e" stroke-width="1.3"/>
    <path d="M8 3v3.6M16 3v3.6" stroke="#a23a28" stroke-width="2" stroke-linecap="round"/>
    <circle cx="9" cy="14" r="1.4" fill="#4ca03f"/><circle cx="14.5" cy="14" r="1.4" fill="#e2d1ae"/>
  </symbol>

  <symbol id="i-scales" viewBox="0 0 24 24">
    <path d="M12 3.6v14.8" stroke="#6d4c2e" stroke-width="2" stroke-linecap="round"/>
    <path d="M4.6 6.4h14.8" stroke="#6d4c2e" stroke-width="2" stroke-linecap="round"/>
    <circle cx="12" cy="4" r="1.7" fill="#ffcb45" stroke="#8a5b10" stroke-width="1.1"/>
    <path d="M4.9 6.6L2.6 12.2M4.9 6.6l2.3 5.6M19.1 6.6l-2.3 5.6M19.1 6.6l2.3 5.6" stroke="#6d4c2e" stroke-width="1.2"/>
    <path d="M1.6 12.4a3.3 3.3 0 0 0 6.6 0z" fill="url(#gCoin)" stroke="#8a5b10" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M15.8 12.4a3.3 3.3 0 0 0 6.6 0z" fill="url(#gCoin)" stroke="#8a5b10" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M7 20.4h10" stroke="#6d4c2e" stroke-width="2.2" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-clipboard" viewBox="0 0 24 24">
    <rect x="4.6" y="4" width="14.8" height="17" rx="2.2" fill="#c9974f" stroke="#6d4c2e" stroke-width="1.4"/>
    <rect x="6.8" y="6.6" width="10.4" height="12.2" rx="1.2" fill="#fffdf6" stroke="#6d4c2e" stroke-width="1.1"/>
    <rect x="8.8" y="2.4" width="6.4" height="4" rx="1.3" fill="#8a94a0" stroke="#3e454e" stroke-width="1.2"/>
    <path d="M9 10.4h6M9 13.2h6M9 16h3.6" stroke="#8a7458" stroke-width="1.3" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-gear" viewBox="0 0 24 24">
    <g fill="#8a94a0" stroke="#3e454e" stroke-width="1.2">
      <rect x="10.4" y="2.2" width="3.2" height="19.6" rx="1.5"/>
      <rect x="10.4" y="2.2" width="3.2" height="19.6" rx="1.5" transform="rotate(60 12 12)"/>
      <rect x="10.4" y="2.2" width="3.2" height="19.6" rx="1.5" transform="rotate(120 12 12)"/>
    </g>
    <circle cx="12" cy="12" r="6" fill="#8a94a0" stroke="#3e454e" stroke-width="1.3"/>
    <circle cx="12" cy="12" r="2.6" fill="#fffdf6" stroke="#3e454e" stroke-width="1.2"/>
  </symbol>

  <symbol id="i-house" viewBox="0 0 24 24">
    <path d="M4.6 11.5v7.6c0 .8.6 1.4 1.4 1.4h12c.8 0 1.4-.6 1.4-1.4v-7.6" fill="#f3e2c3" stroke="#6d4c2e" stroke-width="1.5"/>
    <path d="M2.6 12.2L12 3.6l9.4 8.6" fill="none" stroke="#a23a28" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="9.6" y="14" width="4.8" height="6.5" rx="1" fill="#8a6440" stroke="#6d4c2e" stroke-width="1.2"/>
  </symbol>

  <symbol id="i-tractor" viewBox="0 0 24 24">
    <path d="M5.5 13V8.4c0-.8.6-1.4 1.4-1.4h4.3l1.6 5" fill="#4ca03f" stroke="#245c1e" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 12h6.8c.8 0 1.4.6 1.4 1.4v2.4" fill="#4ca03f" stroke="#245c1e" stroke-width="1.4"/>
    <circle cx="8" cy="16.2" r="3.9" fill="#3b3229" stroke="#181310" stroke-width="1.3"/>
    <circle cx="8" cy="16.2" r="1.5" fill="#c9b489"/>
    <circle cx="17.6" cy="17.4" r="2.7" fill="#3b3229" stroke="#181310" stroke-width="1.3"/>
    <circle cx="17.6" cy="17.4" r="1" fill="#c9b489"/>
    <path d="M9 7V4.6h1.8" fill="none" stroke="#245c1e" stroke-width="1.6" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-sign" viewBox="0 0 24 24">
    <rect x="10.9" y="10" width="2.2" height="10.5" rx="1" fill="#8a6440" stroke="#5b3e25" stroke-width="1.1"/>
    <path d="M4.5 4h13.4l2.6 3-2.6 3H4.5c-.6 0-1-.4-1-1V5c0-.6.4-1 1-1z" fill="#c9974f" stroke="#5b3e25" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M6.5 7h8" stroke="#5b3e25" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
  </symbol>

  <symbol id="i-tag" viewBox="0 0 24 24">
    <path d="M12.6 3.2h6.4c1 0 1.8.8 1.8 1.8v6.4c0 .5-.2.9-.5 1.3l-8 8c-.7.7-1.8.7-2.5 0l-5.5-5.5c-.7-.7-.7-1.8 0-2.5l8-8c.4-.3.8-.5 1.3-.5z" fill="#c9974f" stroke="#6d4c2e" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="16.6" cy="7.4" r="1.7" fill="#fffdf6" stroke="#6d4c2e" stroke-width="1.2"/>
  </symbol>

  <symbol id="i-well" viewBox="0 0 24 24">
    <path d="M4.5 8.5L12 3l7.5 5.5" fill="none" stroke="#a23a28" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.2 11h11.6v5.2c0 2.3-2.6 4.2-5.8 4.2s-5.8-1.9-5.8-4.2z" fill="#9aa3ad" stroke="#4c545c" stroke-width="1.4"/>
    <path d="M6.2 13.6h11.6M9.5 11v9M14.5 11v9" stroke="#4c545c" stroke-width="1" opacity=".55"/>
    <path d="M12 6.2c1.5 2 2.4 3.1 2.4 4.2 0 1.3-1.1 2.2-2.4 2.2s-2.4-.9-2.4-2.2c0-1.1.9-2.2 2.4-4.2z" fill="#57c1f0" stroke="#1d6fa3" stroke-width="1.3"/>
  </symbol>

  <symbol id="i-scarecrow" viewBox="0 0 24 24">
    <rect x="11" y="10" width="2" height="10.6" rx="1" fill="#8a6440" stroke="#5b3e25" stroke-width="1"/>
    <path d="M4 12.2h16" stroke="#8a6440" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="12" cy="8.4" r="3.6" fill="#f2a13c" stroke="#9c5c12" stroke-width="1.3"/>
    <circle cx="10.7" cy="8" r=".8" fill="#5b3e25"/><circle cx="13.3" cy="8" r=".8" fill="#5b3e25"/>
    <path d="M11.2 9.8h1.6" stroke="#5b3e25" stroke-width="1" stroke-linecap="round"/>
    <path d="M7.6 5.4h8.8L14.9 2.6c-.3-.5-.8-.8-1.4-.8h-3c-.6 0-1.1.3-1.4.8z" fill="#c9974f" stroke="#5b3e25" stroke-width="1.2" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-sprinkler" viewBox="0 0 24 24">
    <path d="M9.4 14.5h5.2l-.7 6H10z" fill="#9aa3ad" stroke="#4c545c" stroke-width="1.3" stroke-linejoin="round"/>
    <rect x="8" y="11.4" width="8" height="3.4" rx="1.4" fill="#c2cad2" stroke="#4c545c" stroke-width="1.3"/>
    <g fill="#57c1f0" stroke="#1d6fa3" stroke-width="1">
      <path d="M5.2 5.4c.8 1 1.2 1.6 1.2 2.2 0 .7-.6 1.2-1.2 1.2S4 8.3 4 7.6c0-.6.4-1.2 1.2-2.2z"/>
      <path d="M12 3c.8 1 1.2 1.6 1.2 2.2 0 .7-.6 1.2-1.2 1.2s-1.2-.5-1.2-1.2c0-.6.4-1.2 1.2-2.2z"/>
      <path d="M18.8 5.4c.8 1 1.2 1.6 1.2 2.2 0 .7-.6 1.2-1.2 1.2s-1.2-.5-1.2-1.2c0-.6.4-1.2 1.2-2.2z"/>
    </g>
  </symbol>

  <symbol id="i-coop" viewBox="0 0 24 24">
    <path d="M4.8 10.8V19c0 .8.6 1.4 1.4 1.4h11.6c.8 0 1.4-.6 1.4-1.4v-8.2" fill="#c9974f" stroke="#6d4c2e" stroke-width="1.4"/>
    <path d="M2.8 11.6L12 3.4l9.2 8.2" fill="none" stroke="#a23a28" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="13.2" r="2.7" fill="#5b3e25" stroke="#3d2a17" stroke-width="1.1"/>
    <path d="M10.9 12.4c.2-.5.7-.9 1.3-.8.5 0 .9.4 1 .8" fill="none" stroke="#f2a13c" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M6.6 20.4v-2.4h3v2.4M7 18l2.2-1.4" stroke="#6d4c2e" stroke-width="1.2" fill="none" opacity=".8"/>
  </symbol>

  <symbol id="i-barn" viewBox="0 0 24 24">
    <path d="M4.4 9.8V19c0 .8.6 1.4 1.4 1.4h12.4c.8 0 1.4-.6 1.4-1.4V9.8" fill="#b6412c" stroke="#6d2317" stroke-width="1.4"/>
    <path d="M3 10.4c2.4-1.1 7-5.6 9-7.4 2 1.8 6.6 6.3 9 7.4" fill="none" stroke="#6d2317" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="8.6" y="12.4" width="6.8" height="8" rx="1" fill="#f3e2c3" stroke="#6d2317" stroke-width="1.3"/>
    <path d="M8.9 12.7l6.2 7.4M15.1 12.7l-6.2 7.4" stroke="#6d2317" stroke-width="1.3"/>
  </symbol>

  <symbol id="i-mill" viewBox="0 0 24 24">
    <path d="M9.2 9.5h5.6l1.4 11H7.8z" fill="#c9974f" stroke="#6d4c2e" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="12" cy="9" r="1.6" fill="#6d4c2e"/>
    <g fill="#f3e2c3" stroke="#6d4c2e" stroke-width="1.3" stroke-linejoin="round">
      <path d="M12 8.2L8.3 2.6c2.5-1 4.6.3 5 2.7z"/>
      <path d="M12.8 9l6.6-1.2c.3 2.7-1.5 4.3-3.9 4z"/>
      <path d="M11.2 9L4.6 10.2c-.3-2.7 1.5-4.3 3.9-4z"/>
    </g>
  </symbol>

  <symbol id="i-bread" viewBox="0 0 24 24">
    <path d="M4 10.2c0-2.6 3.6-4.6 8-4.6s8 2 8 4.6c0 1.2-.8 2.2-2 3v4.6c0 .9-.7 1.6-1.6 1.6H7.6c-.9 0-1.6-.7-1.6-1.6v-4.6c-1.2-.8-2-1.8-2-3z" fill="#e8a94f" stroke="#8c5a1a" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M9 9.4c.8 1 .8 2.2 0 3.4M12.6 9.4c.8 1 .8 2.2 0 3.4M16 9.6c.6.9.6 1.9 0 2.8" fill="none" stroke="#8c5a1a" stroke-width="1.3" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-cheese" viewBox="0 0 24 24">
    <path d="M2.8 10.4L18.6 4c1.6 1.3 2.6 3.3 2.6 5.4v8.2c0 .9-.7 1.6-1.6 1.6H4.4c-.9 0-1.6-.7-1.6-1.6z" fill="#ffcb45" stroke="#a8760e" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M2.8 10.4h18.4" stroke="#a8760e" stroke-width="1.3"/>
    <circle cx="8" cy="14.6" r="1.7" fill="#e8a51f" stroke="#a8760e"/>
    <circle cx="14.6" cy="16.4" r="1.3" fill="#e8a51f" stroke="#a8760e"/>
    <circle cx="17.4" cy="12.8" r="1" fill="#e8a51f" stroke="#a8760e"/>
  </symbol>

  <symbol id="i-juice" viewBox="0 0 24 24">
    <path d="M7 8.5h10L15.8 20c-.1.8-.8 1.4-1.6 1.4H9.8c-.8 0-1.5-.6-1.6-1.4z" fill="#f2734e" stroke="#93341b" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M7.4 12.5h9.2" stroke="#93341b" stroke-width="1.2" opacity=".7"/>
    <path d="M12.5 8.5l3-6h2.6" fill="none" stroke="#4ca03f" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="10.6" cy="16.4" r="1.1" fill="#ffd7c4" opacity=".9"/>
  </symbol>

  <symbol id="i-spool" viewBox="0 0 24 24">
    <rect x="7.4" y="3" width="9.2" height="3.4" rx="1.4" fill="#c9974f" stroke="#6d4c2e" stroke-width="1.3"/>
    <rect x="7.4" y="17.6" width="9.2" height="3.4" rx="1.4" fill="#c9974f" stroke="#6d4c2e" stroke-width="1.3"/>
    <path d="M9 6.4h6v11.2H9z" fill="#5a8fd4" stroke="#2c5182" stroke-width="1.3"/>
    <path d="M9 8.6h6M9 10.8h6M9 13h6M9 15.2h6" stroke="#2c5182" stroke-width="1" opacity=".6"/>
    <path d="M15 17.6l5 1.6" stroke="#5a8fd4" stroke-width="1.6" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-drone" viewBox="0 0 24 24">
    <rect x="9" y="9.6" width="6" height="5" rx="1.6" fill="#8a94a0" stroke="#3e454e" stroke-width="1.3"/>
    <path d="M9.5 10.5L5.5 6.5M14.5 10.5l4-4M9.5 13.7l-4 4M14.5 13.7l4 4" stroke="#3e454e" stroke-width="1.5"/>
    <g fill="#c2cad2" stroke="#3e454e" stroke-width="1.1">
      <ellipse cx="5" cy="5.6" rx="3.4" ry="1.3"/><ellipse cx="19" cy="5.6" rx="3.4" ry="1.3"/>
      <ellipse cx="5" cy="18.4" rx="3.4" ry="1.3"/><ellipse cx="19" cy="18.4" rx="3.4" ry="1.3"/>
    </g>
    <circle cx="12" cy="12.1" r="1.2" fill="#57c1f0" stroke="#1d6fa3"/>
  </symbol>

  <symbol id="i-greenhouse" viewBox="0 0 24 24">
    <path d="M4.6 11v8c0 .8.6 1.4 1.4 1.4h12c.8 0 1.4-.6 1.4-1.4v-8" fill="#bfe4ef" stroke="#3e7d94" stroke-width="1.4"/>
    <path d="M2.8 11.4L12 3.8l9.2 7.6" fill="none" stroke="#3e7d94" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8.4 11v9.2M15.6 11v9.2M4.6 15.4h14.8" stroke="#3e7d94" stroke-width="1.1" opacity=".7"/>
    <path d="M10.8 20.2v-2.6c0-1.4 2.4-1.4 2.4 0v2.6" fill="#4ca03f" stroke="#245c1e" stroke-width="1.1"/>
  </symbol>

  <symbol id="i-hen" viewBox="0 0 24 24">
    <path d="M8.2 6.8c0-1.6 1.2-2.8 2.7-2.8 1 0 1.9.5 2.4 1.4.4-.3 1-.3 1.5 0" fill="#e05a48" stroke="#8c2e20" stroke-width="1.2"/>
    <path d="M5 12.8c0-3.6 2.8-6.4 6.3-6.4 3.4 0 6.2 2.7 6.2 6.2l2.7-1c.5-.2.9.4.6.8l-2.9 3.9c-1.1 2.4-3.6 4-6.6 4-3.5 0-6.3-2.9-6.3-6.4z" fill="#f7f2e6" stroke="#7a6746" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="13.9" cy="11" r="1" fill="#33261a"/>
    <path d="M16.5 13.2l2-.7" stroke="#e8971d" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M8 20.4l1-2.2M11.5 20.6l.3-2" stroke="#e8971d" stroke-width="1.6" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-duck" viewBox="0 0 24 24">
    <path d="M8.8 7.2c0-2 1.6-3.6 3.5-3.6s3.5 1.6 3.5 3.6c0 .8-.3 1.6-.7 2.2" fill="#f7f2e6" stroke="#7a6746" stroke-width="1.3"/>
    <path d="M15.6 7.6h3c.5 0 .8.5.5 1l-1.7 2" fill="#f2a13c" stroke="#b06a12" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M4.6 13.4c0-2.6 2.1-4.7 4.7-4.7h.1c.3 2 2 3.5 4 3.5 1 0 2-.4 2.7-1.1 1.6.9 2.7 2.6 2.7 4.6 0 3.4-3.2 5.3-7.1 5.3s-7.1-1.9-7.1-5.3z" fill="#f7f2e6" stroke="#7a6746" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="13.3" cy="6.7" r=".9" fill="#33261a"/>
    <path d="M7.6 14.6c1.2 1.6 3.4 1.9 5 1" fill="none" stroke="#d8cfba" stroke-width="1.3" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-cow" viewBox="0 0 24 24">
    <path d="M4.4 6.2C3 5.9 2.2 4.9 2.2 3.6c1.7-.5 3.4.2 4.1 1.6M19.6 6.2c1.4-.3 2.2-1.3 2.2-2.6-1.7-.5-3.4.2-4.1 1.6" fill="#e8d3b8" stroke="#8a6440" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M6.2 4.6h11.6c.9 2 .9 4.2 0 6.2l-1 2H7.2l-1-2c-.9-2-.9-4.2 0-6.2z" fill="#f7f2e6" stroke="#7a6746" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M13.9 4.7c1.7 0 3.2 1 3.9 2.5.5 1.9.3 3.5-.3 4.8" fill="#6d4c2e" opacity=".85"/>
    <ellipse cx="12" cy="16.4" rx="6.2" ry="4.6" fill="#f2b8ac" stroke="#b06a5a" stroke-width="1.4"/>
    <circle cx="9.4" cy="16.2" r="1.1" fill="#8c4a3a"/><circle cx="14.6" cy="16.2" r="1.1" fill="#8c4a3a"/>
    <circle cx="9.2" cy="9.4" r="1" fill="#33261a"/><circle cx="14.8" cy="9.4" r="1" fill="#fffdf6"/>
  </symbol>

  <symbol id="i-goat" viewBox="0 0 24 24">
    <path d="M7.4 6C5.8 5.4 5 3.9 5.2 2.2c1.9.1 3.4 1.3 3.9 3M16.6 6c1.6-.6 2.4-2.1 2.2-3.8-1.9.1-3.4 1.3-3.9 3" fill="#c9b489" stroke="#8a7458" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M6.6 5.4h10.8c1 1.9 1.3 4.1.7 6.2l-1.2 4.2c-.4 1.5-1.8 2.5-3.3 2.5h-3.2c-1.5 0-2.9-1-3.3-2.5l-1.2-4.2c-.6-2.1-.3-4.3.7-6.2z" fill="#e8dcc8" stroke="#8a7458" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="9.2" cy="9.8" r="1" fill="#33261a"/><circle cx="14.8" cy="9.8" r="1" fill="#33261a"/>
    <path d="M10.4 13.6c.5.5 1.1.8 1.6.8s1.1-.3 1.6-.8" fill="none" stroke="#8a7458" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M12 15v2.2c0 1.6-.6 3-1.6 4" fill="none" stroke="#b8a888" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M13.6 21.2c-1-1-1.6-2.4-1.6-4" fill="none" stroke="#b8a888" stroke-width="1.5" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-sheep" viewBox="0 0 24 24">
    <path d="M6.2 8.2a3 3 0 0 1 2.4-4.6 3 3 0 0 1 3.4-1.8 3 3 0 0 1 3.9.6 3 3 0 0 1 2.8 3.3 3 3 0 0 1 .8 4.6 3 3 0 0 1-2 4.4H8.4a3 3 0 0 1-2.2-6.5z" fill="#f7f2e6" stroke="#a89878" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M4.2 10.2c-1.2.1-2.2-.6-2.6-1.8 1-.7 2.4-.7 3.4 0M19.8 10.2c1.2.1 2.2-.6 2.6-1.8-1-.7-2.4-.7-3.4 0" fill="#c9b489" stroke="#8a7458" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M8.2 12.2h7.6c1.3 0 2.3 1 2.3 2.3v2.1c0 2.4-2 4.4-4.4 4.4h-3.4c-2.4 0-4.4-2-4.4-4.4v-2.1c0-1.3 1-2.3 2.3-2.3z" fill="#8a7a68" stroke="#5b4c3c" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="10" cy="15.4" r="1" fill="#fffdf6"/><circle cx="14" cy="15.4" r="1" fill="#fffdf6"/>
    <path d="M11 18.6c.3.4.7.6 1 .6s.7-.2 1-.6" fill="none" stroke="#d8cfc0" stroke-width="1.2" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-pig" viewBox="0 0 24 24">
    <path d="M5.2 8.4c-.9-1-1.2-2.4-.8-3.7 1.5.2 2.8 1 3.5 2.3M18.8 8.4c.9-1 1.2-2.4.8-3.7-1.5.2-2.8 1-3.5 2.3" fill="#f2a8a0" stroke="#b06a5a" stroke-width="1.2" stroke-linejoin="round"/>
    <ellipse cx="12" cy="13" rx="8.2" ry="7" fill="#f6bcb2" stroke="#b06a5a" stroke-width="1.4"/>
    <ellipse cx="12" cy="14.2" rx="4" ry="3" fill="#e88a7a" stroke="#a85a48" stroke-width="1.3"/>
    <ellipse cx="10.5" cy="14.2" rx=".9" ry="1.3" fill="#7c3a2c"/><ellipse cx="13.5" cy="14.2" rx=".9" ry="1.3" fill="#7c3a2c"/>
    <circle cx="8.6" cy="9.8" r="1" fill="#33261a"/><circle cx="15.4" cy="9.8" r="1" fill="#33261a"/>
  </symbol>

  <symbol id="i-hand" viewBox="0 0 24 24">
    <path d="M10.9 2.2a7 7 0 0 0-4.4 4.4M10.9 5.4a4 4 0 0 0-2.3 2.3" fill="none" stroke="#57a8d8" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>
    <path d="M12.4 4.8c.9 0 1.7.8 1.7 1.7v5.6l3.6.8c1.5.3 2.5 1.6 2.5 3.1 0 .4-.1.9-.2 1.3l-1.2 2.9c-.4 1-1.4 1.6-2.4 1.6h-4.2c-.9 0-1.7-.4-2.2-1.1l-3.1-4.3c-.5-.7-.4-1.7.3-2.3.6-.5 1.5-.5 2.1 0l1.4 1.2V6.5c0-.9.8-1.7 1.7-1.7z" fill="#f2c29a" stroke="#a06a3a" stroke-width="1.4" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-hoe" viewBox="0 0 24 24">
    <path d="M5.4 20.6L16.2 7.2" stroke="#8a6440" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M14.4 5.2c1.8-1.6 4.3-2.2 6.6-1.6.3 2.4-.6 4.8-2.4 6.3l-1.5 1.3c-.6.5-1.5.5-2-.1l-1.5-1.8c-.5-.6-.4-1.5.2-2z" fill="#9aa3ad" stroke="#4c545c" stroke-width="1.4" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-sprout" viewBox="0 0 24 24">
    <path d="M12 19.5v-8" stroke="#245c1e" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 11.6C7.4 11.4 5.2 8.6 5 4.9c3.9-.3 6.8 2.5 7 6.7z" fill="#4ca03f" stroke="#245c1e" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M12 11.6c3.8-.2 5.6-2.5 5.8-5.5-3.2-.2-5.6 2-5.8 5.5z" fill="#64b953" stroke="#245c1e" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M6.4 19.8c.6-1.7 2.6-2.9 5.6-2.9s5 1.2 5.6 2.9c-1.4 1-3.4 1.6-5.6 1.6s-4.2-.6-5.6-1.6z" fill="#8a6440" stroke="#5b3e25" stroke-width="1.3" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-drop" viewBox="0 0 24 24">
    <path d="M12 2.6c3.6 4.7 5.8 7.5 5.8 10.3 0 3.3-2.6 5.9-5.8 5.9s-5.8-2.6-5.8-5.9c0-2.8 2.2-5.6 5.8-10.3z" fill="#57c1f0" stroke="#1d6fa3" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M9.2 12.6c0 1.7 1 3.1 2.4 3.7" fill="none" stroke="#bfe8fa" stroke-width="1.6" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-sparkle" viewBox="0 0 24 24">
    <path d="M10.4 3.2l1.8 5.8 5.8 1.8-5.8 1.8-1.8 5.8-1.8-5.8-5.8-1.8 5.8-1.8z" fill="#ffd75e" stroke="#b07d10" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M18.4 13.6l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#ffcb45" stroke="#b07d10" stroke-width="1.1" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-basket" viewBox="0 0 24 24">
    <path d="M7.8 9.6a4.2 4.2 0 0 1 8.4 0" fill="none" stroke="#6d4c2e" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M4.2 9.4h15.6c.7 0 1.2.6 1.1 1.3l-1.4 7.8c-.2 1.2-1.3 2.1-2.5 2.1H7c-1.2 0-2.3-.9-2.5-2.1l-1.4-7.8c-.1-.7.4-1.3 1.1-1.3z" fill="#c9974f" stroke="#6d4c2e" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M8.4 9.6l1 10.8M12 9.6v10.8M15.6 9.6l-1 10.8M4.4 13h15.2M5 16.4h14" stroke="#6d4c2e" stroke-width="1" opacity=".5"/>
  </symbol>

  <symbol id="i-blossom" viewBox="0 0 24 24">
    <g fill="#f7b8cf" stroke="#c4638a" stroke-width="1.2">
      <ellipse cx="12" cy="5.4" rx="3" ry="3.4"/>
      <ellipse cx="18.3" cy="10" rx="3" ry="3.4" transform="rotate(72 18.3 10)"/>
      <ellipse cx="15.9" cy="17.4" rx="3" ry="3.4" transform="rotate(144 15.9 17.4)"/>
      <ellipse cx="8.1" cy="17.4" rx="3" ry="3.4" transform="rotate(-144 8.1 17.4)"/>
      <ellipse cx="5.7" cy="10" rx="3" ry="3.4" transform="rotate(-72 5.7 10)"/>
    </g>
    <circle cx="12" cy="12" r="3" fill="#ffd75e" stroke="#c07f13" stroke-width="1.2"/>
  </symbol>

  <symbol id="i-leaf" viewBox="0 0 24 24">
    <path d="M18.8 3.4c1 5.6-.2 10.2-3 13-1.9 1.9-4.5 3-7.6 3.2-.2-3.1.6-6.4 2.5-8.9 2.1-2.9 4.9-6 8.1-7.3z" fill="#e8862c" stroke="#9c4a12" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M5 21c2.4-4.6 6-9.4 10.4-13" fill="none" stroke="#9c4a12" stroke-width="1.4" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-snowflake" viewBox="0 0 24 24">
    <g fill="none" stroke="#57c1f0" stroke-width="1.7" stroke-linecap="round">
      <path d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4L4 16.6"/>
      <path d="M9.6 4.4L12 6.4l2.4-2M9.6 19.6l2.4-2 2.4 2M3.6 11.2l3 .9.3-3.2M20.4 12.8l-3-.9-.3 3.2M20.4 11.2l-3 .9-.3-3.2M3.6 12.8l3-.9.3 3.2"/>
    </g>
  </symbol>

  <symbol id="i-cloud" viewBox="0 0 24 24">
    <path d="M7.2 18.6a4.2 4.2 0 0 1-.5-8.4 5.6 5.6 0 0 1 11-1.1 4.4 4.4 0 0 1-.6 8.7z" fill="#eef2f5" stroke="#7d8b96" stroke-width="1.4" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-rain" viewBox="0 0 24 24">
    <path d="M7.4 14.2a3.8 3.8 0 0 1-.4-7.6 5 5 0 0 1 9.8-1 4 4 0 0 1-.5 7.9z" fill="#dfe7ec" stroke="#7d8b96" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M8 16.6l-1.2 3M12.4 16.6l-1.2 3M16.8 16.6l-1.2 3" stroke="#3a9ad4" stroke-width="1.8" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-storm" viewBox="0 0 24 24">
    <path d="M7.4 13.4a3.8 3.8 0 0 1-.4-7.6 5 5 0 0 1 9.8-1 4 4 0 0 1-.5 7.9z" fill="#9aa8b4" stroke="#5b6a76" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M12.6 11.4l-3.4 5h2.6l-1.6 5.2 5.6-6.8h-2.8l2.2-3.4z" fill="#ffd75e" stroke="#b07d10" stroke-width="1.2" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-flame" viewBox="0 0 24 24">
    <path d="M12 2.6c.8 3 3.4 4.6 5 7a7.4 7.4 0 1 1-12.3-.3C6.5 6.8 10.7 5.8 12 2.6z" fill="#f2734e" stroke="#93341b" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 11.2c1.9 1.5 2.9 3 2.9 4.5A2.9 2.9 0 0 1 12 18.6a2.9 2.9 0 0 1-2.9-2.9c0-1.5 1-3 2.9-4.5z" fill="#ffd75e" stroke="#c07f13" stroke-width="1.1"/>
  </symbol>

  <symbol id="i-snow" viewBox="0 0 24 24">
    <path d="M7.4 13.4a3.8 3.8 0 0 1-.4-7.6 5 5 0 0 1 9.8-1 4 4 0 0 1-.5 7.9z" fill="#eef2f5" stroke="#7d8b96" stroke-width="1.3" stroke-linejoin="round"/>
    <g fill="none" stroke="#57c1f0" stroke-width="1.5" stroke-linecap="round">
      <path d="M7.6 16.2v3.6M6 17.1l3.2 1.8M9.2 17.1L6 18.9"/>
      <path d="M15.8 16.2v3.6M14.2 17.1l3.2 1.8M17.4 17.1l-3.2 1.8"/>
    </g>
  </symbol>

  <symbol id="i-crate" viewBox="0 0 24 24">
    <rect x="3.6" y="6.6" width="16.8" height="13.8" rx="1.6" fill="#c9974f" stroke="#6d4c2e" stroke-width="1.4"/>
    <path d="M3.6 10.6h16.8M3.6 16.4h16.8" stroke="#6d4c2e" stroke-width="1.2" opacity=".7"/>
    <path d="M8.2 6.6v13.8M15.8 6.6v13.8" stroke="#6d4c2e" stroke-width="1.2" opacity=".4"/>
    <rect x="9.4" y="3.4" width="5.2" height="3.2" rx="1" fill="#e8c98a" stroke="#6d4c2e" stroke-width="1.2"/>
  </symbol>

  <symbol id="i-shovel" viewBox="0 0 24 24">
    <path d="M8.9 3h6.2" stroke="#8a6440" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M12 3.6v7.2" stroke="#8a6440" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M8.3 10.4h7.4c.9 0 1.6.8 1.5 1.7-.4 3.5-2 6.7-4.6 9.3-.3.3-.9.3-1.2 0-2.6-2.6-4.2-5.8-4.6-9.3-.1-.9.6-1.7 1.5-1.7z" fill="#9aa3ad" stroke="#4c545c" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 12.4v5.8" stroke="#4c545c" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </symbol>

  <!-- ======== item icons (phase 3): crops ======== -->
  <symbol id="i-item-turnip" viewBox="0 0 24 24">
    <path d="M11.1 9.2C7.9 9 6 6.9 5.9 3.9c3.2-.3 5.4 1.8 5.8 5z" fill="#4ca03f" stroke="#245c1e" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12.9 9.2c3.2-.2 5.1-2.3 5.2-5.3-3.2-.3-5.4 1.8-5.8 5z" fill="#64b953" stroke="#245c1e" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12 21.6c-.9-.9-1.6-1.9-2-2.9-2.9-.5-5.1-2.7-5.1-5.3 0-3.1 3.1-5.3 7.1-5.3s7.1 2.2 7.1 5.3c0 2.6-2.2 4.8-5.1 5.3-.4 1-1.1 2-2 2.9z" fill="#f3eaf9" stroke="#8a5fa8" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M5.8 11.5c1.1-2 3.4-3.2 6.2-3.2s5.1 1.2 6.2 3.2c-1.7-1.1-3.8-1.6-6.2-1.6s-4.5.5-6.2 1.6z" fill="#b88ad4" stroke="#8a5fa8" stroke-width="1.1" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-item-wheat" viewBox="0 0 24 24">
    <path d="M12 21.5V8.5" stroke="#a8760e" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 6.4V2.8M9.6 7.4L7.4 4.4M14.4 7.4l2.2-3" stroke="#c99a2a" stroke-width="1.3" stroke-linecap="round"/>
    <g fill="#eab93c" stroke="#8c5a1a" stroke-width="1.2">
      <ellipse cx="12" cy="7.2" rx="2" ry="3"/>
      <ellipse cx="9.3" cy="10.2" rx="1.9" ry="2.9" transform="rotate(-30 9.3 10.2)"/>
      <ellipse cx="14.7" cy="10.2" rx="1.9" ry="2.9" transform="rotate(30 14.7 10.2)"/>
      <ellipse cx="9.3" cy="14" rx="1.9" ry="2.9" transform="rotate(-30 9.3 14)"/>
      <ellipse cx="14.7" cy="14" rx="1.9" ry="2.9" transform="rotate(30 14.7 14)"/>
    </g>
    <path d="M11.2 20.6c-2.4-.4-3.9-1.9-4.3-4.1 2.5.4 4 1.8 4.3 4.1z" fill="#93bc47" stroke="#5b7a1c" stroke-width="1.1" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-item-carrot" viewBox="0 0 24 24">
    <path d="M9 7.6c-1.7-.9-2.6-2.4-2.5-4.3 2 .2 3.4 1.3 4.1 3.1M12 7.4V2.6M15 7.6c1.7-.9 2.6-2.4 2.5-4.3-2 .2-3.4 1.3-4.1 3.1" fill="none" stroke="#3c8a33" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M8.5 7.6h7c.7 0 1.3.6 1.2 1.4-.5 4.7-2 8.7-4.7 12.1-2.7-3.4-4.2-7.4-4.7-12.1-.1-.8.5-1.4 1.2-1.4z" fill="#f27916" stroke="#9c4a12" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M9.3 11.2h5.4M10.2 14.6h3.6" stroke="#9c4a12" stroke-width="1.1" opacity=".55" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-potato" viewBox="0 0 24 24">
    <path d="M12.6 5.9c4.5.2 7.9 3.2 7.7 6.9-.2 3.6-3.9 6.3-8.5 6.1-4.6-.2-8.1-3.2-7.9-6.8.1-1.9 1.2-3.5 2.9-4.5 1.5-1.1 3.6-1.8 5.8-1.7z" fill="#d2a874" stroke="#8a6440" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M9.2 11.9c.4-.5 1-.6 1.5-.3M14.4 9.9c.4-.5 1-.6 1.5-.3M12.6 15.3c.4-.5 1-.6 1.5-.3" fill="none" stroke="#8a6440" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M6.8 9.6c.9-1.2 2.2-2 3.8-2.4" fill="none" stroke="#f0d2a0" stroke-width="1.6" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-rice" viewBox="0 0 24 24">
    <path d="M9.6 21.5c.2-6 1.2-10.9 3-14.9" fill="none" stroke="#7da84a" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M10.4 16c-2.7-.2-4.5-1.6-5.4-4 2.8-.3 4.8 1.2 5.4 4z" fill="#3eb2a0" stroke="#1c7a6c" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12.8 6.2c2.6.4 4.6 1.9 5.9 4.4" fill="none" stroke="#a89448" stroke-width="1.2"/>
    <g fill="#f4eed4" stroke="#8c7a44" stroke-width="1.1">
      <ellipse cx="12.9" cy="4.5" rx="1.45" ry="2.2" transform="rotate(16 12.9 4.5)"/>
      <ellipse cx="15.1" cy="5.6" rx="1.45" ry="2.2" transform="rotate(48 15.1 5.6)"/>
      <ellipse cx="17" cy="7.4" rx="1.45" ry="2.2" transform="rotate(66 17 7.4)"/>
      <ellipse cx="18.3" cy="9.7" rx="1.45" ry="2.2" transform="rotate(80 18.3 9.7)"/>
      <ellipse cx="18.9" cy="12.3" rx="1.45" ry="2.2" transform="rotate(92 18.9 12.3)"/>
    </g>
  </symbol>

  <symbol id="i-item-garlic" viewBox="0 0 24 24">
    <path d="M10.9 7.2c-.2-1.8.2-3.4 1.1-4.8.9 1.4 1.3 3 1.1 4.8z" fill="#d8cfb2" stroke="#9a8a62" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12 7.4c.8 0 1.5-.2 2-.7 2.9 1.5 4.9 4.3 4.9 7.4 0 3.9-3 6.7-6.9 6.7s-6.9-2.8-6.9-6.7c0-3.1 2-5.9 4.9-7.4.5.5 1.2.7 2 .7z" fill="#f4f0e2" stroke="#9a8a62" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 7.8v12.8M8.7 9.4c-.7 3.4-.7 7.2.1 10.6M15.3 9.4c.7 3.4.7 7.2-.1 10.6" fill="none" stroke="#9a8a62" stroke-width="1.1" opacity=".55"/>
  </symbol>

  <symbol id="i-item-strawberry" viewBox="0 0 24 24">
    <path d="M12 6.6v-2.4" stroke="#1e6e28" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 21.2c-4.1-1.6-6.7-4.5-6.7-8.2 0-2.5 1.7-4.5 4.2-5h5c2.5.5 4.2 2.5 4.2 5 0 3.7-2.6 6.6-6.7 8.2z" fill="#e83a42" stroke="#93222a" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M11.9 6.3c-1.7-.9-3.5-.9-5.2.1 1 1.6 2.7 2.4 4.6 2.1M12.1 6.3c1.7-.9 3.5-.9 5.2.1-1 1.6-2.7 2.4-4.6 2.1M12 6.1c-.6 1.1-.8 2.2-.5 3.3h1c.3-1.1.1-2.2-.5-3.3z" fill="#39a344" stroke="#1e6e28" stroke-width="1.1" stroke-linejoin="round"/>
    <g fill="#ffd7a8">
      <circle cx="9.4" cy="12.6" r=".75"/><circle cx="14.6" cy="12.6" r=".75"/><circle cx="12" cy="11" r=".75"/>
      <circle cx="12" cy="14.8" r=".75"/><circle cx="10.2" cy="17.2" r=".65"/><circle cx="13.8" cy="17.2" r=".65"/>
    </g>
  </symbol>

  <symbol id="i-item-tomato" viewBox="0 0 24 24">
    <circle cx="12" cy="13.4" r="7.6" fill="#ee4230" stroke="#8e1e12" stroke-width="1.4"/>
    <path d="M12 6.6V4.4" stroke="#1c5c22" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M12 5.9l1.2 1.9 2.3-.5-.7 2.1 1.9 1.1-2.2.9-2.5-1.2-2.5 1.2-2.2-.9 1.9-1.1-.7-2.1 2.3.5z" fill="#2e8a35" stroke="#1c5c22" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M7.4 11.6c.5-1.7 1.8-3 3.5-3.5" fill="none" stroke="#ff8a76" stroke-width="1.6" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-pepper" viewBox="0 0 24 24">
    <path d="M12 6.8c-.3-1.9.2-3.4 1.6-4.6" fill="none" stroke="#3c821c" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M9 7.2c.9-.4 1.9-.6 3-.6s2.1.2 3 .6c2.6.8 4.3 3.2 4.3 6.2 0 4.6-3.1 8-7.3 8s-7.3-3.4-7.3-8c0-3 1.7-5.4 4.3-6.2z" fill="#f66430" stroke="#98330e" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M9.2 20.4c-.8-3.5-.8-6.7 0-9.8M14.8 20.4c.8-3.5.8-6.7 0-9.8" fill="none" stroke="#98330e" stroke-width="1.1" opacity=".5"/>
    <path d="M6.9 12.8c.2-1.8 1.2-3.3 2.8-4" fill="none" stroke="#ffa27e" stroke-width="1.5" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-corn" viewBox="0 0 24 24">
    <ellipse cx="12" cy="11.2" rx="4.5" ry="8.5" fill="#f8d22a" stroke="#9c7a10" stroke-width="1.4"/>
    <path d="M9.9 3.6c-.7 5-.7 10.2 0 15.2M14.1 3.6c.7 5 .7 10.2 0 15.2M7.6 7.8h8.8M7.4 11.2h9.2M7.6 14.6h8.8" fill="none" stroke="#9c7a10" stroke-width="1" opacity=".5"/>
    <path d="M8.4 21.6c-2.4-3.7-3-8.1-1.8-12.9 2.7 1.6 4.2 4.4 4.1 7.8-.1 2-.9 3.8-2.3 5.1z" fill="#4ca03f" stroke="#245c1e" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M15.6 21.6c2.4-3.7 3-8.1 1.8-12.9-2.7 1.6-4.2 4.4-4.1 7.8.1 2 .9 3.8 2.3 5.1z" fill="#64b953" stroke="#245c1e" stroke-width="1.2" stroke-linejoin="round"/>
  </symbol>

  <symbol id="i-item-melon" viewBox="0 0 24 24">
    <path d="M12 4.8V3M12.4 3.4c1-.8 2.1-.9 3.2-.4" fill="none" stroke="#5b7a1c" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="12" cy="13" r="8.2" fill="#54b85c" stroke="#2c6e30" stroke-width="1.4"/>
    <path d="M8.3 5.7c-1.7 4.8-1.7 9.9 0 14.6M12 4.9c-1 5.4-1 10.9 0 16.2M15.7 5.7c1.7 4.8 1.7 9.9 0 14.6" fill="none" stroke="#2c6e30" stroke-width="1.5" opacity=".7"/>
    <path d="M6.9 10.2c.6-1.9 2-3.4 3.9-4.1" fill="none" stroke="#a5dca8" stroke-width="1.5" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-sunflower" viewBox="0 0 24 24">
    <g fill="#ffc93a" stroke="#c07f13" stroke-width="1.1">
      <ellipse cx="12" cy="4.9" rx="2.1" ry="3.7"/>
      <ellipse cx="17" cy="7" rx="2.1" ry="3.7" transform="rotate(45 17 7)"/>
      <ellipse cx="19.1" cy="12" rx="2.1" ry="3.7" transform="rotate(90 19.1 12)"/>
      <ellipse cx="17" cy="17" rx="2.1" ry="3.7" transform="rotate(135 17 17)"/>
      <ellipse cx="12" cy="19.1" rx="2.1" ry="3.7"/>
      <ellipse cx="7" cy="17" rx="2.1" ry="3.7" transform="rotate(45 7 17)"/>
      <ellipse cx="4.9" cy="12" rx="2.1" ry="3.7" transform="rotate(90 4.9 12)"/>
      <ellipse cx="7" cy="7" rx="2.1" ry="3.7" transform="rotate(135 7 7)"/>
    </g>
    <circle cx="12" cy="12" r="4.4" fill="#7a4a22" stroke="#4a2a12" stroke-width="1.2"/>
    <g fill="#a8703a"><circle cx="10.6" cy="10.8" r=".7"/><circle cx="13.4" cy="10.8" r=".7"/><circle cx="12" cy="13.3" r=".7"/></g>
  </symbol>

  <symbol id="i-item-grapes" viewBox="0 0 24 24">
    <path d="M12 6.2c0-1.3.6-2.4 1.7-3.2" fill="none" stroke="#5b3e25" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M12.4 5.4c2.2-1.9 4.6-2.3 7.1-1.2-1 2.4-3.1 3.6-6.4 3.4-.6 0-1-.5-1-1.1z" fill="#64b953" stroke="#2f6e28" stroke-width="1.2" stroke-linejoin="round"/>
    <g fill="#7e50c8" stroke="#48287c" stroke-width="1.2">
      <circle cx="8.3" cy="9.9" r="2.8"/><circle cx="12" cy="8.9" r="2.8"/><circle cx="15.7" cy="9.9" r="2.8"/>
      <circle cx="9.8" cy="14.1" r="2.8"/><circle cx="14.2" cy="14.1" r="2.8"/>
      <circle cx="12" cy="18.3" r="2.8"/>
    </g>
    <circle cx="11.1" cy="8.1" r=".85" fill="#b79ae0"/>
  </symbol>

  <symbol id="i-item-cabbage" viewBox="0 0 24 24">
    <circle cx="12" cy="12.6" r="8.2" fill="#6cc276" stroke="#2f8f3e" stroke-width="1.4"/>
    <path d="M5.3 9c1.4-2.9 3.8-4.6 6.7-4.6S17.3 6.1 18.7 9" fill="none" stroke="#a5dca8" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M12 20.5V8.6M12 12c-2.3-.4-3.9-1.7-4.8-3.9M12 12c2.3-.4 3.9-1.7 4.8-3.9M12 16.2c-2.9-.3-5.1-1.6-6.6-3.9M12 16.2c2.9-.3 5.1-1.6 6.6-3.9" fill="none" stroke="#2f8f3e" stroke-width="1.3" opacity=".8" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-yam" viewBox="0 0 24 24">
    <ellipse cx="12" cy="12.4" rx="8.8" ry="4.7" transform="rotate(-32 12 12.4)" fill="#cc5f38" stroke="#7a3218" stroke-width="1.4"/>
    <path d="M5.9 16.9l-1.7 1.5M18.1 7.9l1.7-1.5" stroke="#7a3218" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M9 13.8c1-.4 2-.4 3 0M12.2 10c1-.4 2-.4 3 0" fill="none" stroke="#7a3218" stroke-width="1.1" opacity=".5" stroke-linecap="round"/>
    <path d="M8 10.6c1.2-1.2 2.7-2 4.4-2.3" fill="none" stroke="#e8946a" stroke-width="1.4" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-pumpkin" viewBox="0 0 24 24">
    <path d="M11 7.7c-.3-1.7 0-3.2 1.1-4.5 1.3 1 1.9 2.5 1.8 4.5z" fill="#6b8c2e" stroke="#3c5c14" stroke-width="1.2" stroke-linejoin="round"/>
    <ellipse cx="12" cy="14.1" rx="8.5" ry="6.7" fill="#f57318" stroke="#a34a0e" stroke-width="1.4"/>
    <path d="M8.5 7.9c-2 4-2 8.5 0 12.4M15.5 7.9c2 4 2 8.5 0 12.4M12 7.4c-.7 4.5-.7 9 0 13.4" fill="none" stroke="#a34a0e" stroke-width="1.3" opacity=".55"/>
    <path d="M6 11.7c.6-1.6 1.8-2.9 3.4-3.7" fill="none" stroke="#ffa04e" stroke-width="1.5" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-kale" viewBox="0 0 24 24">
    <path d="M11.2 21.5c-1.5-3.6-3-6.4-5.4-9.4M12 21.6V7.4M12.8 21.5c1.5-3.6 3-6.4 5.4-9.4" fill="none" stroke="#1c8a78" stroke-width="1.7" stroke-linecap="round"/>
    <!-- curly clusters: outline pass then fill pass (cloud union) -->
    <g stroke="#0c7a68" stroke-width="2.4" fill="#2ba894">
      <circle cx="5.4" cy="11.2" r="2.4"/><circle cx="7.8" cy="12.6" r="2.5"/><circle cx="6.4" cy="8.6" r="2.3"/><circle cx="8.9" cy="9.9" r="2.3"/>
    </g>
    <g fill="#2ba894"><circle cx="5.4" cy="11.2" r="2.4"/><circle cx="7.8" cy="12.6" r="2.5"/><circle cx="6.4" cy="8.6" r="2.3"/><circle cx="8.9" cy="9.9" r="2.3"/></g>
    <g stroke="#0c7a68" stroke-width="2.4" fill="#38c2ac">
      <circle cx="18.6" cy="11.2" r="2.4"/><circle cx="16.2" cy="12.6" r="2.5"/><circle cx="17.6" cy="8.6" r="2.3"/><circle cx="15.1" cy="9.9" r="2.3"/>
    </g>
    <g fill="#38c2ac"><circle cx="18.6" cy="11.2" r="2.4"/><circle cx="16.2" cy="12.6" r="2.5"/><circle cx="17.6" cy="8.6" r="2.3"/><circle cx="15.1" cy="9.9" r="2.3"/></g>
    <g stroke="#0c7a68" stroke-width="2.4" fill="#63d8c0">
      <circle cx="12" cy="4.9" r="2.5"/><circle cx="9.7" cy="6.6" r="2.4"/><circle cx="14.3" cy="6.6" r="2.4"/><circle cx="12" cy="8.2" r="2.4"/>
    </g>
    <g fill="#63d8c0"><circle cx="12" cy="4.9" r="2.5"/><circle cx="9.7" cy="6.6" r="2.4"/><circle cx="14.3" cy="6.6" r="2.4"/><circle cx="12" cy="8.2" r="2.4"/></g>
  </symbol>

  <symbol id="i-item-frostberry" viewBox="0 0 24 24">
    <path d="M12.6 6.6c2.2-2.1 4.8-2.6 7.6-1.5-1 2.7-3.3 4-6.8 4z" fill="#3a6458" stroke="#1e3c34" stroke-width="1.2" stroke-linejoin="round"/>
    <g fill="#7284e0" stroke="#39479c" stroke-width="1.3">
      <circle cx="7.9" cy="12.2" r="3.7"/><circle cx="15.7" cy="13.4" r="3.7"/><circle cx="11" cy="17.8" r="3.7"/>
    </g>
    <path d="M6.6 11l2.6 2.4M9.2 11l-2.6 2.4" stroke="#39479c" stroke-width=".9" opacity=".8"/>
    <circle cx="14.5" cy="12.1" r=".9" fill="#aebbf0"/><circle cx="10" cy="16.6" r=".8" fill="#aebbf0"/>
    <path d="M18.9 4.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" fill="#cfe4fa" stroke="#7aa8d8" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M4.9 6.9l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z" fill="#cfe4fa" stroke="#7aa8d8" stroke-width=".8" stroke-linejoin="round"/>
  </symbol>

  <!-- ======== item icons: animal products ======== -->
  <symbol id="i-item-egg" viewBox="0 0 24 24">
    <path d="M12 2.8c3.4 0 6.3 4.4 6.3 9.1 0 4-2.7 6.8-6.3 6.8s-6.3-2.8-6.3-6.8c0-4.7 2.9-9.1 6.3-9.1z" fill="#fbf6ea" stroke="#a89878" stroke-width="1.4"/>
    <path d="M8.7 8.3c.4-1.7 1.3-3.2 2.5-4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".85"/>
    <g stroke="#d9b23c" stroke-width="1.5" stroke-linecap="round" fill="none">
      <path d="M4.6 20.6c2.1-1.2 4.6-1.8 7.4-1.8M19.4 20.6c-2.1-1.2-4.6-1.8-7.4-1.8M8 21.4c2.6-.8 5.4-.8 8 0"/>
    </g>
  </symbol>

  <symbol id="i-item-duck_egg" viewBox="0 0 24 24">
    <path d="M12.9 3c3.4.4 5.8 5 5.3 9.7-.5 4-3.4 6.5-7 6.1s-5.9-3.5-5.5-7.5C6.2 6.6 9.6 2.6 12.9 3z" fill="#e4f0e4" stroke="#7a9a86" stroke-width="1.4"/>
    <g fill="#9ab4a0">
      <circle cx="10.4" cy="8.6" r=".7"/><circle cx="14.2" cy="10.8" r=".8"/><circle cx="10.8" cy="13.6" r=".7"/>
      <circle cx="13.4" cy="15.8" r=".6"/><circle cx="9" cy="11.2" r=".55"/><circle cx="14.8" cy="6.8" r=".6"/>
    </g>
    <path d="M9.3 7.4c.6-1.6 1.6-2.9 2.9-3.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
  </symbol>

  <symbol id="i-item-milk" viewBox="0 0 24 24">
    <path d="M9.2 5.8h5.6l.4 1.7c1.7 1.5 2.7 3.7 2.7 6.1v6c0 1.1-.9 2-2 2H8.1c-1.1 0-2-.9-2-2v-6c0-2.4 1-4.6 2.7-6.1z" fill="#eef4f7" stroke="#6d7a88" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M6.3 12.4h11.4v7c0 .7-.6 1.3-1.3 1.3H7.6c-.7 0-1.3-.6-1.3-1.3z" fill="#fffdf6"/>
    <path d="M6.3 12.4h11.4" stroke="#aebbc4" stroke-width="1.2"/>
    <rect x="8.4" y="2.6" width="7.2" height="3.2" rx="1.1" fill="#e05a48" stroke="#8c2e20" stroke-width="1.2"/>
    <path d="M8.6 15.2v3.6" stroke="#d8e2e8" stroke-width="1.4" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-goat_milk" viewBox="0 0 24 24">
    <ellipse cx="11" cy="3.9" rx="3.5" ry="1.4" fill="#fffdf6" stroke="#8a7458" stroke-width="1.1"/>
    <path d="M7.5 4.2c-.4 1.1-.4 2.1 0 3-1.9 1.8-3.1 4.3-3.1 7 0 4.1 2.9 7 6.6 7s6.6-2.9 6.6-7c0-2.7-1.2-5.2-3.1-7 .4-.9.4-1.9 0-3" fill="#e8dcc8" stroke="#8a7458" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M16.9 9.6c1.9.6 3 1.8 3 3.4 0 1.3-.8 2.4-2.1 2.9" fill="none" stroke="#8a7458" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M4.6 12.6c2 .8 4.2 1.2 6.4 1.2s4.4-.4 6.4-1.2" fill="none" stroke="#3eb2a0" stroke-width="1.8" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-wool" viewBox="0 0 24 24">
    <circle cx="11.4" cy="11.8" r="8.1" fill="#f0e6d0" stroke="#8a7458" stroke-width="1.4"/>
    <g fill="none" stroke="#b09a6e" stroke-width="1.5">
      <path d="M3.9 14.6c3.3-4.3 8.7-7 14.7-7.2M5.2 17.9c3.2-4.1 8.2-6.6 13.7-6.9"/>
      <path d="M6 5.9c4 2.9 6.3 7.4 6.2 13.1M10.2 4c3.4 3.3 5 7.6 4.6 13.2"/>
    </g>
    <path d="M5.2 8.2c1-1.5 2.4-2.7 4.1-3.3" fill="none" stroke="#fdf8ec" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M17.6 16.6c1.9.5 3.1 1.5 3.6 2.9.4 1-.3 1.9-1.3 1.9h-6.4" fill="none" stroke="#8a7458" stroke-width="1.7" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-truffle" viewBox="0 0 24 24">
    <circle cx="16.6" cy="9.6" r="5.3" fill="#d8c9a2" stroke="#8a7458" stroke-width="1.3"/>
    <path d="M13.6 8.2c1.3-.8 2.8-1 4.3-.5M13.3 10.9c1.7-.7 3.5-.7 5.2 0M14.6 12.9c1.1-.5 2.3-.5 3.4-.1" fill="none" stroke="#6b5844" stroke-width="1" stroke-linecap="round" opacity=".85"/>
    <path d="M8.4 7.7l3.3-.4 2.8 1.6 1.7 2.8-.2 3.3-1.7 2.9-2.9 1.7-3.3.2-2.7-1.8-1.3-3 .4-3.3 2-2.7z" fill="#5b4636" stroke="#33261a" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M7.5 11.8l2.8-1.5 2.8 1.6M10.4 14.7l.3 3" fill="none" stroke="#33261a" stroke-width="1" opacity=".55"/>
    <circle cx="8.3" cy="9.9" r=".7" fill="#c9b489"/><circle cx="12.6" cy="12.7" r=".6" fill="#c9b489"/>
    <circle cx="8.9" cy="16.2" r=".6" fill="#c9b489"/>
  </symbol>

  <symbol id="i-item-truffle_oil" viewBox="0 0 24 24">
    <rect x="9.5" y="2.2" width="5" height="3.4" rx="1.1" fill="#c9974f" stroke="#6d4c2e" stroke-width="1.2"/>
    <path d="M10 5.4h4v2.8c2.4 1.4 4 4 4 6.8 0 3.7-2.7 6.4-6 6.4s-6-2.7-6-6.4c0-2.8 1.6-5.4 4-6.8z" fill="#f7edd2" stroke="#8a5b10" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M6.3 13.6c-.2.5-.3.9-.3 1.4 0 3.7 2.7 6.4 6 6.4s6-2.7 6-6.4c0-.5-.1-.9-.3-1.4z" fill="#f0a41c"/>
    <circle cx="10.2" cy="16.8" r="1.15" fill="#5b4636"/><circle cx="13.9" cy="18.1" r=".9" fill="#5b4636"/>
    <path d="M8.2 12.2c.5-1.3 1.4-2.4 2.6-3.1" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>
  </symbol>

  <!-- ======== item icons: artisan goods ======== -->
  <symbol id="i-item-cookies" viewBox="0 0 24 24">
    <circle cx="15.2" cy="9.4" r="6" fill="#d89a44" stroke="#8c5a1a" stroke-width="1.3"/>
    <g fill="#5b3e25"><circle cx="14" cy="7.6" r="1"/><circle cx="17.4" cy="10" r=".9"/><circle cx="14.6" cy="11.4" r=".7"/></g>
    <circle cx="9.2" cy="14.4" r="6.8" fill="#e8a94f" stroke="#8c5a1a" stroke-width="1.4"/>
    <g fill="#5b3e25"><circle cx="7.2" cy="12.4" r="1.1"/><circle cx="11.2" cy="13.6" r="1"/><circle cx="8.6" cy="16.6" r=".9"/><circle cx="11.8" cy="17" r=".75"/></g>
  </symbol>

  <symbol id="i-item-pie" viewBox="0 0 24 24">
    <path d="M5 15.9h14l-1.2 3.1c-.3.8-1.1 1.4-2 1.4H8.2c-.9 0-1.7-.6-2-1.4z" fill="#9aa3ad" stroke="#4c545c" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M4.8 13.9h14.4v2.1H4.8z" fill="#e07a1f" stroke="#8c4a12" stroke-width="1.1"/>
    <path d="M5.2 13.7c0-3.2 3-5.7 6.8-5.7s6.8 2.5 6.8 5.7z" fill="#e8a94f" stroke="#8c5a1a" stroke-width="1.4" stroke-linejoin="round"/>
    <g fill="#e8a94f" stroke="#8c5a1a" stroke-width="1.1">
      <circle cx="5.9" cy="13.8" r="1.55"/><circle cx="8.95" cy="13.8" r="1.55"/><circle cx="12" cy="13.8" r="1.55"/><circle cx="15.05" cy="13.8" r="1.55"/><circle cx="18.1" cy="13.8" r="1.55"/>
    </g>
    <path d="M10.2 10.4l-.5 1.5M13.8 10.4l.5 1.5" stroke="#8c5a1a" stroke-width="1.2" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-cake" viewBox="0 0 24 24">
    <path d="M5.4 10.6h13.2v8.2c0 1-.8 1.8-1.8 1.8H7.2c-1 0-1.8-.8-1.8-1.8z" fill="#f7e8c4" stroke="#a87c3a" stroke-width="1.4"/>
    <path d="M5.7 14.6h12.6M5.7 17.4h12.6" stroke="#f2a0b8" stroke-width="1.7"/>
    <path d="M7.6 8.2h8.8c1.2 0 2.2 1 2.2 2.2v.6c0 .9-.7 1.6-1.6 1.6-1.2 0-1.2-1.1-2.4-1.1s-1.2 1.1-2.4 1.1-1.2-1.1-2.4-1.1-1.2 1.1-2.4 1.1c-.9 0-1.6-.7-1.6-1.6v-.6c0-1.2 1-2.2 2.2-2.2z" fill="#fffdf6" stroke="#c8bfae" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="12" cy="6.7" r="2.1" fill="#e83a42" stroke="#93222a" stroke-width="1.1"/>
  </symbol>

  <symbol id="i-item-butter" viewBox="0 0 24 24">
    <path d="M4.2 12l3.4-3.4h12.2L16.4 12z" fill="#ffe392" stroke="#c07f13" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M16.4 12l3.4-3.4v6.6l-3.4 3.4z" fill="#f0b52e" stroke="#c07f13" stroke-width="1.3" stroke-linejoin="round"/>
    <rect x="4.2" y="12" width="12.2" height="6.6" fill="#ffd75e" stroke="#c07f13" stroke-width="1.3"/>
    <rect x="8.2" y="4.4" width="6.6" height="2.9" rx=".9" transform="rotate(-6 11.5 5.8)" fill="#ffe392" stroke="#c07f13" stroke-width="1.2"/>
    <path d="M5.6 13.6v3.4" stroke="#fff2c0" stroke-width="1.4" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-goat_cheese" viewBox="0 0 24 24">
    <path d="M3.4 11.6v4.6c0 2.9 3.9 5 8.6 5s8.6-2.1 8.6-5v-4.6" fill="#e8dcc0" stroke="#a89878" stroke-width="1.4"/>
    <path d="M3.5 15c1.1 2.3 4.4 3.9 8.5 3.9s7.4-1.6 8.5-3.9" fill="none" stroke="#a89878" stroke-width="1" opacity=".5"/>
    <ellipse cx="12" cy="11.6" rx="8.6" ry="5" fill="#fbf6ea" stroke="#a89878" stroke-width="1.4"/>
    <g stroke="#6b9c2e" stroke-width="1.4" stroke-linecap="round">
      <path d="M9 10.2l1.7-.5M13.6 9.6l1.5.6M10.6 13l1.7.4M14.8 12.4l1.4-.7"/>
    </g>
    <circle cx="8" cy="12.6" r=".7" fill="#6b9c2e"/><circle cx="13" cy="11.2" r=".65" fill="#6b9c2e"/>
  </symbol>

  <symbol id="i-item-yogurt" viewBox="0 0 24 24">
    <path d="M6.3 9.6h11.4l-1.2 9.4c-.1 1-1 1.8-2 1.8H9.5c-1 0-1.9-.8-2-1.8z" fill="#f2f4f6" stroke="#7d8b96" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M6.9 13.5h10.2" stroke="#f27a9c" stroke-width="2.4"/>
    <ellipse cx="12" cy="9.6" rx="5.7" ry="1.9" fill="#fffdf6" stroke="#c8bfae" stroke-width="1.2"/>
    <path d="M10.4 8.9c-.1-1.8.5-3.2 1.6-4.3 1.1 1.1 1.7 2.5 1.6 4.3z" fill="#fffdf6" stroke="#c8bfae" stroke-width="1.1" stroke-linejoin="round"/>
    <circle cx="15.4" cy="7.6" r="1.6" fill="#e83a42" stroke="#93222a" stroke-width="1"/>
  </symbol>

  <symbol id="i-item-grape_juice" viewBox="0 0 24 24">
    <circle cx="18" cy="4.8" r="1.9" fill="#7e50c8" stroke="#48287c" stroke-width="1.1"/>
    <circle cx="20.2" cy="7.4" r="1.6" fill="#7e50c8" stroke="#48287c" stroke-width="1.1"/>
    <path d="M6.6 4.4h10.8l-1 14.2c-.1 1.1-1 1.9-2.1 1.9H9.7c-1.1 0-2-.8-2.1-1.9z" fill="#eef4f7" stroke="#6d7a88" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M7 9.2h10l-.7 9.2c-.1.8-.7 1.4-1.5 1.4h-5.6c-.8 0-1.4-.6-1.5-1.4z" fill="#7e50c8"/>
    <path d="M7 9.2h10" stroke="#a07ad8" stroke-width="1.3"/>
    <path d="M8.9 6.6v2" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>
  </symbol>

  <symbol id="i-item-smoothie" viewBox="0 0 24 24">
    <path d="M13 5l1.7-2.8h2.5" fill="none" stroke="#e05a48" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M6.9 8.3c0-2.1 2.3-3.6 5.1-3.6s5.1 1.5 5.1 3.6z" fill="#eef2f5" stroke="#7d8b96" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M6.2 8.4h11.6" stroke="#7d8b96" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M7 9.4h10l-1 9.3c-.1 1-1 1.8-2 1.8h-4c-1 0-1.9-.8-2-1.8z" fill="#f27a9c" stroke="#a83a5c" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="10.2" cy="13.2" r="1" fill="#f9b8ca"/><circle cx="13.4" cy="16.2" r=".85" fill="#f9b8ca"/>
  </symbol>

  <symbol id="i-item-melon_juice" viewBox="0 0 24 24">
    <path d="M16.2 8V3.2c2.7 0 4.9 2.2 4.9 4.8z" fill="#bfe89a" stroke="#2c6e30" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M16.6 3.6c2.2.2 4 1.9 4.2 4.1" fill="none" stroke="#54b85c" stroke-width="1.6"/>
    <path d="M10.4 5.8L8.9 2.6H6.4" fill="none" stroke="#e05a48" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M5.8 6.4h11.6l-.9 12.8c-.1 1.1-1 1.9-2.1 1.9H8.8c-1.1 0-2-.8-2.1-1.9z" fill="#eef4f7" stroke="#6d7a88" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M6.2 10.6h10.8l-.6 8.4c-.1.8-.7 1.4-1.5 1.4H8.3c-.8 0-1.4-.6-1.5-1.4z" fill="#9ed486"/>
    <path d="M6.2 10.6h10.8" stroke="#c2e8a8" stroke-width="1.3"/>
  </symbol>

  <symbol id="i-item-cloth" viewBox="0 0 24 24">
    <path d="M5.4 5.6h13.2c.7 0 1.2.5 1.2 1.2v2.4c0 .7-.5 1.2-1.2 1.2H5.4c-.7 0-1.2-.5-1.2-1.2V6.8c0-.7.5-1.2 1.2-1.2z" fill="#5a8fd4" stroke="#2c5182" stroke-width="1.3"/>
    <path d="M6.6 10.4h13.2c.7 0 1.2.5 1.2 1.2V14c0 .7-.5 1.2-1.2 1.2H6.6c-.7 0-1.2-.5-1.2-1.2v-2.4c0-.7.5-1.2 1.2-1.2z" fill="#7aaae0" stroke="#2c5182" stroke-width="1.3"/>
    <path d="M4.6 15.2h13.2c.7 0 1.2.5 1.2 1.2v2.4c0 .7-.5 1.2-1.2 1.2H4.6c-.7 0-1.2-.5-1.2-1.2v-2.4c0-.7.5-1.2 1.2-1.2z" fill="#5a8fd4" stroke="#2c5182" stroke-width="1.3"/>
    <path d="M6.2 7.6h9.6M7.4 12.4h9.6M5.4 17.2H15" stroke="#bcd4ee" stroke-width="1.1" opacity=".8" stroke-linecap="round"/>
  </symbol>

  <symbol id="i-item-quilt" viewBox="0 0 24 24">
    <rect x="3.6" y="5.4" width="16.8" height="14" rx="2.2" fill="#f0e8d4" stroke="#8a7458" stroke-width="1.4"/>
    <path d="M9.2 5.6v13.6M14.8 5.6v13.6M3.8 12.4h16.4" stroke="#8a7458" stroke-width="1" stroke-dasharray="2 1.7" opacity=".8"/>
    <path d="M4.4 6.2h4v5.4h-4z" fill="#5a8fd4" opacity=".92"/>
    <path d="M15.6 6.2h3.8v5.4h-3.8z" fill="#e05a48" opacity=".92"/>
    <path d="M10 13.2h4v5.4h-4z" fill="#e05a48" opacity=".92"/>
    <path d="M4.4 13.2h4.1v5.4H4.4z" fill="#f2c14e" opacity=".92"/>
    <path d="M15.6 13.2h3.8v5.4h-3.8z" fill="#5a8fd4" opacity=".92"/>
    <path d="M10 6.2h4v5.4h-4z" fill="#f2c14e" opacity=".92"/>
    <rect x="3.6" y="5.4" width="16.8" height="14" rx="2.2" fill="none" stroke="#8a7458" stroke-width="1.4"/>
  </symbol>
</svg>`;

  // inject the sprite once at boot (scripts run after <body> exists)
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  host.innerHTML = SPRITE;
  document.body.insertBefore(host, document.body.firstChild);

  const IDS = new Set([...SPRITE.matchAll(/id="i-([\w-]+)"/g)].map(m => m[1]));

  // known ids that have no SVG symbol yet — emoji until their art lands
  const FALLBACK = {};

  // core helper — svg <use> markup, or a graceful emoji fallback for ids
  // that have no symbol yet. Item ids resolve through the `item-` namespace
  // (phase 3), so Icons.icon('turnip') finds #i-item-turnip.
  function icon(id, cls, fallbackEmoji) {
    if (!IDS.has(id) && IDS.has('item-' + id)) id = 'item-' + id;
    if (IDS.has(id)) {
      return `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
    }
    return `<span class="ic ic-emoji${cls ? ' ' + cls : ''}" aria-hidden="true">${fallbackEmoji || FALLBACK[id] || '❔'}</span>`;
  }

  // ---- domain mappings ----
  const BUILDING = {
    well: 'well', scarecrow: 'scarecrow', sprinkler: 'sprinkler', coop: 'coop',
    barn: 'barn', mill: 'mill', bakery: 'bread', creamery: 'cheese',
    press: 'juice', loom: 'spool', drone: 'drone', greenhouse: 'greenhouse',
  };
  const ANIMAL = { chicken: 'hen', duck: 'duck', cow: 'cow', goat: 'goat', sheep: 'sheep', pig: 'pig' };
  const TOOL = { auto: 'hand', hoe: 'hoe', plant: 'sprout', water: 'drop', fert: 'sparkle', harvest: 'basket', shovel: 'shovel' };
  const SEASON = ['blossom', 'sun', 'leaf', 'snowflake'];
  const WEATHER = { sun: 'sun', cloud: 'cloud', rain: 'rain', storm: 'storm', drought: 'flame', snow: 'snow' };
  // emoji used as system icons elsewhere in game data (goals etc.)
  const EMOJI = {
    '⛏️': 'hoe', '🌱': 'sprout', '💧': 'drop', '🧺': 'basket', '⚖️': 'scales',
    '🐔': 'hen', '📋': 'clipboard', '🎃': 'scarecrow', '🚧': 'sign', '✨': 'sparkle',
    '🍞': 'bread', '🐄': 'cow', '💰': 'coin', '🤖': 'drone', '⭐': 'star',
    '🏪': 'shop', '⛽': 'fuel', '🏷️': 'tag', '📦': 'crate', '🥚': 'hen',
    '🗺️': 'sign', '🏦': 'coin', '⚙️': 'gear', '⚠️': 'warning', '🌾': 'mill',
  };

  const building = (id, cls) => icon(BUILDING[id] || id, cls, (DATA.BUILDINGS[id] || {}).emoji);
  const animal   = (id, cls) => icon(ANIMAL[id] || id, cls, (DATA.ANIMALS[id] || {}).emoji);
  const tool     = (id, cls) => icon(TOOL[id] || id, cls);
  const season   = (i, cls)  => icon(SEASON[i] || 'sun', cls, DATA.SEASONS[i] && DATA.SEASONS[i].emoji);
  const weather  = (id, cls) => icon(WEATHER[id] || id, cls, (DATA.WEATHERS[id] || {}).emoji);
  // bread & cheese reuse their phase-1 symbols; everything else lives in the
  // item- namespace so crop/product ids can't collide with system icons
  const ITEM_ALIAS = { bread: 'bread', cheese: 'cheese' };
  const item     = (id, cls) => {
    const it = DATA.ITEMS[id];
    return icon(ITEM_ALIAS[id] || 'item-' + id, cls, it ? it.emoji : '❔');
  };
  const fromEmoji = (e, cls) => EMOJI[e] ? icon(EMOJI[e], cls) : `<span class="ic ic-emoji${cls ? ' ' + cls : ''}" aria-hidden="true">${e}</span>`;

  return { icon, has: id => IDS.has(id), building, animal, tool, season, weather, item, fromEmoji };
})();
