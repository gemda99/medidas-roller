// Genera src/environments/environment.ts desde variables de entorno (Vercel) o desde .env (local).
// Solo valores públicos: la URL del proyecto y la clave anon, protegidas por RLS.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const fromFile = {};
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) fromFile[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const get = (k) => process.env[k] ?? fromFile[k] ?? '';
const url = get('SUPABASE_URL');
const key = get('SUPABASE_ANON_KEY');

function isSecretKey(k) {
  if (k.startsWith('sb_secret_')) return true;
  const parts = k.split('.');
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'service_role';
  } catch {
    return false;
  }
}
if (isSecretKey(key)) {
  console.error('ERROR: SUPABASE_ANON_KEY es una clave secreta (service_role). Usa la clave anon o publishable.');
  process.exit(1);
}
if (!url || !key) {
  console.warn('Aviso: faltan SUPABASE_URL o SUPABASE_ANON_KEY. La app mostrará un aviso de configuración.');
}

mkdirSync('src/environments', { recursive: true });
writeFileSync(
  'src/environments/environment.ts',
  `// Archivo generado por scripts/set-env.mjs. No editar ni subir a Git.
export const environment = {
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(key)},
};
`,
);
