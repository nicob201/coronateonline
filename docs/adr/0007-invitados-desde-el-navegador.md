# ADR 0007 — Los invitados entran desde el navegador, sin captcha

- **Estado:** aceptada
- **Fecha:** 2026-11-08 (D23)

## Contexto

Cualquiera puede jugar como invitado con un clic, y cada cuenta nueva recibe 20 👑. Como la economía es de suma cero, alguien podría crear muchos invitados y pasarle todas esas Coronas a una sola cuenta.

Supabase limita los inicios de sesión anónimos **por IP**. Pero el invitado se creaba desde una Server Action, así que la IP que veía Supabase era la de Vercel, compartida por todos los visitantes. O el límite no frenaba a nadie, o frenaba a todos a la vez.

## Decisión

- El botón "Entrar como invitado" llama a `signInAnonymously()` **desde el navegador**, así que el límite cuenta la IP real de cada visitante.
- Después, la Server Action `enterAsGuest` valida el nombre en el servidor y lo guarda.
- El límite de Supabase para usuarios anónimos queda en 10 por hora por IP (dashboard en producción, `config.toml` en local).
- No hay captcha. Se agregaría (Cloudflare Turnstile) solo si aparece abuso real.

## Alternativas

- **Cloudflare Turnstile desde el principio:** suma un script de terceros y fricción en el primer clic, que es justo lo que tiene que ser instantáneo.

## Consecuencias

- Entrar a jugar sigue siendo un clic, sin desafíos.
- El nombre del invitado se sigue validando en el servidor, así que el navegador no puede saltear las reglas de nombres (largo, únicos sin distinguir mayúsculas ni acentos).
- Alguien con muchas IPs todavía puede crear cuentas. Para una demo sin plata real, el costo de ese abuso es bajo y el límite alcanza.
- En el stack local, Auth no aplica límites por IP, así que el límite solo se puede ver funcionando en producción.
