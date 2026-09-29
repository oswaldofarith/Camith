// Exporta Firestore y las cuentas de Firebase Auth a JSON para importarlos en Django.
//
// Uso (desde legacy/firebase/export/, con serviceAccountKey.json en esa carpeta
// o su contenido en la variable FIREBASE_SERVICE_ACCOUNT):
//   npm install && npm run exportar   (genera firestore-export/ en la raíz)
//
// Genera un archivo <coleccion>.json por colección y auth_users.json.
// No exporta contraseñas: los usuarios las recuperan desde la nueva app.
import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';

const COLECCIONES = [
  'users',
  'vehiculos',
  'equipos',
  'solicitudes',
  'fieldUnitCompositions',
  'ordenesDeTrabajo',
  'planesDeMantenimiento',
  'notificaciones',
  'appConfiguration',
];

const destino = path.resolve(process.argv[2] ?? 'firestore-export');
// La credencial se lee de FIREBASE_SERVICE_ACCOUNT (contenido JSON) o del archivo.
const credenciales = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT ?? fs.readFileSync('serviceAccountKey.json', 'utf8'),
);
admin.initializeApp({ credential: admin.credential.cert(credenciales) });
const db = admin.firestore();

// Convierte tipos de Firestore a JSON plano.
function normalizar(valor) {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof admin.firestore.Timestamp) return valor.toDate().toISOString();
  if (valor instanceof admin.firestore.GeoPoint) {
    return { latitude: valor.latitude, longitude: valor.longitude };
  }
  if (valor instanceof admin.firestore.DocumentReference) return valor.path;
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, normalizar(v)]));
  }
  return valor;
}

fs.mkdirSync(destino, { recursive: true });

for (const nombre of COLECCIONES) {
  const snap = await db.collection(nombre).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...normalizar(d.data()) }));
  fs.writeFileSync(path.join(destino, `${nombre}.json`), JSON.stringify(docs, null, 2));
  console.log(`${nombre}: ${docs.length} documentos`);
}

const cuentas = [];
let pageToken;
do {
  const pagina = await admin.auth().listUsers(1000, pageToken);
  for (const u of pagina.users) {
    cuentas.push({ uid: u.uid, email: u.email ?? null, disabled: u.disabled });
  }
  pageToken = pagina.pageToken;
} while (pageToken);
fs.writeFileSync(path.join(destino, 'auth_users.json'), JSON.stringify(cuentas, null, 2));
console.log(`auth_users: ${cuentas.length} cuentas`);
