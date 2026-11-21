-- Sprint 6: pega TODO este archivo en Supabase > Editor SQL > nueva consulta > Correr (una sola vez).

-- Sprint 6 · Reglas de confección por producto (HU-42, D-25, D-30).
-- Cada columna es lo que se suma o resta (en cm) a la medida de terreno. NULL = esa pieza no aplica.
-- Base: ancho de la tela de terreno, salvo conf_fabric_h, que usa el alto.
-- Se guardan como columnas del producto (no como tabla aparte): son 6 valores fijos por producto,
-- y así el administrador los edita en la misma ficha del catálogo.
alter table public.products
  add column conf_fabric_w numeric(4,1) check (conf_fabric_w between -50 and 50),  -- tela ancho
  add column conf_fabric_h numeric(4,1) check (conf_fabric_h between -50 and 80),  -- tela alto
  add column conf_tube     numeric(4,1) check (conf_tube     between -50 and 50),  -- tubo
  add column conf_bottom   numeric(4,1) check (conf_bottom   between -50 and 50),  -- G polvo
  add column conf_cenefa   numeric(4,1) check (conf_cenefa   between -50 and 50),  -- cenefa (si la cortina la lleva)
  add column conf_roller   numeric(4,1) check (conf_roller   between -50 and 50);  -- rodillo extra del dúo

-- Valores informados por Gabriel (Excel y D-25). BOP usa los mismos que BO (D-30).
update public.products
set conf_fabric_w = -4, conf_fabric_h = 20, conf_tube = -3.5, conf_bottom = -3.5, conf_cenefa = -0.5
where code in ('SE', 'BO', 'BOP', 'RD', 'RDBO');

-- Dúo: rodillo extra = G polvo − 1 cm → ancho − 4,5.
update public.products set conf_roller = -4.5 where code in ('RD', 'RDBO');

-- VE: fabricación externa (fabricated = false), sin reglas. VC: sin reglas hasta que el administrador las cargue.
-- Los sistemas dobles (SE+BO, SE+BOP) no llevan reglas propias: cada tela usa las de su producto.
