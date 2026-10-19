-- Crea TU negocio y TU usuario dueño sin pasar por el registro de la app.
-- Pegar en Supabase → SQL Editor → Run (después de haber pegado TODO_SUPABASE.sql).
-- 1) CAMBIA los 4 valores marcados con ◄◄ (correo, contraseña, nombre, negocio).
-- La contraseña debe cumplir las reglas de la app (mínimo 8 caracteres).

select registrar_(jsonb_build_object(
  'email',    'exking.guedez.tuv@gmail.com',   -- ◄◄ tu correo
  'password', 'CambiaEstaClave123',            -- ◄◄ tu contraseña
  'nombre',   'Exking Guedez',                 -- ◄◄ tu nombre
  'negocio',  'Mi Negocio'                     -- ◄◄ nombre de tu negocio
));

-- 2) Plan máximo (PREMIUM = todas las funciones, usuarios ilimitados), activo y con fecha de vencimiento explícita.
update negocios
   set plan = 'PREMIUM',
       activo = true,
       vencimiento = date '2035-12-31',   -- ◄◄ esta es la fecha; cámbiala cuando quieras (ver abajo)
       max_usuarios = null,               -- null = usa el límite del plan (PREMIUM = ilimitado)
       funciones_extra = ''
 where id = (select tenant_id from "Usuarios" where lower("Email") = lower('exking.guedez.tuv@gmail.com') limit 1);

-- 3) Ver el resultado
select n.codigo, n.nombre, n.plan, n.vencimiento, n.activo from negocios n
 where n.id = (select tenant_id from "Usuarios" where lower("Email") = lower('exking.guedez.tuv@gmail.com') limit 1);

-- ───────── DESPUÉS, para administrar ─────────
-- Cambiar la fecha de vencimiento:
--   update negocios set vencimiento = date '2040-06-30' where codigo = 'minegocio';
-- Sin fecha (nunca vence):   update negocios set vencimiento = null where codigo = 'minegocio';
-- Suspender / reactivar:     update negocios set activo = false where codigo = 'minegocio';
-- Cambiar de plan:           update negocios set plan = 'PROFESIONAL' where codigo = 'minegocio';
-- (el "codigo" sale en el paso 3; también se ve en Table Editor → negocios)
