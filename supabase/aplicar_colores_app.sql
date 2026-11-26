-- Colores de la app por empresa: pega TODO este archivo en Supabase > Editor SQL > nueva consulta > Correr (una sola vez).

-- Colores de la app por empresa (pedido del 26-11): cada instalación muestra su marca.
-- theme_primary: fondos (menú lateral, encabezados, botones principales).
-- theme_secondary: resaltados (opción activa del menú, enlaces, chips).
-- Los valores por defecto son los colores actuales, así que una instalación existente no cambia.
-- (accent_color sigue siendo el color de las imágenes de cotización, confección e instalación.)
alter table public.business_settings
  add column if not exists theme_primary   text not null default '#0F2A4A' check (theme_primary ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists theme_secondary text not null default '#2563EB' check (theme_secondary ~ '^#[0-9A-Fa-f]{6}$');
