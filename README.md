# LAB LIFE

Panel de gestión y pantallas de solo visualización para IE Creative Labs.

Aplicación: https://garcy99.github.io/lab-life/

## Uso

1. Inicia sesión con tu correo y contraseña. El acceso está limitado al owner configurado y a los editores invitados.
2. Configura horarios, cierres, entregas, carteles y apariencia. Pulsa **Publish changes**.
3. En **Screens**, crea una pantalla por laboratorio y selecciona sus contenidos y diseño.
4. Abre su enlace completo en el PC de la pantalla y pulsa F11. No necesita cuenta y no puede editar.
5. En **Team**, crea invitaciones por correo y comparte personalmente el enlace generado. No se envía correo automáticamente. Cada enlace de invitación es personal, caduca y se usa una vez.

Los cambios de configuración de pantallas se guardan inmediatamente. Las pantallas consultan las novedades cada 10 segundos. Los enlaces de pantalla son privados: cualquier persona que tenga uno puede visualizar el contenido de esa pantalla. Se pueden pausar o eliminar desde el panel.

## Arquitectura

- React + Vite estático en GitHub Pages, bajo `/lab-life/`.
- Supabase Auth para sesiones personales; sin registro público en la interfaz.
- Edge Function `lab-life-api` verifica cada sesión o token de pantalla y autoriza cada operación.
- Postgres con RLS y sin permisos directos para los clientes; solo el servicio administrativo del backend accede a las tablas.
- Storage privado para imágenes, entregadas tras comprobar el acceso. El bucket se crea con la primera imagen válida.
- Cada pantalla tiene un token aleatorio; la base de datos almacena su hash.

Este repositorio contiene código y configuración pública. No contiene contraseñas, claves administrativas, datos reales, enlaces privados ni imágenes cargadas. La clave publishable de Supabase es pública por diseño; no concede acceso administrativo.

## Desarrollo

Node 22.13 o posterior y npm:

```sh
npm ci
npm test
npm run build
npm run dev
```

`dist/` contiene el sitio estático. Las rutas utilizan parámetros de consulta para funcionar en GitHub Pages sin servidor de rutas.

El backend de producción permite únicamente el origen `https://garcy99.github.io`. Para probar edición desde localhost, usa un proyecto de desarrollo independiente y configura `LAB_FRONTEND_ORIGIN` en su Edge Function; no amplíes el origen de producción.

## Despliegue

GitHub Pages está configurado para **GitHub Actions**. Cada push a `main` ejecuta pruebas, compila y publica `dist/`. El workflow no necesita secretos de Supabase.

El backend se despliega por separado:

1. Aplica `supabase/schema.sql` mediante una migración administrativa.
2. Despliega `supabase/functions/lab-life-api/index.ts` incluyendo `_shared/model.ts`.
3. Configura `verify_jwt = false`: el propio handler verifica las sesiones confirmadas y los tokens de pantalla. El gateway no puede exigir JWT a los tokens de visualización.
4. El servicio usa exclusivamente credenciales administrativas integradas del entorno de Supabase. Nunca las pongas en variables `VITE_*`, en este repositorio o en el frontend.
5. Si cambias el repositorio, dominio o proyecto, actualiza `vite.config.ts`, `src/links.ts`, `src/ui/auth-client.ts` y la URL del frontend en la función.

No ejecutes SQL directamente sobre el esquema interno `storage`; los buckets se gestionan mediante la API de Storage.

## Copias de seguridad y límites

Usa **Export backup** en el panel para guardar contenidos e imágenes. **Restore backup** carga un borrador: revisa y publica después. Los backups no contienen cuentas, permisos de editores ni perfiles/enlaces de pantalla; se gestionan por separado.

El despliegue utiliza los planes gratuitos, sujetos a las condiciones y cuotas de GitHub y Supabase. No hay una garantía de gratuidad indefinida de terceros. No se activan automáticamente planes de pago desde esta aplicación. Revisa las cuotas y conserva copias externas.

El envío automático de emails no está configurado. El owner entrega las invitaciones manualmente; para recuperar la cuenta owner puede generarse un enlace desde la administración de Supabase.

## Privacidad del código público

Nunca incluyas correos reales, contraseñas, enlaces de invitación, tokens de pantalla o copias de datos en el repositorio, los tests o los logs. Los ejemplos usan el dominio reservado `example.org`.

El backend reconoce al owner por la propiedad del tablero almacenada en la base de datos privada. Para una instalación nueva sin tablero, configura `LAB_OWNER_EMAIL` únicamente como secreto del backend en Supabase antes del primer acceso; nunca en el frontend ni en GitHub. La instalación existente no necesita publicar esa dirección.

La URL de Supabase y su clave publishable deben ser accesibles al navegador y no son credenciales administrativas. Los permisos los verifica el backend; no se almacenan claves secret o service_role en el repositorio.
