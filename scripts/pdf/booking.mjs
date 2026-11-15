// PDF del paquete booking (riders y advance sheet), es y en. `npm run downloads -- --only rider-tecnico-es`.
// Se generan a partir de las vistas de impresión (PrintLayout) y se versionan en public/downloads/booking/.
// Con el interruptor de contenido de ejemplo encendido cada página lleva el sello "Contenido de ejemplo".
const doc = (name, es, en) => [
  { name: `${name}-es`, route: `/booking/${es}/`, out: `public/downloads/booking/ailen-cachela-${name === 'advance' ? 'advance' : name === 'rider-tecnico' ? 'rider-tecnico' : 'rider-hospitalidad'}-es.pdf` },
  { name: `${name}-en`, route: `/en/booking/${en}/`, out: `public/downloads/booking/ailen-cachela-${name === 'advance' ? 'advance' : name === 'rider-tecnico' ? 'rider-tecnico' : 'rider-hospitalidad'}-en.pdf` },
];

export const jobs = [
  ...doc('rider-tecnico', 'rider-tecnico/imprimir', 'technical-rider/print'),
  ...doc('rider-hospitalidad', 'rider-hospitalidad/imprimir', 'hospitality-rider/print'),
  ...doc('advance', 'imprimir/advance', 'print/advance'),
];
