// Regenera supabase/instalar_todo.sql con todas las migraciones en orden: `npm run install-sql`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const head = `-- =====================================================================
-- MEDIDAS ROLLER · INSTALAR TODO (base de datos nueva de una empresa)
-- =====================================================================
-- Úsalo SOLO en un proyecto de Supabase NUEVO y vacío (no en uno que ya tenga la app).
-- Supabase > SQL Editor > New query > pega TODO este archivo > Run (una sola vez).
-- Después: crea el primer usuario en Authentication > Users y ejecuta el bloque del final.
-- Incluye ${files.length} migraciones, en orden:
${files.map((f) => `--   ${f}`).join('\n')}
-- =====================================================================
`;
const body = files.map((f) => `\n\n-- >>>>>>>>>> ${f}\n${readFileSync(`${dir}/${f}`, 'utf8')}`).join('');
const tail = `

-- =====================================================================
-- PRIMER ADMINISTRADOR (ejecutar DESPUÉS de crear el usuario en Authentication > Users)
-- Cambia el correo y el nombre, selecciona solo estas líneas y presiona Run.
-- =====================================================================
-- update public.profiles
-- set role = 'admin', full_name = 'Nombre Apellido'
-- where id = (select id from auth.users where email = 'correo@empresa.cl');
`;
writeFileSync('supabase/instalar_todo.sql', head + body + tail);
console.log(`instalar_todo.sql: ${files.length} migraciones`);
