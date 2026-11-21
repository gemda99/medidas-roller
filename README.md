# Medidas Roller

Aplicación web responsive para registrar rectificaciones de cortinas roller, cotizar en la visita y compartir la cotización como imagen.

Documentación funcional y técnica: carpeta `docs/` del proyecto (PRD, DATABASE, ARCHITECTURE, DESIGN).

## Stack

Angular 22 (standalone, signals, zoneless) · Supabase (Auth, PostgreSQL con RLS, Storage) · Vercel.

## Estado: Sprint 1

| Historia | Estado |
|---|---|
| HU-08 Proyecto Angular y estructura | Hecho (compila, pruebas en verde) |
| HU-09 Migraciones y RLS | Hecho (13 pruebas de base de datos en verde, con PGlite) |
| HU-41 Roles medidor y administrador | Hecho en base de datos; falta probar en Supabase real |
| HU-10 Login, recuperación, guards | Código y pruebas unitarias; falta probar en Supabase real |
| HU-12 Layout responsive | Código; falta revisión en teléfono |
| HU-13 / HU-14 Clientes y direcciones | Código y pruebas unitarias; falta probar en Supabase real |
| HU-11 GitHub + despliegue | Configuración lista (`vercel.json`); falta crear repo y proyecto |

## Puesta en marcha (una sola vez)

### 1. Supabase

1. Crea un proyecto en <https://supabase.com> (plan gratuito, región São Paulo por cercanía).
2. **Authentication > Sign In / Providers > Email**: desactiva *Allow new users to sign up* (no hay registro público).
3. **Authentication > URL Configuration**: en *Site URL* pon la URL de Vercel; en *Redirect URLs* agrega `http://localhost:4200/nueva-clave` y `https://TU-APP.vercel.app/nueva-clave`.
4. **SQL Editor**: ejecuta, en orden, los archivos de `supabase/migrations/`.
   (Alternativa con CLI: `npx supabase link --project-ref TU_REF` y `npx supabase db push`.)
5. **Authentication > Users > Add user**: crea tu usuario con correo y contraseña (marca *Auto confirm*). Opcional: en *User metadata* pon `{"full_name": "Tu nombre"}`.
6. **SQL Editor**: ejecuta `supabase/seed_first_admin.sql` con tu correo para quedar como administrador.
7. Para cada medidor: repite el paso 5. Quedan como medidor automáticamente.

### 2. Local

```bash
cp .env.example .env      # completa SUPABASE_URL y SUPABASE_ANON_KEY (Project Settings > API)
npm install
npm start                 # http://localhost:4200
```

> Usa solo la clave **anon / publishable**. El script `scripts/set-env.mjs` se niega a compilar con la clave `service_role`.

### 3. GitHub y Vercel

1. Crea un repositorio **privado** en GitHub y sube el proyecto (`.env` está en `.gitignore`).
2. En Vercel: *Add New > Project*, importa el repo. La configuración se lee de `vercel.json`.
3. En *Settings > Environment Variables* agrega `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
4. Cada push a `main` publica la app.

## Pruebas

```bash
npm test -- --watch=false   # unitarias (Vitest): validaciones, errores, guards, login, lista de clientes
npm run test:db             # migraciones + RLS en PostgreSQL embebido (PGlite), sin Supabase
```

## Estructura

```text
src/app/
├── core/          auth (sesión y perfil), guards, layout
├── shared/        errores, validaciones, componentes comunes
├── domain/        modelos y datos de negocio (sin Angular ni Supabase)
├── data-access/   cliente Supabase y repositorios
└── features/      auth, dashboard, customers
supabase/
├── migrations/    SQL versionado
└── tests/         pruebas de RLS
```

## Decisiones técnicas de este sprint

- **`@lucide/angular`** en lugar de `lucide-angular`: el paquete antiguo no es compatible con Angular 22.
- **Crear cliente + dirección en una función SQL** (`create_customer_with_address`): si se corta la señal no queda un cliente sin dirección.
- **Columna `phone_digits`**: permite buscar «912345678» aunque el teléfono se guardó con espacios.
- **Clientes compartidos** entre usuarios activos; solo el administrador los borra.
- **Inlining de fuentes desactivado** en el build: la fuente Inter se carga desde Google Fonts en el navegador.
- Presupuesto de bundle inicial subido a 600 kB (aviso): `supabase-js` ocupa la mayor parte (~124 kB comprimido en total).
