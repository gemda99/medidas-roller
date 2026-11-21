# Medidas Roller

Aplicación web responsive para registrar rectificaciones de cortinas roller, cotizar en la visita y compartir la cotización como imagen.

Documentación funcional y técnica: carpeta `docs/` del proyecto (PRD, DATABASE, ARCHITECTURE, DESIGN).

## Stack

Angular 22 (standalone, signals, zoneless) · Supabase (Auth, PostgreSQL con RLS, Storage) · Vercel.

## Estado

| Sprint | Estado |
|---|---|
| 1 · Fundamentos y clientes | Probado por Gabriel con Supabase real. Falta HU-11 (GitHub + Vercel). |
| 2 · Rectificación en terreno | Probado por Gabriel con Supabase real (incluidos ajustes: cuadros, orden del doble, caída por tela, VC). |
| 3 · Fotos y tarifarios | Probado por Gabriel con Supabase real. |
| 4 · Motor y cotización | Código y pruebas automáticas en verde; falta prueba en Supabase real. |

### Aplicar migraciones nuevas en Supabase

Cada sprint trae archivos nuevos en `supabase/migrations/` y un archivo `supabase/aplicar_*.sql` listo para copiar y pegar en Supabase › Editor SQL › nueva consulta › Correr (una sola vez cada uno, en orden): `aplicar_sprint2.sql`, `aplicar_sprint2_ajustes.sql`, `aplicar_sprint3.sql`, `aplicar_sprint4.sql`.

## Puesta en marcha (una sola vez)

### 1. Supabase

1. Crea un proyecto en <https://supabase.com> (plan gratuito, región São Paulo por cercanía).
2. **Authentication > Sign In / Providers > Email**: desactiva *Allow new users to sign up* (no hay registro público).
3. **Authentication > URL Configuration**: en *Site URL* pon la URL de Vercel; en *Redirect URLs* agrega `http://localhost:4200/nueva-clave` y `https://TU-APP.vercel.app/nueva-clave`.
4. **SQL Editor**: ejecuta, en orden, los archivos de `supabase/migrations/` (cada uno incluye sus permisos `GRANT`).
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
npm run test:db             # migraciones + RLS en PostgreSQL embebido (PGlite), sin Supabase (45 pruebas)
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
- **Permisos explícitos (`GRANT`) en cada migración**: los proyectos nuevos de Supabase no exponen solas las tablas a la API. Las pruebas de base de datos ya no dan permisos globales, así detectan si falta alguno.
- **Cortina = 1 o 2 telas (`curtain_components`)** y guardado atómico con `save_curtain`: valida en la base que un doble tenga fondo y frente.
- **Borrador local** (`DraftStore`): lo escrito se guarda en el teléfono mientras se edita y se borra al guardar.
- **Motor de cotización** (`domain/pricing/pricing-engine.ts`): TypeScript puro y determinista, 20 pruebas (caso del Excel: $246.425). La base valida coherencia de montos, límites de descuento del medidor y bloquea cotizaciones emitidas.
- **Snapshot por cotización**: copia de precios, catálogo y cliente dentro de la cotización; un borrador se recalcula con su copia salvo que se pida «Actualizar al tarifario vigente».
- Presupuesto de bundle inicial subido a 600 kB (aviso): `supabase-js` ocupa la mayor parte (~124 kB comprimido en total).
