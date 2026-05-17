# HB Lab — Briefing para Claude

> Leer este archivo completo antes de tocar cualquier código.
> Para historial detallado de cada sesión, ver `CONTEXTO.md`.

---

## Qué es el proyecto

Plataforma de cursos online de entrenamiento deportivo. Vende cursos a alumnos, los coaches gestionan foro/materiales/progreso, el admin gestiona todo. Sin framework — HTML estático + CSS inline + vanilla JS + Supabase.

**Stack estricto:**
- HTML estático, CSS embebido en `<style>`, JS embebido en `<script>` — sin npm, sin build, sin módulos ES
- Supabase JS v2 via CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- Cliente global `sb` expuesto por `supabase.js` (incluir SIEMPRE antes de cualquier script que use `sb`)
- No hay backend propio — todo via Supabase PostgREST + Auth + Storage + RPCs

---

## Archivos del proyecto

```
hblab/
├── index.html                     ← Landing (dinámica desde Supabase: launches, cursos, próximamente)
├── login.html                     ← Login + Recuperar contraseña (2 paneles — registro eliminado en Etapa X.15; alta automática vía process-payment)
├── set-password.html              ← Activación de cuenta para alumnos invitados (Etapa X.17 — recibe token del email de invite, fija password, redirige a dashboard)
├── dashboard.html                 ← Panel alumno (cursos comprados paid+active)
├── admin.html                     ← Panel admin (role='admin') — Cursos, Alumnos, Coaches, Lanzamientos, Gestión
├── coach.html                     ← Panel coach (role='coach'|'admin') — 2 tabs: Mi curso + Ganancias
├── perfil.html                    ← Página de perfil (todos los roles) — avatar, datos personales, cursos completados (Sesión 57)
├── curso.html                     ← Página de curso dinámica (?slug=) para cursos nuevos
├── venta-curso.html               ← Página de venta dinámica (?slug=) para cursos nuevos
├── checkout.html                  ← Página de checkout pública (?slug=&currency=) — form + cupones + integración MP (Etapa X.13)
├── checkout-success.html          ← Pago aprobado — landing post-MP (back_url success, Etapa X.13)
├── checkout-pending.html          ← Pago en proceso — landing post-MP (back_url pending, Etapa X.13)
├── curso-webinar-hipertrofia.html ← Curso legacy 1 (contenido hardcoded)
├── curso-carrera-hibrida.html     ← Curso legacy 2
├── curso-entrenamiento-hibrido.html ← Curso legacy 3
├── webinar-hipertrofia.html       ← Página de venta legacy 1
├── carrera-hibrida.html           ← Página de venta legacy 2
├── entrenamiento-hibrido.html     ← Página de venta legacy 3
├── supabase.js                    ← Config cliente (expone `sb`)
├── notifs.js                      ← Sistema in-app de notificaciones compartido (Sesión 58)
├── CONTEXTO.md                    ← Historial completo sesión a sesión
└── assets/certificados/           ← PNGs base para jsPDF (cert-{slug}.png)
```

---

## Supabase

| Campo | Valor |
|-------|-------|
| Project URL | `https://bqkajhxfdybmuilvzchm.supabase.co` |
| Anon key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxa2FqaHhmZHlibXVpbHZ6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTI3MTcsImV4cCI6MjA5MjEyODcxN30.d0HL1AyK_6LOYDKk6hNtChFtik6gVc-3p77ODrz32Gk` |

---

## Base de datos — tablas activas

| Tabla | Descripción clave |
|-------|-------------------|
| `auth.users` | Interna Supabase Auth |
| `public.profiles` | `id, full_name, email, avatar_url, bio, role, created_at, birth_date, phone, experience_level, training_goal` — RLS: `auth.uid() = id` (solo propio). Campos extra para perfil del usuario (Sesión 57) |
| `public.courses` | `id, slug, title, description, cover_url, banner_text, price_ars, price_usd, is_active, is_coming_soon, is_live, live_url, live_date, recording_url (legacy single), recordings JSONB DEFAULT '[]' (array `[{title, url}]`), live_completed, total_videos, videos JSONB, learning_points JSONB, syllabus JSONB, certificate_url, course_type ENUM('videos','modules','live')` |
| `public.course_modules` | `id, course_id, title, order_num, created_at` — agrupa lecciones cuando `course_type='modules'` (Sesión 48) |
| `public.course_lessons` | `id, module_id, title, video_url, order_num, created_at` — videos individuales dentro de cada módulo. ⚠️ La columna se llama **`video_url`** (NO `url`) — usar siempre `video_url` en SELECTs y en los payloads de INSERT/UPDATE (Sesión 50 fix) |
| `public.user_courses` | `user_id, course_id, payment_status, payment_method, amount_paid, currency, status` — acceso: `paid + active` |
| `public.coach_courses` | `coach_id, course_id, commission_pct` — asigna coaches a cursos |
| `public.forum_posts` | `course_id, user_id, parent_id, content, is_anonymous, image_urls TEXT[]` — árbol a un nivel |
| `public.course_materials` | `course_id, title, description, drive_url, uploaded_by` — ⚠️ columna es `drive_url` (NO `drive_link`), `uploaded_by` (NO `coach_id`) |
| `public.video_progress` | `user_id, course_id, video_index, completed` |
| `public.ad_spend` | `course_id, platform, amount_ars, amount_usd, spend_date` |
| `public.launches` | `title, description, image_url, course_id, active, cta_text` — máx. 3 activos |
| `public.notifications` | `id, user_id, title, body, link, read, created_at` — RLS: usuario lee/actualiza solo lo propio; INSERT abierto a authenticated (Sesión 58) |
| `public.site_config` | `key TEXT PK, value TEXT` — keys actuales: `global_announcement`, `countdown` (value es JSON serializado). RLS: admin escribe; público lee (Sesión 54) |
| `public.coupons` | `id, code, discount_pct, discount_fixed, valid_until, max_uses, uses_count, course_id, is_active` — códigos promocionales que el alumno aplica en checkout.html. RLS: admin gestiona todo; público lee solo `is_active=true`. `discount_fixed` está expresado en ARS (no aplica para pagos USD). `course_id IS NULL` → cupón válido para todos los cursos. `max_uses=0` → ilimitado. (Etapa X.12) |

**Nueva columna en `courses`**: `display_order INT DEFAULT 0` — controla el orden de aparición en la landing (`index.html` ordena por `display_order ASC, created_at ASC`). Se gestiona desde admin → Tab Landing → sección "Orden de cursos" (Sesión 54).

**Roles de usuario:** `'student'` → dashboard.html · `'coach'` → coach.html · `'admin'` → admin.html

---

## RPCs SECURITY DEFINER (todas ejecutadas en Supabase)

Usar siempre RPCs para leer datos de otros usuarios — la RLS de `profiles` bloquea lecturas cruzadas.

| RPC | Retorna | Uso |
|-----|---------|-----|
| `assign_coach_by_email(p_email)` | `{status}` | Admin asigna rol coach |
| `remove_coach_role(p_user_id)` | void | Admin quita rol coach |
| `get_coaches()` | `{id, full_name, course_titles[]}` | Admin — lista coaches |
| `get_students_with_courses()` | `{user_id, full_name, email, course_titles[]}` | Admin — alumnos con cursos activos |
| `get_students_without_courses()` | `{p_id, p_full_name, p_email, p_created_at}` | Admin — email marketing |
| `get_forum_posts(p_course_id)` | `{id, content, created_at, parent_id, user_id, full_name, role, is_anonymous, image_urls[]}` | Coach + Alumnos |
| `get_course_progress(p_course_id)` | `{user_id, full_name, email, completed, total}` | Coach — progreso alumnos |
| `get_course_coaches(p_course_id)` | `{coach_id, full_name, avatar_url, bio}` | venta-curso.html — instructores. Llamada con `course.id` (UUID, NUNCA el slug). En `renderInstructores`: error o data vacío → `section.style.display='none'` (silencioso en UI, `console.warn` para debug); con datos → setea `display=''` (defensivo) y renderiza cada coach con `<img>` si `avatar_url` o `<div class="instructor-initials">` con iniciales (primeras 2 palabras de `full_name`) como placeholder, + nombre + bio (Sesión 45) |
| `set_live_completed(p_course_id)` | void | Coach — finaliza clase en vivo |
| `set_recording_url(p_course_id, p_recording_url)` | void | Coach — guarda URL embed de grabación post-live (legacy, columna `recording_url`) |
| `set_recordings(p_course_id, p_recordings)` | void | Coach — guarda array JSONB `[{title, url}]` de grabaciones post-live (Sesión 40) |
| `notify_coaches(p_course_id, p_title, p_body, p_link)` | void | Alumno → notifica a todos los coaches del curso (resuelve `coach_courses` internamente, INSERT batch en `notifications`). SECURITY DEFINER bypasea la RLS de notifications (Sesión 62) |
| `get_ventas()` | `{enrolled_at, full_name, email, course_title, amount_paid, currency, payment_method, payment_status, status}` | Admin — Tab Gestión `loadVentas()`. SECURITY DEFINER que joinea `user_courses + profiles + courses` server-side y bypassea la RLS de profiles (que bloqueaba la lectura del email cruzado). Reemplaza al patrón viejo de 3 queries separadas (Etapas X.16.1 + X.25). El RPC retorna **TODAS** las filas; el cliente filtra `payment_status === 'paid'` y ordena por `enrolled_at` desc. **No expone `course_id`** — el filtro de curso del Tab Gestión matchea por `course_title` (Etapa X.26) |

**Regla:** `sb.rpc()` NO admite `.select()`, `.eq()` ni modificadores PostgREST encadenados.

---

## Identidad visual

| Variable CSS | Valor |
|-------------|-------|
| `--bg` | `#1E2A3A` |
| `--lime` | `#C8E600` |
| `--violet` | `#7B4FBE` |
| `--white` | `#FFFFFF` |
| `--gray-text` | `#94A3B8` |
| `--card-bg` | `#243042` |
| `--card-border` | `#2f3e52` |
| `--red` | `#ef4444` |

Tipografía: **Inter** (UI) + **Playfair Display** (acentos cursiva).

---

## Mobile (Etapas X.21 → X.23 — viewport ≤ 600px)

**Regla general (Etapa X.23 — actualiza X.22)**: las tablas del admin **NUNCA ocultan columnas** en mobile. El approach correcto es **scroll horizontal sobre el wrapper**, manteniendo todas las columnas visibles a su ancho natural. El usuario hace swipe lateral para ver las que no entran en pantalla. Esto reemplaza la estrategia anterior (X.21+X.22) que escondía columnas con `display: none` y resultaba en información perdida y columnas de acciones a veces escondidas.

**Implementación canónica del scroll** (admin.html):

```css
@media (max-width: 600px) {
  /* Wrappers que contienen tablas hacen scroll horizontal */
  .data-table-wrap,
  [class*="table-wrap"],
  [class*="tabla"] {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  /* La tabla mantiene su ancho intrínseco mínimo de 600px → fuerza scroll */
  .data-table { min-width: 600px; font-size: 13px; }
  /* Cells sin wrap y con padding compacto */
  .data-table td, .data-table th { white-space: nowrap; padding: 8px 10px; }
}
```

Esto se aplica a TODAS las tablas del admin: Cursos (8 cols), Alumnos (6 cols), Coaches (3 cols), Cupones (7 cols), Ventas (6 cols), Coaches ventas (3 cols), Ad spend (5 cols), Lanzamientos. Todas visibles con scroll, ninguna columna escondida.

**Reglas eliminadas en X.23**:
- `.data-table th:nth-child(n+4), .data-table td:nth-child(n+4) { display: none }` que vivía en el `@media (max-width: 768px)` original (pre-X.21).
- Todos los bloques `#panel-cursos .data-table th:nth-child(N) { display: none }` de X.21 y X.22 (cols Slug, Precio USD, Estado, Ventas, Creado).
- Todos los bloques `#panel-alumnos .data-table th:nth-child(N) { display: none }` de X.22 (cols Nombre, Cursos, Registrado).
- Todos los bloques `.data-table:has(#tbody-ventas) th:nth-child(N) { display: none }` de X.22 (cols Fecha, Moneda, Método).
- Las reglas de truncado en el email de Alumnos (`max-width: 160px; overflow: hidden; text-overflow: ellipsis`) — ya no se necesita truncar porque el email se ve completo gracias al scroll.
- Las reglas `min-width: 40px` específicas para columnas de acciones — ya no se necesitan porque toda celda hereda `white-space: nowrap` del rule global.

---



Optimización CSS sin tocar lógica ni HTML estructural en `admin.html` y `coach.html`. Todos los media queries usan `@media (max-width: 600px)`.

**`admin.html`** (Etapa X.23):
- **Tabs**: `.tabs-inner` con `overflow-x: auto`, `white-space: nowrap`, `-webkit-overflow-scrolling: touch`, scrollbar oculta (Firefox `scrollbar-width:none` + WebKit `::-webkit-scrollbar { display:none }`). Cada `.tab-btn` con `flex-shrink: 0` para no comprimirse.
- **Tablas — scroll horizontal universal**: el bloque CSS canónico (`.data-table-wrap` / `.data-table` / `td/th`) descrito arriba aplica a las 8 tablas del admin sin excepción. Ninguna tabla esconde columnas. El swipe lateral en el wrapper revela las cols que no caben.
  - **Tab Cursos** (8 cols: Título, Slug, Precio ARS, Precio USD, Estado, Ventas, Creado, Acciones) — todas visibles con scroll.
  - **Tab Alumnos** (6 cols: Nombre, Email, Rol, Cursos asignados, Registrado, Acciones) — todas visibles con scroll.
  - **Tab Coaches** (3 cols) — entran sin scroll en la mayoría de viewports.
  - **Tab Cupones** (7 cols) — todas visibles con scroll.
  - **Tab Gestión — Ventas** (6 cols: Fecha, Alumno, Curso, Monto, Moneda, Método) — todas visibles con scroll.
  - **Tab Gestión — Ventas por coach**, **Ad spend**, **Lanzamientos** — todas visibles con scroll.
- **Notif dropdown**: `.notif-dropdown` se reposiciona con `position: fixed !important; top: 70px !important; left: 8px !important; right: 8px !important; width: auto !important; max-width: none !important; z-index: 9999 !important`. Ancla el panel debajo del navbar con 8px de margen lateral → ocupa el ancho útil completo sin recortarse con emails largos.
- **Stats grid**: `.stats-grid { grid-template-columns: 1fr !important }` (1 columna en mobile).
- **Override del overflow de Etapa X.4**: `.data-table-wrap` tenía `overflow: hidden` para clippear el `border-radius`. El nuevo `overflow-x: auto` (sin `overflow-y`) reemplaza eso en mobile y el border-radius sigue funcionando porque las celdas no se desbordan vertical. El dropdown ⋮ no se ve afectado porque usa `position: fixed` desde X.4.

**`coach.html`**:
- **Navbar**: `.nav-right` con `gap: 8px; flex-wrap: nowrap; min-width: 0`. `.nav-email` truncado a `max-width: 120px` con elipsis y `flex-shrink: 1`. `.badge-role` y `.btn-logout` con `flex-shrink: 0` para no comprimirse. El botón "Cerrar sesión" (preexistente en `.nav-right` línea 839) se fuerza visible en mobile con `display: inline-flex !important` y padding/fontsize reducidos para que entre todo en la barra angosta.
- **Tabs**: mismo fix que admin (scroll horizontal con inercia, scrollbar oculta, tab-btn `flex-shrink: 0`).
- **Selectores mes/año (Tab Ganancias)**: `.gains-controls` cambia a `flex-direction: column; align-items: stretch; gap: 8px`. `.gains-select` y `.btn-gains-load` con `width: 100%` para ocupar todo el ancho.
- **Tabla ganancias**: `#tab-ganancias .card` con `overflow-x: auto` para scroll lateral del table dentro del card wrapper. Columna "Comisión" (nth-child 4) escondida con `display: none`.

Todos los bloques quedan al final del `<style>` de cada archivo, agrupados bajo el comentario `Etapa X.21 — Optimización mobile`. Ningún rule afecta desktop ni breakpoints más anchos.

---

## Patrones y convenciones críticas

### Helper HTML-escape
```js
escapeHtml(str)  // ← nombre correcto, definido al final de coach.html
// escHtml NO EXISTE — bug histórico ya corregido
```

### Storage bucket
`course-materials` (público) — usado para PDFs, imágenes de portada, certificados, imágenes de lanzamientos, avatares.
- PDFs materiales: `{courseId}/{timestamp}-{titulo}.pdf`
- Portadas cursos: `covers/{timestamp}-{random}.{ext}`
- Certificados: `certificados/{timestamp}-{random}.{ext}`
- Imágenes lanzamiento: `launches/{timestamp}-{random}.{ext}`
- Avatares de usuarios: `avatars/{userId}.{ext}` (upsert true → reemplaza la foto previa, Sesión 57)

### Routing de cursos
```js
const LEGACY_PAGES = {
  'webinar-hipertrofia':   'webinar-hipertrofia.html',
  'carrera-hibrida':       'carrera-hibrida.html',
  'entrenamiento-hibrido': 'entrenamiento-hibrido.html',
};
// Cursos nuevos → venta-curso.html?slug=X  /  curso.html?slug=X
```

### SEO — meta tags + Open Graph + Twitter + favicon (Sesión 47)
Todos los HTML del proyecto (13 archivos) tienen un bloque SEO uniforme insertado entre `<title>` y `<link rel="preconnect">`:
```html
<meta name="description" content="..." />
<meta name="robots" content="..." />
<link rel="canonical" href="https://hblab.com/{file}" />
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta property="og:image" content="https://hblab.com/og-cover.jpg" />  <!-- placeholder -->
<meta property="og:url" content="https://hblab.com/{file}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="..." />
<meta name="twitter:description" content="..." />
<meta name="twitter:image" content="https://hblab.com/og-cover.jpg" />
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🧬</text></svg>" />
```
**Robots por archivo**:
- `index, follow`: `index.html`, `webinar-hipertrofia.html`, `carrera-hibrida.html`, `entrenamiento-hibrido.html`, `venta-curso.html`
- `noindex`: `login.html`
- `noindex, nofollow`: `dashboard.html`, `admin.html`, `coach.html`, `curso.html`, `curso-webinar-hipertrofia.html`, `curso-carrera-hibrida.html`, `curso-entrenamiento-hibrido.html`, `checkout.html`, `checkout-success.html`, `checkout-pending.html`, `set-password.html`

**Títulos públicos** usan formato `Título | HB Lab` (pipe). Privados conservan formato `... — HB Lab` (em-dash).

**`venta-curso.html` dinámico**: el `document.title` se setea a `${course.title} | HB Lab` cuando carga el curso (línea ~766), y se sincronizan `meta[property="og:title"]` y `meta[name="twitter:title"]` con `setAttribute('content', pageTitle)`.

**Dominio**: `https://hblab.com` es placeholder hasta que haya un dominio real (todos los `canonical`/`og:url` apuntan ahí). Ídem `og:image`/`twitter:image` apuntan a `og-cover.jpg` placeholder. El favicon SVG inline con emoji 🧬 es temporal.

### perfil.html — Página de perfil del usuario (Sesión 57)
- Accesible para todos los roles (student/coach/admin). Protección: sin sesión → redirect a login.html.
- Navbar consistente con dashboard: logo + "← Volver" + nav-email + "Cerrar sesión".
- **Sección 1 — Foto de perfil**: avatar circular 120px. Si `avatar_url` → `<img class="avatar-big">` con cache-buster `?t={ts}`; si no → `<div class="avatar-initials-big">` con iniciales sobre fondo violeta. Botón "📷 Cambiar foto" → input file → `handleAvatarUpload(file)`: sube a `course-materials/avatars/{userId}.{ext}` con `upsert:true`, hace UPDATE de `profiles.avatar_url` y re-renderiza. Status inline (`#avatar-status`) lime/red.
- **Sección 2 — Datos personales**: form editable con `cf-prefix p-`: `p-fullname`, `p-email` (readonly), `p-birthdate` (date), `p-phone` (tel), `p-experience` (select: principiante/intermedio/avanzado), `p-goal` (select: hipertrofia/hibrido/rendimiento/salud), `p-bio` (textarea, visible para coaches). `saveProfile()` UPDATE en profiles → mensaje inline `#p-msg` (success green / error red).
- **Sección 3 — Mis cursos**: query `user_courses` join `courses(id, title, slug, certificate_url, total_videos, course_type, is_live, live_completed)` con `payment_status='paid' AND status='active'`. Cuenta `video_progress` completados por curso. Si `completed >= total_videos` (y total > 0) → badge `✅ Completado` + botón "📄 Descargar certificado" (si `certificate_url` existe). Si no → muestra `X / Y videos completados`. Botón "Ir al curso →" siempre. `generarCertificado(courseId, courseTitle, certUrl, btn)` espejo del de `curso.html` (jsPDF 2.5.1 CDN, A4 landscape, fullName en bolditalic 32pt, fecha 16pt, color `#2D1B6B`).
- Globals: `currentUser`, `currentProfile` (cache para no re-querear al renderizar).
- Reusa la paleta + Inter + estilos `.card`/`.form-input`/`.form-select`/`.form-textarea`/`.btn-primary` consistentes con admin/coach.

### Notificaciones in-app (Sesión 58)
**Stack**: tabla `public.notifications` + Supabase Realtime + módulo compartido `notifs.js`. RLS: usuario lee/actualiza solo lo propio; cualquier authenticated puede insertar (necesario para que coaches/admins notifiquen alumnos).

**Módulo `notifs.js`** (incluido vía `<script src="notifs.js">` en `dashboard.html`, `coach.html`, `admin.html`, `perfil.html`, después de `supabase.js`):
- API pública: `window.initNotifs(user)` — invocar después del auth con el `user` ya autenticado.
- Inyecta CSS (`.notif-bell-wrap`, `.notif-bell-btn`, `.notif-badge`, `.notif-dropdown`, `.notif-item`, `.notif-empty`, `.notif-mark-all`) y HTML (bell + dropdown) al primer `.nav-right` que encuentre.
- Carga últimas 10 notifs del usuario, renderiza dropdown (item con título, body truncado a 60 chars + `…`, fecha relativa "hace X min/h/días/ayer"), badge rojo con count de unread (oculto si 0).
- Subscribe `sb.channel('notifs-{userId}').on('postgres_changes', { event:'INSERT', table:'notifications', filter:'user_id=eq.{userId}' }, payload => …)` → unshift al cache, re-render, actualiza badge.
- Click en notif → UPDATE `read=true` → re-render → si tiene `link` navega vía `window.location.href`.
- Botón "Marcar todas como leídas" → bulk UPDATE `read=true` donde `read=false`.
- Click outside del wrap cierra el dropdown.

**Inyección automática en navbars**: el módulo busca `.nav-right` y se inserta como primer hijo (a la izquierda del email/avatar/badge). Si una página agrega/cambia su navbar, basta con que el contenedor tenga la clase `.nav-right` para que el bell se monte solo.

**Triggers automáticos al responder en el foro**:
- `coach.html` → `submitReply(parentId, courseId)`: tras INSERT exitoso en `forum_posts`, fire-and-forget query `forum_posts.user_id` + `courses.slug` → `INSERT notifications` con título `"💬 Nueva respuesta del coach"`, body `content.substring(0, 80)`, link `curso.html?slug={slug}`. Skip si el autor del post raíz es el mismo coach (evita auto-notificación).
- `admin.html` → `vcSubmitReply(parentId)`: misma lógica usando `_vcCourse.slug` directo (ya en memoria).

**Triggers automáticos al hacer una pregunta (Sesión 59-66)**:
- `curso.html`, `curso-webinar-hipertrofia.html`, `curso-carrera-hibrida.html`, `curso-entrenamiento-hibrido.html` → `submitPregunta()`: tras INSERT exitoso del post raíz en `forum_posts`, fire-and-forget llama a la **RPC `notify_coaches(p_course_id, p_title, p_body, p_link)` SECURITY DEFINER (Sesión 62)** que internamente resuelve los coaches del curso vía `coach_courses` y hace el INSERT batch en `notifications`. Reemplaza el bloque previo (Sesiones 59-61) que hacía SELECT `coach_courses` + filter + INSERT directo y se silenciaba bajo RLS. Título `"❓ Nueva pregunta en el foro"`, body `content.substring(0, 80)`, link **`coach.html?course={slug}#foro` (Sesión 66)** — apunta al panel del coach (no a `curso.html`, porque el coach no tiene `user_courses paid+active` y sería redirigido a coach.html de todos modos). curso.html usa `currentSlug` del query string; legacy files usan la const `COURSE_SLUG` hardcoded.
- **Scroll automático en curso.html al hash `#forum-section` (Sesión 63 + fix 64 + delay 65)**: en `loadForo()`, después de renderizar los hilos, si `window.location.hash === '#forum-section'` → `setTimeout(() => document.getElementById('forum-section')?.scrollIntoView({ behavior: 'smooth' }), 800)`. Sigue activo para deep-links genéricos a curso.html cuando el alumno tiene acceso. El delay 800ms es necesario porque sin él el scroll dispara antes de que el iframe del video termine de cargar y la altura del documento aún cambia.
- **Deep-link a coach.html con `?course=SLUG#foro` (Sesión 66-70)**: orden final del init dentro del IIFE:
  1. `await loadCoachCourses()` — pobla la global `coachCourses` con `[{id, title, slug}]`.
  2. Banner check si coach sin cursos.
  3. **Auto-select 1-curso (si `coachCourses.length === 1`)** → setea selector + `await loadCursoCompleto(coachCourses[0].id)`.
  4. **Deep-link `?course=SLUG`** → `URLSearchParams.get('course')`. Si matchea con un slug en `coachCourses` → setea `sel.value = target.id`, llama `await loadCursoCompleto(target.id)` (con try/catch), y dispara `setTimeout(() => scrollIntoView('#forum-section'), 1200)`.
  5. `initGananciasSelectors()` + `hideLoading()`.
  
  **Sesión 70 — reordenamiento**: el bloque de deep-link ahora corre DESPUÉS del auto-select 1-curso (antes estaba antes y usaba un flag `deepLinkLoaded` que escondía un orden incorrecto). En coach con 1 sólo curso + deep-link al mismo curso, `loadCursoCompleto` se llama dos veces (idempotente — la segunda llamada gana al setear el `seq` global). En coach con multi-curso, sólo el deep-link dispara la carga.
  
  **HTML**: se agregó `id="forum-section"` al wrapper de la sección foro en el skeleton de `loadCursoCompleto` (Sesión 66). El delay 1200ms da margen para que las 5 cargas paralelas del `Promise.all` (live, materiales, foro, progreso, módulos) terminen de renderizar antes del scroll.
  
  **Logs de debug** (Sesiones 67-69, conservados para diagnóstico): `[REDIRECT]` (param + slugs), `[URL COURSE]`, `[MATCH]`, `[SELECT ID]` (cascada inicial); `[REDIRECT] selector seteado, sel.value = X`, `[REDIRECT] llamando loadCursoCompleto(...)`, `[REDIRECT] loadCursoCompleto retornó OK` o `... throw:` (try/catch surface), `[REDIRECT] scroll fire, elemento = ...` (tracing intra-bloque). Confirmado que el ID del select es `mi-curso-sel`. Si el slug no matchea → `console.warn('[REDIRECT] slug no encontrado en coachCourses:', courseParam)` y sigue con el flujo normal.

**Variables de course_id y slug usadas en cada archivo de `submitPregunta`** (Sesión 61 — confirmadas por grep):

| Archivo | Variable course_id (UUID) | Origen | Slug |
|---|---|---|---|
| `curso.html` | `currentCourseId` | `currentCourseId = course.id` (línea 968 — del SELECT en init) | `currentSlug` (global) |
| `curso-webinar-hipertrofia.html` | `currentCourseId` | `currentCourseId = courseData.id` (línea 937) | const `COURSE_SLUG = 'webinar-hipertrofia'` |
| `curso-carrera-hibrida.html` | `courseId` | `courseId = courseData.id` (línea 939) | const `COURSE_SLUG = 'carrera-hibrida'` |
| `curso-entrenamiento-hibrido.html` | `currentCourseId` | `currentCourseId = course.id` (línea 1052) | const `COURSE_SLUG = 'entrenamiento-hibrido'` |

- **Sesión 62 — RPC `notify_coaches` resuelve el bug definitivamente**: la causa raíz era RLS de `notifications` que silenciaba los INSERTs aún con `.select()` y captura de errores. La RPC SECURITY DEFINER bypasea la RLS por completo y centraliza la lógica (resolución de `coach_courses` + INSERT batch) en un solo round-trip. El cliente solo captura `{ error }` del `sb.rpc('notify_coaches', {...})` y loguea con `console.error`/`console.log`. Se eliminó la query previa a `coach_courses` (la RPC la hace internamente).
- **Sesión 60 (legacy) — captura de errores explícita**: la primera versión hacía `await sb.from('notifications').insert(...)` sin destructurar `{ error }`. Resuelto en Sesión 62 al pasar a RPC.
- **Sesión 61 (legacy) — `[NOTIF DEBUG]` log de sondeo**: justo antes del bloque IIFE de notificaciones se imprime un objeto con `typeof` checks de las 4 variables potenciales (`courseId`, `currentSlug`, `slug`, `currentCourseId`) para identificar runtime cuál existe en scope. **Se conservó** porque sigue siendo útil para diagnosticar si la variable de courseId llega `null`/vacía a la RPC. El `typeof X !== 'undefined'` es el único patrón seguro para checkear sin throw `ReferenceError` cuando una variable no está declarada en el scope.

**Notificación manual desde admin.html (Tab Alumnos)**:
- Botón "📢 Enviar notificación" en `panel-header` de Alumnos → abre `#modal-manual-notif`.
- Selector destinatario (`#mn-target`): `all` / `course` / `user`. `onManualNotifTargetChange` muestra/oculta `#mn-course-wrap` o `#mn-user-wrap`. `_populateMNCoursesSelector` lee `allCourses` cache; `_populateMNUsersSelector` llama RPC `get_students_with_courses` (alumnos con cursos activos).
- `sendManualNotification()` resuelve la lista de `user_ids` según target (query `user_courses paid+active` filtrado por curso o todos), valida título+body, hace `INSERT` batch `notifications.insert(rows)` donde rows = `userIds.map(uid => ({user_id, title, body, link}))`. Mensaje inline `#mn-msg` (success/error) y auto-cierra a los 1.6s en éxito.

### Acceso a perfil.html desde otros archivos (Sesión 57)
- **dashboard.html**: link `Mi perfil` en `.nav-right` (junto al email).
- **admin.html**: link `Mi perfil` en `.nav-right` (junto al email + badge Admin).
- **coach.html**: link clicable `<a class="nav-avatar-link">` con mini-avatar circular 32px (`.avatar-nav`) que muestra `<img>` si hay `avatar_url` o iniciales sobre violeta. La query del init de coach.html ahora también selecciona `avatar_url`.
- **venta-curso.html**: la sección "Tus instructores" (`renderInstructores`) ya muestra `<img class="instructor-photo" src="${avatar_url}">` cuando hay avatar, fallback a `.instructor-initials` (Sesión 45 — sin cambios necesarios en Sesión 57).

### index.html — site_config dinámico (Sesión 54+55)
- `loadCursos()` ordena por `display_order ASC, created_at ASC` (SELECT incluye `display_order`).
- `loadSiteConfig()` lee `site_config` (todas las keys), parsea JSON de `global_announcement` y `countdown`, y:
  - **Anuncio global · marquee/rotación (Sesión 55)**: si `active && text` → muestra `#global-announcement` (barra fixed a `top:70px`, altura 36px, `overflow:hidden`) con clase `.color-{lime|violet|red}` y agrega `body.has-announcement`. El texto vive en `.ann-marquee > #global-announcement-text`. Si el texto contiene `|` → split en oraciones, modo rotación (`.ann-marquee.rotating`), fade in/out controlado por JS cada 3s vía `_annRotateTimer`. Sin `|` → modo scroll (`.ann-marquee.scrolling`) con CSS animation `ann-marquee-scroll` 22s linear infinite. Sin texto/inactivo → display:none + `clearInterval(_annRotateTimer)`.
  - **Countdown · diseño card + click (Sesión 55+56)**: si `active && target` → muestra `#countdown-wrap` (centrado horizontal `width:fit-content; margin:0 auto`, fondo `#243042`, borde `var(--lime) 1.5px`, label gris uppercase, números 2.1rem blancos `tabular-nums`, etiquetas DÍAS/HS/MIN/SEG en gris debajo). Tick con `setInterval(_, 1000)`. Si `cd.course_id` está set → fetch `id, slug, title, description, price_ars, price_usd, cover_url` y (a) agrega `.clickable` + `onclick = window.location.href = LEGACY_PAGES[slug] || venta-curso.html?slug=X` al wrap del countdown; (b) **renderiza una card del curso** vía `renderCountdownCourseCard(course, url)` dentro de `#countdown-course-wrap` (Sesión 56) usando el mismo HTML/CSS de `.course-card` (tag, title, desc, divider, price-block ARS/USD, btn-buy "Ver curso") + `.card-cover` con `background-image:url(cover_url)` y `aspect-ratio:16/9` arriba. Wrap centrado con `max-width:380px; margin:0 auto`. Card entera clickeable; el `<a class="btn-buy">` usa `event.stopPropagation` para no doble-disparar. Cuando el countdown se desactiva o `course_id` se quita → la card se oculta automáticamente (reset al inicio de `loadSiteConfig`). Cuando `diff<=0` oculta wrap del countdown y limpia timer. Globals: `_countdownTimer` para clear/restart, `_annRotateTimer` para rotación de anuncio.
- `loadSiteConfig()` se invoca desde el `Promise.all` del IIFE init junto con `loadLaunches`, `loadCursos`, `loadProximos`.

### index.html — buscador de cursos (Sesión 46)
- Sección `#cursos`: input `#courses-search-input` (con ícono 🔍, max-width 400px, centrado, fondo `var(--card-bg)`, borde `var(--card-border)`, focus borde `var(--lime)` + box-shadow lime suave) justo arriba de `#courses-grid`.
- Wrap `#courses-search-wrap` arranca con `display:none`; `loadCursos()` lo muestra solo si `data.length > 3`.
- Cada `.course-card` se renderiza con `data-title="${title.toLowerCase()}"` para matchear sin tocar DOM hijo.
- `filterCursos(rawQuery)` (oninput): trim + lowercase del query → itera cards → `card.style.display = match ? '' : 'none'`. Vacío → todas visibles.
- `#courses-empty-search` (oculto por default): se muestra cuando `query !== ''` y ningún card matchea.

### Certificados PDF (jsPDF 2.5.1 CDN)
- Nombre en cursiva: helvetica bolditalic, 32pt, color `#2D1B6B`, Y = 108mm, X = 148.5mm
- Fecha: helvetica normal, 16pt, color `#2D1B6B`, Y = 72mm, X = 148.5mm
- Formato A4 landscape (297×210mm)
- PNG base: `assets/certificados/cert-{slug}.png` (legacy) o `courses.certificate_url` (dinámico)

---

## coach.html — arquitectura actual (Sesión 28+)

### Estructura de tabs
```
📋 Mi curso  |  💰 Ganancias
```

### Tab "Mi curso"
- Selector único prominente `#mi-curso-sel` → `onCursoChange()` → `loadCursoCompleto(courseId)`
- Auto-selección si `coachCourses.length === 1`

### Globals de estado
```js
let currentCourseId = '';    // curso seleccionado actualmente
let _loadSeq        = 0;     // contador anti-stale (se incrementa en cada loadCursoCompleto)
// Foro en memoria:
let _foroPosts           = [];  // posts raíz, desc (más nuevo primero)
let _foroRepliesByParent = {};
let _foroCourseId        = '';
let _foroVisibleCount    = 5;
let _foroSearchQuery     = '';
```

### `loadCursoCompleto(courseId)`
Renderiza esqueleto HTML con 4 secciones y llama en paralelo:
```js
Promise.all([loadLiveSection(seq), loadMateriales(seq), loadForo(seq), loadProgreso(seq)])
```
IDs de inyección: `#live-content`, `#mat-form-wrap`, `#mat-content`, `#foro-content`, `#prog-content`

### Anti-stale render
Cada loader recibe `seq`. Después de cada `await` verifica:
```js
if (seq !== undefined && seq !== _loadSeq) return;
const wrapNow = document.getElementById('...');
if (!wrapNow) return;
```

### Progreso de alumnos (`loadProgreso(courseId, seq)`)
- Recibe `courseId` como **parámetro explícito** (NO desde `currentCourseId` global — fix Sesión 33). Es la única loader con esta firma; las demás (`loadForo`, `loadMateriales`, `loadLiveSection`) siguen leyendo `currentCourseId`.
- Usa `sb.rpc('get_course_progress', { p_course_id: courseId })` — si `courseId` fuera vacío, la RPC devuelve "unauthorized", por eso el guard temprano `if (!courseId) return;`
- Si `total > 0`: muestra `X / Y` + barra semáforo (lime ≥80%, amarillo ≥40%, rojo <40%)
- Si `total = 0` o null: muestra `N videos completados` + badge gris `.badge-no-total` "Total no configurado"
- Filas con total van primero (orden por pct desc); sin total al final

### Foro (`loadForo` + `renderForoSection`)
- `loadForo(seq)`: RPC `get_forum_posts` → augmenta `_email` para null-names → invierte array → guarda globals → llama `renderForoSection()`
- `renderForoSection()`: renderiza sin re-query; paginación 5+5 o búsqueda en memoria
- `onForoBuscar(value)`: actualiza `_foroSearchQuery`, resetea `_foroVisibleCount=5`, re-renderiza, restaura foco
- `foroVerMas()`: `_foroVisibleCount += 5`, re-renderiza

### Módulos del curso (`loadModulos` — Sesión 48)
- 5ª sección `#modulos-section` en el skeleton de `loadCursoCompleto`, agregada al `Promise.all`. Oculta por default; sólo se muestra si `course.course_type === 'modules'`.
- `loadModulos(seq)` hace un mini-SELECT a `courses.course_type` para decidir mostrar la sección. Si aplica, llama `loadCoachModulesForCourse(courseId)` (lee `course_modules` + `course_lessons` ordenados por `order_num`) y renderiza el manager.
- UI: tarjetas `.mod-card` con título + botón ×, `.mod-lessons-list` con `.mod-lesson-row` (título + URL + ×), botón "+ Agregar lección" por módulo, "+ Agregar módulo" global, mensaje inline `#mod-action-msg`, botón "Guardar módulos".
- Helpers: `addCoachModuleRow(modId, title, lessons)`, `addCoachLessonRow(listEl, lessonId, title, url)`, `getCoachModulesFromForm()` (normaliza URLs con `toYoutubeEmbed`).
- `saveCoachModules()`: mismo diff sync que admin (DELETE/UPDATE/INSERT preservando UUIDs); además actualiza `courses.total_videos` con la suma de lecciones para que `get_course_progress` devuelva el total correcto.
- CSS: `.mod-list`, `.mod-card`, `.mod-card-head`, `.mod-lessons-list`, `.mod-lesson-row`, `.mod-add-lesson-btn`. Reusa `.field-input`, `.btn-icon-rec`, `.btn-lime` del set existente.

### Materiales (`loadMateriales`)
- SELECT: `course_materials.select('id, title, description, drive_url').eq('course_id', ...).order('created_at')`
- Tipo: URL contiene `/storage/v1/object/public/course-materials/` → PDF `📄`; si no → link `🔗`
- INSERT usa `uploaded_by: currentUser.id`

### Clase en vivo (`loadLiveSection` + `finalizarClase` + lista dinámica de grabaciones)
- SELECT incluye `recording_url` (legacy) y `recordings` (JSONB array) además de `is_live, live_url, live_date, live_completed`
- **Estado `!is_live`** → mensaje "Este curso no es una clase en vivo"
- **Estado `is_live && !live_completed`** → tarjeta con `live_date` + `live_url` + botón "Finalizar clase" → `set_live_completed` RPC
- **Estado `is_live && live_completed`** → tarjeta con badge ✅ + **lista dinámica `#rec-list`** de filas `.rec-row` (input "Título de la clase" + input "URL de YouTube" + botón × eliminar) + botón "+ Agregar clase" + botón "Guardar grabaciones" (Sesión 40, reemplaza el campo único de Sesiones 34-39)
- **Pre-poblado de la lista**: prioridad a `course.recordings` (filtra ítems sin `title|url` y normaliza). Si está vacío y `course.recording_url` existe (legacy) → carga como `[{title:'Clase 1', url: recording_url}]`. Si todo vacío → 1 fila vacía como placeholder.
- Helpers: `addRecRow(title, url)` agrega fila al `#rec-list`; `renderRecRows(arr)` limpia y re-popula; el `×` por fila usa `this.closest('.rec-row').remove()` inline.
- `saveRecordings()`: itera filas en `#rec-list`, normaliza cada URL con `toYoutubeEmbed()` **in-place** en el input, descarta filas con `title` y `url` vacíos. Llama RPC `sb.rpc('set_recordings', { p_course_id: currentCourseId, p_recordings: JSON.stringify(recs) })` (SECURITY DEFINER). Mensaje verde inline `#rec-action-msg` ("✅ N grabaciones guardadas.") en éxito; rojo + `console.error` en error. **NO re-renderiza la sección completa** — el estado del usuario se preserva (patrón Sesión 36).
- `toYoutubeEmbed(url)`: regex `(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})` extrae el ID y devuelve `https://www.youtube.com/embed/{id}`; si no matchea, devuelve la URL original sin tocar (Sesión 35). **Definida en los 3 archivos del módulo de cursos** (coach.html, admin.html, curso.html — Sesión 51) y cubre los 3 formatos de YouTube: `watch?v=ID`, `youtu.be/ID`, `embed/ID` (idempotente).
  - **admin.html**: aplicada en `syncCourseModules` antes del INSERT/UPDATE en `course_lessons.video_url` (write-time normalization).
  - **coach.html**: aplicada en `saveRecordings` y `getCoachModulesFromForm` (write-time).
  - **curso.html**: aplicada al setear `iframe.src` en `renderModulesView` (read-time, defensivo por si la BD tiene URLs sin normalizar de antes).
- CSS: `.rec-list`, `.rec-row`, `.field-input`, `.btn-icon-rec`, `.btn-add-rec` (espejo del sistema de videos en admin.html).

---

## admin.html — puntos clave

### Estructura general (Sesión 52 redesign + Sesión 54)
- **Tabs activos**: `Cursos · Alumnos · Coaches · 🎟 Cupones · 🎨 Landing · 📊 Gestión`. El tab "🚀 Lanzamientos" fue reemplazado en Sesión 54 por "🎨 Landing" (centro de control visual de index.html); el CRUD de lanzamientos vive ahora dentro de la sección 3 de su acordeón. El tab "Certificados" se removió en Sesión 52 (PNG base se gestiona dentro del Paso 4 del wizard de cada curso). El tab "🎟 Cupones" se agregó en Etapa X.12 (CRUD sobre tabla `coupons`).
- **Tab Cursos**: barra de filtros arriba de la tabla (`#cursos-filter-text`, `#cursos-filter-coach`, `#cursos-filter-estado`) → función `filterCursos()` que filtra `allCourses` en memoria. Tabla con 8 columnas (Título, Slug, Precio ARS, Precio USD, Estado, **Ventas**, **Creado**, Acciones). Botones de acción reemplazados por dropdown `⋮` (`.action-menu-btn` + `.action-menu`) con items: 👁 Ver curso · ✏️ Editar · ✅/❌ Activar/Desactivar · 🗑 Eliminar. `toggleRowMenu` + `closeAllRowMenus` (click-outside listener registrado a nivel de documento).
- **`loadCursos()` ahora**: SELECT del curso + count de `user_courses(payment_status='paid')` agrupado por `course_id` + cache de `coach_courses` por curso → enriquece `allCourses[i]` con `_salesCount` y `_coachIds` → llama `filterCursos()` para renderizar. `refreshCursosFilterCoaches()` puebla el `<select>` de coaches del filtro vía RPC `get_coaches`.

### Tab Cursos — Wizard de 4 pasos (Sesión 52)
El form `#curso-form-card` se reorganizó en wizard. **Todos los IDs de inputs preexistentes se preservaron** — `saveCurso`, `editCurso`, `resetCursoForm` siguen leyendo los mismos campos. La estructura interna es:
- **Step 1 — Identidad**: `cf-title`, `cf-slug` (+ hint), `cf-tipo` (visual webinar/capacitación/masterclass), `cf-course-type` (videos/modules/live), `cf-price-ars`, `cf-price-usd`, `cf-desc`, cover (cf-cover-*), `cf-banner-text`, `cf-is-coming-soon`, `cf-is-active` (nuevo — antes solo se controlaba desde la tabla).
- **Step 2 — Contenido**: `cf-videos-section` (videos sueltos) o `cf-modules-section` (módulos+lecciones) según `cf-course-type`. Plus toggle `cf-is-live` con `cf-live-fields` (link Meet, fecha, recording legacy).
- **Step 3 — Página de venta**: `lp-list` (Learning points), `sy-list` (Syllabus), `cf-coaches-list` (nuevo — checkboxes de coaches con input de comisión por fila).
- **Step 4 — Certificado**: cf-cert-* (PNG base) + selector "Al completar el 100%" deshabilitado (única condición disponible por ahora).
- **Wizard nav**: pills clickables en el indicador (`.wiz-step-pill[data-step]`) + botones `← Anterior` / `Siguiente →` / `Guardar curso` (este último solo visible en step 4). Globals: `_wizCurrent`, `_wizTotal=4`. Funciones: `wizGoTo(n)`, `wizNext`, `wizPrev`. CSS: `.wiz-steps`, `.wiz-step-pill`, `.wiz-step.active` (display grid 1fr 1fr), `.wiz-nav`.

### Tab Cursos — Coaches asignados al curso (Sesión 52)
- `loadCoachesForForm(courseId)`: RPC `get_coaches()` para listar todos + `coach_courses` SELECT para cargar comisiones existentes del curso. Renderiza `.cf-coach-row` con checkbox + nombre + input comisión (default 30%). Si `courseId` es `null` (curso nuevo), todos sin marcar.
- `getCoachAssignmentsFromForm()`: lee solo las filas chequeadas → `[{coach_id, commission_pct}]`.
- `syncCoachAssignments(courseId)`: diff sync de `coach_courses` (DELETE las que ya no están + UPSERT con `onConflict: 'coach_id,course_id'` las marcadas). Llamado desde `saveCurso()` después del UPSERT del curso.
- `cf-is-active` ahora va al payload de `saveCurso` (antes hardcoded `true` en INSERT).

### Tab Cursos — `saveCurso()`
- `total_videos: videos.length` — SIEMPRE usa la longitud del array de videos del form (nunca hardcodea 0). En `course_type='modules'` se usa `lessons.length` total acumulado de todos los módulos.
- `getVideosFromForm()` retorna array siempre (nunca null)
- Campos extras: `cover_url`, `certificate_url`, `banner_text`, `learning_points JSONB`, `syllabus JSONB`
- Upload widgets: `_cfCoverUrl`, `_cfCertUrl` — exclusión mutua file/URL directa
- SELECT de `loadCursos()` incluye `recordings`, `live_completed`, `course_type` además del legacy `recording_url` (Sesiones 42, 48)
- Acciones por fila: `👁 Ver curso` (modal), `Editar`, `🗑 Eliminar` (Sesión 44), `Activar/Desactivar`. `deleteCurso(id)` busca el título en el cache `allCourses`, pide `confirm("¿Eliminar el curso '{title}'? ...")`, hace `sb.from('courses').delete().eq('id', id)`. En error → `showAlert('alert-cursos', ..., 'error')` (rojo, por default). En éxito → `showAlert(..., 'success')` + `loadCursos()`.

### Tab Cursos — Tipo de curso + Modules manager (Sesión 48)
- Selector `#cf-course-type` en el form con 3 opciones: `videos` (sueltos), `modules` (módulos+lecciones), `live` (clase en vivo). `toggleCourseTypeFields()` muestra/oculta `#cf-videos-section` vs `#cf-modules-section`.
- Para `course_type='modules'`: gestor jerárquico `#cf-modules-list` con tarjetas `.cf-module-card` (título + botón ×) que contienen `.cf-lessons-list` con `.cf-lesson-row` (título + URL YouTube + botón ×). Botones "+ Agregar módulo" y "+ Agregar lección".
- Helpers: `addModuleRow(modId, title, lessons)`, `addLessonRow(listEl, lessonId, title, url)`, `getModulesFromForm()` (preserva IDs vía `data-mod-id` / `data-lesson-id` para diff sync), `renderModuleRows(modules)`, `loadModulesForCourse(courseId)` (lee `course_modules` + `course_lessons` ordenados por `order_num`).
- **Diff sync** en `syncCourseModules(courseId, formModules)`: compara IDs en BD vs form → DELETE los que no están en form (CASCADE borra lecciones), UPDATE los existentes, INSERT los nuevos. **Preserva los UUIDs de lecciones** (clave: `video_progress.video_index` apunta a `lesson.id`, así que borrar+recrear borraría el progreso de los alumnos).
- **Manejo de errores explícito (Sesión 49)**: cada SELECT/INSERT/UPDATE/DELETE captura `error` con destructuring; helper interno `fail(label, err, extra)` hace `console.error(label, err, extra)` y `throw new Error(label + ': ' + err.message)`. El INSERT de módulos usa `.insert(payload).select().single()` para obtener el **UUID real** retornado por la BD; ese id se usa luego como `module_id` en el INSERT de lecciones. Si `.select()` no devuelve fila tras un INSERT exitoso (típico cuando RLS permite escribir pero bloquea leer), también lanza error con mensaje explícito ("¿RLS bloqueando SELECT?"). Los throws propagan al `catch` de `saveCurso` que muestra el mensaje en `#alert-cursos` (rojo) y loguea por consola.
- `editCurso(c)` pre-carga: `cf-course-type = c.course_type || (c.is_live ? 'live' : 'videos')` + si modules → `loadModulesForCourse(c.id).then(renderModuleRows)`.
- `saveCurso()`: si `course_type='modules'`, después del UPSERT del curso llama `syncCourseModules(savedCourseId, getModulesFromForm())` y guarda `total_videos` = suma de lecciones.

### Tab Cursos — Modal "👁 Ver curso" (Sesión 42)
- Botón "👁 Ver curso" en cada fila de la tabla → `vcOpen(courseId)` → modal fullscreen `#modal-ver-curso` (clase `.modal-fullscreen`, max-width 1100px, max-height 92vh).
- Lee el course de `allCourses` cache (no re-query) y abre 4 secciones en paralelo. Globals: `_vcCourse`, `_vcEditingMatId`, `_vcEditingMatUrl`.
- **Sección 1 — `🎥 Contenido del curso`** (`vcRenderVideos`): read-only.
  - `!is_live` → lista `course.videos` con título y link "Ver ↗"
  - `is_live && !live_completed` → tarjeta con `live_date` + link `live_url` "Unirse a la clase ↗"
  - `is_live && live_completed` → lista `course.recordings` (parsea string JSON si hace falta), fallback legacy `recording_url`. Si todo vacío → "La grabación aún no fue cargada."
- **Sección 2 — `📚 Materiales`** (CRUD completo): `vcLoadMateriales`, `vcSaveMaterial`, `vcEditMat`, `vcDeleteMat`. Form con tipo Link/PDF (`vcToggleMatTipo`), upload a Storage `course-materials` con path `{courseId}/{ts}-{slug}.pdf`. INSERT usa `uploaded_by: currentUser.id`. Columna real `drive_url`. Mensaje inline `#vc-mat-msg`.
- **Sección 3 — `💬 Foro`** (`vcLoadForo` + `vcRenderForo`): RPC `get_forum_posts(p_course_id)` + augmento de email para null-names. **Paginación 5+5 en memoria sin re-query (Sesión 43)** — `vcLoadForo` query y guarda en globals `_vcForoPosts`, `_vcForoRepliesByParent`, resetea `_vcForoVisibleCount = 5` y llama a `vcRenderForo`. `vcRenderForo` es render puro: muestra los primeros `_vcForoVisibleCount` posts raíz, botón "Ver más (N restantes)" si `remaining > 0` (`vcForoVerMas` suma 5), botón "Ver menos" si `_vcForoVisibleCount > 5` (`vcForoVerMenos` resetea a 5 + scrollIntoView del wrap). Posts raíz desc, replies expandidas inline, badge "Coach 🎓" si `role IN ('coach','admin')`. Form `<textarea>` + botón "Responder" por post → `INSERT forum_posts` con `parent_id`. Botón "🗑 Eliminar" en cada pregunta y respuesta — al volver a `vcLoadForo` la paginación se resetea a 5 (mismo comportamiento que coach.html). Sin emoji picker, sin upload de imágenes, sin edición inline (alcance acotado vs. coach.html).
- **Sección 4 — `📊 Progreso de alumnos`** (`vcLoadProgreso`): RPC `get_course_progress(p_course_id)`, tabla read-only con barra semáforo (lime ≥80% / amarillo ≥40% / rojo <40%) o badge `.vc-no-total` si `total = 0`. Misma lógica que coach.html.
- CSS prefijado `.vc-*` para no colisionar con clases existentes. Helper `escapeHtml(s)` agregado al script (admin.html sólo tenía `escapeAttr`).

### Tab Coaches
- Lista via `get_coaches()` (SECURITY DEFINER)
- Comisión editable por coach+curso con `guardarComision(coachId, courseId, btn)`
- Asignación multi-curso via checkboxes + upsert

### Tab Alumnos
- Tabla principal: `get_students_with_courses()` — identificador es `user_id` (NO `id`)
- Sección "Sin cursos": `get_students_without_courses()` — campos con prefijo `p_`: `p_id`, `p_full_name`, `p_email`, `p_created_at`

### Tab Landing (Sesión 54)
Centro de control visual de `index.html`. Layout `.landing-layout` 40fr/60fr (colapsa a 1 columna < 1100px):
- **Columna izquierda**: 4 secciones colapsables `.landing-acc` (toggle vía `toggleLandingAcc(idx)` que añade/quita `.open` para mostrar `.landing-acc-body` y rotar `.landing-acc-arrow` 180°). Todas inician colapsadas.
  1. **📢 Anuncio global**: toggle `#ann-active` + input `#ann-text` + selector de color (`.color-pick` lime/violet/red, helper `pickAnnColor`). `saveAnnouncementConfig` upsert en `site_config(key='global_announcement', value=JSON.stringify({active,text,color}))`.
  2. **⏱ Cuenta regresiva**: toggle `#cd-active` + datetime-local `#cd-target` + label `#cd-label` + **`<select id="cd-course">` con cursos activos (Sesión 55, opcional — si se elige, el contador en la landing se vuelve clickeable y redirige a la página de venta del curso)**. `saveCountdownConfig` upsert en `site_config(key='countdown', value=JSON.stringify({active,target,label,course_id}))` (target convertido a ISO).
  3. **🚀 Lanzamientos**: el CRUD existente (`loadLanzamientos`, `saveLanzamiento`, `editLanzamiento`, `deleteLanzamiento`, `toggleLanzamientoActivo`, helpers de imagen `handleLzImage` etc.) movido sin cambios. Todos los IDs preservados (`lz-title`, `lz-form-title`, `tbody-lanzamientos`, etc.).
  4. **🗂 Orden de cursos**: lista drag&drop nativo HTML5 (`draggable="true"` + ondragstart/over/leave/drop/end). Globals `_orderCourses` y `_orderDragId`. Cada `.order-card` tiene cover, título, tag (Live/Módulos/Videos) y número de orden. `saveCourseOrder` recorre el array final y hace `UPDATE courses SET display_order = i WHERE id = c.id` en loop.
- **Columna derecha**: `<iframe id="landing-preview" src="index.html">` con `pointer-events:none`. Wrap sticky a `top:92px`. Botón "🔄 Recargar" en el header del wrap + botón global "🔄 Actualizar vista previa" en el panel-header. `reloadLandingPreview()` usa **cache-buster `src='index.html?_t={ts}'` como método primario** (Sesión 56) — más confiable que `contentWindow.location.reload()` porque garantiza una request fresca al servidor y evita HTML/JS cacheado. Llamado automáticamente después de `saveAnnouncementConfig`, `saveCountdownConfig`, `saveCourseOrder`, `saveLanzamiento`, `toggleLanzamientoActivo` y `deleteLanzamiento` — al cambiar el `src`, la iframe re-corre `loadSiteConfig` y `loadCursos` contra Supabase reflejando los datos recién guardados.
- **Orquestador**: `loadLanding()` corre las 4 cargas en paralelo (`loadAnnouncementConfig`, `loadCountdownConfig`, `loadLanzamientos`, `loadCourseOrder`). Llamado desde `switchTab('landing')`. El alert `#alert-landing` muestra mensajes de éxito/error de las nuevas secciones; `#alert-lanzamientos` queda para el CRUD de lanzamientos.
- **CSS nuevo**: `.landing-layout`, `.landing-control`, `.landing-acc` (+ `.open`), `.landing-acc-head`, `.landing-acc-arrow`, `.landing-acc-body`, `.color-pick` (+ `.lime`/`.violet`/`.red`/`.active`), `.color-dot`, `.order-list`, `.order-card` (+ `.dragging`/`.drag-over`), `.order-handle`, `.order-cover`, `.order-meta`, `.order-title`, `.order-tag`, `.order-num`, `.landing-preview-wrap`, `.landing-preview-head`, `.landing-preview-iframe`.

### Tab Gestión
- Chart.js 4.4.3 CDN
- Inversión publicitaria: tabla `ad_spend` (ya migrado de localStorage)
- Resultado neto: `loadResultadoNeto()` — ingresos − comisiones − ad_spend, + **ROI publicitario (Etapa X.24)** como una línea nueva dentro del card `#resultado-neto-card`: `((ingresos − ad_spend) / ad_spend) × 100`. Render en `#rn-roi`: lime con prefix `+` si ≥ 0, rojo si < 0, gris `—` italic cuando `totalAdSpend === 0` (evita división por cero). Misma función `loadResultadoNeto` lo computa con los mismos totales que ya calcula.
- **KPIs del mes actual (Etapa X.24)**: bloque `.kpi-grid` con 4 cards al tope del Tab Gestión (justo arriba del `.stats-grid` histórico). Cards: 💰 Ingresos del mes (ARS), 📈 Delta vs mes anterior, 🎟 Ventas del mes, 🎯 Ticket promedio. Computados en `renderKPIs()` desde `_ventas` (sin query extra) filtrando por `enrolled_at` dentro del mes calendario actual y currency `ARS`. Bounds: `new Date(now.getFullYear(), now.getMonth(), 1)` → `..., now.getMonth() + 1, 1)`. El delta usa la clase `.kpi-delta.up` (lime `#4ade80`) / `.down` (rojo `#f87171`) / `.flat` (gris). Edge cases: si `prev === 0 && cur > 0` muestra `+Nuevo` en lime; si ambos `0` muestra `—`. Layout 4 cols desktop, 2 cols mobile (`@media (max-width: 600px)` con `grid-template-columns: repeat(2, 1fr) !important`).
- **Ranking de cursos (Etapa X.24)**: lista ordenada por ingresos totales ARS, debajo de la tabla de ventas y antes del resultado neto. Computada en `renderRankingCursos()` agrupando `_ventas` por `course_id` (filtrado a `currency === 'ARS'`), suma `amount_paid`, ordena desc. Render en `.ranking-list` con filas `.ranking-row` que contienen `.ranking-pos` (1./2./3.), `.ranking-title`, `.ranking-stat` ("N ventas") y `.ranking-amount` ($X). Primer puesto en lime (`.gold`), segundo en violet (`.silver`). Mensaje vacío "Aún no hay ventas registradas en ARS." si todo está vacío. Tanto `renderKPIs` como `renderRankingCursos` se invocan al final de `loadVentas()` después de poblar `_ventas`.
- **Separador de mes en la tabla de ventas (Etapa X.24)**: cuando la tabla está expandida (`_ventasExpanded === true`) y hay ventas de distintos meses, `renderVentas()` inserta una fila `<tr class="ventas-month-sep"><td colspan="6">── MAYO 2026 ──</td></tr>` cada vez que cambia el `YYYY-MM` de `enrolled_at`. Solo en modo expandido para no romper el preview de 5 filas. El comparador `lastMonth` se resetea en cada render. CSS: fondo violeta sutil, uppercase, letter-spacing 0.1em, bordes sutiles arriba y abajo del separador.
- **Ventas por coach (`loadCoachesVentas`)**: acordeón colapsable por coach (Sesión 53). Cada coach es una fila clicable (`cursor:pointer`, `user-select:none`) con nombre + badge de cantidad de cursos + flecha `▾` + ganancia total. Click en la fila → `toggleCoursesRow('ventas-row-${coachId}', arrowEl)` (helper genérico ya usado en Tab Coaches) abre/cierra la sub-fila `<tr class="coach-courses-row">` que contiene una `<table class="coach-courses-subtable">` con curso, ventas y ganancia. Por default todos colapsados (CSS `.coach-courses-row { display:none; }`). El helper rota la flecha ▾↔▴ vía `innerHTML.replace`. ID prefix `ventas-row-` para no colisionar con `courses-row-` de Tab Coaches.
- **Tabla de ventas detallada (Etapa X.15 + fix X.16.1)**: nueva sub-section `.sub-section` debajo de las stats-grid y arriba del resultado neto. Columnas `Fecha · Alumno (email) · Curso · Monto · Moneda · Método`. Cache en global `_ventas` + filtros in-memory por curso (UUID), mes (`YYYY-MM`), moneda (ARS/USD/todos). Selectores de curso y mes se autopueblan con valores únicos de los datos cargados; preservan la selección entre re-renders. Totales abajo de la tabla: `$X ARS` lime + `USD X` violeta + `N ventas`. Botón "📥 Exportar CSV" (`exportarVentasCSV()`) exporta los datos filtrados con BOM UTF-8 + headers en español + nombre `ventas-YYYY-MM-DD.csv`. Helper `_filteredVentas()` y `_renderVentasTotals(filtered)` separados para reuso entre render y export.
- **`loadVentas()` — RPC `get_ventas()` (Etapa X.26)**: el flujo previo de 3 queries (X.16.1 + X.25) topaba con que la RLS de `profiles` bloqueaba la lectura cruzada del email aunque el admin esté loggeado — solo veía su propio email, no el del alumno. La RPC `get_ventas` SECURITY DEFINER joinea `user_courses + profiles + courses` del lado servidor, bypassea la RLS de profiles, y retorna directamente: `enrolled_at, full_name, email, course_title, amount_paid, currency, payment_method, payment_status, status`. El cliente solo hace:
  ```js
  const { data, error } = await sb.rpc('get_ventas');
  // sb.rpc() NO acepta .eq()/.order() encadenados — filtramos client-side
  const rows = (data || []).filter(r => r.payment_status === 'paid');
  rows.sort((a, b) => new Date(b.enrolled_at) - new Date(a.enrolled_at));
  ```
  Luego mapea al shape interno de `_ventas` preservando el campo `email` con la cascada `r.email || r.full_name || '(sin datos)'` (compatibilidad con la columna "Alumno" del render, el CSV exporter, los KPIs del mes y el ranking de cursos). **`course_id` queda `null`** en el shape porque el RPC no lo retorna — el filtro de curso del Tab Gestión y la agrupación del ranking ahora comparan/agrupan por **`course_title`**:
  - `<select id="ventas-filter-curso">` populate con `value="${course_title}"` (era `value="${course_id}"`).
  - `_filteredVentas()` ahora hace `v.course_title !== _ventasFilterCurso`.
  - `renderRankingCursos()` agrupa con `key = v.course_title || '(sin título)'`.
  - `_ventasFilterCurso` global pasa a guardar string (título) en lugar de UUID.

  **Histórico (no usar)** — los patrones X.16.1 (3 queries con `profiles.in('id', userIds)`) y X.25 (extender con `full_name`) quedaron obsoletos al introducir la RPC. Tampoco usar `select('*, profiles(email))` con embed: PostgREST no detecta el FK porque `user_courses.user_id → auth.users(id)`, no `profiles(id)` — sigue retornando `"Could not find a relationship..."` independiente del trigger nuevo de X.19.
- **Tabla colapsable — preview de 5 ventas (Etapa X.16.2)**: por default muestra solo las últimas 5 filas (`VENTAS_PREVIEW = 5`). Botón `#btn-ventas-toggle` debajo de la tabla con texto dinámico: `"Ver todas las ventas → (N)"` cuando está colapsado, `"Ver menos ↑"` cuando está expandido. Estado en global `_ventasExpanded`. El toggle es 100% client-side: `_ventas` ya tiene todos los datos, `renderVentas()` hace `filtered.slice(0, VENTAS_PREVIEW)` si no está expandido. Helper `_renderVentasToggle(totalCount)` decide si mostrar el wrap (solo si `totalCount > VENTAS_PREVIEW`). Click en "Ver menos" hace `scrollIntoView` al header de la sub-section para no dejar al admin perdido en el medio del scroll. Los filtros (curso/mes/moneda) y los totales debajo de la tabla siguen contemplando TODAS las filas filtradas, no solo las visibles — los totales muestran el agregado correcto.

---

## Flujo de checkout (Etapa X.12)

```
venta-curso.html
  └── botón "Comprar ahora" → openCurrencyModal()
       └── modal #modal-currency con 2 botones (ARS / USD)
            └── click → goToCheckout(currency) → checkout.html?slug=X&currency=Y

checkout.html (público, sin auth)
  ├── lee ?slug= y ?currency= de la URL
  ├── carga course de Supabase (anon key — courses.is_active=true)
  ├── render: form 60% + summary card 40% (sticky en desktop, arriba en mobile)
  ├── form: nombre, apellido, email, confirmar email, cupón opcional, terms
  ├── validateCoupon() → SELECT coupons WHERE code = X AND is_active = true
  │     ├── chequea valid_until, max_uses vs uses_count, course_id null|=currentCourseId
  │     └── calcula precio final: discount_pct → base*(1-pct/100); discount_fixed → base-fixed (cap 0)
  │         (discount_fixed solo aplica a ARS — el front bloquea si currency=USD)
  └── goToPayment() → guarda en sessionStorage 'checkout_payload' { ... } y:
       ARS  → fetch POST a Edge Function `create-preference` (Etapa X.13)
              → recibe { init_point } → window.location.href = init_point
              → MP hostea el checkout y al terminar redirige a back_urls.success/failure/pending
              → MP también envía webhook a `process-payment` con el resultado del pago
       USD  → placeholder (#paypal-pending) — pendiente integración PayPal
```

**Etapa X.31 — Verificación HMAC-SHA256 real del webhook de Mercado Pago:**

Hasta ahora el branch MP de `verifySignature()` retornaba siempre `{ ok: false, reason: 'no implementada' }` y el handler dependía de `PAYMENTS_ALLOW_UNVERIFIED=1` (bypass) para que el flujo funcionara en producción. Esto significaba que **cualquier persona en internet podía POSTear un payload falso a `/functions/v1/process-payment` y disparar el flujo de "pago aprobado"** — el secret crítico estaba sin validar.

**Fix**: implementación real del HMAC-SHA256 de MP según [docs](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks).

**Flujo** (en `verifySignature` cuando `isMP === true`):
1. Lee `MP_WEBHOOK_SECRET` del env. Si falta → 401 con motivo.
2. Lee headers `x-signature` y `x-request-id`. Ambos obligatorios.
3. Parsea `x-signature` (formato `ts=<unix>,v1=<hex>` — orden de campos puede variar, MP a veces los manda al revés). Split por coma → split por `=` → extrae `ts` y `v1`.
4. Parsea `rawBody` a JSON, extrae `data.id` (el payment_id que MP manda en el webhook).
5. Construye el **manifest** canónico exacto que MP usa: `` `id:${dataId};request-id:${xRequestId};ts:${ts};` `` — con el punto-y-coma final (importante, MP lo incluye).
6. HMAC-SHA256 vía Web Crypto API: `crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' })` → `crypto.subtle.sign('HMAC', key, manifest)`.
7. Convierte el `ArrayBuffer` a hex lowercase (`Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')`).
8. Compara contra el `v1` del header (lowercase en ambos extremos, defensivo). Match → `{ ok: true, provider: 'mercadopago' }`. Mismatch → log con `console.warn` (manifest_len, dataId, ts, expected_v1, got_hex para debugging) + `{ ok: false, reason: 'firma MP inválida' }`.

**Casos de error específicos** (cada uno con su `reason` para debugging en el log de la Edge Function):
- `'MP_WEBHOOK_SECRET no configurado'` — secret faltante.
- `'header x-signature ausente'` / `'header x-request-id ausente'` — headers críticos.
- `'x-signature mal formado (faltan ts o v1)'` — parseo falló.
- `'body no es JSON válido'` — rawBody no parseable.
- `'data.id ausente en el payload'` — webhook secundario sin payment_id (no debería verificarse igual, pero defensivo).
- `'firma MP inválida'` — el hex calculado no matchea el v1 del header (caso crítico — alguien intenta forjar).
- `'HMAC exception: ...'` — error de la Web Crypto API.

**Por qué Web Crypto API y no `node:crypto`**: las Edge Functions de Supabase corren en Deno Deploy. `node:crypto` está disponible vía polyfill pero `crypto.subtle.*` es la API nativa y zero-overhead. La firma HMAC-SHA256 de un manifest de ~80 chars toma sub-milisegundo.

**`PAYMENTS_ALLOW_UNVERIFIED=1` se mantiene como bypass** para sandbox/dev local. Verificado: el flag se chequea ANTES del branch isMP, así que con el flag activo la verificación se saltea para ambos proveedores (PayPal y MP). En producción **debe estar apagado** — la única razón legítima de tenerlo activo en prod sería un incidente donde la firma falla por un cambio del lado de MP y necesitamos urgentemente procesar pagos mientras se investiga (escenario raro).

**Comentario del header del archivo** actualizado para reflejar que MP ya está implementado (eliminado el "TODO", reemplazado por descripción de la fórmula del manifest).

**Re-deploy manual requerido** en Supabase Dashboard → Edge Functions → process-payment → Code → pegar el archivo actualizado → Deploy updates. El secret `MP_WEBHOOK_SECRET` ya está cargado (confirmado por el usuario). Verificar tras el primer pago real que el log NO emite `'MP signature mismatch'` — si lo emite, revisar la consistencia del manifest (puede haber diferencias subtiles en cómo MP construye el string, e.g. con/sin `;` final, escapes, etc.).

---

**Etapa X.30 — Validación server-side del monto en `create-preference` y `create-paypal-order`:**

Hueco de seguridad cubierto en esta etapa: el `amount` (precio final post-cupón) viajaba desde el cliente en el body del fetch a las dos Edge Functions que arman la order de pago. Un atacante con DevTools podía interceptar el fetch, cambiar `amount` a $1, y comprar el curso a precio simbólico — el front confiaba en sí mismo. El webhook `process-payment` después lo registraba como pago aprobado porque MP/PayPal cobraban lo que decía la preference/order. **Fix**: ambas funciones reconstruyen el precio del lado servidor desde `courses.price_ars` / `courses.price_usd` y validan que el `amount` del body coincida.

**Lógica compartida** (espejo de `validateCoupon()` en `checkout.html`):
1. SELECT del curso (`courses.is_active=true`) con service role para tener `basePrice` (price_ars o price_usd según endpoint). Si falta o es 0 → 500.
2. Si el body trae `coupon_code`: SELECT en `coupons` con `is_active=true`. Valida en cascada: existe, no vencido (`valid_until`), no agotado (`max_uses` vs `uses_count`), `course_id` matchea (o es null = todos). Si alguno falla → 400 con mensaje específico.
3. Aplica descuento: `discount_pct` → `basePrice * (1 - pct/100)`; `discount_fixed` → `basePrice - fixed` (cap 0).
4. Redondea a 2 decimales: `Math.round(price * 100) / 100`.
5. Compara `amount` del cliente contra `expectedPrice` con tolerancia:
   - **`create-preference` (ARS)**: tolerancia `±1 ARS` (redondeos del front en pesos enteros).
   - **`create-paypal-order` (USD)**: tolerancia `±0.01 USD` (precio USD se redondea a 2 decimales sí o sí).
6. Si no matchea → `errOut('Monto inválido.', 400)`. Si matchea → usa **`expectedPrice` server-side** en el payload (NO el `amount` del cliente — defensa en profundidad).

**Diferencias entre los dos endpoints**:
- `create-preference` resuelve el curso por `slug` (ya lo hacía); `create-paypal-order` lo resuelve por `course_id` (UUID, ya lo recibía del front).
- `create-paypal-order` necesitó **agregar** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (auto-inyectados) + `import { createClient }`. `create-preference` ya los tenía desde X.13.
- `discount_fixed` se considera **ARS-only**. En `create-paypal-order`, si el cupón es de tipo `discount_fixed`, retorna 400 con `"Este cupón solo aplica a pagos en ARS."` (consistente con el front, que en validateCoupon ya bloqueaba esa combinación).

**Tipo del body** ahora incluye `coupon_code?: string | null` en `create-paypal-order` (ya estaba en `create-preference`).

**Por qué la tolerancia y no `===` estricto**: el front redondea con `Math.round(price * 100) / 100`, pero JS tiene bugs de punto flotante conocidos (e.g. `0.1 + 0.2 !== 0.3`). En ARS los precios son enteros, así que `±1` cubre cualquier redondeo razonable; en USD `±0.01` permite la diferencia de 1 centavo si hubiera alguna sutileza de floating point. Cero impacto en el caso legítimo (el front siempre redondea), bloquea cualquier delta significativa.

**`process-payment` sin cambios**: la verificación final del monto cobrado real ya la hace MP/PayPal contra la preference/order. Si en el futuro queremos doble-verificación (comparar `payment.transaction_amount` con `courses.price_*` server-side), se agregaría ahí. Por ahora basta con bloquear la creación de la preference/order con monto adulterado.

**Re-deploy manual requerido de las DOS funciones** en Supabase Dashboard → Edge Functions → cada función → Code → pegar el archivo actualizado → Deploy updates. No requiere secrets nuevos.

---

**Etapa X.29 — Botones PayPal SDK en checkout.html + Edge Function `create-paypal-order`:**

Cierra el flujo USD end-to-end. Hasta X.28 el backend (`process-payment`) ya manejaba el webhook `PAYMENT.CAPTURE.COMPLETED` real de PayPal, pero el frontend seguía cayendo al placeholder `#paypal-pending`. Esta etapa monta los **PayPal Buttons** oficiales en `checkout.html` y agrega la Edge Function que crea la order del lado servidor.

**Por qué dos lados (frontend + server)**: el `PAYPAL_CLIENT_SECRET` no puede vivir en el cliente. Por eso la **creación** de la order (que requiere OAuth con el secret) se hace en `create-paypal-order` Edge Function. La **captura** post-aprobación sí se puede hacer client-side vía `actions.order.capture()` del SDK — usa la sesión autenticada del comprador (popup PayPal), no el secret de la app.

**Frontend (`checkout.html`)**:
- SDK en `<head>`: `<script src="https://www.paypal.com/sdk/js?client-id=AcRIf9eRcMlbnVK6xVxYDjtBeLcQC43bnEx_Z82v42Aq1wV2U2SRGK9-KaQI8hMEXgwUQebOWBC0nA53&currency=USD&intent=capture" defer></script>`. El client-id es **público** (a diferencia del secret) — se puede leer del Dashboard PayPal Developer → My Apps.
- HTML nuevo bajo el `btn-continue`: `<div id="paypal-button-container" style="display:none; margin-top:14px;"></div>` + `<div id="paypal-error">` para errores inline en rojo.
- `goToPayment()` rama USD reemplaza el placeholder por: oculta `btn-continue`, limpia `#redirect-msg`, llama `mountPayPalButtons({ nombre, apellido, email })`.
- `mountPayPalButtons` (guard global `_paypalMounted` evita doble render):
  - **`createOrder`**: `fetch POST https://bqkajhxfdybmuilvzchm.supabase.co/functions/v1/create-paypal-order` con body `{ course_id: _course.id, amount: _finalPrice, nombre, apellido, email }`. Espera `{ ok: true, order_id }`. Retorna el `order_id` al SDK.
  - **`onApprove(data, actions)`**: `await actions.order.capture()` (lado cliente — usa la sesión del popup PayPal). Luego redirige a `checkout-success.html`. **No espera al webhook**: el webhook `PAYMENT.CAPTURE.COMPLETED` corre en paralelo del lado servidor y registra el `user_courses` + manda emails (X.27/X.28). El alumno ya ve la pantalla de éxito mientras eso ocurre.
  - **`onError(err)`**: `showPayPalError(...)`, restaura `btn-continue` para reintentar, loguea por consola.
  - **`onCancel(data)`**: silencioso — solo restaura `btn-continue`. El alumno cerró el popup, no es error.
- Helpers: `showPayPalError(msg)` (muestra `#paypal-error` rojo), `clearPayPalError()` (oculta).

**Diseño dual-track**: el redirect a `checkout-success.html` da feedback **inmediato** al alumno; el webhook PayPal → `process-payment` registra el acceso server-side de forma **idempotente** (UPSERT `user_courses` con `onConflict`). Si el webhook tarda unos segundos, el alumno ya está en la pantalla de éxito; cuando entre al dashboard el curso aparece. Si el webhook fallara, el admin puede asignar manualmente — el cobro en PayPal igual quedó hecho.

**Edge Function `create-paypal-order/index.ts`** (~180 líneas, ver `supabase/functions/create-paypal-order/index.ts`):
- `verify_jwt = false` — la página de checkout es pública.
- POST `{ course_id, amount, nombre, apellido, email }`. Valida `course_id`, `email`, `amount > 0`, `amount < 999999`.
- OAuth via `getPayPalAccessToken()` (espejo del de process-payment): `Basic ${btoa(client_id:secret)}` contra `/v1/oauth2/token`.
- Body de la order: `intent: 'CAPTURE'`, `purchase_units[0]: { amount: { currency_code: 'USD', value: amount.toFixed(2) }, custom_id: course_id, description: 'Acceso al curso en HB Lab' }`. **`custom_id` es crítico** — `process-payment` lo lee al recibir el webhook para resolver qué curso comprar.
- `application_context`: `brand_name: 'HB Lab'`, `user_action: 'PAY_NOW'`, `shipping_preference: 'NO_SHIPPING'`.
- `payer.name` y `payer.email_address` opcionales — pre-poblan el popup PayPal pero el comprador puede usar otra cuenta.
- POST a `/v2/checkout/orders` con `Bearer ${token}`. Retorna `{ ok: true, order_id, status: 'CREATED' }`.

**Configuración `supabase/config.toml`**: agregado `[functions.create-paypal-order] verify_jwt = false`.

**Pre-requisitos antes del primer pago real**:
1. Secrets en Supabase → Edge Functions → Manage Secrets: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV` opcional (default `live`).
2. Deploy manual de `create-paypal-order` via Dashboard → Edge Functions → New function → "Via Editor" → pegar `supabase/functions/create-paypal-order/index.ts` → Deploy.
3. Webhook configurado en PayPal Developer Dashboard → Webhooks apuntando a `https://bqkajhxfdybmuilvzchm.supabase.co/functions/v1/process-payment` con eventos `CHECKOUT.ORDER.APPROVED` y `PAYMENT.CAPTURE.COMPLETED`.
4. `process-payment` ya desplegado con el branch PayPal de X.28.

---

**Etapa X.28 — Integración PayPal real (reemplaza placeholder):**

Hasta esta etapa el branch PayPal de `process-payment` parseaba el payload del webhook directamente y la verificación de firma siempre fallaba con `PAYMENTS_ALLOW_UNVERIFIED=1` como bypass para dev. Ahora la integración usa la API real de PayPal igual que el branch MP.

**Helper nuevo: `getPayPalAccessToken()`** — al tope del archivo (sección OAuth helpers):
- Lee secrets `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` de `Deno.env`.
- Calcula `Basic ${btoa(client_id:secret)}` y hace `POST /v1/oauth2/token` con `grant_type=client_credentials`.
- Retorna `{ token, error? }`. Stateless por request (las Edge Functions escalan horizontalmente, no compartirían cache).
- Detecta entorno con `Deno.env.get('PAYPAL_ENV')`: `'sandbox'` → `https://api-m.sandbox.paypal.com`, default `'live'` → `https://api-m.paypal.com`. La constante `PAYPAL_API_BASE` se exporta a las dos funciones que la usan.

**`verifySignature` para PayPal**: rama nueva si el request trae el header `paypal-transmission-sig`:
1. Lee `PAYPAL_WEBHOOK_ID` del env. Si falta → 401 con motivo.
2. Llama `getPayPalAccessToken()`. Si falla → 401 con motivo.
3. Parsea `rawBody` a JSON (el `webhook_event` del verify endpoint espera el payload como objeto, no string).
4. POST a `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature` con `Authorization: Bearer ${token}` y body `{ auth_algo, cert_url, transmission_id, transmission_sig, transmission_time, webhook_id, webhook_event }` (los primeros 5 leídos del request original con `req.headers.get('paypal-...')`).
5. Si la response trae `verification_status === 'SUCCESS'` → `{ ok: true, provider: 'paypal' }`. Si no → reason con el status recibido.
6. Cualquier excepción (red, parse) → `ok: false` con detalle en `reason`.

**Branch PayPal en el handler (paso 2b)**:
1. `orderId` se resuelve de `payload.resource.supplementary_data.related_ids.order_id` (eventos `PAYMENT.CAPTURE.*` lo traen ahí) con fallback a `payload.resource.id` (eventos `CHECKOUT.ORDER.*`). Si ninguno está → 200 con `skipped: true`.
2. `getPayPalAccessToken()` otra vez (la verificación y la consulta del order son llamadas independientes; reusar el token entre ellas requeriría passing through varios layers — más simple un fetch extra).
3. `GET ${PAYPAL_API_BASE}/v2/checkout/orders/{orderId}` con `Authorization: Bearer ${token}`. Si falla → 502.
4. **Skip si no está aprobado**: el order se considera aprobado si:
   - `order.status === 'COMPLETED'`, **O**
   - `order.intent === 'CAPTURE'` Y algún `purchase_units[].payments.captures[].status === 'COMPLETED'`.
   - Cualquier otro estado → 200 con `skipped: true, reason: 'status=...'` para que PayPal no reintente.
5. Extracción inline (sin pasar por `normalizePayPal`, que fue eliminada):
   - `email = order.payer.email_address`.toLowerCase().
   - `course_id = order.purchase_units[0].custom_id` — debe ser el UUID del curso, seteado por `create-paypal-order` al crear la order.
   - `amount = order.purchase_units[0].amount.value` (number).
   - `currency = order.purchase_units[0].amount.currency_code` (default `USD`).
   - `nombre = order.payer.name.given_name`, `apellido = order.payer.name.surname` — para que `process-payment` los pase como `data.full_name` al `createUser` si el alumno es nuevo (mismo flujo que MP).
   - `external_ref = order.id`.
6. Si falta `email` o `course_id` → 400 con detalle.
7. El resto del flujo (paso 3 cliente service role, paso 4 lookup profiles, paso 5 UPSERT user_courses, paso 5.5 email de confirmación, paso 6 magic link welcome email) **es idéntico al de MP** — el `payment_method: 'paypal'` se diferencia solo en el campo del UPSERT.

**Eliminada**: la función `normalizePayPal(payload)` standalone que parseaba el webhook crudo. Reemplazada por el flujo inline arriba. Ahora ningún proveedor tiene parser standalone — todo vive en el handler (MP en paso 2a, PayPal en paso 2b).

**Secrets requeridos en Supabase → Edge Functions → Manage Secrets** (los 3 primeros confirmados como ya configurados por el usuario):
- `PAYPAL_CLIENT_ID` — Client ID de la app PayPal Business.
- `PAYPAL_CLIENT_SECRET` — Secret correspondiente.
- `PAYPAL_WEBHOOK_ID` — ID del webhook configurado en PayPal Developer Dashboard → Webhooks. Debe apuntar a `https://bqkajhxfdybmuilvzchm.supabase.co/functions/v1/process-payment` y suscribirse a `CHECKOUT.ORDER.APPROVED` y `PAYMENT.CAPTURE.COMPLETED`.
- `PAYPAL_ENV` (opcional) — `'sandbox'` para testing, default `'live'` para producción. Si se omite → live.

**Pendiente del lado frontend** (no cubierto en esta etapa, queda para sesión siguiente): `create-paypal-order` Edge Function que el frontend (`checkout.html` rama USD) llama para crear la order vía `POST /v2/checkout/orders` antes de redirigir al `approval_url`. Hoy `checkout.html` aún redirige a `#paypal-pending` para el flujo USD. El branch del webhook `process-payment` está listo y esperando — apenas exista la order real, el flujo se cierra completo.

**Re-deploy manual requerido** en Supabase Dashboard → Edge Functions → process-payment → Code → pegar el archivo actualizado (885 líneas) → Deploy updates. Verificar que los 3 secrets estén configurados en Manage Secrets antes del primer pago de prueba (idealmente con `PAYPAL_ENV=sandbox` primero).

**Etapa X.27 — Email de CONFIRMACIÓN para alumnos existentes:**

Problema previo: cuando un alumno con cuenta ya creada compraba un curso adicional, el flujo X.20 lo manejaba bien técnicamente (no le pedía contraseña ni le mandaba magic link), pero **no recibía ningún email de aviso**. El curso aparecía mágicamente en su dashboard la próxima vez que entrara, sin notificación previa. UX poco clara — si tarda en entrar al dashboard, no se entera que el pago se procesó.

**Solución**: nueva función `sendConfirmationEmail({ email, fullName, courseTitle })` que se dispara cuando se detecta el caso "usuario existente compró otro curso". Sin magic link, sin contraseña visible — solo un aviso con CTA al dashboard.

**Disparador**: en `process-payment`, en el **paso 5.5** (entre el UPSERT exitoso y el bloque del welcome email), condicional `if (inviteSkippedReason && !tempPassword)`. Las dos condiciones a la vez identifican exactamente al caso "usuario existente":
- `inviteSkippedReason` está set → el lookup primario en `profiles.email` (paso 4.a) encontró al usuario, o el `createUser` retornó "already exists".
- `!tempPassword` → no se creó cuenta nueva en este request (si fuera nuevo, `tempPassword` estaría set y el welcome email del paso 6 cubriría el aviso).

**Contenido del email**:
- **Subject**: `✅ Nuevo curso activado — {courseTitle}`.
- **From**: `HB Lab <noreply@hblabarg.com>` (mismo que welcome email).
- **Body** (HTML inline-styled, mismo estilo dark que welcome email):
  - Header: "✅ Nuevo curso activado en HB Lab".
  - Saludo: "Hola {fullName || 'alumna/o'}, tu acceso al curso **{courseTitle}** ya está activo. Entrá a tu dashboard para empezar."
  - **CTA principal**: botón lime "Ir al dashboard →" linkeando a `https://hblabarg.com/dashboard.html`.
  - Fallback con el URL en texto plano por si el botón no renderea.
  - Recordatorio: "Ingresá con tu email {email} y la contraseña que ya configuraste."
  - Footer común: "Si tenés alguna pregunta, respondé este email o escribinos a ekapradacoach@gmail.com".

**Resolución del `fullName`**: prioriza los datos del extRef del pago (`nombre + apellido`), y si están vacíos hace lookup en `profiles.full_name` por el `userId` ya resuelto. Si tampoco hay nada → el template usa "alumna/o" como placeholder.

**Resolución del `courseTitle`**: SELECT `courses.title.eq('id', course_id).maybeSingle()` (mismo patrón que el welcome email del paso 6.b).

**Response shape extendido** — `confirmation_email` agregado al objeto de respuesta:
- `'sent'` — Resend aceptó el envío.
- `'failed: ...'` — Resend retornó error (rate limit, dominio no verificado, etc.). Logueado en console.warn.
- `'not_needed'` — el caso no aplica (era usuario nuevo y el welcome_email del paso 6 cubre el aviso).

Si Resend falla, **NO aborta el handler** — el acceso al curso ya quedó registrado en `user_courses` (paso 5). El admin puede reenviar manualmente desde el panel.

**Re-deploy manual requerido** en Supabase Dashboard → Edge Functions → process-payment → Code → pegar el archivo actualizado (734 líneas) → Deploy updates. **No requiere secrets nuevos** — usa el mismo `RESEND_API_KEY` que el welcome email.

**Etapa X.20 — Magic link en el email (reemplaza contraseña temporal visible):**

Problema en X.19: el email incluía la contraseña temporal en texto plano dentro del cuerpo. Riesgo de seguridad obvio (cualquiera con acceso al inbox del alumno la lee), y UX subóptima (el alumno tenía que copiarla y pegarla en login.html). Además dejaba la temp password viviendo en BD por siempre hasta que el alumno la cambiara manualmente.

**Solución**: usar magic link de Supabase Auth. La contraseña temporal sigue generándose **a nivel BD** (necesaria como argumento de `createUser` — Supabase Auth requiere password no-null al crear), pero **NO aparece en el email** ni el alumno la necesita conocer.

**Flujo nuevo**:

1. `auth.admin.createUser({ email, email_confirm: true, password: tempPassword })` igual que antes (X.19).
2. **`auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: 'https://hblabarg.com/set-password.html' } })`** — devuelve `data.properties.action_link`, una URL larga con un token de auth de Supabase. Ese link expira en 1h por default.
3. El email pasa a `sendWelcomeEmail({ ..., magicLink })` (firma cambiada: el param `tempPassword` se reemplazó por `magicLink`).
4. **HTML del email** (cambios vs X.19):
   - **Eliminado**: el bloque con el código de password en monoespaciada lime + el botón "Ingresar a HB Lab →" que llevaba a login.html + el link a set-password.html en texto plano.
   - **Agregado**: una sola CTA grande "Crear mi contraseña →" linkeando directo al magic link, fallback en texto plano con el mismo URL (`word-break:break-all` para que se rompa correctamente en email clients), y nota explícita "El link expira en 1 hora. Si vence, podés pedir uno nuevo desde la pantalla de login con 'Olvidaste tu contraseña'".

**UX resultante**: alumno paga → recibe email → click "Crear mi contraseña" → Supabase valida el token y lo redirige a `https://hblabarg.com/set-password.html` con la sesión ya creada → `set-password.html` detecta la sesión via `sb.auth.getSession()` (caso D del bootstrap — Etapa X.17), muestra el form, alumno elige password → updateUser → dashboard. **Sin contraseñas visibles en ningún momento**.

**`redirectTo` apunta a `https://hblabarg.com/set-password.html`** — el dominio nuevo de HB Lab. Pre-requisito: la URL debe estar en la allow-list de Supabase → Auth → URL Configuration → Redirect URLs. Si todavía no se sirve `set-password.html` desde `hblabarg.com` (DNS/Pages pending), considerar volver a `https://ekapradacoach.github.io/HBLAB/set-password.html` temporalmente hasta que el dominio esté apuntando bien al hosting.

**Defensive en process-payment**: si `generateLink` falla (rate limit, error de Supabase Auth), `magicLink` queda `null`, `magicLinkSkipped` registra el motivo, y se **skipa el envío del email** (mejor no enviar nada que enviar un email roto). El acceso al curso queda registrado igual; el admin puede regenerar/reenviar manualmente desde el panel.

**Response shape** ahora incluye:
- `magic_link_skipped: '...'` cuando `generateLink` falló.
- `welcome_email: 'skipped_no_magic_link'` cuando se omitió el envío por no tener magic link.

**Re-deploy manual requerido** en Supabase Dashboard → Edge Functions → process-payment → Code → pegar el archivo actualizado (619 líneas) → Deploy updates. Verificar que `hblabarg.com/set-password.html` esté en la allow-list de Redirect URLs antes del primer pago de prueba.

**Etapa X.19 — `createUser` + email de bienvenida vía Resend (reemplaza inviteUserByEmail):**

Problema en producción: `auth.admin.inviteUserByEmail` depende del SMTP que Supabase tiene configurado para auth-emails. Cuando ese SMTP no está bien configurado para edge functions (o se llega al rate limit), el invite falla con `"Error sending invite email"` y el alumno no recibe nada. Etapa X.18 logró que el handler no abortara, pero el alumno seguía sin acceso porque el email nunca llegaba.

**Solución**: dejamos de depender del SMTP de Supabase para el email de invite. Ahora:

1. **Creamos el usuario directamente** con `auth.admin.createUser({ email, email_confirm: true, password: tempPassword, user_metadata: { full_name, name } })`. La password temporal se genera localmente con `generateTempPassword()` (12 chars alfanuméricos random vía `crypto.getRandomValues`). `email_confirm: true` deja al alumno listo para loguear sin pasar por confirmación adicional.
2. **Si `createUser` falla con "already exists"** (race condition): re-lookup en `profiles` por email, recuperar el id, **no enviar email** (el usuario ya tenía cuenta).
3. **El UPSERT en `user_courses` corre siempre** (igual que en X.18).
4. **Email de bienvenida vía Resend API** (DESPUÉS del UPSERT): `fetch POST https://api.resend.com/emails` con header `Authorization: Bearer ${RESEND_API_KEY}`. Body con `from: 'HB Lab <noreply@hblabarg.com>'` (Etapa X.19.1 — dominio propio verificado en Resend; reemplazó al `onboarding@resend.dev` sandbox), `to: email del alumno`, `subject: '🎉 Tu acceso a HB Lab — {courseTitle}'`, y `html` con un template inline-styled (email-safe, sin grids/flex):
   - Encabezado "¡Bienvenida/o a **HB Lab**!" (HB Lab en lime).
   - Saludo personalizado con `full_name` si está disponible (fallback "alumna/o").
   - Confirmación del curso comprado en bold.
   - **Box destacado con la contraseña temporal** en font monoespaciada lime.
   - Botón CTA "Ingresar a HB Lab →" linkeando a `login.html` con el email del alumno.
   - Link secundario a `set-password.html` para cambiar la temp por una propia.
   - Footer con email de contacto `ekapradacoach@gmail.com`.

**Helpers nuevos** en `process-payment/index.ts`:
- `generateTempPassword(length = 12)`: genera string aleatorio uniforme con `crypto.getRandomValues` sobre charset alfanumérico (A-Z, a-z, 0-9).
- `sendWelcomeEmail({ email, fullName?, courseTitle, tempPassword })`: arma el HTML, hace fetch a Resend, devuelve `{ ok, error? }`. NO lanza — los errores quedan en el log.

**Secret nuevo requerido en Supabase**: `RESEND_API_KEY` (Edge Functions → Manage secrets). Get del dashboard de Resend.com → API Keys. **El dominio `hblabarg.com` ya está verificado en Resend** (Etapa X.19.1), por eso el `from` ahora es `'HB Lab <noreply@hblabarg.com>'` con display name humano. El sandbox `onboarding@resend.dev` quedó atrás.

**Response shape** ahora incluye `welcome_email: 'sent' | 'failed: ...' | 'not_needed'` además del `invite_skipped` ya existente.

**Re-deploy manual requerido** en Supabase Dashboard → Edge Functions → process-payment → Code → pegar el contenido del archivo (577 líneas) → Deploy updates. Antes de testear, agregar el secret `RESEND_API_KEY` en Manage secrets.

**Etapa X.18 — `process-payment` robusto: usuarios existentes + rate limit del invite:**

Tres problemas detectados en producción que esta etapa cubre:

1. **Usuario que ya compró antes**: la cascada anterior usaba `auth.admin.listUsers({ page:1, perPage:200 })` y filtraba por email — funcionaba pero no escala más allá de 200 usuarios y obliga al invite a manejar el "ya existe" cada vez. **Fix**: lookup primario en `profiles.email` con `maybeSingle()`. Esto requiere que el trigger `handle_new_user` también persista el email en `profiles` (SQL ya ejecutado en Supabase). Si la query devuelve un id, salta el invite completamente — el alumno no recibe email duplicado por cada compra adicional.

2. **`AuthApiError: email rate limit exceeded`**: Supabase rate-limita los emails de invite (default ~30/hora). Cuando se supera, el `inviteUserByEmail` retorna error. Antes esto abortaba todo el handler con 500 y MP reintentaba el webhook, lo que generaba más invites fallidos y más rate limit — espiral. **Fix**: el `inviteUserByEmail` ahora corre dentro de `try/catch`. Si el error contiene `"rate limit"` o `"email"` (o cualquier otro error), se loguea con `console.warn('invite rate limited:', email, ...)` y se guarda el motivo en `inviteSkippedReason`. **NO se relanza ni se aborta el flujo**.

3. **`UPSERT user_courses` siempre debe correr**: independiente de si el invite funcionó o falló. Antes estaba inmediatamente después del invite y compartía la misma rama de error → si el invite reventaba, el pago no se registraba. **Fix**: el UPSERT ahora vive fuera del `if (!userId)` del invite. Tres outcomes:
   - **Usuario existía** (lookup en profiles encontró id) → invite skipped + UPSERT normal con ese id.
   - **Usuario nuevo, invite OK** → UPSERT normal con el id retornado.
   - **Usuario nuevo, invite falló** → no hay `userId`, **no podemos hacer UPSERT** (la columna es NOT NULL). Respondemos `{ ok: true, pending_invite: true, reason: inviteSkippedReason, email, course_id, ... }` con HTTP 200 para que MP no reintente. El admin puede asignar el curso manualmente desde `admin.html` → Tab Alumnos → "➕ Asignar curso" una vez que el alumno se registre por su cuenta. Caso esperado a ser raro (solo si los 3 outcomes anteriores fallan a la vez).

**Response shape** de `process-payment` ahora incluye opcionalmente `invite_skipped: string` (motivo del skip cuando aplica). Útil para debugging desde el log de la Edge Function.

**Etapa X.17 — `set-password.html`: activación de cuenta para alumnos invitados:**

Cuando `process-payment` confirma un pago e invita al alumno con `auth.admin.inviteUserByEmail(email, { data: { full_name } })`, Supabase envía un email con un magic link. Hasta ahora ese link aterrizaba en una página default de Supabase (no en HB Lab). La página nueva `set-password.html` es la landing oficial post-invite: valida el token, deja al alumno crear una contraseña, y lo lleva al dashboard.

**Flujos de token soportados** (`set-password.html` los detecta en cascada en el IIFE `bootstrap()`):
1. **Hash fragment (implicit flow)** — `#access_token=XXX&refresh_token=YYY&type=invite` → `sb.auth.setSession({ access_token, refresh_token })`.
2. **PKCE flow** — `?code=XXX` → `sb.auth.exchangeCodeForSession(window.location.href)`.
3. **OTP verify** — `?token_hash=XXX&type=invite` → `sb.auth.verifyOtp({ token_hash, type })`.
4. **Sesión preexistente** (recargó la página tras setSession): `sb.auth.getSession()` → si retorna session, ir directo al form.

Tras el bootstrap exitoso: `history.replaceState(null, '', pathname)` para limpiar la URL (no exponer tokens en la barra del navegador), luego `revealForm()` que también muestra el email del usuario en un pill `.user-pill` lime.

**UI**: card centrada al estilo `login.html` (gradiente top lime→violet, blobs decorativos, `--card-bg`). 3 paneles mutuamente excluyentes:
- `#panel-loading` (default mientras valida el token) — spinner grande + "Validando tu invitación…".
- `#panel-form` — header "Bienvenida/o a HB Lab" con "HB Lab" en lime, pill con el email, 2 campos (password + confirmar) con indicador de fortaleza de 4 barras (mismo helper `getStrength()` que la sesión vieja de registro reusado), botón "Crear contraseña y entrar →".
- `#panel-error` — ícono ⚠️ + título "Link inválido o expirado" + detalle dinámico (`#error-detail innerHTML`) + link a `login.html` como fallback.

**Submit**: `sb.auth.updateUser({ password: pw })` → si éxito, mensaje verde "¡Listo! Redirigiendo…" + `window.location.replace('dashboard.html')` tras 1s.

**Configuración requerida en Supabase Dashboard** (para que el link del invite apunte a esta página):
1. **Authentication → URL Configuration**:
   - **Site URL**: setear como `https://ekapradacoach.github.io/HBLAB/` (es la URL base del proyecto en GitHub Pages — Supabase la usa como destino por defecto cuando el invite no especifica `redirectTo`).
   - **Redirect URLs** (allow-list): agregar `https://ekapradacoach.github.io/HBLAB/set-password.html` para permitir el redirect explícito.
2. **Authentication → Email Templates → Invite user**: revisar que el botón principal del template use `{{ .SiteURL }}set-password.html` o un `{{ .ConfirmationURL }}` que finalmente redirija ahí. Si el template tiene un URL hardcoded a otra página (login.html legacy), reemplazarlo.
3. **`redirectTo` explícito en las Edge Functions (Etapa X.17.1)**: las dos llamadas a `auth.admin.inviteUserByEmail` del backend ahora pasan `redirectTo: 'https://ekapradacoach.github.io/HBLAB/set-password.html'` siempre, independientemente del Site URL configurado en el dashboard. Aplica a:
   - `process-payment/index.ts` (paso 4.b, invite tras pago confirmado) — `inviteOpts` ahora arma `{ redirectTo, data?: { full_name, name } }` con tipo explícito y `data` opcional.
   - `invite-coach/index.ts` (paso 4, invite del admin para nuevo coach) — se pasó de `inviteUserByEmail(email)` a `inviteUserByEmail(email, { redirectTo: ... })`.
   Esto asegura que el link del email apunte siempre a `set-password.html` aunque alguien cambie el Site URL en Supabase. **Requiere re-deploy manual** de las dos funciones tras el cambio (Edge Functions → cada función → Code → pegar nuevo contenido → Deploy updates).

**Etapa X.16 — Bugfix crítico: process-payment ahora hace fetch a la API de MP:**
- **Causa raíz**: el webhook real de MP solo manda `{ action, data: { id }, type, user_id }`. El parser viejo `normalizeMP(payload)` asumía que el webhook ya traía `payer.email`, `external_reference`, `transaction_amount`, etc., así que devolvía `null` siempre y el endpoint respondía 400. Resultado: ningún pago aprobado llegaba a `user_courses`.
- **Fix**: la función `normalizeMP` legacy fue eliminada. La normalización del MP webhook ahora se hace **inline en el handler**:
  1. Extrae `paymentId = payload.data.id`. Si falta → 200 + `skipped:true` (eventos secundarios como test/refund no traen id).
  2. `fetch GET https://api.mercadopago.com/v1/payments/{paymentId}` con `Authorization: Bearer ${MP_ACCESS_TOKEN}`. Si la API responde no-2xx → 502 (MP reintentará).
  3. **Skip silencioso si `payment.status !== 'approved'`**: retorna 200 + `{ ok: true, skipped: true, reason: 'status=...' }`. Esto evita que MP reintente el webhook para pagos `in_process` / `pending` / `rejected` (esos estados llegan a status final con webhooks subsiguientes).
  4. Parsea `payment.external_reference` como JSON (lo armó `create-preference` con `{ slug, email, nombre, apellido, coupon_code, course_id }`). Si el JSON.parse falla, loguea warning y trata el campo como vacío (cae en validaciones siguientes).
  5. Resuelve `course_id` por `slug` contra la tabla `courses` con service role (bypassea RLS).
  6. Arma el `NormalizedPayment` con `email` (priorizando `extRef.email` sobre `payment.payer.email` por compatibilidad), `amount=transaction_amount`, `currency=currency_id`, `payment_method='mercadopago'`, `external_ref=payment.id`, y `nombre/apellido` del extRef.
  7. Continúa al flujo común de invite + UPSERT en `user_courses`.
- **Re-deploy requerido** en Supabase Dashboard: Edge Functions → process-payment → Code → pegar nuevo contenido (369 líneas) → Deploy. Verificar que el secret `MP_ACCESS_TOKEN` está configurado en Manage Secrets.
- **Follow-up anotado** (sin implementar todavía): incrementar `coupons.uses_count` cuando `extRef.coupon_code` está set en el webhook MP. Comentario inline marca dónde.

**Etapa X.15 — Cleanup: registro eliminado, sales table, contact email:**
- `login.html`: panel de registro removido completamente (HTML + JS + form-register handler + indicador de fortaleza de password + checker de confirmación). Solo quedan **Login** y **Recuperar contraseña**. El alta de alumnos se hace 100% automática vía `process-payment` Edge Function al confirmar pago (`auth.admin.inviteUserByEmail` envía un email con magic link). El link "¿No tenés cuenta? Crear cuenta →" del panel login también desapareció. CSS `.pw-bar*` queda definido pero sin uso (harmless).
- `checkout-success.html`: footer info-box ahora referencia `ekapradacoach@gmail.com` en lugar del placeholder `hola@hblab.com`. (`checkout-pending.html` quedó con el placeholder — no se pidió cambiarlo.)
- `admin.html` Tab Gestión: tabla de ventas detallada (ver sección "Tab Gestión" más abajo).

**Etapa X.14 — Cupón 100% off (precio final $0) salta MP/PayPal:**
- `checkout.html` → `goToPayment()`: branch nuevo al inicio. Si `_finalPrice <= 0` (cupón con `discount_pct=100` o `discount_fixed >= base_price`), NO se llama a `create-preference` ni se redirige a MP.
- En su lugar, `fetch POST` directo a `https://bqkajhxfdybmuilvzchm.supabase.co/functions/v1/process-payment` con body `{ provider: 'coupon', email, nombre, apellido, slug, amount: 0, currency: 'ARS', coupon_code, status: 'approved' }`.
- Si `process-payment` responde `{ ok: true }` → redirect a `checkout-success.html`.
- Si responde error → alert con el detalle, restaura el botón "Continuar al pago →" y permite reintentar.
- En `process-payment`, el branch "coupon" detecta `provider === 'coupon'` ANTES de la verificación de firma (early return) y procesa el acceso. Validaciones server-side: existencia del slug + curso activo, cupón existe + `is_active=true`, `valid_until` no vencido, `max_uses` no excedido, `course_id` matchea (si está set). Defensivo contra clientes maliciosos que envíen `amount: 0` con un cupón inválido.
- El email de invitación que envía Supabase Auth ahora incluye `full_name` en `user_metadata` (extraído de `nombre + apellido`) → el trigger `handle_new_user` lo persiste en `profiles.full_name` automáticamente. Aplica a **todos los flujos** (MP, PayPal y coupon) — antes el invite no pasaba metadata, lo que dejaba `profiles.full_name` vacío y forzaba al alumno a completarlo manualmente desde `perfil.html`.

**Bugfix Etapa X.13.1 — botón "Comprar ahora" de la card en `index.html`:**
- El handler antiguo `alert('Próximamente — integración con Mercado Pago y PayPal')` se reemplazó por `window.location.href='${coursePage}&buy=1'` (navega a `venta-curso.html?slug=X&buy=1`).
- `venta-curso.html` detecta el flag `buy=1` en la URL dentro del callback del `MutationObserver` que setea `_ventaCourse`, y dispara `openCurrencyModal()` automáticamente apenas el course está cargado. Resultado UX: click "Comprar ahora" en landing → aterriza en venta-curso con el modal de selección de moneda ya abierto.

**Integración Mercado Pago (Etapa X.13):**
- **SDK** cargado en `<head>` de `checkout.html`: `<script src="https://sdk.mercadopago.com/js/v2"></script>`.
- **Public Key** hardcoded en JS: `APP_USR-50bae8c7-b6bf-4f8b-813e-38a4307e91bd` (producción). Se inicializa con `new MercadoPago(MP_PUBLIC_KEY, { locale: 'es-AR' })` para dejar el SDK listo si en el futuro se cambia a checkout-bricks (transparente). Hoy se usa el flujo de **redirect a checkout hosteado** vía `init_point`.
- **Edge Function `create-preference`** (Etapa X.13): recibe `{ slug, email, nombre, apellido, amount, coupon_code }`, resuelve el course en BD con service role (no confía en el front para el `title`), llama a `https://api.mercadopago.com/checkout/preferences` con `Authorization: Bearer ${MP_ACCESS_TOKEN}`, devuelve `init_point` al cliente.
- **`back_urls`** (configuradas en la preference):
  - success → `https://ekapradacoach.github.io/HBLAB/checkout-success.html`
  - failure → `https://ekapradacoach.github.io/HBLAB/checkout.html` (el alumno puede reintentar)
  - pending → `https://ekapradacoach.github.io/HBLAB/checkout-pending.html`
- **`auto_return: 'approved'`** — si el pago se aprueba, MP redirige automáticamente a `back_urls.success` sin que el usuario tenga que apretar nada.
- **`notification_url`** (webhook): `https://bqkajhxfdybmuilvzchm.supabase.co/functions/v1/process-payment` — MP llama acá tras el pago confirmado, y `process-payment` (Etapa X.11) hace UPSERT en `user_courses`.
- **`external_reference`**: JSON serializado con `{ slug, email, nombre, apellido, coupon_code, course_id }` — sirve para que `process-payment` recupere los datos del comprador desde el webhook (MP devuelve este string tal cual). **Pendiente** en `process-payment`: parsear `external_reference` y usar esos campos en lugar de leerlos del payload genérico.

**Cupones — semántica:**
- `code` único, mayúsculas. El front lo upper-casea on-input.
- `discount_pct` (0..100) y `discount_fixed` (ARS) son **mutuamente excluyentes**. El form valida.
- `valid_until` nullable → sin fecha vence → cupón eterno.
- `max_uses=0` → ilimitado. `uses_count` lo incrementa el backend al confirmar el pago (lógica pendiente en `process-payment`).
- `course_id` nullable → válido para todos los cursos. Con UUID → solo para ese curso.
- RLS: admin gestiona todo (insert/update/delete); público (anon key) solo SELECT con `is_active=true` — necesario para que `validateCoupon()` en checkout.html funcione sin login.

**`btn-cupon-cancel` y los handlers**: el form vive arriba de la tabla en `panel-cupones`. Estado de edición controlado por `_editingCuponId` global (null = creando). `editCupon(c)` setea el global + muestra "Cancelar edición". `resetCuponForm()` lo limpia.

---

## Foro — comportamiento de anonimato

- `is_anonymous = true` + caller es `student` → RPC retorna `full_name = 'Alumno'`
- Coaches y admins ven el nombre real siempre
- Badge "Coach 🎓" en lime: cuando `profiles.role IN ('coach','admin')`

---

## Flujo de acceso a cursos

```
Alumno tiene acceso a un curso SOLO SI:
  user_courses WHERE payment_status = 'paid' AND status = 'active'
```

---

## Lógica de páginas de curso (curso.html dinámico)

1. Lee `?slug=` → consulta `courses` (SELECT incluye `id, slug, title, description, videos, total_videos, is_live, live_url, live_date, recording_url, recordings, live_completed, certificate_url, course_type`) → verifica acceso en `user_courses`
2. **Pregrabado** (`is_live = false`) → lista de videos JSONB + progreso `video_progress` + certificado al 100%
3. **Live no finalizado** (`is_live = true && !live_completed`) → tarjeta `renderLiveSection` con botón "Unirse" (`live_url`); barra de progreso oculta
4. **Live finalizado con grabaciones** (`is_live && live_completed && liveRecordings.length > 0`) → se trata **igual que un curso pregrabado** con N videos: `VIDEOS = liveRecordings.map((r,i) => ({ index:i, title: r.title || \`Grabación ${i+1}\`, src: r.url }))`, `TOTAL_VIDEOS = N`, botón "Marcar como completado" por video → `video_progress(video_index=i)`, barra de progreso, certificado al 100% (Sesión 40, generalización de Sesión 34).
5. **Live finalizado sin grabaciones** → mensaje "La grabación estará disponible pronto." (vía `renderLiveSection`); barra de progreso oculta y **sin certificado** (Sesión 37).
6. **Resolución de `liveRecordings` en `init()`**: `course.recordings` puede llegar como **string JSON** o como array — parsear con `typeof recs === 'string' ? JSON.parse(recs) : recs` (envuelto en try/catch) y validar `Array.isArray` antes de filtrar (fix Sesión 41 — sin esto `Array.isArray` devolvía false sobre el string y caía siempre al fallback legacy o a `[]`). Luego: prioridad a las grabaciones (filtra ítems sin `url`); si vacío y `course.recording_url` existe → fallback legacy `[{title:'Grabación de la clase', url: recording_url}]`; si todo vacío → `[]` (cae en estado #5). Decisión: `showRecordingsAsVideos = is_live && live_completed && liveRecordings.length > 0`; `treatAsRecorded = !is_live || showRecordingsAsVideos`. `currentCertUrl = course.certificate_url || null` se setea antes de cualquier render — el certificado se dispara solo desde `updateProgress()` cuando `pct >= 100`, nunca desde `renderLiveSection`.
7. `renderLiveSection` solo maneja 2 estados: `live_completed=true && sin grabaciones` (mensaje "estará disponible pronto", sin cert) y `live_completed=false` (tarjeta "Unirse a la clase"). El caso "live finalizado con grabaciones" lo maneja `treatAsRecorded` vía `renderVideos`.
7b. **Modo módulos** (`course_type='modules'` — Sesión 48): pre-empta los flujos anteriores. Globals dedicadas: `isModulesMode`, `MODULES`, `LESSONS_FLAT`, `activeLessonId`. `loadStudentModules(courseId)` carga `course_modules` + `course_lessons`. `LESSONS_FLAT` es un array plano para indexar; `TOTAL_VIDEOS = LESSONS_FLAT.length`. Progreso: `video_progress.video_index` guarda el **UUID de la lección como string**; el load filtra con `.in('video_index', lessonIds.map(String))` y `completedSet` guarda strings. `renderModulesView()` reemplaza `renderVideos()` cuando aplica: layout grid `.modules-layout` con `.modules-sidebar` (sticky 290px, módulos plegables `.modules-mod` con `.modules-lessons` colapsables vía `.collapsed`) + `.modules-main` (título + iframe + botón "Marcar como completado"). `selectLesson(id)` cambia `activeLessonId` y re-renderiza. `markLessonComplete(lessonId)` upsert con `video_index = lessonId`. Mobile: el grid colapsa a 1 columna y el sidebar pierde el sticky. `updateProgress` usa "lecciones" en el label cuando `isModulesMode`. Certificado al 100% igual que siempre vía `showCertSection()`.
8. Sección materiales: `course_materials` filtrado por `course_id`
9. Foro: RPC `get_forum_posts` con emojis, multi-imagen (hasta 3), editar/eliminar

---

## Edge Functions de Supabase

**Ubicación:** `hblab/supabase/functions/<name>/index.ts`. Hay cuatro funciones listas en el repo:

- **`invite-coach`** — `verify_jwt = true`. POST `{ email, role }`. Verifica que el caller sea admin (lee JWT del Authorization), llama `auth.admin.inviteUserByEmail(email, { redirectTo: 'https://ekapradacoach.github.io/HBLAB/set-password.html' })` con la service role key, hace UPSERT en `profiles.role`. Retorna `{ ok, user_id, email, role }`. El `redirectTo` (Etapa X.17.1) garantiza que el botón del email apunte a `set-password.html` independiente del Site URL.
- **`create-preference`** — `verify_jwt = false`. POST `{ slug, email, nombre, apellido, amount, coupon_code }`. Resuelve el `course` por slug (con service role para bypassear RLS), llama a `https://api.mercadopago.com/checkout/preferences` con `MP_ACCESS_TOKEN`, devuelve `{ ok, init_point, sandbox_init_point, preference_id }` al cliente. El cliente redirige a `init_point`. El webhook de MP llega luego a `process-payment`. Etapa X.13.
- **`create-paypal-order`** — `verify_jwt = false`. POST `{ course_id, amount, nombre, apellido, email }`. Espejo de `create-preference` para PayPal. Hace OAuth2 con `PAYPAL_CLIENT_ID:PAYPAL_CLIENT_SECRET` contra `${PAYPAL_API_BASE}/v1/oauth2/token`, luego `POST /v2/checkout/orders` con `intent: 'CAPTURE'`, `purchase_units[0]: { amount: { currency_code: 'USD', value: amount.toFixed(2) }, custom_id: course_id }`, y `payer: { name, email_address }` si fueron provistos. Retorna `{ ok, order_id, status }`. El SDK PayPal del cliente recibe el `order_id`, abre el popup oficial, y al aprobar dispara el webhook `PAYMENT.CAPTURE.COMPLETED` → process-payment. Etapa X.29. Secrets requeridos: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV` (opcional, default `live`).
- **`process-payment`** — `verify_jwt = false`. Webhook público de MP/PayPal **+ entry point del cupón 100% off** (Etapa X.14). Verifica firma (placeholder hoy — bloque `TODO` con docs links + flag `PAYMENTS_ALLOW_UNVERIFIED=1` para dev). Tres branches según el provider:
  - **MP** (Etapa X.16 — fix crítico): el webhook real de MP solo trae `{ action, data: { id }, type, user_id }` — NO incluye email/amount/external_reference. Por eso process-payment ahora hace `GET https://api.mercadopago.com/v1/payments/{data.id}` con `Authorization: Bearer ${MP_ACCESS_TOKEN}` para enriquecer el pago. Si `payment.status !== 'approved'` (pending, in_process, rejected, etc.) → retorna `{ ok: true, skipped: true, reason: 'status=...' }` con HTTP 200 para que MP no reintente. Si está aprobado, parsea `payment.external_reference` (JSON con `{ slug, email, nombre, apellido, coupon_code, course_id }` que `create-preference` armó al crear la preference), resuelve `course_id` por slug y arma el `NormalizedPayment`. Si el webhook llega sin `data.id` (eventos secundarios tipo test/refund) responde 200 con `skipped: true` también, sin error.
  - **PayPal** (Etapa X.28 — integración real): igual que MP, el webhook real de PayPal solo trae `{ resource: { id }, ... }`. Process-payment hace `GET ${PAYPAL_API_BASE}/v2/checkout/orders/{orderId}` con `Authorization: Bearer ${access_token}` (obtenido via `getPayPalAccessToken()` → OAuth2 con Basic Auth `client_id:secret` contra `/v1/oauth2/token`). El `orderId` viene de `payload.resource.supplementary_data.related_ids.order_id` (eventos CAPTURE.*) o fallback a `payload.resource.id` (eventos CHECKOUT.ORDER.*). Solo procesa si `order.status === 'COMPLETED'` O `order.intent === 'CAPTURE'` con `captures[].status === 'COMPLETED'` — sino skip silencioso con 200. Extrae: `email = order.payer.email_address`, `course_id = order.purchase_units[0].custom_id` (UUID del curso seteado por `create-paypal-order`), `amount = unit.amount.value`, `currency = unit.amount.currency_code`, `nombre = order.payer.name.given_name`, `apellido = order.payer.name.surname`. La verificación de firma (`verifySignature`) llama a `/v1/notifications/verify-webhook-signature` con los 5 headers (`paypal-transmission-id/-time/-cert-url/-auth-algo/-transmission-sig`) + `webhook_id = PAYPAL_WEBHOOK_ID` + `webhook_event` (payload parseado a objeto). Solo si `verification_status === 'SUCCESS'` continúa.
  - **Coupon**: si el body trae `provider: 'coupon'`, salta la verificación de firma, resuelve `course_id` por `slug` con service role, valida el cupón contra la tabla `coupons` (existencia + activo + vencimiento + max_uses + course_id match), y procesa el acceso con el mismo flujo (`payment_method='coupon'`, `amount_paid=0`, `external_ref='coupon:{CODE}'`).

  En los 3 branches: resuelve `user_id` por email con la siguiente cascada (Etapa X.19 — reemplazo de invite por createUser + Resend):
    1. **Lookup primario en `profiles.email`** (`select('id').eq('email', X).maybeSingle()`) — más rápido y barato que `listUsers`, y `profiles` se mantiene en sync con `auth.users` vía el trigger `handle_new_user` que persiste email. Si encuentra → usa ese id, salta la creación y **no envía email de bienvenida** (el alumno ya tenía cuenta).
    2. **Solo si profiles devuelve `null`** → `auth.admin.createUser({ email, email_confirm: true, password: tempPassword, user_metadata: { full_name, name } })`. La contraseña temporal se genera localmente con `generateTempPassword()` (12 chars alfanuméricos vía `crypto.getRandomValues`). El `email_confirm: true` marca el email como confirmado de entrada — el alumno puede loguear inmediatamente. La metadata permite que `handle_new_user` guarde `profiles.full_name`.
    3. **Caso race "already exists"** (alguien creó al usuario entre el lookup y este punto): re-lookup en `profiles` para recuperar el id. Si tampoco aparece → log warning y sigue (sin id).
    4. **Otros errores de `createUser`**: degradados a `console.warn`, NO abortan el flujo.
    5. **`UPSERT user_courses` corre SIEMPRE** fuera del `if` de createUser. Si tenemos `userId` → UPSERT normal con `payment_status='paid'`, `status='active'`. Idempotente por `onConflict: 'user_id,course_id'`. Si NO hay `userId` → responde 200 con `{ ok: true, pending_invite: true, reason }` para que MP no reintente; el admin asigna el curso manualmente desde admin.html.
    6. **Email de bienvenida con MAGIC LINK vía Resend** (Etapa X.20 — reemplaza el flujo con temp password visible de X.19): después del UPSERT exitoso, si `tempPassword` está set (señal de "usuario nuevo creado en este request"):
       - **6.a Generar magic link**: `sbAdmin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: 'https://hblabarg.com/set-password.html' } })`. El response trae `data.properties.action_link` con la URL larga que autentica al alumno y lo redirige a `set-password.html`. Si falla → `console.warn` + guarda motivo en `magicLinkSkipped`, NO aborta.
       - **6.b Resolver course title**: SELECT mínima `courses.title.eq('id', course_id).maybeSingle()`.
       - **6.c Enviar email**: `fetch POST https://api.resend.com/emails` con `Authorization: Bearer ${RESEND_API_KEY}`. Body: `{ from: 'HB Lab <noreply@hblabarg.com>', to: email, subject: '🎉 Tu acceso a HB Lab — {courseTitle}', html: <plantilla dark con CTA "Crear mi contraseña →" linkeando al magic link + link de fallback en texto plano + nota de expiración 1h> }`. **La contraseña temporal NO aparece en el email** — el alumno hace click en el botón, queda autenticado vía magic link y aterriza en `set-password.html` donde elige su contraseña personal. Si Resend falla → `console.warn`, NO aborta.
    7. **Email de CONFIRMACIÓN para usuarios existentes (Etapa X.27)**: después del UPSERT y antes del bloque del welcome email, si `inviteSkippedReason && !tempPassword` (el lookup en profiles encontró al usuario y NO se creó cuenta nueva), se envía un email simple via Resend con `subject: '✅ Nuevo curso activado — {courseTitle}'` y un CTA al dashboard (`https://hblabarg.com/dashboard.html`). Sin magic link, sin contraseña visible. Usa la misma `RESEND_API_KEY`. Resolución del `fullName`: prioriza datos del extRef del pago, fallback a `profiles.full_name`.
    8. La response final incluye `invite_skipped` (motivo del skip si el usuario ya existía), `magic_link_skipped` (motivo si la generación de magic link falló), `welcome_email` (`'sent'` / `'failed: ...'` / `'skipped_no_magic_link'` / `'not_needed'`) y `confirmation_email` (`'sent'` / `'failed: ...'` / `'not_needed'`) para debugging.

**⚠️ Estado actual: PENDIENTE de deploy.** El código está listo en el repo pero las funciones no están desplegadas todavía. El CLI de Supabase tiene problemas en Windows, así que el deploy se hace **manualmente desde el dashboard**:

### Deploy manual via dashboard (paso a paso)

1. Abrir el proyecto en `https://supabase.com/dashboard/project/bqkajhxfdybmuilvzchm`.
2. En el menú lateral: **Edge Functions** → botón **"New function"** (o "Create a new function").
3. Para cada función:
   - **Nombre**: `invite-coach` (exacto, sin espacios, kebab-case) o `process-payment`.
   - Elegir el tab **"Via Editor"** (no "Via CLI").
   - **Pegar el contenido completo** del archivo correspondiente (`hblab/supabase/functions/invite-coach/index.ts` o `hblab/supabase/functions/process-payment/index.ts`) en el editor.
   - Click **"Deploy function"**.
4. Tras el primer deploy, el endpoint queda disponible en `https://bqkajhxfdybmuilvzchm.supabase.co/functions/v1/<name>`.
5. **Re-deploy en futuras ediciones**: misma página → la función ya existe → tab "Code" → pegar la nueva versión → Deploy.

### Secrets

- `SUPABASE_SERVICE_ROLE_KEY` — **ya configurado en el proyecto** (Supabase lo inyecta automáticamente en el runtime de Edge Functions; no hay que setearlo manualmente).
- `SUPABASE_URL` — también inyectado automáticamente.
- `MP_ACCESS_TOKEN` — **REQUERIDO para `create-preference`** (Etapa X.13). Es el Access Token de **producción** del partner de MP (Dashboard MP → Tus integraciones → Credenciales de producción → "Access Token"). **NO** confundir con la Public Key (esa va hardcoded en checkout.html). Setear en Supabase → Edge Functions → Manage secrets.
- `MP_WEBHOOK_SECRET`, `PAYPAL_WEBHOOK_ID` — placeholders para verificación de firma en `process-payment`, configurar cuando se haga la integración real de webhooks.
- `PAYMENTS_ALLOW_UNVERIFIED=1` — solo para sandbox/dev mientras la verificación de firma esté pendiente. **NUNCA en producción.**

### Verificación de los archivos en el repo

Tamaños esperados de las tres funciones (al día de hoy):

```
supabase/functions/invite-coach/index.ts        147 líneas   ~7.2 KB
supabase/functions/create-preference/index.ts   ~175 líneas  ~6.1 KB
supabase/functions/process-payment/index.ts     207 líneas  ~10.8 KB
```

Todos los archivos cierran con `});` (el handler `serve(...)`). Si alguno está cortado, no hacer deploy y revisar primero.

### Configuración asociada en `supabase/config.toml`

```toml
[functions.invite-coach]      verify_jwt = true   # exige JWT del admin en Authorization
[functions.create-preference] verify_jwt = false  # llamada desde checkout.html (público)
[functions.process-payment]   verify_jwt = false  # webhook público — firma valida adentro
```

Cuando se haga el deploy via "Via Editor", la flag `verify_jwt` puede configurarse desde el panel de **Settings** de cada función (toggle "Enforce JWT verification"). Asegurarse de que **invite-coach tenga JWT enforcement ON** y **create-preference / process-payment tengan JWT enforcement OFF**.

---

## Infraestructura de email (Etapa X.19 — consolidado)

**Proveedor**: [Resend](https://resend.com). Reemplaza al SMTP default de Supabase que tenía problemas de configuración para enviar invites desde Edge Functions ("Error sending invite email" / rate limit).

**Dominio propio**: `hblabarg.com` — comprado en **Namecheap**. Se usa exclusivamente para correos transaccionales del backend (NO para web hosting — el frontend sigue en `https://ekapradacoach.github.io/HBLAB/` por GitHub Pages, y la migración a `hblab.com` que aparece en los `canonical` sigue siendo placeholder de SEO).

**DNS configurado en Namecheap → Advanced DNS** (registros provistos por Resend → Domains → Add Domain):

| Tipo | Host | Valor | Estado |
|------|------|-------|--------|
| `MX` | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) | configurado |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | ⏳ pendiente propagación |
| `TXT` | `resend._domainkey` | (clave pública DKIM larga) | ✅ verificado |
| `TXT` | `_dmarc` | `v=DMARC1; p=none;` | configurado (opcional) |

**Estado de verificación en Resend** (a la fecha):
- **DKIM**: ✅ verificado — Resend ya puede firmar los emails con la clave privada, y los servidores receptores validan la firma contra el `TXT resend._domainkey` publicado.
- **SPF**: ⏳ pendiente — el registro `TXT send` con `v=spf1 include:amazonses.com ~all` está cargado en Namecheap pero Resend todavía no lo validó. La propagación DNS puede tardar hasta 48hs. Revisar en Resend → Domains → `hblabarg.com` → Refresh. **Sin SPF verificado, algunos receptores (Gmail estricto, Outlook corporativo) pueden marcar los emails como spam o rechazarlos.** Mientras tanto, los emails siguen saliendo (DKIM válido alcanza para entregar en la mayoría de los casos) pero la deliverability no es óptima.

**Configuración en Supabase**:

1. **Project Settings → Auth → SMTP Settings** (para emails de auth — confirmation, password reset, magic link):
   - **Host**: `smtp.resend.com`
   - **Port**: `465` (TLS) o `587` (STARTTLS)
   - **Username**: `resend`
   - **Password**: `RESEND_API_KEY` (el mismo API key de Resend.com → API Keys)
   - **Sender email**: `noreply@hblabarg.com`
   - **Sender name**: `HB Lab`
   - **Enable Custom SMTP**: ON
2. **Edge Functions → Manage Secrets**:
   - `RESEND_API_KEY` — el mismo API key, expuesto a `process-payment` para que pueda hacer `fetch` directo a la API de Resend (independiente del SMTP).
3. **Email Templates**: revisar que el "Invite user" template apunte al flujo nuevo (el botón debería linkear a `set-password.html` vía `redirectTo`). Tras la migración a `createUser` en `process-payment`, el invite template ya no se usa para el flujo de compra — pero sigue siendo el que se dispara desde `invite-coach` (admin → agregar coach).

**Flujo de email tras una compra confirmada** (Etapa X.19):
1. MP/PayPal/Coupon envía webhook → `process-payment` resuelve `course_id` y `user_id`.
2. Si el alumno **es nuevo**: `auth.admin.createUser({ email, email_confirm: true, password: tempPassword })` (no usa el SMTP de Supabase para nada — solo crea el row en `auth.users` localmente).
3. **`process-payment` envía el email de bienvenida** vía `fetch POST https://api.resend.com/emails` con `Authorization: Bearer ${RESEND_API_KEY}`. Body:
   - `from: 'HB Lab <noreply@hblabarg.com>'`
   - `to: <email del alumno>`
   - `subject: '🎉 Tu acceso a HB Lab — {courseTitle}'`
   - `html`: template inline-styled con la contraseña temporal + link a `login.html` + link a `set-password.html` para cambiarla.
4. Resend acepta el request, firma con DKIM, despacha vía SES → llega al alumno.

**Trigger `handle_new_user` actualizado** (SQL ya ejecutado en Supabase): ahora persiste también el `email` en `public.profiles` además del `full_name`. Esto habilita el lookup primario en `profiles.email` que hace `process-payment` (paso 4.a de Etapa X.19), evita depender de `auth.admin.listUsers` (paginado, no escala) y permite que el Tab Alumnos del admin muestre el email sin queries cruzadas a `auth.users`.

```sql
-- Versión vigente del trigger (referencia, ya ejecutado):
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
    SET email     = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**⏳ Pendientes de la infraestructura de email**:
- **Verificar SPF en Resend** cuando termine de propagar el DNS (revisar Resend → Domains cada 12hs hasta verde, max 48hs desde el alta del registro). Una vez verificado, la deliverability sube significativamente.
- **Backfill de `profiles.email`** para usuarios pre-existentes que se registraron antes del trigger nuevo: ejecutar `UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE p.id = u.id AND p.email IS NULL;` para llenar los huecos. Después de esto, todos los lookups por email del backend pueden confiar 100% en `profiles`.
- **(Opcional)** Agregar un registro `TXT _dmarc` más estricto (`v=DMARC1; p=quarantine; rua=mailto:...`) una vez que SPF esté verificado y el flujo esté estable, para protección anti-phishing.

---

## SQL pendiente de ejecutar en Supabase

```sql
-- 0. Tabla site_config + columna display_order (Sesión 54)
CREATE TABLE IF NOT EXISTS public.site_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gestiona site_config" ON public.site_config
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Publico lee site_config" ON public.site_config
  FOR SELECT USING (true);

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
```

```sql
-- 1. Policies RLS para editar/eliminar posts de foro (alumnos editan/eliminan lo propio; coaches eliminan cualquiera)
CREATE POLICY "forum_posts_update_own" ON public.forum_posts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "forum_posts_delete_own" ON public.forum_posts
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "forum_posts_delete_coach" ON public.forum_posts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach','admin'))
  );

-- 2. Policy READ de forum_posts para coaches (actualmente bloqueados si no tienen user_courses)
DROP POLICY IF EXISTS "<nombre-actual-policy-select>" ON public.forum_posts;
CREATE POLICY "forum_posts_lectura" ON public.forum_posts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_courses uc
    WHERE uc.user_id = auth.uid() AND uc.course_id = forum_posts.course_id
      AND uc.payment_status = 'paid' AND uc.status = 'active')
  OR EXISTS (SELECT 1 FROM public.coach_courses cc
    WHERE cc.coach_id = auth.uid() AND cc.course_id = forum_posts.course_id)
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- 3. Policy DELETE en ad_spend
CREATE POLICY "Admin puede eliminar ad_spend" ON public.ad_spend FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
```

---

## Próximos pasos del proyecto

1. **Integración de pagos** — Mercado Pago (ARS) + PayPal (USD) → registrar en `user_courses` con `payment_status='paid'`, `status='active'`
2. **Ejecutar SQL pendiente** — policies RLS del foro (ver arriba)
3. **Notificaciones in-app** — tabla `notifications` + Supabase Realtime
4. **Cursos pregrabados con módulos** — tablas `course_modules` + `course_lessons`, sidebar de navegación
5. **Personalizar email de confirmación** — Supabase → Authentication → Email Templates
6. **SEO** — meta tags Open Graph, favicon, Lighthouse

---

## Usuarios registrados

| Email | Rol |
|-------|-----|
| `ekapradacoach@gmail.com` | `admin` |
| `test@hblab.com` | `student` (password: `HBLab2024!`) |
