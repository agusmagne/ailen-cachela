// PDF de prensa: EPK de 3 páginas y one-sheet, en español e inglés (vistas de impresión de src/pages/prensa/imprimir y en/press/print).
// Se generan con `npm run downloads` (o `-- --only epk-es`) y se versionan en public/downloads/press/.
// Regenerar con el interruptor demo en el estado que se va a publicar: un PDF con ejemplos lleva el sello en cada página.
export const jobs = [
  { name: 'epk-es', route: '/prensa/imprimir/', out: 'public/downloads/press/ailen-cachela-epk-es.pdf' },
  { name: 'epk-en', route: '/en/press/print/', out: 'public/downloads/press/ailen-cachela-epk-en.pdf' },
  { name: 'one-sheet-es', route: '/prensa/imprimir/una-pagina/', out: 'public/downloads/press/ailen-cachela-one-sheet-es.pdf' },
  { name: 'one-sheet-en', route: '/en/press/print/one-sheet/', out: 'public/downloads/press/ailen-cachela-one-sheet-en.pdf' },
];
