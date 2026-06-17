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
├── taller.html                    ← Página de venta de TALLERES PRESENCIALES (?slug=, is_workshop=true) — Etapa X.80
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
| `public.courses` | `id, slug, title, description, cover_url, banner_text, price_ars, price_usd, scheduled_prices JSONB DEFAULT '[]' (Etapa X.38 — array `[{date: 'YYYY-MM-DD', price_ars, price_usd}]` con incrementos automáticos por fecha), is_active, is_coming_soon, is_live, live_url, live_date, recording_url (legacy single), recordings JSONB DEFAULT '[]' (array `[{title, url}]`), live_completed, total_videos, videos JSONB, learning_points JSONB, syllabus JSONB, certificate_url, course_type ENUM('videos','modules','live'), is_workshop BOOLEAN DEFAULT false (Etapa X.80 — taller presencial), location TEXT (dirección del taller), max_seats INT (cupos del taller)` |
| `public.course_modules` | `id, course_id, title, order_num, unlock_at, created_at` — agrupa lecciones cuando `course_type='modules'` (Sesión 48). `unlock_at TIMESTAMPTZ` (Etapa X.38) controla el drip: si está set y `> now`, el módulo está "bloqueado" (lógica del filtro queda pendiente del lado alumno). NULL = disponible siempre. |
| `public.course_lessons` | `id, module_id, title, video_url, order_num, created_at` — videos individuales dentro de cada módulo. ⚠️ La columna se llama **`video_url`** (NO `url`) — usar siempre `video_url` en SELECTs y en los payloads de INSERT/UPDATE (Sesión 50 fix) |
| `public.course_lives` | `id, module_id, live_url, live_date, recording_url, live_ended (Etapa X.45 — BOOLEAN DEFAULT FALSE, controla cuándo se habilita la asistencia para alumnos), created_at` — 0..1 por módulo. Para el link Meet/Zoom previo al live + grabación posterior. FK con `ON DELETE CASCADE` desde `course_modules`. ⚠️ **Sin RLS configurada** — queda public-readable y public-writable por default (pendiente agregar policies). El alumno marca asistencia con `video_progress.video_index = -1 * order_num` (Etapa X.44 — convención que reusa la columna sin migración). Render alumno en `curso.html` con gate `!live_ended` (Etapa X.45) — el botón "Asistí al live" solo aparece cuando el coach explícitamente finalizó el live. |
| `public.user_courses` | `user_id, course_id, payment_status, payment_method, amount_paid, currency, status` — acceso: `paid + active` |
| `public.coach_courses` | `coach_id, course_id, commission_pct` — asigna coaches a cursos |
| `public.forum_posts` | `course_id, user_id, parent_id, content, is_anonymous, image_urls TEXT[]` — árbol a un nivel |
| `public.course_materials` | `course_id, title, description, drive_url, uploaded_by` — ⚠️ columna es `drive_url` (NO `drive_link`), `uploaded_by` (NO `coach_id`) |
| `public.video_progress` | `user_id, course_id, video_index, completed` |
| `public.ad_spend` | `course_id, platform, amount_ars, amount_usd, spend_date` |
| `public.launches` | `title, description, image_url, image_url_mobile (Etapa X.89 — imagen opcional para mobile <768px), course_id, active, cta_text` — máx. 3 activos |
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

## 🔒 Hardening de seguridad del flujo de pago (Etapas X.30 + X.31 + X.32)

Tres etapas consecutivas que cierran las vulnerabilidades del flujo de pago end-to-end. Antes de este bloque, un atacante podía:
- **Adulterar el `amount`** del fetch a `create-preference` / `create-paypal-order` y comprar a $1 (no había validación server-side del precio).
- **Forjar el webhook de MP** y disparar el flujo "pago aprobado" sin pagar (la firma HMAC nunca se verificaba — el flag `PAYMENTS_ALLOW_UNVERIFIED=1` bypass estaba activo).
- **Spam-atacar los endpoints de pago** con scripts automatizados (sin CAPTCHA), consumiendo budget de MP/PayPal y llenando la BD con preferences basura.

Estado tras X.32 (todo verificado server-side):

| Etapa | Defensa | Endpoints afectados | Secret requerido |
|-------|---------|---------------------|------------------|
| **X.30** | Validación del monto contra `courses.price_*` y descuento de cupón calculado server-side. Tolerancia ±1 ARS / ±0.01 USD. | `create-preference`, `create-paypal-order` | — (usa BD) |
| **X.31** | HMAC-SHA256 real del webhook MP sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` comparado contra `v1` del header `x-signature`. | `process-payment` (rama MP) | `MP_WEBHOOK_SECRET` |
| **X.32.A** | Firma webhook PayPal vía `/v1/notifications/verify-webhook-signature` — guard de headers + `reason` strings normalizados. | `process-payment` (rama PayPal) | `PAYPAL_WEBHOOK_ID` |
| **X.32.B** | Cloudflare Turnstile CAPTCHA en checkout.html + verificación con siteverify del lado servidor. | `create-preference`, `create-paypal-order` | `TURNSTILE_SECRET_KEY` |

Bypass dev `PAYMENTS_ALLOW_UNVERIFIED=1` se mantiene operativo (chequeado antes de las ramas isMP/isPaypal) — **NUNCA dejarlo activo en producción**.

---

**Etapa X.32 — Hardening de seguridad: firma PayPal real + Cloudflare Turnstile en checkout:**

Segundo bloque del paquete de seguridad de la jornada (junto a X.30 y X.31). Cierra dos huecos:

### A) Verificación de firma del webhook PayPal — alineada a la spec

El branch `isPaypal` de `verifySignature()` en `process-payment` ya hacía la llamada a `/v1/notifications/verify-webhook-signature` desde X.28, pero faltaba un guard explícito para headers ausentes y los `reason` strings eran heterogéneos (mezcla de `verify HTTP ...`, `verification_status=...`, `verify exception: ...`). Ajustes:

- **Guard al inicio**: lee los 5 headers críticos (`paypal-transmission-id`, `paypal-transmission-time`, `paypal-cert-url`, `paypal-auth-algo`, `paypal-transmission-sig`) por separado. Si falta cualquiera → `{ ok: false, provider: 'paypal', reason: 'headers PayPal incompletos' }`. Antes se leían inline en el body del fetch y PayPal devolvía un error genérico.
- **Strings normalizadas**: rechazo de firma → `'firma PayPal inválida'`. Cualquier otra falla (OAuth, parse del body, HTTP error, exception) → prefijo unificado `'error verificando firma PayPal: ...'` + detalle. Hace los logs y las respuestas mucho más legibles.
- **`console.warn('PayPal signature mismatch', { verification_status, transmission_id })`** agregado en el caso de rechazo — mismo patrón que MP en X.31, para debugging desde el log de la Edge Function.

Sin tocar: `PAYPAL_API_BASE` se mantiene (conmuta sandbox/live según `PAYPAL_ENV`), `getPayPalAccessToken()` helper compartido, bypass `PAYMENTS_ALLOW_UNVERIFIED=1` antes del branch (sigue funcionando para sandbox/dev).

### B) Cloudflare Turnstile (CAPTCHA) en checkout + verificación server-side

Defensa anti-bot/anti-spam contra ataques automatizados al endpoint de pago. Hasta ahora cualquier script podía POSTear a `create-preference` o `create-paypal-order` con datos falsos y consumir el budget de las APIs MP/PayPal (rate limit, costos de transacción, llenado de la BD con preferences basura). Turnstile pone un challenge invisible/managed entre el alumno humano y los Edge Functions.

**Frontend (`checkout.html`)**:
- SDK cargado en `<head>`: `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`.
- Widget renderizado justo arriba del botón "Continuar al pago →": `<div class="cf-turnstile" data-sitekey="0x4AAAAAADRNE3mONBTsORsw" data-theme="dark" id="turnstile-widget">`. Tema dark para matchear la paleta de checkout. El `data-sitekey` es **público** (es la counterpart del `TURNSTILE_SECRET_KEY` server-side).
- Div `#turnstile-error` (oculto por default) debajo del widget para mostrar "Por favor completá la verificación de seguridad." si el alumno aprieta el botón sin completarlo.
- `goToPayment()` arranca leyendo el token: `document.querySelector('[name="cf-turnstile-response"]')?.value`. Si está vacío → muestra `#turnstile-error`, restaura el botón ("Continuar al pago →"), `return` temprano antes de cualquier fetch.
- El `turnstile_token` se manda en el body de las **3 ramas** de pago:
  - **Cupón 100% off** → `process-payment` (provider `'coupon'`).
  - **ARS** → `create-preference`.
  - **USD** → `create-paypal-order`. El token se captura en `goToPayment` y se pasa a `mountPayPalButtons({ ..., turnstileToken })`; luego el callback `createOrder` del SDK PayPal lo incluye en el body del fetch. **El token vive ~300s** por default, suficiente margen para que el alumno haga click en el botón oficial de PayPal después.

**Edge Functions (`create-preference` y `create-paypal-order`)** — implementación espejo en ambas:
1. `turnstile_token?: string` agregado al tipo del body.
2. **Step de verificación NUEVO** justo después de las validaciones básicas y ANTES de cualquier trabajo pesado (consulta de BD, OAuth con PayPal, llamada a MP):
   ```ts
   const turnstileToken = (body.turnstile_token || '').trim();
   if (!turnstileToken) return errOut('Verificación de seguridad requerida.', 400);
   const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
     method: 'POST',
     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
     body: `secret=${encodeURIComponent(Deno.env.get('TURNSTILE_SECRET_KEY') || '')}&response=${encodeURIComponent(turnstileToken)}`,
   });
   const tsData = await tsRes.json();
   if (!tsData?.success) return errOut('Verificación de seguridad fallida.', 400);
   ```
3. **Excepción del fetch** (red, timeout) → 502 con `'Error verificando captcha: ' + msg`. Log con `console.warn`/`console.error` para debugging.

**Por qué siteverify y no JWT decoding**: la API de Cloudflare es la fuente de verdad — además del `success: true/false` retorna metadata útil (`challenge_ts`, `hostname`, `action`, `cdata`) que podríamos usar en el futuro para policies más finas. El token JWT está firmado por Cloudflare pero no es trivial validarlo offline desde Deno.

**`process-payment` (rama cupón 100% off)**: hoy el `turnstile_token` llega al body pero **no se verifica todavía** del lado server. El flujo de cupón ya tiene defensas server-side independientes (valida `coupons.is_active`, `valid_until`, `max_uses`, `course_id`) — el riesgo de spam es bajo. Si en el futuro el cupón 100% se usa para campañas masivas, conviene agregar la verificación Turnstile acá también (copy-paste del mismo bloque).

**Pre-requisito del lado server**: cargar `TURNSTILE_SECRET_KEY` en Supabase → Edge Functions → Manage Secrets antes del re-deploy. Sin ese secret, la verificación falla silenciosamente y todas las requests retornan 400 — el checkout queda **completamente bloqueado**.

**Site key vs secret key** — recordatorio: `data-sitekey` en el HTML del cliente es público y se puede leer del DOM (es por diseño — Cloudflare necesita identificar al widget). `TURNSTILE_SECRET_KEY` jamás debe aparecer en el frontend; vive solo en los secrets de las Edge Functions.

**Re-deploy manual requerido de las DOS funciones** (`create-preference` y `create-paypal-order`) tras configurar el secret. `process-payment` no toca código en esta sub-etapa pero sí en X.32.A (firma PayPal aligned) → re-deploy también.

---

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
   - `order.status === 'COMPLETED'` **o `'APPROVED'`** (Etapa X.91 — APPROVED cubre el caso en que PayPal autoriza el pago pero la captura sigue en proceso), **O**
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

**Ubicación:** `hblab/supabase/functions/<name>/index.ts`. Hay cinco funciones listas en el repo:

**Diseño de los templates de email** (Etapa X.35 — consistencia visual): los 3 templates HTML que se mandan vía Resend (`sendWelcomeEmail` y `sendConfirmationEmail` en `process-payment`, `sendCoachInviteEmail` en `invite-coach-new`) usan el dark theme de HB Lab — fondo `#1E2A3A`, card `#243042` con borde `1px solid #2f3e52`, texto principal `#FFFFFF`, secundario `#94A3B8`, acento "HB Lab" en lime `#C8E600`, botón CTA con fondo `#C8E600` + texto `#1E2A3A` bold + border-radius 8px + padding 16px 32px, link de fallback en lime `#C8E600` (antes era violeta `#9B6FDE`, cambiado para unificar). Tipografía: `'Inter',Arial,Helvetica,sans-serif` (Inter primaria con sans-serif fallback). El `<head>` incluye `<meta name="color-scheme" content="dark">` y `<meta name="supported-color-schemes" content="dark">` para evitar que Gmail/iOS Mail inviertan los colores en modo claro. Las propiedades críticas de fondo (`background:#1E2A3A`, `background:#243042`, `background:#C8E600` del CTA) llevan `!important` inline para resistir el dark mode auto de los clientes de email. Todo el HTML sigue siendo email-safe: table layout, inline styles, sin flex/grid/JS. Cualquier cambio al template requiere re-deploy manual de la Edge Function correspondiente.


- **`invite-coach`** — `verify_jwt = true` (LEGACY — pre-Etapa X.32). POST `{ email, role }`. Verifica que el caller sea admin, llama `auth.admin.inviteUserByEmail(email)` con la service role key, hace UPSERT en `profiles.role`. Requería que el usuario ya estuviera registrado y dependía del SMTP de Supabase (problemas en producción). Reemplazada por `invite-coach-new` para el flujo de "Agregar coach" en admin.html. Se mantiene en el repo por compatibilidad pero no es invocada desde el frontend actual.
- **`invite-coach-new`** — `verify_jwt = true` (Etapa X.32 — crear coach desde cero). POST `{ email, full_name }` desde admin.html → Tab Coaches → modal "Agregar coach". Verifica que el caller sea admin via JWT. Si el email ya existe en `profiles` → retorna `{ status: 'already_exists' }`. Si no existe: `auth.admin.createUser({ email, email_confirm: true, password: tempPassword, user_metadata: { full_name, name, role: 'coach' } })`, luego UPSERT en `profiles` con `role='coach'` (el trigger handle_new_user crea la fila con `role='student'` por default, por eso forzamos coach). Después genera magic link con `auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: 'https://hblabarg.com/set-password.html' } })` y envía email vía Resend con `subject: '🎓 Tu acceso como Coach a HB Lab'`, template oscuro y CTA "Activar mi cuenta →". Retorna `{ status: 'ok', email, email_sent: bool, email_error? }`. Usa los mismos secrets que `process-payment` (`RESEND_API_KEY` + service role + URL). Pattern de creación + magic link copiado de `sendWelcomeEmail` en `process-payment` para consistencia visual entre el email del alumno y el del coach.
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
[functions.invite-coach]      verify_jwt = true   # exige JWT del admin en Authorization (LEGACY)
[functions.invite-coach-new]  verify_jwt = true   # crear coach desde cero + magic link (Etapa X.32)
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

## Etapa X.32 — Crear coach desde cero con magic link

Reemplaza el flujo viejo del modal "Agregar coach" en `admin.html`. Antes el admin solo podía asignar el rol coach a alguien ya registrado en la plataforma (RPC `assign_coach_by_email`); ahora puede crear la cuenta directamente ingresando email + nombre, y el sistema le manda un magic link de activación al coach para que elija su contraseña.

**Cambios:**

- **Nueva Edge Function `supabase/functions/invite-coach-new/index.ts`** (`verify_jwt = true`). POST `{ email, full_name }`. Verifica admin via JWT → chequea que el email no exista en `profiles` → `auth.admin.createUser({ email, email_confirm: true, password: tempPassword, user_metadata: { full_name, name, role: 'coach' } })` → UPSERT `profiles` con `role='coach'` → genera magic link con redirect a `set-password.html` → envía email vía Resend con subject `'🎓 Tu acceso como Coach a HB Lab'` y CTA "Activar mi cuenta →". Retorna `{ status: 'ok' | 'already_exists', email, email_sent?, email_error? }`.
- **`admin.html` modal "Agregar coach"**: ahora pide nombre + email (input `coach-nombre` + input `coach-user-email`). `confirmarAgregarCoach()` reemplaza la RPC `assign_coach_by_email` por un `fetch POST` a `https://bqkajhxfdybmuilvzchm.supabase.co/functions/v1/invite-coach-new` con `Authorization: Bearer ${session.access_token}` y `apikey: SUPABASE_ANON_KEY`. Maneja los estados `already_exists` → "Este email ya tiene cuenta en HB Lab", `ok` → "✅ Coach creado. Se envió el email de activación a {email}", error → mensaje de error. Resetea inputs y llama `loadCoaches()` al éxito.
- **`config.toml`**: agregado `[functions.invite-coach-new] verify_jwt = true`.

**RPC vieja `assign_coach_by_email`**: ya no se invoca desde el frontend pero queda viva en BD por las dudas. La función legacy `invite-coach` también queda en el repo pero no se usa desde admin.html.

**Re-deploy manual requerido** en Supabase Dashboard → Edge Functions → "New function" → Nombre: `invite-coach-new` → "Via Editor" → pegar contenido de `supabase/functions/invite-coach-new/index.ts` → Deploy. Activar "Enforce JWT verification" en Settings. Secrets ya configurados (mismos que `process-payment`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`.

---

## Etapa X.33 — Quitar curso de coach + ocultar ingresos brutos en panel coach

**`admin.html` (Tab Coaches → subtabla de cursos por coach):**

En la `.coach-courses-subtable` se agrega una columna extra al final de cada fila con un botón rojo "Quitar" (mismo estilo `btn-danger` que "Quitar rol", padding compacto 5px 10px y font-size 0.78rem). Llama a `quitarCursoCoach(coachId, courseId)` que pide confirmación nativa y hace `DELETE FROM coach_courses WHERE coach_id = X AND course_id = Y` directo (RLS de `coach_courses` permite al admin DELETE). En éxito → `loadCoaches()` para re-render. La función queda al lado de `quitarRolCoach` en el bloque de coaches.

**`coach.html` (Tab Ganancias):**

Se elimina la columna "Ingresos brutos" de la tabla en `loadGanancias()` — el coach ya no ve el revenue bruto del curso, solo Ventas + Comisión% + Su ganancia. La estructura de columnas pasa de **5 cols** (Curso, Ventas, Ingresos, Comisión, Tu ganancia) a **4 cols** (Curso, Ventas, Comisión, Tu ganancia). Razón: el monto que paga el alumno (`amount_paid`) puede tener cupones aplicados y no representa el ingreso "neto" que ve el coach — confunde más que ayuda.

**Ajuste de regla mobile asociado** (`@media (max-width: 600px)`): la regla que escondía `.gains-table th/td:nth-child(4)` se mueve a `nth-child(3)` para mantener el intent original (ocultar columna "Comisión" en mobile). Con la nueva estructura de 4 cols, `nth-child(3)` es la columna "Comisión" — antes era `nth-child(4)` cuando había 5. Si no se ajustaba, se escondía justo "Tu ganancia" en mobile (catastrófico).

El cálculo interno (`revenue = data.revenue > 0 ? data.revenue : data.count * priceArs` → `commission = revenue * commissionPct / 100`) **no cambia** — la fórmula sigue usando el revenue real para calcular la comisión, solo se omite el revenue del render. El box destacado en lima con "Total de ganancia del mes" sigue igual.

**Diagnóstico activo en `quitarCursoCoach`**: la función tiene `console.log` antes y después del DELETE + `.select()` encadenado al query para que PostgREST retorne las filas afectadas (`data: [...]`). Esto está en producción mientras se debuggea por qué el DELETE no estaba eliminando la fila. Una vez identificada la causa (probable RLS de `coach_courses` que no permite DELETE al admin desde el cliente), remover los logs y eventualmente migrar a una RPC SECURITY DEFINER si la RLS sigue bloqueando.

---

## Etapa X.34 — Histórico acumulado en panel coach (Tab Ganancias)

Debajo de la tabla mensual de `loadGanancias()` en `coach.html` se agrega un bloque "Histórico acumulado" que muestra:

- **Ganancia total acumulada** (suma de `amount_paid × commission_pct / 100` para todas las ventas paid+active de los cursos del coach, sin filtro de fecha).
- **Cantidad total de ventas históricas**.
- **Texto secundario**: "Desde el inicio hasta hoy".

**Implementación**: tras la query mensual y el render de la tabla, una segunda query `sb.from('user_courses').select('amount_paid, course_id').eq('payment_status','paid').eq('status','active').in('course_id', courseIds)` (sin `gte/lt enrolled_at`) trae todas las ventas históricas de los cursos asignados al coach. Se agrupa por `course_id` con el mismo patrón `salesByCourse`, y se suma `revenue × commissionPct / 100` para cada curso (usando el mismo fallback `revenue > 0 ? revenue : count × priceArs` que la tabla del mes para mantener consistencia cuando `amount_paid` viene en 0).

**Estilo**: nuevo CSS `.gains-historic-box` espejado de `.gains-total-box` (el del mes) pero con **borde violeta** (`rgba(123,79,190,0.45)`) en lugar de lime y monto en `var(--violet)` (`#7B4FBE`) en lugar de `var(--lime)`. Padding un poco más compacto (`24px 32px` vs `28px 32px`) y `margin-top: 24px` para separarlo de la tabla. Reusa `.gains-total-label` y `.gains-total-detail` para no duplicar tipografía.

**Posición en el DOM**: el box histórico se renderiza dentro del mismo `wrap.innerHTML` (`#gains-content`), justo después del `.card` con la tabla. No se modifica el `#gains-total-box` del mes (lime, sigue arriba del wrap) ni el selector mes/año.

---

## Etapa X.36 — Soporte por email (footer público + FAB alumnos)

Dos canales de contacto agregados, ambos apuntan a `mailto:ekapradacoach@gmail.com`:

**1. Footer de páginas públicas** (`index.html` + `venta-curso.html`):

Dentro del `.footer-bottom` se agrega `<p class="footer-support"><a href="mailto:ekapradacoach@gmail.com">✉ ¿Consultas? Escribinos</a></p>` entre el copyright y el "Hecho con ♥". CSS asociado: color base `#94A3B8` (gray-text de la paleta), hover `#C8E600` (lime), font-size 0.82rem, sin underline.

⚠️ Las páginas legacy `webinar-hipertrofia.html`, `carrera-hibrida.html`, `entrenamiento-hibrido.html`, `curso-webinar-hipertrofia.html`, `curso-carrera-hibrida.html`, `curso-entrenamiento-hibrido.html` son archivos de 14 líneas que sólo hacen un meta-refresh redirect a sus reemplazos dinámicos (`venta-curso.html?slug=...` / `curso.html?slug=...`). No tienen footer ni body real, por eso no se les agregó nada — el footer del destino ya cubre el caso.

**2. Botón flotante (FAB) en páginas de alumno** (`dashboard.html` + `curso.html`):

Botón `<a class="support-fab">✉</a>` con `position: fixed; bottom: 24px; right: 24px; z-index: 999`, círculo de 52px (48px en mobile), fondo `#C8E600`, ícono `#1E2A3A`, box-shadow suave con tinte lime. Hover: traslada -2px arriba + sombra más fuerte. Tooltip CSS puro (`::after` con `content: "¿Necesitás ayuda?"`) que aparece a la izquierda del botón en hover, fondo card-bg `#243042` con borde `#2f3e52`. Sin JS para el tooltip.

- **`dashboard.html`**: href estático `mailto:...?subject=Consulta%20HB%20Lab&body=Hola%2C%20tengo%20una%20consulta%20sobre...`.
- **`curso.html`**: href base estático en el HTML, pero se actualiza al cargar el curso (justo después de `document.title = ${course.title}`) usando `supportFab.href = mailto:...?subject=${encodeURIComponent('Consulta sobre ' + course.title)}&body=...`. Así el subject incluye dinámicamente el nombre del curso actual.

Las páginas legacy de curso (`curso-*.html`) son redirects de 14 líneas — el FAB no aplica.

`z-index: 999` queda por debajo del navbar (`z-index: 100` en dashboard, no — `100` < `999`; en realidad el FAB queda **por encima**) pero no interfiere con modales (z-index 1000+) ni el loading screen (z-index 300). El media query mobile reduce el botón a 48px y lo despega 16px del borde.

---

## Etapa X.37 — Sync del neto real de Mercado Pago en gestión

**SQL ejecutado** (manual, vía Supabase SQL editor):
```sql
ALTER TABLE public.user_courses ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
ALTER TABLE public.user_courses ADD COLUMN IF NOT EXISTS net_amount NUMERIC(10,2);
```

Dos columnas nuevas en `user_courses`:
- **`mp_payment_id TEXT`**: ID real del payment de Mercado Pago (lo que devuelve `payment.id` en el webhook). Se popula automáticamente en el UPSERT del branch MP de `process-payment`. Sirve para vincular cada venta con su transacción real en MP y poder sincronizar el neto.
- **`net_amount NUMERIC(10,2)`**: monto neto recibido por HB Lab post comisión MP + IIBB. Se popula manualmente cuando el admin hace click en "🔄 Sincronizar netos con MP".

**Cambios en `process-payment/index.ts`**: el `upsertPayload` del UPSERT a `user_courses` ahora agrega `mp_payment_id: external_ref` cuando `payment_method === 'mercadopago'`. (`external_ref` ya contenía `String(payment.id)` desde la normalización del webhook MP.) Para PayPal/cupón/manual no se setea (queda null), como corresponde.

**Nueva Edge Function `supabase/functions/sync-mp-payments/index.ts`** (`verify_jwt = true`). POST sin body. Verifica admin via JWT → SELECT `user_courses` WHERE `payment_method='mercadopago' AND mp_payment_id IS NOT NULL` → por cada fila hace `GET https://api.mercadopago.com/v1/payments/{mp_payment_id}` con `Authorization: Bearer ${MP_ACCESS_TOKEN}` → extrae `payment.transaction_details.net_received_amount` → UPDATE `user_courses.net_amount` donde `mp_payment_id` matchea. Retorna `{ ok: true, updated: N, errors: [{ mp_payment_id, error }] }`. Errores por fila (HTTP 4xx/5xx de MP, sin `transaction_details.net_received_amount` en la response, UPDATE fallido) se acumulan en el array `errors` sin abortar — el cliente loguea los errores y sigue. Sin paginación: si crece a miles de ventas habría que iterar en batches con `range()`. Secrets requeridos (ya configurados): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`. Entry en `config.toml`: `[functions.sync-mp-payments] verify_jwt = true`.

**Cambios en `admin.html` — Tab Gestión**:
- **Botón "🔄 Sincronizar netos con MP"** arriba del card de resultado neto (`<div>` con `btn-secondary` + `border: 1px solid lime; background: transparent; color: lime`). Al click llama `sb.functions.invoke('sync-mp-payments')`, deshabilita el botón, muestra "⏳ Sincronizando...", y al terminar muestra `✅ Sincronizados N pagos` (verde lime) o `Error: ...` (rojo) en un span al lado. Después del sync exitoso recarga `loadVentas()` y `loadResultadoNeto()` en paralelo para refrescar el card y la tabla.
- **`loadResultadoNeto()`**: usa `COALESCE(net_amount, amount_paid)` vía helper inline `effectiveAmount(r) = Number(r.net_amount != null ? r.net_amount : r.amount_paid || 0)`. Si la venta MP ya fue sincronizada → el neto real entra al cálculo de ingresos totales + revenue por curso (que feed comisiones de coaches). Si no → cae al bruto. Se aplica tanto al `totalARS` como al `salesMap[course_id].revenue`. La query a `user_courses` ahora selecciona también `net_amount`.
- **Tabla de ventas (`#tbody-ventas`)**: nueva columna **"Neto MP"** entre Monto y Moneda. Muestra `$X.XX` en lime si `net_amount != null`, o `—` en gris si no. Total de columnas ahora es **7** (antes 6); los `colspan` de las filas placeholder/empty/error/separador-mes se ajustaron a 7. La RPC `get_ventas()` no expone `net_amount` ni `mp_payment_id`, así que `loadVentas()` hace una side-query a `user_courses` (`select('enrolled_at, net_amount, mp_payment_id').eq('payment_status', 'paid')`) y construye un Map keyed por `enrolled_at` (timestamp con precisión de ms, virtualmente único por venta) para mergear los dos campos al shape de `_ventas`. Si en el futuro la RPC `get_ventas` se actualiza para devolver estos campos directamente, se puede eliminar el side-query.

**⚠️ Pendiente de deploy manual** tras este commit:
1. Re-deploy de `process-payment` (cambió el upsert para guardar `mp_payment_id`).
2. Deploy nuevo de `sync-mp-payments`: Supabase Dashboard → Edge Functions → New function → nombre `sync-mp-payments` → "Via Editor" → pegar contenido → Settings → activar "Enforce JWT verification". Sin secrets nuevos.

Sin estos deploys: las ventas MP nuevas no van a tener `mp_payment_id` (UPSERT funciona sin la nueva col porque es nullable), y el botón de sync va a fallar con 404 hasta que la función exista. El frontend ya está deployable y funciona con `mp_payment_id` null (la columna Neto MP muestra "—").

---

## Etapa X.38 — Drip + Lives por módulo + Precios programados (editor admin)

**SQL ejecutado** (manual):
```sql
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS public.course_lives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  live_url TEXT, live_date TIMESTAMPTZ, recording_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS scheduled_prices JSONB DEFAULT '[]'::jsonb;
```

Modelo nuevo:
- **`course_modules.unlock_at TIMESTAMPTZ`** (nullable) — fecha/hora de desbloqueo del módulo (drip). NULL = disponible siempre.
- **`course_lives (id, module_id, live_url, live_date, recording_url, created_at)`** — relación 0..1 por módulo. Para link Meet/Zoom previo + grabación post-live. FK `ON DELETE CASCADE`. **⚠️ Sin RLS configurada todavía** — la tabla queda public-readable; falta `ENABLE ROW LEVEL SECURITY` + policies antes de prod.
- **`courses.scheduled_prices JSONB DEFAULT '[]'`** — array `[{date: 'YYYY-MM-DD', price_ars: N, price_usd: N}]`. A partir de cada fecha el curso pasa a ese precio.

**`admin.html`** (editor de cursos, course_type='modules'):
- Cada `.cf-module-card` tiene ahora un bloque `.cf-mod-meta` con: input `datetime-local` para `unlock_at`, toggle "¿Tiene live?" + (cuando activo) fields `live_date` (datetime-local) + `live_url` (text). El id del live preexistente se persiste en `card.dataset.liveId`, y `recording_url` en `card.dataset.liveRecording` (no editable desde admin — pensado para subirse desde coach panel post-live).
- `loadStudentModules`-equivalente (`loadModulesForCourse`) hace SELECT paralelo de `course_lessons` + `course_lives` y mergea por `module_id`.
- `syncCourseModules` ahora hace UPSERT del módulo con `unlock_at`, y al final del loop sync de `course_lives`: si `has_live && live` → UPDATE (con id) o INSERT (sin id); si no → DELETE por `module_id` (idempotente).
- **Sección "Precios programados"** en wizard step 1, debajo de Precio USD. Filas `[date | price_ars | price_usd | ×]` + botón "+ Agregar". Funciones: `addSchedPriceRow`, `getSchedPricesFromForm` (ordena ASC, descarta sin fecha), `renderSchedPriceRows` (tolerante string JSON). `loadCursos` + `editCurso` + `saveCurso` + `resetCursoForm` wired.

---

## Etapa X.39 — Precio vigente en venta-curso.html

Helper `getEffectivePrice(course)` que aplica `scheduled_prices`: filtra entradas con `date <= today` (formato `YYYY-MM-DD` en zona local del cliente), ordena DESC y toma la primera; si ninguna es vigente o `scheduled_prices` está vacío → precios base. Tolera string JSON. SELECT del init + MutationObserver extiende con `scheduled_prices`. Render hero/CTA usa `effective.price_ars/usd`. `_ventaCourse` se cachea con precios vigentes ya aplicados (auto-open `?buy=1` se movió al init porque el observer ya no entra al re-query branch).

**Pendiente:** `checkout.html` aún lee precio base — riesgo de inconsistencia. Edge Functions también — vector de manipulación si el cliente manda precio base estando un scheduled activo.

---

## Etapa X.40 — getEmbedUrl: soporte de URLs Drive + YouTube en curso.html

Helper `getEmbedUrl(url)` que detecta:
- **YouTube** (`youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`) → `https://www.youtube.com/embed/ID` (matcher unificado).
- **Google Drive** (`drive.google.com/file/d/ID/...`) → `https://drive.google.com/file/d/ID/preview` (única variante embed-friendly; `/view` deniega iframe).
- **Vacío** → string vacío.
- **Cualquier otro link** → tal cual.

Aplicado en los 2 iframes del player de `curso.html`: `renderVideos()` (modo videos sueltos + live recordings) y `renderModulesView()` (modo módulos). `toYoutubeEmbed` se mantiene porque sigue usado en admin al guardar (matcher estricto solo-YouTube).

---

## Etapa X.41 — getEffectivePrice en index.html (cards de landing)

Copia textual de `getEffectivePrice` desde venta-curso.html, colocada junto a `escHtml`. Aplicada en 3 sitios:
1. `loadCursos()` — grid principal.
2. `loadLaunches()` — slider de lanzamientos (JOIN extendido a `courses(..., scheduled_prices)`, guard si el launch no tiene curso asociado).
3. `renderCountdownCourseCard()` — card del curso vinculado al countdown.

**Pendientes documentados:** sección "Próximamente" (semántica ambigua, sin tocar); centralizar `getEffectivePrice` en `supabase.js` (hoy hay 2 copias literales, sumará una 3ra cuando se aplique a checkout.html); aplicación server-side en Edge Functions.

---

## Etapa X.42 — Lives por módulo en curso.html (cierre del feature drip/lives)

Visualización del lado alumno. `loadStudentModules` extendido para traer `course_lives` en paralelo y mergear. Tres estados por módulo (bloque entre `.modules-mod-head` y `.modules-lessons`):

1. **Live futura** (`live_date > now`) → botón lime "📡 Unirse al live" (target `_blank`) + fecha formateada (`Jue 23 May · 19:30` en zona local).
2. **Pasada con grabación** → botón violet "▶ Ver grabación" que reproduce en el panel principal vía global `_liveOverride = { moduleId, title, src }`. El main panel checkea ese flag al inicio del render: si está set, ignora la lección activa y muestra `<iframe>` con `getEmbedUrl(_liveOverride.src)` + título `"🔴 {módulo} — Grabación"`. Sin botón "Marcar completado" y sin materiales (no es una lección).
3. **Pasada sin grabación** → texto italic gris "⏳ Grabación próximamente".
4. **Sin live** → nada.

`selectLesson(lessonId)` limpia `_liveOverride = null` — el alumno vuelve del modo grabación a una lección con un click. Las lecciones en el sidebar se marcan `active` solo si `!_liveOverride` (evita highlight confuso).

Helpers nuevos: `formatLiveDate(iso)`, `renderModuleLiveInfo(m)`, `playLiveRecording(moduleId)`. CSS nuevo: `.modules-mod-live` con variantes `.recording` (violet) / `.pending` (gray) — borde-left color-coded + bg soft + botones `.btn-live-join` (lime) / `.btn-live-recording` (violet).

**Pendientes:** notif pre-live, tracking de asistencia al click, marcar grabación como completada (afectar `video_progress`), edición de `recording_url` desde admin/coach, RLS de `course_lives`, render del live en `course_type='videos'`/`'live'` (legacy).

### Etapa X.42b — Placeholder para lecciones sin video

Fix UX: si la lección activa no tiene `video_url`, en lugar de mostrar un `<iframe>` vacío (que se ve negro), se renderiza un `.no-video-placeholder` (card con borde dashed + texto italic "📄 Esta lección aún no tiene video cargado"). En ese caso también se oculta el botón "Marcar como completado" — solo aparece cuando hay video real.

---

## Etapa X.43 — Drip de módulos en curso.html (aplicación de unlock_at)

Cierre del feature drip: el alumno ya ve módulos bloqueados según `course_modules.unlock_at`. Helpers nuevos `isModuleLocked(m)` y `formatUnlockDate(iso)` (formato `"lunes 6 de junio"` via `toLocaleDateString('es-AR', { weekday, day, month })` con fallback manual). Global `_lockedView = { moduleId, unlock_at, title } | null` mutuamente excluyente con `_liveOverride`.

**Sidebar — módulo bloqueado**: head con 🔒 antes del título, sin `.modules-lessons`, sin bloque de live, sin flecha, opacidad 0.55, cursor not-allowed. Click → `showLockedModule(m.id)`.

**Main panel — prioridad** `_lockedView > _liveOverride > lección activa`. Branch nuevo: `.locked-module-panel` con ícono 🔒 grande + "Este módulo estará disponible el **{fecha}**" + "Vas a recibir una notificación cuando se habilite."

**Fix default**: `activeLessonId` ahora defaultea a la primera lección de un módulo NO bloqueado (filtro vía `lockedModIds` Set). Evita filtrar contenido por defaultear a una lección de módulo locked.

**Pendientes**: notif automática cuando se desbloquea, enforcement server-side (hoy es soft-lock cliente — un user técnico puede leer `video_url` de `MODULES`), auto-refresh cuando pasa la fecha sin recargar, indicador "se desbloquea en X días".

---

## Etapa X.44 — Asistencia a lives + certificado por módulo

**Convención de identificación** (sin migración nueva): la asistencia a live de un módulo se guarda en `video_progress.video_index = -1 * order_num` (signo negativo para no colisionar con lecciones reales que usan índices ≥ 0).

**5 estados del bloque de live en `curso.html`** (`renderModuleLiveInfo`): futura/asistida o no, pasada/asistida o no, con/sin grabación. Botón `✅ Asistí al live` (lime soft) cuando aplica, badge "✅ Asististe a este live", o "⏳ La grabación estará disponible en las próximas 72hs".

**Main panel — `_liveOverride` activo**: si el alumno está viendo la grabación de un live no asistido, aparece `<button class="btn-video">Marcar como completado</button>` debajo del iframe.

**`updateProgress` rediseñado**:
- `realCount = [...completedSet].filter(i => i >= 0).length` — los índices negativos (asistencias) no inflan el % de la barra.
- Cert gate en modo módulos: `areAllModulesCompleted()` (loose — un módulo se considera completo si tiene ≥1 lección hecha O el live asistido O no tiene ni lecciones ni live). En no-módulos sigue siendo `pct >= 100`.
- Trade-off documentado: alumno con todos los lives asistidos + 1 lección por módulo → barra al 30% pero cert visible (matches spec).

**Load inicial de `video_progress`**: ahora acepta también `idx < 0` para cargar asistencias previas.

**Pendientes**: tabla `live_attendance` dedicada (hoy reusamos `video_progress` con índices negativos), validación server-side de asistencia (el botón es self-reportado), cancelar asistencia (hoy es solo forward), copy de "72hs" hardcoded.

---

## Etapa X.45 — Finalizar live (live_ended) — coach/admin + gate de asistencia

**SQL ejecutado**:
```sql
ALTER TABLE public.course_lives ADD COLUMN IF NOT EXISTS live_ended BOOLEAN DEFAULT FALSE;
```

Cambia el control del flujo de asistencia: antes el botón "✅ Asistí al live" aparecía con `live_date > now` (raro: el alumno marcaba ANTES de que empezara). Ahora aparece SOLO cuando el coach finaliza explícitamente el live (`live_ended = true`).

**`coach.html` (tab Mi curso → módulos)**: cada `.mod-card` con live `live_date <= now` muestra arriba un `.coach-live-status`:
- `!live_ended` → botón **🔴 Finalizar live** (coral `#fc8181`) + meta "Live realizado el {fecha}".
- `live_ended` → badge **✅ Live finalizado** (lime) + "Realizado el {fecha}".
- Futuro o sin live → nada.

`loadCoachModulesForCourse` hace `Promise.all` con lessons + lives. `addCoachModuleRow(modId, title, lessons, live)` recibe el cuarto arg. Helpers nuevos `renderCoachLiveStatus`, `formatCoachLiveDate`, `finalizarLive(liveId, btn)` (confirm → UPDATE → reemplaza bloque inline).

**`admin.html` (wizard de cursos)**: espejo en `addModuleRow`. Críticamente, `live_ended` se persiste en `card.dataset.liveEnded` y se incluye en el `livePayload` del sync — sino un "Guardar curso" posterior pisaría el flag a false con el default de la columna.

**`curso.html` (alumno)**: SELECT extendido con `live_ended`. Nuevo gate `isFuture || !ended` en `renderModuleLiveInfo` — el alumno solo ve "📡 Unirse al live" + fecha hasta que el coach finalice. Recién después se habilitan asistencia / grabación / badges.

**Pendientes**: RLS de `course_lives` (sigue pendiente desde X.38), reabrir live finalizado, notif al alumno cuando se finaliza, auto-finalize tras X horas.

---

## Etapa X.46 — Sección "Clase en vivo" del coach rediseñada (lives por módulo)

Reemplazo completo de `loadLiveSection` en `coach.html`. **Antes** leía `courses.is_live` + `courses.live_url` + `courses.recording_url` (legacy: un único live por curso, modelo de Sesiones 37–40). **Ahora** consulta `course_lives` filtrado por los módulos del curso actual y lista cada live independientemente.

**Flujo:**
1. SELECT `course_modules` del curso (id, title, order_num).
2. Si no hay módulos → "No hay lives configurados para este curso."
3. SELECT `course_lives` `.in('module_id', modIds)`.
4. Si no hay lives → mismo mensaje.
5. Sort por `order_num` del módulo padre.
6. Render por live: card con título del módulo + fecha formateada (`toLocaleString('es-AR', { weekday, day, month, year, hour, minute })`) + link al `live_url` si existe + acción según estado.

**Estados:**
- `!live_ended && live_date <= now` → botón **🔴 Finalizar live**.
- `!live_ended && live_date > now` → texto gris italic "⏳ Live programado".
- `live_ended` → texto verde "✅ Live finalizado" + `<input type="url">` con la `recording_url` actual (placeholder admite YouTube o Drive) + botón "Guardar grabación".

**Funciones nuevas:**
- `finalizarLiveAndReload(liveId, btn)` — diferencia con el `finalizarLive` de la sección Módulos: tras UPDATE recarga toda la sección para que aparezca el input de grabación. (La sección Módulos hace reemplazo inline porque el contexto es distinto.)
- `saveLiveRecording(liveId, btn)` — UPDATE `course_lives.recording_url`. Feedback "✅ Guardado" 1.5s tras éxito, luego vuelve al label original.

**Decisión:** la sección legacy para `course_type='live'` (con `courses.live_url` + `live_completed` + `recordings JSONB`) queda **deprecada del lado coach**. Si en el futuro hay un curso legacy de ese tipo, el coach no verá nada útil ahí — la edición sigue disponible desde admin si hace falta. Las funciones `finalizarClase` y `addRecRow`/`renderRecRows`/`saveRecordings` siguen en el código por compat pero ya no se invocan.

**Pendientes:** RLS de `course_lives` (UPDATE de `recording_url` lo hace cualquier authenticated cliente con el id — falta policy `role IN ('coach','admin') AND assigned`), notif al alumno cuando se sube la grabación, validación del formato de URL (hoy se acepta cualquier string como recording_url).

---

## Etapa X.47 — Fix flujo de asistencia al live (curso.html)

Bug observado: cuando el coach finalizaba el live (`live_ended=true`), había estados en que el alumno veía "✅ Asististe a este live" sin haberlo marcado. Causa raíz: el render de `renderModuleLiveInfo` mezclaba múltiples ramas (futura/pasada/con grabación/sin grabación) y el resultado era difícil de auditar — además, el load inicial de `video_progress` se saltaba completamente cuando el módulo no tenía lecciones (solo live), dejando estados inconsistentes entre `markLiveAttended` (que actualizaba `completedSet` en memoria) y la siguiente recarga.

**Spec simplificada — 3 estados solamente:**

| Condición | Render |
|---|---|
| `!live.live_ended` | `return ''` (nada — ni botón, ni texto, ni link al meet) |
| `live_ended && !attended` | botón lime **"✅ Asistí al live"** que dispara `markLiveAttended` |
| `live_ended && attended` | texto verde **"✅ Asististe a este live"** (sin botón) |

`attended` = `completedSet.has(liveAttendanceIndex(m))` — viene **ÚNICAMENTE** de `video_progress.video_index` (no hay ningún campo en `course_lives` que indique asistencia del alumno actual).

**Cambios concretos:**

- **`renderModuleLiveInfo` rediseñado** — pasó de 5 ramas (futura, pasada-no-finalizada, con/sin grabación, asistió/no asistió) a 3 ramas explícitas. Sale temprano con `return ''` si `!live_ended`. **Se removió** del render del live block:
  - Botón "📡 Unirse al live" + fecha futura (estaban pre-finalización).
  - Bloque "▶ Ver grabación" + "Grabación del {fecha}".
  - Texto "⏳ La grabación estará disponible en las próximas 72hs".
  - Badge superpuesto al "Ver grabación".

  Las funciones `playLiveRecording` + `_liveOverride` quedan en el código sin caller actual desde el sidebar (no se eliminaron por seguridad — futuras etapas pueden re-conectar la grabación a otro UI).

- **Load inicial de `video_progress` ampliado** — antes: `if (LESSONS_FLAT.length)`. Ahora: `if (LESSONS_FLAT.length || MODULES.length)`. Garantiza que las asistencias previas a lives (índices negativos) se carguen aunque el módulo no tenga lecciones, evitando el desfase entre el estado en memoria post-mark y la recarga.

**Fuente de verdad documentada en código** (comentarios `Etapa X.47`): el render comenta explícitamente "se determina ÚNICAMENTE consultando completedSet, que se hidrata al cargar el curso desde video_progress". El load comenta "Este SELECT es la ÚNICA fuente de verdad para `attended` — no hay campo en course_lives que indique asistencia del alumno actual."

**Pendientes:** decidir si se restaura el "Ver grabación" en algún punto del UI (admin pidió simplificación absoluta; si la grabación reaparece, debería ser fuera del live block para no mezclar conceptos). Limpieza eventual de `playLiveRecording` + `_liveOverride` + branch del main panel si efectivamente quedan sin uso a futuro.

---

## Etapa X.48 — Restaurar "Unirse al live" para fecha futura

Fix de la simplificación de X.47 que había removido completamente el botón "📡 Unirse al live". Ese botón debe seguir apareciendo para `live_date > now`, independientemente de `live_ended`.

**Spec actualizada — 4 estados:**

| Condición | Render |
|---|---|
| `live_date` futura | **"📡 Unirse al live"** + fecha formateada. `live_ended` se ignora. |
| `live_date` pasada + `!live_ended` | `return ''` (nada — coach no cerró) |
| `live_date` pasada + `live_ended` + `!attended` | botón lime **"✅ Asistí al live"** |
| `live_date` pasada + `live_ended` + `attended` | texto verde **"✅ Asististe a este live"** |

**Cambios en `renderModuleLiveInfo`** (curso.html):

- Branch `isFuture` arriba de todo, antes del check de `live_ended`. Renderiza `.btn-live-join` (lime) abriendo `live.live_url` en target `_blank` + meta con `formatLiveDate(live.live_date)`.
- Si no es futura → cae a la lógica de asistencia de X.47: nada si `!live_ended`, botón o badge según `attended`.

`formatLiveDate` y el botón `.btn-live-join` ya existían desde Etapa X.42; esta etapa solo restaura el branch que los usa.

**Pendiente:** decidir el manejo de "live en curso" (entre `live_date` y `live_date + duración estimada`) — hoy queda categorizado como "pasada" tras el segundo cero. Si el coach no finaliza inmediatamente, el alumno deja de ver "Unirse al live" pero tampoco ve el botón asistir todavía. Podría sumarse una ventana de gracia (ej. 3h post-live_date sigue mostrando "Unirse").

---

## Etapa X.49 — Fix: módulos con solo live (sin lecciones) en curso.html

Regresión introducida en X.47 cuando se habilitó el caso "módulo solo con live, sin lecciones". El `renderModulesView` mantenía un guard temprano:

```js
if (!LESSONS_FLAT.length) {
  container.innerHTML = `<div class="no-videos-msg">📚 Este curso aún no tiene módulos cargados.</div>`;
  return;
}
```

El problema: ese guard se basa en `LESSONS_FLAT` (lista plana de lecciones), no en `MODULES`. Para un curso cuyos módulos tienen ÚNICAMENTE un live (cero lecciones), `LESSONS_FLAT` queda vacío aunque `MODULES` tenga items. Resultado: el alumno ve el mensaje "Este curso aún no tiene módulos cargados" en vez de la sidebar con los módulos + sus bloques de live.

**Fix** (curso.html — `renderModulesView`):

```js
// Bailear SOLO si no hay ni módulos ni lecciones.
if (!MODULES.length && !LESSONS_FLAT.length) {
  container.innerHTML = `<div class="no-videos-msg">📚 Este curso aún no tiene módulos cargados.</div>`;
  return;
}
```

El resto del render sigue funcionando porque ya manejaba el caso `activeLessonId = null` (cuando `availableLessons[0]?.id` es undefined) — el main panel cae al placeholder "Seleccioná una lección" mientras el alumno usa el sidebar para clickear un live.

**Por qué no era visible antes**: hasta X.47 los cursos siempre tenían lecciones (los lives eran un complemento). Recién al agregar el caso "módulo solo live" — que es lo que el coach está armando en este curso — apareció el bug.

`loadStudentModules` no necesitó cambios: la query a `course_modules` ya retorna los módulos correctamente; el JOIN a `course_lives` funciona aunque `course_lessons` esté vacío para ese `module_id`. La regresión era 100% en el render.

---

## Etapa X.50 — Módulos del alumno: logging + normalización + fallback visible

Bug reportado: tras X.49, los módulos del alumno (curso.html) aparecen en el sidebar pero al expandirlos el contenido queda vacío — no se ven ni las lecciones ni el bloque de live. El panel coach sí muestra todo correctamente.

**Diagnóstico**: el render del módulo arma `lessonsHtml` desde `m.lessons` y `liveHtml` desde `renderModuleLiveInfo(m)`. Si ambos terminan vacíos (`m.lessons.length===0` y el live no cae en una de las ramas con texto), el módulo se ve hueco. Las causas posibles son:

1. **RLS** bloquea `course_lessons` / `course_lives` para el rol del alumno (la query no tira error visible pero retorna `[]`).
2. **Mismatch de UUID** en el merge JS por `module_id` (improbable porque postgres devuelve UUIDs lowercase, pero defensivo no daña).
3. **Combinación válida pero sin contenido visible**: live pasada + `!live_ended` (que por spec X.48 retorna ''), módulo sin lecciones → render legítimamente vacío.

**Fixes aplicados (curso.html):**

- **Logging explícito en `loadStudentModules`**: cada query (`course_modules`, `course_lessons`, `course_lives`) ahora destructura `{ data, error }` y hace `console.error` si hay error. Al final loguea un resumen `[loadStudentModules] { modulos, lecciones, lives, modIds }` para que el usuario pueda abrir la consola y ver exactamente qué se cargó. Esto destraba el debugging de RLS.
- **Normalización defensiva de `module_id`**: helper `norm(v) = String(v ?? '').trim().toLowerCase()` aplicado al mergear `lessonsByMod[k]` y `liveByMod[k]`. Es no-op en la mayoría de casos (postgres devuelve UUIDs lowercase + sin espacios), pero garantiza que cualquier mismatch sutil se evite.
- **Fallback visible en `renderModulesView`**: si un módulo tiene `lessons.length === 0` Y `renderModuleLiveInfo(m)` retorna `''`, en lugar de un `<div class="modules-lessons">` vacío se renderiza `<div class="modules-empty-hint">Sin contenido disponible todavía.</div>`. Italic + gris. Así el alumno entiende que el módulo está sin contenido y no parece un bug.

**Próxima diagnosis posible (no resuelta acá):** si los console.log muestran `lecciones: 0` cuando sí hay lecciones en BD, es RLS. Solución: ya sea (a) agregar policy de SELECT a `course_lessons` para `authenticated` con join a `user_courses.payment_status='paid'`, (b) crear RPC SECURITY DEFINER `get_student_modules(p_course_id)` que bypasea RLS. Mismo análisis para `course_lives`.

---

## Etapa X.51 — Fix definitivo: 3 queries separadas en `loadStudentModules`

Continuación del bug de X.49/X.50 en `curso.html`. Tras X.49 los módulos se rendereaban pero sus lecciones aparecían como "Sin contenido disponible todavía" — el JOIN/asociación cliente entre `course_modules` y `course_lessons` no estaba mergeando las lecciones al módulo.

**Cambio**: rewrite limpio de `loadStudentModules` con la estructura canónica:

```js
// 1) Módulos (sequential — necesitamos moduleIds antes que el resto)
const modulesRes = await sb.from('course_modules')
  .select('id, title, order_num, unlock_at')
  .eq('course_id', courseId)
  .order('order_num');
const modules   = modulesRes.data || [];
const moduleIds = modules.map(m => m.id);

// 2) Lecciones + Lives en PARALELO (Promise.all)
const [lessonsRes, livesRes] = await Promise.all([
  sb.from('course_lessons').select('id, module_id, title, video_url, order_num').in('module_id', moduleIds).order('order_num'),
  sb.from('course_lives').select('id, module_id, live_url, live_date, recording_url, live_ended').in('module_id', moduleIds),
]);

// 3) Asociación por module_id (sin normalización adicional — postgres devuelve UUIDs ya consistentes)
const lessonsByModule = {};
lessons.forEach(l => {
  if (!lessonsByModule[l.module_id]) lessonsByModule[l.module_id] = [];
  lessonsByModule[l.module_id].push(l);
});
const liveByModule = {};
lives.forEach(l => { liveByModule[l.module_id] = l; });

return modules.map(m => ({
  ...m,
  lessons: lessonsByModule[m.id] || [],
  live:    liveByModule[m.id]    || null,
}));
```

**Diferencia con X.50:**
- Se eliminó la normalización `norm(v) = String(v ?? '').trim().toLowerCase()` que aplicaba al `module_id` antes del map. Era defensiva pero introducía complejidad innecesaria — postgres devuelve UUIDs en formato canónico y los IDs son comparables directamente.
- Estructura más limpia: variables `modulesRes/lessonsRes/livesRes` y `modules/moduleIds` con nombres explícitos, fácil de auditar.
- Logging mantenido (`console.error` por query + `console.log('[loadStudentModules]', { ... })`) para que el debugging futuro siga visible en consola.

Lógica de drip (`unlock_at`), lives por módulo y render de lecciones **no cambia** — solo la forma de cargar y mergear datos.

Si el bug **persiste** después de este fix, la causa más probable es **RLS** bloqueando `course_lessons` o `course_lives` para el rol del alumno (las queries no tiran error pero retornan `[]`). Próxima solución: agregar policies o crear RPC SECURITY DEFINER `get_student_modules(p_course_id)`.

---

## Etapa X.52 — Render del módulo: live siempre visible cuando existe el record

Bug observado tras X.51: un módulo con live pero **sin lecciones** seguía mostrando "Sin contenido disponible todavía" en lugar del bloque del live. Causa: la condición del empty-hint usaba `!liveHtml` (resultado del render), no `!m.live` (presencia del record). Si `renderModuleLiveInfo(m)` retornaba `''` en un estado puntual (ej. pasada + `!live_ended`), el render del módulo caía al hint aunque hubiera un live cargado.

**Estructura correcta** (curso.html — `renderModulesView`):

```js
const hasLive    = !!m.live;
const hasLessons = lessons.length > 0;

let innerHtml;
if (!hasLive && !hasLessons) {
  innerHtml = '<div class="modules-empty-hint">Sin contenido disponible todavía.</div>';
} else {
  innerHtml = `${liveHtml}${hasLessons ? `<div class="modules-lessons">${lessonsHtml}</div>` : ''}`;
}
```

**Reglas:**
- Si `m.live` existe → siempre se inyecta `liveHtml` en el body. El contenido depende de la lógica de 4 estados ya implementada en `renderModuleLiveInfo` (Etapa X.48). Si esa lógica retorna `''` (por ej. live pasada + coach no finalizó), el módulo queda visualmente vacío pero NO muestra el mensaje engañoso "Sin contenido".
- Si hay lecciones → `<div class="modules-lessons">` solo se inserta cuando `hasLessons === true`. Antes se inyectaba siempre (vacío cuando no había lecciones) — ahora se omite.
- El empty-hint solo aparece cuando NO hay live AND NO hay lecciones.

Sin cambios en `renderModuleLiveInfo` ni en `loadStudentModules` — el fix es 100% en cómo el render combina los outputs.

---

## Etapa X.53 — `saveLiveRecording` en coach.html: normalización + diagnóstico

Bug reportado: `saveLiveRecording(liveId, btn)` en la sección "Clase en vivo" del coach panel fallaba silenciosamente. La hipótesis inicial (`currentCourseId` null) era incorrecta — la función no usa `currentCourseId`: el UPDATE es directo sobre `course_lives WHERE id = liveId` y no necesita el `course_id` del padre. Pero la falla silenciosa existía por otra causa: el cliente Supabase no reporta error cuando un UPDATE matchea 0 filas (caso típico de RLS bloqueando), y antes no había forma de detectarlo desde el coach.

**Fixes aplicados (coach.html):**

- **Nueva función `getEmbedUrl(url)`** — espejo de la de curso.html (Etapa X.40). Normaliza URLs YouTube (`watch?v=ID` / `youtu.be/ID` / `embed/ID` → `https://www.youtube.com/embed/ID`) y Drive (`file/d/ID/...` → `https://drive.google.com/file/d/ID/preview`). Cualquier otra URL se devuelve tal cual; vacío → `''`.
- **`saveLiveRecording` rediseñado**:
  - Aplica `getEmbedUrl(rawUrl)` ANTES del UPDATE → la URL guardada en BD es la canónica embed. El input se actualiza con la URL normalizada como feedback visual.
  - `.update(...).eq('id', liveId).select()` — el `.select()` encadenado retorna las filas afectadas. Si `data.length === 0`, sabemos que el UPDATE no impactó ningún registro (RLS bloqueando o liveId inválido). Antes el cliente reportaba "success" sin error y el coach pensaba que se había guardado.
  - Manejo explícito de los 4 casos: faltan args (warn), input no encontrado (warn), `error` de Supabase (alert + revert), 0 filas afectadas (alert + revert + log con liveId), éxito (✅ Guardado + setTimeout para volver al label).
  - `console.log('[saveLiveRecording]', { liveId, rawUrl, embedUrl })` antes del UPDATE para diagnóstico en consola.
- **Verificado**: `saveLiveRecording` NO usa `currentCourseId`. La función es self-contained — solo necesita el `liveId` que viene del onclick generado en `loadLiveSection` y la URL del input que vive en la misma `.live-row`.

**Verificación del selector `#mi-curso-sel`**: el handler `onCursoChange()` → `loadCursoCompleto(courseId)` → `currentCourseId = courseId`. El curso activo queda seteado correctamente al cambiar el select. Esto no afecta a `saveLiveRecording` (que no lo usa), pero sí afecta a `loadLiveSection` que se invoca dentro de `loadCursoCompleto` y necesita `currentCourseId` para traer los módulos del curso. Ese flujo ya funciona.

**Próximo paso si el UPDATE sigue retornando 0 filas:** verificar policies de RLS en `course_lives`. Hoy la tabla está sin RLS configurada (heredado de X.38) — el UPDATE debería pasar por la policy default `authenticated` que en Supabase es bastante permisiva. Si está bloqueado, el log dirá explícitamente "UPDATE retornó 0 filas".

---

## Etapa X.54 — Rewrite limpio de lives en curso.html (4 estados, sin "Asistí al live")

Rewrite total de la lógica de lives en el panel del alumno. Reemplaza las iteraciones X.44/X.47/X.48/X.52 con una versión simple y consistente: el live es un "ítem completable más" del módulo, gestionado con el mismo mecanismo de `video_progress` que las lecciones, sin terminología paralela de "asistencia".

### Spec implementada — 4 estados

| Condición | UI en el sidebar |
|---|---|
| `live_date` futura | Link destacado **"📡 Unirse al live"** (lime, abre meet en pestaña nueva) + fecha/hora formateada |
| `live_date` pasada + `!live_ended` | **Nada** (coach todavía no cerró) |
| `live_ended` + `!recording_url` | Texto "⏳ La grabación estará disponible en las próximas 24-72hs" + botón **"✅ Marcar como completado"** |
| `live_ended` + `recording_url` | **Video embed inline** (vía `getEmbedUrl` — soporta YouTube y Drive) + botón **"✅ Marcar como completado"** |

Si el alumno ya marcó completado en estado 3 o 4 → el botón pasa a `Completado` disabled con checkmark (mismo look que lecciones completadas).

### Mecanismo de completado

El botón "Marcar como completado" usa el MISMO mecanismo que `markLessonComplete`: UPSERT a `video_progress` con `completed=true`. Diferencia: el `video_index` se deriva del `course_lives.id` (UUID) mediante un hash determinístico:

```js
function liveCompletionIndex(liveId) {
  // djb2 → entero positivo en rango [10^9, 10^9 + 2^31].
  // Mismo liveId → mismo índice. Offset 10^9 evita colisión con índices de
  // lecciones (que son 0..N-1, típicamente < 1000).
  let h = 5381;
  for (let i = 0; i < liveId.length; i++) { h = ((h << 5) + h) + liveId.charCodeAt(i); h = h | 0; }
  return Math.abs(h) + 1000000000;
}
```

**Justificación**: la columna `video_progress.video_index` es INTEGER (no TEXT), por lo que no podemos guardar el UUID literal. El hash determinístico cumple la semántica que pidió la spec ("usar como video_index el id del live") sin requerir migración. Si en el futuro se migra `video_index` a TEXT, se reemplaza `liveCompletionIndex(liveId)` por `liveId` directo sin cambiar nada más.

### Lógica del certificado

```js
function isModuleCompleted(m) {
  // Módulo vacío (sin lecciones ni live) → considerado completo (no bloquea cert).
  if (!hasLive && !hasLessons) return true;
  // Cualquier lección o el live completados → módulo completo.
  if (hasLive && isLiveCompleted(m.live)) return true;
  if (hasLessons && m.lessons.some(l => completedSet.has(LESSON_IDX_BY_ID[l.id]))) return true;
  return false;
}
function areAllModulesCompleted() { return MODULES.every(isModuleCompleted); }
```

Spec: "El certificado se habilita cuando todos los módulos tienen al menos una entrada completed=true en video_progress — sin distinción de si es lección o live." Implementado literal: el módulo se chequea por OR (lección completada **o** live completado).

### Carga inicial de `video_progress`

Simplificada — antes filtraba por rango (`idx >= 0 && idx < LESSONS_FLAT.length` o `idx < 0` para legacy). Ahora acepta TODOS los índices enteros; los checks `completedSet.has(...)` discriminan por el origen (LESSON_IDX_BY_ID[lessonId] vs liveCompletionIndex(liveId)).

### Limpieza de código legacy

Removidas estas funciones y variables (residuos de X.42–X.48):
- `liveAttendanceIndex(m)` — la convención `video_index = -1 * order_num` se descarta.
- `isLiveAttended(m)` / `markLiveAttended(moduleId)` — reemplazadas por `isLiveCompleted(live)` / `markLiveCompleted(liveId)`.
- `_liveOverride` (global) + `playLiveRecording(moduleId)` — el video del live ya no consume el main panel; se embebe inline en el sidebar.
- Branch del main panel `else if (_liveOverride) { ... }` — removido. `selectLesson` ya no necesita limpiar `_liveOverride`.
- Botones CSS `.btn-live-attended` / `.btn-live-recording`, badge `.live-attended`, modifier `.attended-only` — todos sin caller.
- `renderModuleLiveInfo` reescrito de cero con los 4 estados nuevos.

### CSS nuevo

- `.live-recording-embed` — wrapper aspect-ratio 56.25% (16:9) con iframe inline. Bg negro, border-radius 6px. Pensado para sidebar de 290px → embed de ~280×158px.
- `.modules-mod-live-actions` — wrapper flex para el botón "Marcar como completado".
- `.modules-mod-live-actions .btn-video` — padding compacto (6px 12px) y font 0.78rem, para que el botón no domine el bloque.

### Lo que NO se hizo

- **Migración de `video_index` a TEXT**: pragmático mantener INTEGER + hash hoy. Si crece la cantidad de lives y la coincidencia de hash empieza a importar (probabilidad despreciable), migrar.
- **Cancelar completado del live**: una vez marcado, no se desmarca desde el UI. Igual que con lecciones.
- **Notificación al alumno cuando el coach sube la grabación**: la grabación aparece inline al recargar; sin push real-time.

---

## Etapa X.55 — Live como ítem clickeable del sidebar (refactor X.54)

Refactor de X.54 que había metido el video del live + el botón "Marcar como completado" **embebido inline en el bloque del sidebar**. UX inconsistente con las lecciones (que usan: sidebar = lista clickeable; main panel = contenido). Ahora el live se comporta exactamente como una lección: una fila clickeable en el sidebar, contenido completo en el panel principal derecho.

### Estructura del sidebar

Dentro de `.modules-lessons` de cada módulo, **antes** de las lecciones, se agrega una fila `<button class="modules-lesson modules-live-row">` con:
- `<span class="modules-lesson-check">` con `📡` (o `✓` si está completado, badge lime).
- `<span class="modules-lesson-title">Clase en vivo</span>`.
- `active` cuando `activeLiveId === live.id`.

Helper `renderModuleLiveRow(m)` devuelve este HTML, o `''` si el módulo no tiene live. Patrón análogo a `lessons.map(...)`.

### Estructura del panel principal

Branch nuevo en `renderModulesView`: `priority _lockedView > activeLiveId > activeLessonId`. Cuando `activeLiveId` está set, llama `renderLiveMainPanel(live)` que retorna 4 variantes según estado:

| Condición | Panel principal |
|---|---|
| `live_date` futura | Título "📡 Clase en vivo" + fecha grande + botón "📡 Unirse al live" (lime) + sub "Te lleva directo a la sala de Meet/Zoom." Si no hay `live_url`, sub explicativo. **Sin botón completar.** |
| `live_date` pasada + `!live_ended` | Título + fecha + sub "⏳ El coach todavía no finalizó este live. Vas a poder marcarlo como completado cuando se habilite." **Sin botón.** |
| `live_ended` + sin `recording_url` | Título + sub "⏳ La grabación estará disponible en las próximas 24-72hs." + botón "✅ Marcar como completado". |
| `live_ended` + `recording_url` | Título "📡 Clase en vivo — Grabación" + `<iframe>` 16:9 (vía `getEmbedUrl`) + botón "✅ Marcar como completado". |

Si `markLiveCompleted` ya fue ejecutado para este live → el botón pasa a "Completado" disabled (mismo look que lecciones completadas).

### Globals

- **Nuevo**: `let activeLiveId = null;` — UUID de `course_lives` cuando el alumno clickeó la fila del live.
- Mutuamente excluyente con `activeLessonId`: `selectLive(liveId)` limpia `activeLessonId`, `selectLesson(lessonId)` limpia `activeLiveId`.
- `_lockedView` también se limpia en ambos paths.

### Funciones / variables removidas vs X.54

- `renderModuleLiveInfo(m)` (devolvía el bloque sidebar con embed inline + botón) → eliminada.
- CSS `.live-recording-embed`, `.modules-mod-live-actions`, modificador `.modules-mod-live.recording/.pending` — sin caller.

### Funciones nuevas

- `renderModuleLiveRow(m)` — fila clickeable del sidebar (analogous to `lessons.map`).
- `renderLiveMainPanel(live)` — HTML del panel principal con los 4 estados.
- `selectLive(liveId)` — setter (espejo de `selectLesson`).

### CSS nuevo

- `.modules-live-row` — tinte lime sobre `.modules-lesson` base (check con `rgba(200,230,0,0.12)`, active → `var(--lime)` solid).
- `.live-main-card` — card padding 24/22, borde dashed, fondo soft. Para estados 1, 2, 3 (sin video). Flex column con `gap: 12px`.
- `.live-main-fecha` / `.live-main-sub` — tipografía del card.
- Estado 4 (con grabación) reusa `.video-wrapper` + `.modules-active-actions` que ya existían para lecciones — máxima consistencia visual.

### Lo que NO se hizo

- **Botón "Unirse al live" desde el sidebar**: hoy hay que clickear la fila → ir al panel principal → ahí está el botón. Una vía rápida (botón inline en la fila del sidebar) sería más cómoda pero rompe el patrón "sidebar = lista, main = contenido". Mantenemos coherencia.
- **Auto-seleccionar el live cuando llega su fecha**: si el alumno tiene la pestaña abierta y `live_date` cumple, el live no se auto-pone como activo. Necesitaría un setInterval.
- **Indicador en la fila cuando el live está "en vivo ahora"**: hoy se distingue solo por click. Un badge animado "🔴 EN VIVO" sería útil — pendiente.

---

## Etapa X.56 — Fix de `video_index` para live: `-1 * order_num` (sin migración)

Bug reportado tras X.54/X.55: al marcar un live como completado, Postgres tiraba `"value is out of range for type integer"`. Causa: `liveCompletionIndex(liveId)` usaba un hash djb2 con offset `+ 1000000000`, lo que producía enteros de hasta ~3.1 mil millones — fuera del rango de `INT4` que es ±2.1 mil millones. El UPSERT a `video_progress.video_index` (INT) fallaba.

**Fix elegido — Opción B del prompt:** usar `video_index = -1 * module.order_num`. Garantiza enteros pequeños y negativos (no colisionan con índices de lecciones que son `>= 0`). Sin migración de BD. Esto es esencialmente volver a la convención que tuvimos en X.44, pero limpiada y aplicada al nuevo flujo (sin la lógica de "Asistí al live" — la mecánica del completado ahora es la misma que la lección).

### Cambios

**`liveCompletionIndex` refactoreada de hash → order-based:**

```js
function liveCompletionIndex(m) {
  const o = Number(m?.order_num);
  return -1 * ((Number.isFinite(o) && o > 0) ? o : 1);
}
```

- `order_num > 0` → `-order_num` (ej: 1→-1, 2→-2, ...).
- `order_num = 0` / null / NaN → `-1` (fallback al primer slot negativo). Caso edge: si dos módulos tuvieran `order_num=0` y `order_num=1`, ambos mapearían a `-1` y la completitud se confundiría. En la práctica el editor de admin asigna order_num secuencial sin duplicados, así que no debería ocurrir.

**Signature change:** las funciones de live ahora reciben el módulo entero (no el live ni el liveId) porque necesitan `m.order_num`:
- `isLiveCompleted(m)` (antes `isLiveCompleted(live)`).
- `renderLiveMainPanel(m)` (antes `renderLiveMainPanel(live)`).
- `markLiveCompleted(liveId)` mantiene su signature pública (sigue recibiendo liveId desde el onclick HTML), pero internamente hace `MODULES.find(x => x.live?.id === liveId)` para obtener el módulo y calcular el índice.

**Callsites actualizados:**
- `renderModuleLiveRow(m)`: ya tenía `m`, llama `isLiveCompleted(m)`.
- `isModuleCompleted(m)`: cambia `isLiveCompleted(m.live)` → `isLiveCompleted(m)`.
- `renderLiveMainPanel`: cambia `isLiveCompleted(live)` → `isLiveCompleted(m)`.
- Branch del main panel: `mainHtml = renderLiveMainPanel(liveMod)` (antes pasaba `liveMod?.live`).

**Convivencia con registros legacy:** los registros antiguos en `video_progress` con `video_index` en el rango de hash (>10^9) quedan en la BD pero ya no son matcheados por ningún check. No causan daño. Si en el futuro se quiere limpiarlos, `DELETE FROM video_progress WHERE video_index > 1000000000`.

---

## Etapa X.57 — Fix: cert no se disparaba en cursos solo-lives (`updateProgress` con guard erróneo)

Bug reportado: al marcar como completado el último ítem (live o lección), el certificado no aparece. Causa raíz: `updateProgress()` tenía un early-return `if (!TOTAL_VIDEOS) return;` que disparaba antes de chequear el cert gate. `TOTAL_VIDEOS = LESSONS_FLAT.length`, así que un curso con módulos que **solo tienen live** (sin lecciones) → `TOTAL_VIDEOS === 0` → bailaba sin invocar `areAllModulesCompleted` ni `checkQuizGateAndShowCert`.

### Fix en `updateProgress()`

```js
function updateProgress() {
  // No bailar en modo módulos: un curso puede tener solo lives (sin lecciones)
  // y aun así el cert debe dispararse cuando todos los módulos están completos.
  if (!TOTAL_VIDEOS && !isModulesMode) return;
  if (!TOTAL_VIDEOS && isModulesMode && !MODULES?.length) return;

  const realCount = [...completedSet].filter(i => i >= 0).length;
  const pct       = TOTAL_VIDEOS > 0 ? Math.round(realCount / TOTAL_VIDEOS * 100) : 0;
  if (fill) fill.style.width = pct + '%';

  const certEligible = isModulesMode
    ? areAllModulesCompleted()
    : (TOTAL_VIDEOS > 0 && pct >= 100);

  if (certEligible) {
    if (label) { label.textContent = '¡Curso completado! 🎉'; label.classList.add('completed'); }
    checkQuizGateAndShowCert();   // → showCertSection() si no hay quiz pendiente
    return;
  }
  // Render del label según haya o no lecciones...
}
```

**Cambios concretos:**
- Early-return solo en modo no-modules sin videos, o módulos sin módulos.
- En modo módulos con `TOTAL_VIDEOS=0` (solo-lives) → sigue al check del cert.
- `pct` calculado con guard `TOTAL_VIDEOS > 0` para evitar `/0`.
- Cert dispara basado en `areAllModulesCompleted()` (modules) o `pct >= 100` (no-modules).
- Label nuevo: "En curso" cuando hay módulos solo-lives sin nada para mostrar progreso de lecciones.

### Verificación del flujo end-to-end

| Paso | Estado |
|---|---|
| `markLiveCompleted(liveId)` | UPSERT a `video_progress` con `video_index = -1 * order_num`, `completed = true`. `completedSet.add(idx)`. Re-render + `updateProgress()`. |
| `markLessonComplete(lessonId)` | UPSERT con `video_index = LESSON_IDX_BY_ID[lessonId]` (entero >= 0). `completedSet.add(flatIdx)`. Re-render + `updateProgress()`. |
| `updateProgress()` | Ahora siempre chequea `certEligible` en modo módulos. |
| `areAllModulesCompleted()` | `MODULES.every(isModuleCompleted)`. |
| `isModuleCompleted(m)` | Sin contenido → true · live completado → true · alguna lección completada → true · sino false. |
| `checkQuizGateAndShowCert()` | Si hay quiz activo y no aprobado → muestra quiz. Sino → `showCertSection()`. |

Load inicial (`init`) ya carga TODOS los `video_index` (positivos y negativos) en `completedSet` (X.54) y llama `updateProgress()` después del primer render, así que el cert también se dispara al recargar la página con todo ya completado.

**Pendiente:** el label "En curso" para cursos solo-lives es un placeholder pasivo. Idealmente mostraría algo como "X de Y lives realizados" — pero requiere contar lives por módulo y % de módulos completados (otra métrica). Mejora futura.

---

## Etapa X.58 — Módulo de "Certificación" + barra de progreso por módulos

Dos cambios coordinados en `curso.html`:

### 1. Módulo de certificación (empty module)

**Detección automática**: un módulo sin lecciones ni live (`!m.lessons.length && !m.live`) se interpreta como módulo de "Certificación". El admin lo configura simplemente creando un módulo con solo el título.

**Helpers nuevos:**
- `isCertModule(m)` → true si el módulo no tiene lecciones ni live.
- `isCertModuleUnlocked()` → true si todos los módulos NO-cert están completados (`MODULES.filter(x => !isCertModule(x)).every(isModuleCompleted)`).

**Sidebar:**
- **Bloqueado** (`!certUnlocked`): wrapper `.modules-mod.locked.cert-locked` con opacidad `0.55` + cursor not-allowed. Head con 🔒 antes del título. NO clickeable.
- **Desbloqueado** (`certUnlocked`): wrapper `.modules-mod.cert-unlocked` con color lime en el head. Head con 🎓 + título. Clickeable → `selectCertView()`.

**Main panel** (cuando `_certView === true`): card con título "🎓 ¡Curso completado!", sub "Completaste todos los módulos del curso. Tu certificado está listo para descargar abajo." + botón "Ver y descargar certificado ↓" que llama `showCertSection()` (reutiliza la lógica existente — la sección `#cert-section` ya está fuera del layout de módulos).

**Global nuevo:** `let _certView = false;`. Mutuamente excluyente con `activeLessonId`, `activeLiveId`, `_lockedView` — todos los setters limpian los otros 3. `selectCertView()` verifica `isCertModuleUnlocked()` antes de activar (safety guard).

**Sin botón "Marcar como completado":** el certificado en sí es la completación. El sidebar item del módulo de cert no muestra "Completado" como las lecciones/lives — su presencia desbloqueada ya indica logro.

### 2. Barra de progreso por módulos

**Antes**: `pct = realCount / TOTAL_VIDEOS * 100` donde `TOTAL_VIDEOS = LESSONS_FLAT.length` (contaba lecciones). En un curso con muchas lecciones, marcar una sola movía la barra 1/N. Si había módulos solo-live, no se contaban en absoluto.

**Ahora** (modo módulos):

```js
const contentModules = MODULES.filter(m => !isCertModule(m));
const total          = contentModules.length;
const done           = contentModules.filter(isModuleCompleted).length;
const pct            = total > 0 ? Math.round(done / total * 100) : 0;
```

- **Total**: módulos con contenido (lecciones o live), **excluyendo módulos de certificación** (los empty modules son la meta, no aportan).
- **Done**: módulos con al menos una entrada `completed=true` en `video_progress` — `isModuleCompleted` resuelve el chequeo OR entre lección y live.
- **Pct**: `done / total * 100`.
- **Label**: `"X de Y módulos completados"` (antes era "X lecciones completadas").

**Cuando todos completos** (`areAllModulesCompleted()` incluyendo el módulo de cert, que cuenta como completo por defecto al ser empty) → label cambia a "¡Curso completado! 🎉" + dispara `checkQuizGateAndShowCert()`.

En modo no-modules (videos sueltos / live legacy) la lógica original se preserva (por video, no por módulo).

### CSS nuevo

```css
.modules-mod.cert-locked   { opacity: 0.55; }
.modules-mod.cert-unlocked .modules-mod-head { color: var(--lime, #C8E600); }
.modules-mod.cert-unlocked .modules-mod-head.active { background: rgba(200,230,0,0.12); }
```

### Flujo end-to-end del cert

1. Alumno marca el último ítem (live o lección) del último módulo con contenido.
2. `markLiveCompleted` / `markLessonComplete` → `completedSet.add(...)` → `renderModulesView()` + `updateProgress()`.
3. `updateProgress` cuenta módulos completados → `done === total` → `areAllModulesCompleted()` = true → `checkQuizGateAndShowCert()` → `showCertSection()` auto-revela el cert.
4. En el sidebar, el módulo de cert pasa de `.cert-locked` (🔒) a `.cert-unlocked` (🎓 lime, clickeable).
5. Alumno puede clickear el módulo de cert para volver a verlo en el main panel + scroll a la sección cert.

### Lo que NO se hizo

- **Múltiples módulos de certificación por curso**: el detector marca CUALQUIER módulo empty como cert. Si el admin crea varios módulos empty, todos serían "cert" y el primero unlocked dispararía. Edge case improbable — admin pondría un solo módulo "Certificado" al final.
- **Edición del título "Certificación" desde admin**: el admin escribe lo que quiera (ej: "🏆 Certificado final"); el detector solo mira contenido, no título.
- **El layout del cert dentro del main panel**: hoy es un card simple con CTA → scroll a la sección global. Se podría embeber el cert directo (con el PNG + botón download) en el main panel, pero duplicaría código.

---

## Etapa X.59 — Quitar curso a alumno (admin) + barra de progreso real (dashboard)

### 1. Admin — botón "🗑 Quitar curso" en pills de alumno

En `admin.html` Tab Alumnos, las pills de cursos asignados ya tenían un mini `×` para quitar el curso (Etapa X.5). Esta etapa cambia ese control por un botón visible y explícito:

- **HTML**: cada pill ahora contiene `<button class="btn-quitar-curso-alumno">🗑 Quitar curso</button>` (en lugar del `×` minúsculo).
- **Confirm nuevo**: `"¿Quitar acceso a '${courseTitle}'?"` (antes era `"¿Quitar el curso ... a este usuario?"`).
- **DELETE directo** vía PostgREST: `sb.from('user_courses').delete().eq('user_id', X).eq('course_id', Y).select()`. Si el `.select()` devuelve 0 filas afectadas (RLS bloqueando), **fallback automático** a la RPC SECURITY DEFINER `remove_user_course` que ya estaba implementada.
- **CSS nuevo `.btn-quitar-curso-alumno`**: borde rojo soft, fondo transparente, padding compacto, hover con bg rojo soft y borde más fuerte. Se ve como un chip de acción dentro de la pill (border-radius 100px para match con la pill).
- **Toast**: `'Acceso al curso quitado.'` (antes `'Curso quitado.'`).

### 2. Dashboard — barra de progreso real por curso

En `dashboard.html`, las tarjetas mostraban una barra que usaba `course.total_videos` (count de lecciones) como denominador. Esto era impreciso para cursos `course_type='modules'` y no contaba los lives. Refactor: ahora la barra usa la **misma lógica que `curso.html`** (Etapa X.58) — cuenta módulos con contenido completados.

**Cambios:**
- SELECT a `user_courses → courses` ahora incluye `course_type` (para discriminar el modo).
- El SELECT a `video_progress` ahora trae también `video_index` (necesario para discriminar entre lecciones positivas y lives negativos).
- Se construye `completedIdxByCourse[courseId] = Set<video_index>` y se preserva el contador `completedByCourse[courseId]` viejo (que solo cuenta índices `>= 0`) para los cursos no-modules (compat).
- **Para cursos `course_type='modules'`**: se hacen 3 queries adicionales en el batch:
  - `course_modules.in('course_id', modulesCourseIds)` (id, course_id, order_num).
  - `course_lessons.in('module_id', allModIds)` (id, module_id).
  - `course_lives.in('module_id', allModIds)` (module_id — solo necesitamos saber si existe).
- Por cada curso modules-mode se construye el LESSON_IDX_BY_ID local + se cuenta cuántos módulos con contenido tienen al menos una entry completada (lección con `flatIdx` en cSet, o live con `-order_num` en cSet). Los módulos sin lecciones ni live (cert modules) se excluyen del total.
- `progressByCourse[courseId] = { completed, total, isModulesMode: true }`. El render usa este map cuando existe; sino cae al cálculo viejo.

**Render**: la label dice "**X de Y módulos completados**" para modules-mode y "X de Y clases completadas" para non-modules. El badge de estado (✅ Completado / 📝 Test disponible / 🆕 Sin comenzar / ▶ En progreso) sigue usando el mismo `pct` calculado.

**Performance**: 3 queries adicionales en paralelo, agregadas al `Promise.all` que ya existía. Sin N+1 — todas batch.

**Lo que NO se hizo:**
- **Caching cross-page**: cada vez que el alumno entra al dashboard se recalcula desde scratch. Pequeña optimización futura: cachear `progressByCourse` en sessionStorage con TTL corto.
- **Sync real-time**: si el alumno completa una lección en `curso.html` y vuelve al dashboard, ve el dato actualizado en la próxima carga (la query corre en init). Sin push.
- **Total_videos legacy desactualizado**: cursos no-modules siguen usando `course.total_videos`. Si ese campo está desactualizado vs. cantidad real de videos, la barra puede dar > 100% — el `Math.min(100, ...)` cap evita romperlo visualmente.

---

## Etapa X.60 — "Quitar curso" mudado al action-menu (admin Tab Alumnos)

Bug reportado tras X.59: las pills de cursos en la columna "Cursos asignados" no eran clickeables — el botón "🗑 Quitar curso" dentro de la pill no respondía al click. Causa probable: la pill envuelta en un `<span>` interceptaba el evento por el flex layout. Solución: en lugar de insistir con el botón inline, mover la acción al menú "⋮" donde el patrón ya funciona consistente con el resto del UI.

### Cambios en `admin.html` (Tab Alumnos → render de cada fila)

**Pills simplificadas:** las pills ahora son solo visuales (chip con título del curso) — sin botón dentro. Quedan limpias y consistentes con otras pills del proyecto.

**Action menu ampliado:** el dropdown "⋮" de cada alumno ahora muestra:

```
+ Asignar curso
──────────────────
CURSOS ASIGNADOS
🗑 Quitar "Fuerza Híbrida"
🗑 Quitar "Bases y Programación..."
──────────────────
🗑 Eliminar usuario
```

Cada sub-item de "Quitar curso" llama directo a `removeUserCourse(user_id, course_id, course_title)` (función ya implementada en X.59 con confirm `"¿Quitar acceso a '${courseTitle}'?"` + DELETE directo + fallback RPC).

**Cuando el alumno no tiene cursos:** se omite la sección "Cursos asignados" — solo queda un divider entre "Asignar curso" y "Eliminar usuario".

**Cursos huérfanos:** los cursos sin `c.id` (registros zombi en `user_courses` apuntando a un curso borrado) no se renderan como sub-item — no son removibles desde acá (habría que limpiarlos via SQL).

### CSS nuevo en `.action-menu`

- `.action-menu-divider` — `height: 1px; background: var(--card-border); margin: 4px 6px;` — separador horizontal.
- `.action-menu-section-label` — `font-size: 0.68rem; uppercase; tracked; color: gray-text; padding: 6px 12px 2px; user-select: none;` — etiqueta de sección "CURSOS ASIGNADOS".

CSS de `.btn-quitar-curso-alumno` (X.59) **eliminado** — ya no se renderiza.

### Lo que NO se hizo

- **Confirmar con el nombre del alumno también**: hoy el confirm dice `"¿Quitar acceso a '${courseTitle}'?"` — no aclara a quién. Como la acción se dispara desde el menú del alumno, el contexto está implícito. Si se vuelve confuso, ampliar a `"¿Quitar acceso de ${alumno} a '${curso}'?"`.
- **Bulk quitar**: si el alumno tiene muchos cursos, hay que clickear uno por uno. Una opción "Quitar todos" sería rara (UX peligroso) — se deja un-curso-por-vez.

---

## Etapa X.61 — Fix: resolver course_id real para sub-items "Quitar curso"

Bug post-X.60: el sub-menú "🗑 Quitar curso" no aparecía en el action menu del alumno aunque tuviera cursos visibles en las pills. Causa: la RPC `get_all_users` retorna `course_titles[]` SIN `course_ids[]` (caso 3 del normalizador en `loadAlumnos`), entonces cada `c.id = null`, y el filtro `removableCourses = u.courses.filter(c => !!c.id)` retornaba vacío → no se renderaban los sub-items.

### Fix en `loadAlumnos` (admin.html)

Tras llamar `get_all_users` y normalizar `allUsers`, se hace una query batch a `user_courses`:

```js
const { data: ucData } = await sb.from('user_courses')
  .select('user_id, course_id, courses(id, title)')
  .in('user_id', userIds)
  .eq('payment_status', 'paid')
  .eq('status', 'active');

const coursesByUser = {};
(ucData || []).forEach(r => {
  const cid   = r.course_id || r.courses?.id;
  const title = r.courses?.title || '(sin título)';
  if (!cid) return;
  if (!coursesByUser[r.user_id]) coursesByUser[r.user_id] = [];
  coursesByUser[r.user_id].push({ id: cid, title });
});
allUsers.forEach(u => {
  if (coursesByUser[u.user_id]) u.courses = coursesByUser[u.user_id];
});
```

**Características:**
- **1 sola query batch** por carga del tab, no N+1.
- **Filtrada por `payment_status='paid'` + `status='active'`** — solo se ofrece quitar cursos actualmente asignados.
- **Sobrescribe `u.courses` solo cuando hay datos resueltos** — si la query falla por RLS o devuelve vacío para un user, se conservan los titles del RPC original (degradación grácil).
- Wrapped en `try/catch` — un fallo del side-query no rompe la carga del tab; se loguea warning y se sigue.

**Estado posterior:** `u.courses` ahora siempre tiene `{ id, title }` cuando hay cursos asignados → el `removableCourses.filter(c => !!c.id)` matchea → los sub-items "🗑 Quitar 'X'" aparecen en el dropdown ⋮.

### Alternativa descartada

Modificar la RPC `get_all_users` para retornar `course_ids[]` paralelo sería más eficiente (una sola query menos) pero requiere SQL y migración. El fix del lado cliente cierra el bug sin tocar la DB.

---

## Etapa X.62 — Action menu admin: flip-up cuando no entra abajo

Bug reportado: el dropdown "⋮" de la última fila de cualquier tabla del admin (Cursos, Alumnos, etc.) se cortaba contra el borde inferior del viewport — los items "Activar / Eliminar" quedaban ocultos abajo.

Causa: el menú usa `position: fixed; top: btnRect.bottom + 4` (Etapa X.4). Cuando la fila está cerca del bottom del viewport, los `~5-7` items del menú (incluyendo los nuevos sub-items X.60) sobrepasan el `window.innerHeight`.

### Fix: helper `positionActionMenu(menu, btnRect)`

Tras mostrar el menú (necesario para medir su altura real), decide:

- **Espacio suficiente abajo** → `top = btnRect.bottom + 4` (default).
- **No entra abajo AND hay más espacio arriba** → flip-up: `top = btnRect.top - menuHeight - 4` (con piso `8px`).
- **No entra abajo pero arriba tampoco** (viewport chico) → mantiene abajo + agrega `max-height: spaceBelow - 12px; overflow-y: auto` para scroll interno.

`toggleRowMenu` (cursos) y `toggleUserRowMenu` (alumnos) llaman al helper después de `.classList.add('open')` (necesita estar visible para que `menu.offsetHeight` funcione).

**Sin cambios en el CSS** — el `position: fixed` ya estaba. Solo se ajusta dinámicamente el `top` y opcionalmente `max-height` / `overflow-y` cuando el menú no entra.

---

## Etapa X.63 — Live: link meet visible mientras !live_ended (sin importar fecha)

Refinamiento de X.55/X.48 — la condición para mostrar el link al meet pasaba por `isFuture` (basada en `live_date`). Eso era confuso: si el live estaba programado a las 19:00 y el coach no lo finalizaba al pasar las 20:00, el alumno dejaba de ver el botón "Unirse al live" aunque el coach pudiera seguir en la sala.

**Nueva regla**: el gate es `live_ended` (el coach decide explícitamente cuándo cierra), no la fecha.

### Tabla actualizada de `renderLiveMainPanel(m)`

| Condición | Panel principal |
|---|---|
| `!live.live_ended` (fecha futura O pasada) | Fecha + botón **"📡 Unirse al live"** (lime, target `_blank`). Sin botón completar. Si no hay `live_url` cargado todavía → sub "El link del live va a estar disponible antes de la clase." |
| `live_ended` + sin `recording_url` | "⏳ La grabación estará disponible en las próximas 24-72hs." + botón **"✅ Marcar como completado"**. |
| `live_ended` + `recording_url` | `<iframe>` 16:9 (vía `getEmbedUrl`) + botón **"✅ Marcar como completado"**. |

### Cambios concretos

- **Eliminado** el branch `if (isFuture)` y `isFuture`/`ts`/`now` ya no se calculan en `renderLiveMainPanel` (no son necesarios — `live_ended` es la única condición).
- **Eliminado** el branch "pasada pero coach no cerró" con copy "⏳ El coach todavía no finalizó...". Ese caso ahora cae al estado 1 (link meet visible) — más útil para el alumno porque puede entrar al meet si el coach extendió la clase.
- Estados 3 (sin grabación) y 4 (con grabación) se mantienen idénticos.
- La fila del sidebar (`renderModuleLiveRow`) **no cambia** — sigue mostrando 📡 / ✓ según `isLiveCompleted(m)`.

---

## Etapa X.64 — Live: normalización de URL + visibilidad del link

Bug reportado: tras X.63 el botón "📡 Unirse al live" se muestra correctamente cuando `!live_ended`, pero el click no abre el meet (o abre algo raro). Causa probable: el coach pegó la URL sin `https://` (ej. `meet.google.com/abc-def`), y el `href` resultante se interpreta como **ruta relativa** del navegador → click no funciona.

### Cambios en `renderLiveMainPanel(m)` (estado 1, curso.html)

- **Normalización del URL**: si `live.live_url` no empieza con `http://` o `https://`, se prefija `https://` automáticamente antes de armar el `href`.
- **URL visible como texto**: debajo del botón se renderiza el link como anchor visible en lime con `word-break: break-all`. Sirve como:
  - Diagnóstico inmediato — el alumno ve qué URL está cargada.
  - Plan B si el click del botón no funciona — puede clickear el link en texto o copiarlo.
- **Copy actualizado**: "Te lleva directo a la sala de Meet/Zoom. Si el botón no abre, copiá este link:" (antes solo "Te lleva directo...").
- **`rel="noopener noreferrer"`** (antes solo `noopener`) — mejor higiene para target=_blank.
- **`console.log('[live] live_url:', live.live_url, '→ href:', urlForHref)`** para diagnóstico — el alumno (o coach) puede abrir F12 y verificar la URL que se está usando.

Sin cambios en los otros estados (live_ended con/sin recording) ni en `renderModuleLiveRow`.

---

## Etapa X.65 — Cert gate estricto + scroll directo al cert desde sidebar

Dos fixes en `curso.html`:

### 1. `areAllModulesCompleted` y `isCertModuleUnlocked` estrictos

Antes: ambas funciones llamaban `MODULES.every(isModuleCompleted)`. Como `isModuleCompleted(m)` retorna `true` para módulos sin contenido (semánticamente "nada que hacer"), un curso con módulos vacíos sumaba al `every` indirectamente.

Riesgo: si por algún motivo (RLS, race, mismatch de query) un módulo con contenido se cargaba con `lessons: []` y sin live, era indistinguible de un módulo de certificación vacío → `isModuleCompleted` retornaba `true` → contaba como completo → cert disparaba prematuro.

**Fix explícito:**

```js
function areAllModulesCompleted() {
  const contentModules = (MODULES || []).filter(m => !isCertModule(m));
  if (!contentModules.length) return false;   // sin contenido → no cert
  return contentModules.every(isModuleCompleted);
}

function isCertModuleUnlocked() {
  const contentModules = (MODULES || []).filter(x => !isCertModule(x));
  if (!contentModules.length) return false;
  return contentModules.every(isModuleCompleted);
}
```

- **Filter explícito** de empty modules antes del `every`.
- **Guard `contentModules.length > 0`**: `[].every(fn) === true` por convención de JS — sin el guard, un curso solo-cert dispararía el cert al cargar.
- `isModuleCompleted` no cambia (sigue retornando `true` para empty modules; útil para otros checks dentro del render).

### 2. Cert module sidebar → scroll directo al cert section

Cambio menor pero importante: cuando el alumno clickea el módulo de certificación desbloqueado, el panel principal mostraba un CTA "Ver y descargar certificado ↓" que el alumno tenía que clickear DE NUEVO para scrollear al cert section. Redundante.

**Ahora**: `selectCertView()` ya llama `showCertSection()` (que hace `scrollIntoView` smooth). El main panel solo muestra un card celebratorio sin CTA — el scroll al cert section ocurre automáticamente al clickear el módulo en el sidebar.

```js
} else if (_certView) {
  mainHtml = `
    <div class="modules-active-title">🎓 ¡Curso completado!</div>
    <div class="live-main-card">
      <p class="live-main-fecha">¡Felicitaciones!</p>
      <p class="live-main-sub">Completaste todos los módulos del curso. Tu certificado está debajo, listo para descargar.</p>
    </div>`;
}
```

El resto del flow (mutual exclusion con `activeLessonId`/`activeLiveId`/`_lockedView`, sidebar con 🔒/🎓 según `isCertModuleUnlocked`) no cambia — sigue como X.58.

---

## Etapa X.66 — Cert gate: ignorar módulos bloqueados por drip

Refinamiento de X.65. Bug observado: si un curso tenía módulos con `unlock_at` futura (drip), el cert se calculaba contra TODOS los módulos con contenido — incluyendo los bloqueados — que el alumno literalmente no puede completar. Resultado: el cert nunca disparaba aunque el alumno hubiera completado todo lo accesible.

### Nueva regla del cert

1. Un módulo cuenta para el cert **solo si está desbloqueado** (`!unlock_at` O `unlock_at <= now`).
2. De los desbloqueados, **solo los que tienen contenido** (lecciones o live) deben estar completos.
3. Módulos **bloqueados por fecha** → ignorados (no aportan ni bloquean).
4. Módulos **sin contenido** (cert module) → ignorados.
5. Si no queda ningún módulo relevante → `false` (no hay cert).

### Implementación

```js
function areAllModulesCompleted() {
  const now = new Date();
  const unlockedWithContent = (MODULES || []).filter(m => {
    const unlocked   = !m.unlock_at || new Date(m.unlock_at) <= now;
    const hasContent = (m.lessons?.length > 0) || !!m.live;
    return unlocked && hasContent;
  });
  if (!unlockedWithContent.length) return false;
  return unlockedWithContent.every(isModuleCompleted);
}
```

Mismo patrón en `isCertModuleUnlocked()` para que el módulo de certificación (🎓 en el sidebar) se desbloquee bajo el mismo criterio.

### Re-evaluación al cargar la página

El `updateProgress()` se invoca al final del init después de cargar módulos + progreso. Como la fecha actual (`new Date()`) se evalúa dentro de `areAllModulesCompleted`, cualquier módulo cuya `unlock_at` ya pasó al momento de la carga se considera unlocked automáticamente. No requiere lógica adicional: si el alumno completa todo lo accesible y luego un módulo se desbloquea por fecha, en la siguiente recarga el cert dejará de mostrarse hasta que también complete ese módulo.

### Lo que NO se cambió

- **Barra de progreso (`updateProgress`)**: sigue contando contra TODOS los content modules (no excluye bloqueados). Esto preserva el "tamaño real" del curso visible al alumno. Si se quiere alinear con el cert gate, basta agregar el mismo filtro de `unlocked` en la línea `contentModules = ...`.
- **`isModuleCompleted`**: sin cambios — sigue retornando `true` para empty modules (semántica de "nada que hacer" usada por otros checks).
- **`dashboard.html`**: el cálculo del progreso por módulos (X.59) tampoco excluye bloqueados. Aplicar el mismo refinamiento ahí queda pendiente si el caso de uso aparece.

---

## Etapa X.67 — Cert gate: ignorar módulos con live pendiente (`!live_ended`)

Refinamiento adicional sobre X.66. Cuando un módulo tiene un live programado y el coach todavía no lo finalizó (`live_ended=false`), el alumno NO PUEDE marcarlo como completado (el botón "Marcar como completado" solo aparece en el panel principal del live cuando `live_ended=true`, ver Etapa X.63). Sin embargo, `areAllModulesCompleted` lo incluía en el conteo → el cert quedaba bloqueado indefinidamente esperando que el alumno complete algo que la UI no le permite.

### Nueva regla del cert (X.67)

Un módulo se considera "disponible para completar" solo si:
1. Está **desbloqueado por fecha** (`unlock_at` null o pasado).
2. Tiene **contenido** (lecciones o live).
3. Si tiene live → `live.live_ended === true` (el coach finalizó).

```js
function areAllModulesCompleted() {
  const now = new Date();
  const availableWithContent = (MODULES || []).filter(m => {
    const unlockedByDate = !m.unlock_at || new Date(m.unlock_at) <= now;
    const hasContent     = (m.lessons?.length > 0) || !!m.live;
    const liveReady      = !m.live || m.live.live_ended === true;
    return unlockedByDate && hasContent && liveReady;
  });
  if (!availableWithContent.length) return false;
  return availableWithContent.every(isModuleCompleted);
}
```

Mismo filtro en `isCertModuleUnlocked()` para que el 🎓 del sidebar se desbloquee bajo el mismo criterio.

### Caso edge: módulo con lecciones + live no-finalizado

Si un módulo tiene lecciones (que el alumno SÍ puede completar) AND un live pendiente (`!live_ended`), por el nuevo filtro el módulo entero se ignora del cálculo del cert. Trade-off: el alumno podría tener todas las lecciones del módulo completadas pero el cert no dispara hasta que el coach finalice el live → coherente con la spec ("si tiene live → live_ended debe ser true").

Esto es intencional: el live es parte del módulo, y si no se finalizó, el módulo no se considera "consumible" completamente. Si en el futuro se quiere relajar (cualquier ítem del módulo cuenta), basta cambiar la condición `liveReady` a `(m.lessons?.length > 0 || (m.live && m.live.live_ended))`.

### Sin tocar

- `isModuleCompleted`: sigue retornando `true` para empty modules; semántica de "completable" no cambia.
- Barra de progreso (`updateProgress`): sigue contando contra TODOS los content modules (no aplica el filtro de "disponible"). Si se quiere alinear, agregar el mismo filtro en `contentModules = ...`.
- `dashboard.html`: cálculo del progreso por módulos (X.59) no se actualizó — los cursos con lives pendientes de finalizar pueden mostrar progreso aparentemente "menor" en el dashboard vs. el cert real.

---

## Etapa X.68 — Action-menu: flip-up más robusto (4 casos)

Refinamiento de X.62. El flip-up funcionaba la mayoría de las veces, pero fallaba en algunos casos:
- El reset de `maxHeight` se hacía DESPUÉS de medir `offsetHeight`, así que si un open previo había dejado scroll interno, la medición devolvía la altura artificialmente recortada → la decisión "cabe abajo" se cumplía erróneamente y no flipeaba.
- `offsetHeight === 0` (menú aún no renderizado al medir) → fallback que decidía mal.
- Lógica anterior solo flipeaba si `spaceAbove > spaceBelow`, lo que dejaba scrolls innecesarios cuando el menú entraba completo arriba aunque hubiera menos espacio.

### Nueva `positionActionMenu(menu, btnRect)` — 4 casos explícitos

```js
function positionActionMenu(menu, btnRect) {
  const margin     = 4, safe = 8;
  const vh         = window.innerHeight;

  // Reset ANTES de medir — sino un open previo deja offsetHeight chico.
  menu.style.maxHeight = '';
  menu.style.overflowY = '';

  const menuHeight = Math.max(menu.offsetHeight, 120);  // fallback ante 0
  const spaceBelow = vh - btnRect.bottom;
  const spaceAbove = btnRect.top;

  if (menuHeight + margin <= spaceBelow) {              // (a) Entra cómodo abajo
    menu.style.top = (btnRect.bottom + margin) + 'px';
    return;
  }
  if (menuHeight + margin <= spaceAbove) {              // (b) Cabe completo arriba → flip-up
    menu.style.top = (btnRect.top - menuHeight - margin) + 'px';
    return;
  }
  // (c) o (d): no cabe completo en ninguno → más espacio gana, con scroll interno.
  if (spaceAbove > spaceBelow) {
    menu.style.top       = safe + 'px';
    menu.style.maxHeight = (spaceAbove - margin - safe) + 'px';
    menu.style.overflowY = 'auto';
  } else {
    menu.style.top       = (btnRect.bottom + margin) + 'px';
    menu.style.maxHeight = (spaceBelow - margin - safe) + 'px';
    menu.style.overflowY = 'auto';
  }
}
```

### Aplicado a:

- **Tab Cursos** → `toggleRowMenu(ev, courseId)` (ya lo llamaba desde X.62).
- **Tab Alumnos** → `toggleUserRowMenu(ev, userId)` (ya lo llamaba desde X.62).
- **Tab Coaches**: no tiene `action-menu` con menú multi-item — el botón de acciones por fila es distinto. No requiere flip-up.

### Cambios clave vs X.62

- Reset de `maxHeight` / `overflowY` se hace ANTES de medir `offsetHeight`. Evita el feedback de un open previo con scroll.
- Fallback `Math.max(menu.offsetHeight, 120)` cuando la medición da 0 — la decisión nunca cae al case "cabe abajo" por error.
- Flip-up siempre que cabe completo arriba (no requiere `spaceAbove > spaceBelow`) — UX más consistente.

---

## Etapa X.69 — Cert: completedSet con strings + reescritura limpia

Cierre del ciclo de bugs del certificado (X.65–X.68). Causa raíz: `completedSet` mezclaba números y strings entre callsites (load lo poblaba con `r.video_index` como número, markers también con número, pero la lógica del cert evaluaba a veces con cast implícito). Si por una race o un re-render parcial, `LESSON_IDX_BY_ID` quedaba con un mapping stale y devolvía un `undefined` que `Set.has(undefined)` resolvía como `false`, o peor, devolvía un número que coincidía con uno del set por type-juggling → cert disparaba antes de tiempo.

### Solución: `completedSet` SIEMPRE guarda strings

**Load inicial** (post-fetch de `video_progress`):

```js
(progressData || []).forEach(r => {
  if (r.video_index != null) completedSet.add(String(r.video_index));
});
```

**Markers** (`markComplete`, `markLessonComplete`, `markLiveCompleted`): ahora hacen `completedSet.add(String(idx))`.

**Todos los `.has(...)`** del código (render del progreso de videos, sidebar de lecciones, lección activa, `isLiveCompleted`, `isModuleCompleted`) usan `completedSet.has(String(...))`. Type consistente en todo el flujo.

### `isModuleCompleted(m)` reescrito

```js
function isModuleCompleted(m) {
  const lessons   = m?.lessons || [];
  const lessonDone = lessons.some(l => {
    if (l.id && completedSet.has(String(l.id))) return true;          // por UUID
    const idx = LESSON_IDX_BY_ID[l.id];
    return (idx !== undefined) && completedSet.has(String(idx));      // por flat-index
  });
  const ord     = Number(m?.order_num);
  const liveOrd = (Number.isFinite(ord) && ord > 0) ? ord : 1;
  const liveIdx = m?.live ? String(-1 * liveOrd) : null;
  const liveDone = liveIdx ? completedSet.has(liveIdx) : false;
  return lessonDone || liveDone;
}
```

- **Hedged**: chequea por UUID directo (futuro/forward-compat si la columna pasa a TEXT) Y como fallback por flat-index (esquema actual).
- **Cambio semántico vs etapas anteriores**: ya **NO retorna `true` para módulos vacíos**. Solo retorna true si HAY un completed real. El filtrado de módulos vacíos / locked / live-pendiente se hace ÚNICAMENTE en `areAllModulesCompleted`.

### `areAllModulesCompleted()` con triple filtro

```js
function areAllModulesCompleted() {
  const now = new Date();
  const available = (MODULES || []).filter(m => {
    const unlockedByDate = !m.unlock_at || new Date(m.unlock_at) <= now;
    const hasContent     = (m.lessons?.length > 0) || !!m.live;
    const liveReady      = !m.live || m.live.live_ended === true;
    return unlockedByDate && hasContent && liveReady;
  });
  const completed = available.filter(isModuleCompleted);
  console.log('[CERT CHECK]', {
    availableCount:  available.length,
    completedCount:  completed.length,
    availableTitles: available.map(m => m.title),
    completedTitles: completed.map(m => m.title),
  });
  if (!available.length) return false;
  return completed.length === available.length;
}
```

**3 filtros que TIENEN que pasarse para que el módulo cuente:**
1. Desbloqueado por fecha.
2. Tiene contenido (lecciones o live).
3. Si tiene live → `live_ended === true`.

**`console.log('[CERT CHECK]', ...)`** antes del return — al abrir F12 y marcar cualquier ítem, el alumno (o admin) ve qué módulos están "available" y cuántos contó como completados.

### `isCertModuleUnlocked` ahora es alias de `areAllModulesCompleted`

Mismos 3 filtros, misma evaluación. Coherencia garantizada: el 🎓 del sidebar se desbloquea EXACTAMENTE cuando el cert se dispara.

### Lo que NO cambia

- `markLessonComplete` y `markLiveCompleted` siguen escribiendo INT en `video_progress.video_index` (la columna es INT, no se migró a TEXT). El cambio a strings ocurre SOLO en el `completedSet` en memoria.
- Los registros legacy en BD con video_index hash (>10^9, residuos de X.54) siguen en BD pero ya no son matcheados por nada. Inofensivos.
- `dashboard.html` cálculo de progreso (X.59) — sigue con números en su propio Set local; no afecta al cert de curso.html.

---

## Etapa X.70 — Cert: invertir el rol de `live_ended` (bloquea en vez de excluir)

Bug observado tras X.67/X.69. La regla de `liveReady` (filtrar módulos con `live_ended === false` ANTES del `every`) tenía el efecto opuesto al deseado: el módulo con live pendiente quedaba excluido del cálculo → reducía el denominador → si todos los otros módulos estaban completados, `every` devolvía `true` con un denominador chico y el cert disparaba prematuro.

### El insight clave

Un módulo con live pendiente (`live_ended=false`) tiene la UI **bloqueada para el alumno**: el botón "Marcar como completado" no aparece (Etapa X.63). Eso significa que **nunca va a estar en `completedSet`** hasta que el coach finalice el live. Por lo tanto:

- Si NO lo filtramos antes (queda en `required`) → `every(isModuleCompleted)` falla en ese módulo → cert NO dispara. ✓
- Si SÍ lo filtramos (sale de `required`) → desaparece del cálculo → cert puede disparar antes. ✗

La regla correcta es **mantener** los módulos con live pendiente en `required` para que **bloqueen** el cert naturalmente.

### Fix definitivo

```js
function areAllModulesCompleted() {
  const now = new Date();
  // Todos los desbloqueados por fecha con contenido. SIN filtrar por live_ended.
  const required = (MODULES || []).filter(m => {
    const unlockedByDate = !m.unlock_at || new Date(m.unlock_at) <= now;
    const hasContent     = (m.lessons?.length > 0) || !!m.live;
    return unlockedByDate && hasContent;
  });
  if (!required.length) return false;
  return required.every(isModuleCompleted);
}
```

**Diferencia con X.67/X.69:** se elimina el filtro `liveReady`. Los módulos con live `!live_ended` quedan en `required` pero no pueden completarse → `every` devuelve `false` hasta que el coach finalice y el alumno marque. Comportamiento intuitivo y consistente.

### Reglas finales del cert (resumen)

| Caso del módulo | ¿En `required`? | ¿Cómo se completa? |
|---|---|---|
| Bloqueado por fecha (`unlock_at` futura) | NO | N/A |
| Sin contenido (módulo de certificación) | NO | N/A |
| Con contenido + live finalizado | SÍ | Alumno marca lección o live |
| Con contenido + live NO finalizado | SÍ | Coach finaliza → alumno marca |
| Sin live + con lecciones | SÍ | Alumno marca alguna lección |

El cert se dispara cuando **todos los módulos en `required` están completados**.

`isCertModuleUnlocked` sigue siendo alias de `areAllModulesCompleted` → el 🎓 del sidebar tiene el mismo gating.

### Console.log actualizado

```js
console.log('[CERT CHECK]', {
  requiredCount, completedCount,
  requiredTitles:  required.map(m => m.title),
  completedTitles: completed.map(m => m.title),
});
```

Renombrado de `available*` → `required*` para reflejar la nueva semántica.

---

## Etapa X.71 — Cert: guards duros en `showCertSection` y `checkQuizGateAndShowCert`

Bug reportado tras X.70: el log `[CERT CHECK]` mostraba `completedCount:0, requiredCount:2` (correcto — cert NO debería dispararse) pero el certificado seguía apareciendo. Hay alguna ruta que escapa al gate de `updateProgress`.

Posibles rutas que pueden disparar el cert:

1. `updateProgress` modules mode → `checkQuizGateAndShowCert()` (guard reciente: solo `areAllModulesCompleted()`).
2. `updateProgress` no-modules mode → `checkQuizGateAndShowCert()` cuando `pct >= 100`.
3. `selectCertView()` → `showCertSection()` (guard `isCertModuleUnlocked()` = alias de areAllModulesCompleted).
4. `checkQuizGateAndShowCert()` internamente → `fallbackToCert()` → `showCertSection()` cuando no hay quiz / ya pasó / etc.
5. `showQuizResult(score, passed)` post-quiz pass → `showCertSection()` (sin guard explícito — asume que llegó al quiz porque cert era eligible).
6. Quizá una ruta antigua que llamaba `showCertSection` directo y no se detectó.

### Solución: guard DURO al entrar a `showCertSection` y `checkQuizGateAndShowCert`

```js
function isCertReady() {
  if (isModulesMode) return areAllModulesCompleted();
  if (!TOTAL_VIDEOS) return false;
  const realCount = [...completedSet]
    .filter(s => typeof s === 'string' && !s.startsWith('-'))
    .length;
  return realCount >= TOTAL_VIDEOS;
}

function showCertSection() {
  if (!isCertReady()) {
    console.warn('[showCertSection] BLOCKED — isCertReady() === false');
    return;
  }
  // ... resto idéntico
}

async function checkQuizGateAndShowCert() {
  if (!isCertReady()) {
    console.warn('[checkQuizGateAndShowCert] BLOCKED — isCertReady() === false');
    return;
  }
  // ... resto idéntico
}
```

**Efecto**: cualquier ruta indebida que llame a `showCertSection` o `checkQuizGateAndShowCert` se corta en seco con un warning en consola. El cert solo aparece cuando `isCertReady()` (= `areAllModulesCompleted()` en modules mode) es `true`.

### Simplificación de `updateProgress` (modules mode)

Antes el branch decía `if (certEligible && total > 0)`. Ahora `if (areAllModulesCompleted())` sin compuertas adicionales. La variable `certEligible` se eliminó (era redundante). El guard en `showCertSection` es el último filtro.

### Lo que NO se cambia

- **`updateProgress` no-modules**: sigue con `if (pct >= 100) checkQuizGateAndShowCert()`. El nuevo guard en `checkQuizGateAndShowCert` valida con `isCertReady` que en no-modules mode usa `pct >= 100` también. Consistente.
- **Post-quiz `showCertSection`** (línea 2601): la llamada tras `passed=true` queda igual. Si por alguna razón el alumno pasó el quiz pero ya no es cert-ready (revirtió completión, edge case raro), el guard bloquea. Comportamiento correcto.
- **`selectCertView`**: el guard interno `isCertModuleUnlocked()` se mantiene. Doble seguridad con el guard de `showCertSection`.

---

## Etapa X.72 — `course_modules.order_num` empieza en 1 (no en 0)

Convención fijada: el `order_num` de los módulos al crearlos desde el form (admin o coach) **empieza en 1**, no en 0. La razón: `liveCompletionIndex(m) = -1 * order_num` genera el `video_index` del live para `video_progress`. Si `order_num = 0` → `video_index = 0` → **colisión** con el flat-index de la primera lección (que también es 0). Resultado: marcar el live de un módulo confundía la completitud con la primera lección.

### Cambio en `admin.html`

`getModulesFromForm()` línea 2484:

```js
// Antes
order_num: i,
// Ahora
order_num: i + 1,    // empieza en 1 — evita colisión liveCompletionIndex / lesson_flat_idx
```

### Cambio en `coach.html`

`getCoachModulesFromForm()` línea 3079: idéntico cambio `i` → `i + 1`.

### Defensive fallback en `curso.html` (sin cambios)

`liveCompletionIndex(m)` ya tenía el fallback `(order_num > 0 ? order_num : 1)` desde X.56 — sigue ahí como red de seguridad para módulos legacy en BD con `order_num=0`. Con el fix de X.72, los módulos nuevos nunca disparan ese fallback (porque `order_num >= 1`), pero los existentes con `order_num=0` seguirían mapeando a `-1` (no a `0`). El fallback evita colisiones en el lado de lectura aunque la BD tenga datos viejos.

### `order_num` de lecciones

Las lecciones (`course_lessons.order_num`) **siguen empezando en 0** dentro de cada módulo. No hay colisión porque las lecciones se identifican en `completedSet` por el flat-index (calculado vía `LESSONS_FLAT`) o por su UUID, no por `order_num` directo.

### Pendiente / cleanup

Módulos existentes en BD con `order_num=0` pueden corregirse manualmente:

```sql
UPDATE public.course_modules
   SET order_num = order_num + 1
 WHERE order_num = 0;
```

No es bloqueante porque el fallback defensive de `liveCompletionIndex` los mapea a `-1` correctamente. Pero re-escribir los módulos desde el wizard del admin/coach también los corrige automáticamente (al guardar se persiste `i + 1`).

---

## Etapa X.73 — Admin "Ver curso": grabación editable de lives (modules-mode)

Espejo del flujo de `coach.html` (X.46/X.53) en el modal "Ver curso" de admin.html. El admin ahora puede subir/editar `recording_url` de los lives finalizados directamente desde la vista de detalle del curso, sin tener que entrar al wizard de edición.

### Cambios en `admin.html`

**1. `getEmbedUrl(url)`** agregado después de `toYoutubeEmbed` — espejo de la función ya existente en `curso.html` (X.40) y `coach.html` (X.53). Normaliza:
- YouTube → `https://www.youtube.com/embed/ID`.
- Drive → `https://drive.google.com/file/d/ID/preview`.
- Otra URL → tal cual; vacío → `''`.

**2. `vcRenderVideos(course)` extendido**: si `course.course_type === 'modules'`, delega a `vcRenderModulesWithLives(course, wrap)`. Los modos `is_live` legacy y videos sueltos siguen igual.

**3. `vcRenderModulesWithLives(course, wrap)`** nueva: 3 queries en paralelo (módulos + lecciones + lives), agrupa por module_id y renderiza un card por módulo:
- Título del módulo + lecciones (idéntico look a videos sueltos).
- Si hay live + `!live_ended`: card dashed con "📡 Live pendiente" + fecha + link al meet.
- Si hay live + `live_ended`: card lime con "✅ Live finalizado" + input editable de `recording_url` + botón "Guardar grabación" + span para mensaje inline.

**4. `vcRenderLiveBlock(live)`** helper que genera el HTML del bloque de live (pendiente o finalizado).

**5. `saveLiveRecordingAdmin(liveId, btn)`** nueva: aplica `getEmbedUrl(rawUrl)`, UPDATE `course_lives.recording_url` con `.select()` para detectar RLS, feedback inline (✅ Grabación guardada en lime / ⚠️ error en rojo). Patrón idéntico al `saveLiveRecording` de coach.html.

### Flujo end-to-end

1. Admin → Tab Cursos → ⋮ Ver curso → modal abierto.
2. Sección "🎥 Contenido del curso" lista los módulos del curso modules-mode.
3. Para cada módulo con live finalizado: input pre-poblado con el `recording_url` actual (vacío si no hay).
4. Admin pega URL (YouTube o Drive) → "Guardar grabación" → `getEmbedUrl` normaliza → UPDATE → input se refresca con el URL canónico + "✅ Grabación guardada" 1.8s.
5. El alumno verá la grabación en `curso.html` al recargar (sin notif real-time todavía).

### Lo que NO se hizo

- **Edición de `recording_url` para `course_type='live'` legacy** ya existía vía `course.recording_url` / `course.recordings`. No tocado.
- **Notif push al alumno** cuando se sube la grabación — pendiente.
- **Bulk upload** (subir grabaciones de varios lives a la vez) — no necesario para el caso de uso.

---

## Etapa X.75 — Fix evento Purchase del Píxel de Meta

> Numeración: la etapa anterior (X.79) instaló el píxel base. Este fix se nombra X.75 a pedido del usuario (continuidad con el commit que solicitó). El orden lógico es post-X.79 pero conviven sin problema.

**Síntoma reportado**: hubo una compra real vía Mercado Pago. En el Administrador de Eventos de Meta apareció solo el `PageView`, **nunca el `Purchase`**.

### Diagnóstico

**Causa raíz #1 — `back_urls` apuntaban a dominio equivocado.**

En `supabase/functions/create-preference/index.ts` los `back_urls` estaban hardcodeados a `https://ekapradacoach.github.io/HBLAB/...` (GitHub Pages legacy). El sitio real de producción es **`hblabarg.com`**. Cuando MP redirigía tras pago aprobado, mandaba al alumno al dominio viejo, no al actual.

**Causa raíz #2 — `sessionStorage` cross-origin.**

El payload `checkout_payload` (con `final_price` + `currency`) se persiste en `hblabarg.com/checkout.html` ANTES de redirigir a MP. Pero MP redirigía a `ekapradacoach.github.io/HBLAB/checkout-success.html` → **cross-origin**. `sessionStorage` es per-origin → los datos no estaban disponibles → `getPurchaseData()` retornaba `null` → `fbq('track', 'Purchase', ...)` nunca se ejecutaba.

**Por qué `PageView` SÍ funcionaba**: GitHub Pages servía una copia del repo (incluyendo el píxel base instalado en X.79). El mismo Pixel ID (`1909301979776543`) dispara desde cualquier dominio, así que el PageView llegaba a Meta. Pero el Purchase necesita el `value` del payload, que estaba inaccesible por la frontera de origin.

**Otros flujos NO afectados** (mismo origin, redirect relativo `window.location.href = 'checkout-success.html'`):
- Cupón 100% off (`checkout.html:720`).
- PayPal post-capture (`checkout.html:885`).

### Fix doble — defensa en profundidad

**1. `back_urls` corregidos** (`create-preference/index.ts`):

```js
back_urls: {
  success: 'https://hblabarg.com/checkout-success.html',
  failure: 'https://hblabarg.com/checkout.html',
  pending: 'https://hblabarg.com/checkout-pending.html',
},
```

Con esto solo, el sessionStorage del checkout original sigue siendo accesible cuando MP redirige (mismo origin). Pero por defensa adicional, también:

**2. `external_reference` enriquecido con `amount` + `currency`** (`create-preference/index.ts`):

```js
const externalRef = JSON.stringify({
  slug, email, nombre, apellido,
  coupon_code: couponCode,
  course_id:   course.id,
  amount:      expectedPrice,   // ← nuevo
  currency:    'ARS',           // ← nuevo
});
```

MP devuelve `external_reference` URL-encoded en el back_url como query param. checkout-success.html lo lee, parsea el JSON y extrae `amount` + `currency`.

`process-payment` no necesita cambios — sigue leyendo solo los campos que conoce (`slug`, `email`, `nombre`, `apellido`, `coupon_code`). Los campos extra `amount`/`currency` son ignorados sin error.

**3. `checkout-success.html` con cascada de fuentes**:

`getPurchaseData()` reescrita con 3 fuentes en orden de confiabilidad:

| # | Fuente | Cuándo aplica |
|---|---|---|
| 1 | `external_reference` del query param (parseado como JSON) | MP — resiliente a cross-origin |
| 2 | `sessionStorage.checkout_payload` | Cupón 100%, PayPal, MP same-origin |
| 3 | Query params sueltos `?amount=`/`?currency=` | Defensivo (si MP empieza a mandarlos directos) |

Si ninguna devuelve `value > 0` + `currency ∈ {ARS, USD}` → **NO dispara** (sin hardcodear) + `console.warn` con la query string para debugging.

Logging activo (`console.log('[Meta Pixel] Purchase →', data)`) para verificar en producción tras el deploy.

### ⚠️ Deploy pendiente

**Re-deploy manual de `create-preference`** en Supabase Dashboard:
1. Edge Functions → `create-preference` → Code.
2. Pegar el contenido actualizado.
3. Deploy updates.

Sin este re-deploy, MP sigue redirigiendo al dominio viejo. El cambio en `checkout-success.html` (cascada de fuentes) ya funciona para el branch del cupón 100% y PayPal, pero los pagos MP siguen rotos hasta que se redeploye la Edge Function.

---

## Etapa X.79 — Instalación del Píxel de Meta (`Meta Pixel`)

> Nota: el prompt original pedía nombrar esta etapa "X.74", pero ese número ya estaba ocupado por "Sección Características del curso" — para no romper la trazabilidad histórica se usa X.79 (siguiente disponible).

**ID del Píxel:** `1909301979776543`.

### Qué se instaló

**Evento `PageView` (base)** — pegado dentro de `<head>`, **arriba de todo**, en cada uno de los 18 archivos `.html` del proyecto:

```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1909301979776543');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1909301979776543&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->
```

**Archivos cubiertos (los 18):**

| # | Archivo | Tipo |
|---|---|---|
| 1 | `index.html` | landing |
| 2 | `venta-curso.html` | venta dinámica |
| 3 | `checkout.html` | checkout |
| 4 | `checkout-success.html` | post-pago (+ Purchase) |
| 5 | `checkout-pending.html` | post-pago |
| 6 | `login.html` | auth |
| 7 | `set-password.html` | auth (post-invite) |
| 8 | `dashboard.html` | alumno |
| 9 | `curso.html` | alumno (contenido) |
| 10 | `perfil.html` | alumno |
| 11 | `coach.html` | coach |
| 12 | `admin.html` | admin |
| 13 | `webinar-hipertrofia.html` | legacy redirect |
| 14 | `carrera-hibrida.html` | legacy redirect |
| 15 | `entrenamiento-hibrido.html` | legacy redirect |
| 16 | `curso-webinar-hipertrofia.html` | legacy redirect |
| 17 | `curso-carrera-hibrida.html` | legacy redirect |
| 18 | `curso-entrenamiento-hibrido.html` | legacy redirect |

Como no había píxel en ningún archivo, **los 18 son agregados nuevos** en esta etapa.

### Evento `Purchase` (solo en `checkout-success.html`)

Después del bloque base del píxel, se agregó un segundo `<script>` que:

1. Intenta leer `sessionStorage.checkout_payload` (lo persiste `checkout.html` antes de redirigir a MP — campos `final_price` + `currency`).
2. Fallback: query params `?amount=&currency=` (algunos PSPs los devuelven).
3. Valida `value > 0` y `currency ∈ {ARS, USD}`.
4. Si OK → `fbq('track', 'Purchase', { value, currency })`.
5. Si no hay datos confiables → **NO dispara** y loguea `console.warn`. No se hardcodea ningún valor.

Se dispara **una sola vez** al cargar (la página solo se renderiza si MP redirigió a `success`, lo que implica pago aprobado).

NO se agregó Purchase en `checkout-pending.html` ni en ninguna otra página.

### Regla a futuro (OBLIGATORIA)

> **Toda página `.html` nueva DEBE incluir el bloque base del Píxel de Meta en su `<head>` (ID `1909301979776543`).**
>
> El sitio no tiene head compartido — cada `.html` es independiente, así que el píxel **no se hereda**. Hay que pegarlo manualmente en cada archivo nuevo (idealmente como primer elemento dentro de `<head>`, antes de cualquier `<meta>` o `<link>`).
>
> Si la página nueva es post-compra confirmada (equivalente a `checkout-success`), también agregar el evento `Purchase` siguiendo el mismo patrón (leer monto real de `sessionStorage.checkout_payload` o de los query params del PSP — nunca hardcodear).

---

## Etapa X.78 — `toLocalDatetimeInput` reescrito con getters locales

El fix de X.77 usaba `new Date(d.getTime() - offset).toISOString().slice(0, 16)` para construir el string del input. Aunque conceptualmente funciona en muchos casos, mezcla métodos UTC (`toISOString`) con manipulación de offset local — frágil ante DST y propenso a errores off-by-one cuando el día cambia por el ajuste de offset.

**Approach correcto** — usar directamente los getters locales del objeto `Date` (que ya respetan el timezone del sistema operativo + DST automáticamente):

```js
function toLocalDatetimeInput(isoUtc) {
  if (!isoUtc) return '';
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const hh   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}
```

- `new Date(isoUtc)` parsea el ISO UTC.
- Los getters `getHours()`, `getDate()`, etc. devuelven la representación en **hora local del browser** sin que tengamos que calcular offsets manualmente — el motor JS ya lo hace, contemplando DST si aplica.
- El string `'YYYY-MM-DDTHH:MM'` resultante es exactamente lo que el input `datetime-local` quiere.

`fromLocalDatetimeInput` queda igual (X.77): `new Date(localStr).toISOString()` — el browser interpreta el string sin offset como hora local y `toISOString` lo convierte a UTC.

**Callsites no cambian**: los 6 puntos del wizard (3 lecturas + 3 guardados) siguen llamando a los mismos `toLocalDatetimeInput` / `fromLocalDatetimeInput`. Solo cambió la implementación interna del primero.

---

## Etapa X.77 — Fix timezone en `datetime-local` del wizard (admin.html)

Bug: los campos `<input type="datetime-local">` del wizard de cursos (`cf-mod-unlock`, `cf-mod-live-date`, `cf-live-date`) cargaban valores de Supabase en UTC y los mostraban como si fueran hora local — el admin que estaba en Argentina (UTC-3) veía un live programado para las 19:00 mostrado como 22:00 (UTC literal). Igual problema en sentido inverso: al guardar, `new Date(localStr).toISOString()` ya funcionaba correctamente (interpreta local → UTC), pero quedaba inconsistente con la lectura buggy.

### Helpers nuevos

```js
function toLocalDatetimeInput(isoUtc) {
  if (!isoUtc) return '';
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset() * 60000;       // ms
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}
function fromLocalDatetimeInput(localStr) {
  if (!localStr) return null;
  const d = new Date(localStr);                        // se interpreta como hora local
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
```

`toLocalDatetimeInput(isoUtc)`: convierte un timestamp UTC al string que el input `datetime-local` interpreta como hora local. Resta el offset del cliente antes del `toISOString().slice(0,16)` → el resultado, parseado de nuevo por el browser, mantiene la hora local correcta.

`fromLocalDatetimeInput(localStr)`: el valor de un input `datetime-local` (ej. `"2026-05-28T19:00"`) se interpreta nativamente como local. `new Date(s).toISOString()` convierte a UTC para guardar. Equivalente a `new Date(localStr).toISOString()` pero con guards null/NaN explícitos.

### Aplicación

**Lecturas** (Supabase UTC → input local):
- `cf-mod-unlock` (módulo `unlock_at`) — en `addModuleRow` línea ~2302.
- `cf-mod-live-date` (módulo `live_date`) — en `addModuleRow` línea ~2304.
- `cf-live-date` (curso-level `live_date`) — en `editCurso` línea ~3120.

**Guardados** (input local → ISO UTC):
- `mod.unlock_at` en `getModulesFromForm` línea ~2500.
- `mod.live.live_date` en `getModulesFromForm` línea ~2505.
- `liveDate` en `saveCurso` línea ~3152.

### Fuera de scope

`cd-target` (countdown del tab Landing) y `cp-valid-until` (cupones) usan el patrón viejo (`String(...).slice(0, 16)`) pero quedan **sin tocar** porque el usuario limitó el scope al wizard de cursos. Pueden migrarse en una etapa posterior copiando los mismos helpers.

---

## Etapa X.76 — Fixes mobile del hero en `venta-curso.html`

4 ajustes para mejorar la experiencia en pantallas chicas.

### 1. Banner global → marquee animado en mobile

Antes el `#banner-bar` era texto estático centrado, en mobile el texto largo se cortaba o quedaba apretado. Ahora cuando el viewport está debajo de **768px**, se convierte en marquee horizontal infinito (mismo patrón que el anuncio global de `index.html`, Sesión 55).

- **HTML**: el texto se envuelve en `<span class="banner-text">` para poder animarlo con CSS.
- **CSS**: `#banner-bar.scrolling .banner-text { animation: banner-bar-scroll 22s linear infinite }` con `transform: translateX(0 → -100%)`. `padding-left: 100%` para que el texto empiece fuera de la pantalla.
- **JS**: `applyBannerMode()` agrega/saca `.scrolling` según `window.innerWidth < 768`. Listener `resize` para reaccionar a rotaciones de pantalla.
- **Font-size en mobile**: `0.82rem` vía `@media (max-width: 768px) { #banner-bar }`. En desktop sigue siendo `0.82rem` también (no cambia), pero el ajuste explícito previene heredar tamaños mayores si un día se modifica el default.

### 2. Hero title → clamp más flexible

Antes: `clamp(2rem, 8vw, 2.8rem)` en `@media (max-width: 680px)` — mínimo 2rem (32px) que en títulos largos de 4-6 palabras se cortaba a dos+ líneas y desbordaba.

Ahora (`@media (max-width: 768px)`):
```css
.hero-title {
  font-size: clamp(1.6rem, 5vw, 3rem);
  line-height: 1.15;
  word-break: break-word;
}
```

Mínimo más chico (1.6rem = 25.6px) + `word-break: break-word` evita que palabras largas (URLs, hashtags) rompan el layout.

### 3. Botón "Comprar ahora" centrado en mobile

Antes: solo `<=440px` aplicaba `width: 100%; justify-content: center`. En tablets (440–768px) el botón tenía padding ancho fijo y a veces el ícono+texto quedaba descentrado.

Ahora (`@media (max-width: 768px)`):
```css
.btn-buy-hero {
  display: flex;
  width: 100%;
  text-align: center;
  justify-content: center;
  padding: 16px 24px;
  font-size: 1rem;
}
```

`display: flex` (no `inline-flex`) + `text-align: center` + `justify-content: center` garantiza centrado tanto del SVG como del texto en cualquier ancho.

### 4. Descripción visible sin recortes

Antes: `.hero-subtitle` no tenía media query mobile — en pantallas chicas, el texto Playfair italic con `max-width: 620px` podía quedar con `font-size` muy chico relativo al título y se acortaba visualmente.

Ahora:
```css
.hero-subtitle {
  font-size: 1rem;
  line-height: 1.6;
  overflow: visible;
  max-height: none;
  word-break: break-word;
}
```

`overflow: visible` + `max-height: none` son defensivos — la spec del usuario explícitamente lo pedía aunque el default ya era visible. `word-break: break-word` protege contra descripciones con URLs.

### Consolidación de breakpoints

El media query existente `(max-width: 680px)` quedó SOLO con `section { padding }`, `.footer-top`, `.temario-list li`. Todo lo del hero se movió a `(max-width: 768px)` que es el breakpoint estándar de tablet/mobile.

---

## Etapa X.75 — "Descripción de modalidad" (texto libre debajo de las características)

Campo nuevo en el wizard del admin (Step 3 "Página de venta") y display en `venta-curso.html` debajo del grid de características. Texto libre para explicar formato, fechas, condiciones especiales, etc.

### SQL requerido (pendiente)

```sql
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS modalidad_descripcion TEXT;
```

Si la columna no existe, los cursos viejos cargan `null` y el campo no se muestra. Tras el SQL, el textarea del admin persiste su contenido.

### admin.html

- **Nueva form-section "Descripción de modalidad"** en Step 3, **justo debajo de "Características del curso"**. Tagline: *"Texto libre que aparece debajo de las características en la página de venta. Usalo para explicar el formato, fechas, condiciones especiales, etc."*
- `<textarea class="form-textarea" id="cf-modalidad-descripcion" rows="6">` con placeholder de ejemplo.
- Wiring: `editCurso` lee `c.modalidad_descripcion`, `saveCurso` agrega `modalidad_descripcion` al payload (trim + `null` si vacío), `resetCursoForm` blanquea, `loadCursos` SELECT extendido.

### venta-curso.html

- **SELECT extendido** con `modalidad_descripcion`.
- **`<p class="modalidad-desc" id="modalidad-desc" style="display:none">`** agregado dentro de `#caracteristicas .container`, **después del `.features-grid`**.
- `renderCaracteristicas`: tras pintar el grid, si `course.modalidad_descripcion` tiene texto → `modDescEl.textContent = txt; display = ''`. Sino se queda oculto.
- `textContent` (no `innerHTML`) → escape automático. Combinado con `white-space: pre-line` en CSS, los saltos de línea del admin se respetan sin permitir HTML inyectado.

### CSS

```css
.modalidad-desc {
  margin-top: 36px;
  padding-top: 28px;
  border-top: 1px solid var(--card-border);   /* separador sutil arriba */
  font-size: 1rem;
  line-height: 1.7;
  color: var(--gray-text);
  max-width: 820px;
  white-space: pre-line;                       /* preserva los \n del admin */
}
```

Tipografía coherente con la descripción del hero (texto claro, color gris secundario).

### Edge cases

- **Sin features activos pero con modalidad** → la sección `#caracteristicas` se mantiene visible mostrando solo el párrafo de modalidad (sin grid).
- **Sin features activos y sin modalidad** → la sección se oculta por completo (`display: none`).
- **Con features pero sin modalidad** → grid renderiza normal, `<p>` queda oculto.

---

## Etapa X.74.1 — Toggles de "Características" configurables desde admin

Follow-up de X.74. Antes los 6 bloques se mostraban hardcoded para todos los cursos. Ahora el admin elige cuáles aparecen por curso desde el wizard (Step 3 "Página de venta").

### SQL requerido (pendiente de ejecutar en Supabase)

```sql
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS features JSONB
  DEFAULT '["inicio","lives","grabaciones","material","foro","certificado"]'::jsonb;
```

Si la columna no existe todavía: cursos nuevos guardan `features` con `null` (PostgREST lo ignora), y `venta-curso.html` cae al default (todos los bloques activos). Tras correr el SQL, los toggles del admin se persisten correctamente.

### admin.html

- **Nueva sección en Step 3 del wizard "Página de venta"** (justo antes de "Lo que vas a aprender"): "Características del curso" con 6 toggles (uno por bloque). Usa el componente `.toggle-row` existente.
- **`FEATURE_CATALOG`** — array fijo de 6 entradas `{ key, icon, title }`.
- **`renderFeatureCheckboxes(enabledKeys)`** — renderiza los toggles marcando los que están en `enabledKeys`. Si recibe `null`/`undefined` → todos activos por default.
- **`getFeaturesFromForm()`** — extrae el array de `key`s activas.
- **Wiring**: `editCurso` llama `renderFeatureCheckboxes(c.features)`, `saveCurso` agrega `features: getFeaturesFromForm()` al payload, `resetCursoForm` llama `renderFeatureCheckboxes(null)` para reset, `loadCursos` agrega `features` al SELECT.

### venta-curso.html

- **SELECT extendido** con `features`.
- **`renderCaracteristicas(course)`** resuelve el set activo:
  - `course.features` array → `new Set(course.features)`.
  - `course.features` string JSON → parsea y luego Set.
  - `course.features` null/undefined → **todos los 6 keys** (compat).
- Filtra `items` por `activeSet.has(it.key)`.
- Si `activeSet.size === 0` o `items.length === 0` después de filtrar → **oculta la sección entera** con `section.style.display = 'none'`.

### Lo que NO se hizo

- **Editar título / descripción / ícono por bloque desde admin**: las descripciones quedan fijas en JS de `venta-curso.html`. Esto mantiene consistencia entre cursos (el "Foro de consultas" siempre dice lo mismo, etc.). Si en el futuro se quiere editar por curso, conviene un `features JSONB` con shape `{ key, title, desc, icon }` en vez de solo array de keys.
- **Override de la fecha de inicio**: el bloque "📅 Inicio del curso" sigue tomando la fecha del primer módulo automáticamente (no hay input manual en el admin).

---

## Etapa X.74 — Sección "Características del curso" en `venta-curso.html`

Nueva sección genérica entre el hero y "Lo que vas a aprender", reutilizable para cualquier curso de la plataforma. Muestra 6 bloques en grilla con info estándar del producto + 1 campo dinámico (fecha de inicio).

### HTML

```html
<section id="caracteristicas">
  <div class="container">
    <div class="features-header">
      <span class="section-label">Lo que incluye</span>
      <h2 class="section-title">Todo lo que vas a tener al inscribirte</h2>
    </div>
    <div class="features-grid" id="features-grid"></div>
  </div>
</section>
```

### 6 bloques

| Ícono | Título | Descripción |
|---|---|---|
| 📅 | Inicio del curso | **Dinámico**: fecha del primer módulo (con highlight lime) |
| 🎥 | Clases en vivo | Módulos en vivo con el coach, uno cada 15 días los domingos. |
| 📁 | Grabaciones permanentes | Cada clase queda disponible en la plataforma sin vencimiento. |
| 📊 | Material de cada módulo | Diapositivas descargables incluidas en cada clase. |
| 💬 | Foro de consultas | Espacio dedicado para preguntas en cada módulo. |
| 🏅 | Certificado de finalización | Obtenés tu certificado al completar el curso. |

### Resolución de la fecha de inicio

`renderCaracteristicas(course)` async, best-effort:

1. SELECT `course_modules.unlock_at` ordenado por `order_num` LIMIT 1.
2. Si `unlock_at` null → SELECT `course_lives.live_date` para ese `module_id`.
3. Fallback final: `course.live_date` (modo live legacy).
4. Si no hay ninguno → "Disponible ahora".

Formato: `toLocaleDateString('es-AR', { weekday, day, month, year })` → ej. `"domingo 14 de junio de 2026"`.

Try/catch envuelve toda la lógica — si fallan las queries, el bloque cae al placeholder y el resto de la sección renderiza igual.

### CSS

Variables existentes (`--card-bg`, `--card-border`, `--lime`, `--gray-text`). Bloques con borde `1px solid var(--card-border)`, hover `border-color: rgba(200,230,0,0.3)` + `translateY(-3px)` (mismo patrón que `.learn-item`). Ícono dentro de un cuadrado lime soft (`rgba(200,230,0,0.08)` + borde `rgba(200,230,0,0.2)`).

**Grid responsivo:**
- Desktop (`>900px`) → `repeat(3, 1fr)` = 3×2.
- Tablet (`560px–900px`) → `repeat(2, 1fr)` = 2×3.
- Mobile (`<560px`) → `1fr` = 1 columna.

### Wiring

- `renderCaracteristicas(course)` se llama en `init()` justo antes de `renderLearn`, sin `await` (es async pero no bloquea el resto del render).
- `.feature-card` agregado al selector del `IntersectionObserver` (animate-on-scroll).

---

## Etapa X.80 — Talleres presenciales (in-person workshops)

Un **taller** es un `courses` row con `is_workshop = true`. Reusa toda la infra de cursos (checkout, pagos, alta de usuario, magic link) pero con UX diferenciada en landing, dashboard, admin y email.

**Columnas nuevas en `courses`** (SQL ya ejecutado): `is_workshop BOOLEAN DEFAULT false`, `location TEXT` (dirección), `max_seats INT` (cupos). La **fecha/hora del taller reusa `courses.live_date`** (no hay columna nueva de fecha).

**Filtro canónico de taller**: `is_workshop = true AND is_active = true`. `taller.html` y `checkout.html` leen `?slug=` (NO `?course=`).

- **`taller.html`** (NUEVO, modelado sobre `venta-curso.html`): lee `?slug=`, query `courses WHERE slug = X AND is_workshop = true`. Hero con badge violeta "🏋️ Presencial", fecha (`formatTallerDate` sobre `live_date`), lugar (`location`), CTA "Reservar lugar" → `checkout.html?slug=X&currency=ARS`. Soporta `?buy=1` para auto-abrir compra. Aplica `getEffectivePrice`.
- **`index.html`** — sección `#talleres` ubicada entre `#proximos` y `#incompany` (orden de secciones: `#cursos` → `#proximos` → `#talleres` → `#incompany` → `<footer>`, Etapa X.85). `loadTalleres()` query talleres activos, renderiza cards → `taller.html?slug=X`, auto-oculta la sección si no hay ninguno. Los talleres se **excluyen de `loadCursos()`** con `.or('is_workshop.is.null,is_workshop.eq.false')` para no duplicarse.
- **`admin.html`** Tab Cursos: badge violeta "🏋️ Presencial" en la tabla, toggle "Es taller presencial" (`cf-is-workshop`) que revela `cf-location` + `cf-max-seats`, y botón "👥 Inscritos" por taller → modal con lista de inscritos + export CSV. SELECT de `loadCursos` extendido con `is_workshop, location, max_seats`.
- **`dashboard.html`**: card diferenciada cuando `is_workshop=true` — badge violeta, fecha + lugar, **sin barra de progreso**, botón "Ver entrada" → modal-ticket (en vez de "Ir al curso →").
- **`process-payment/index.ts`**: si el curso comprado tiene `is_workshop=true`, envía email diferenciado — subject `🎟️ ¡Tu lugar está reservado! — {courseTitle}`, confirmación de reserva + fecha + dirección + instrucción del ticket + credenciales de acceso (magic link). Mismo dark theme inline. **⚠️ Requiere re-deploy manual** de `process-payment` en Supabase Dashboard.

**Cómo crear un taller**: admin → Tab Cursos → Nuevo curso → activar "Es taller presencial" → completar `location` + `max_seats` + `live_date` (fecha del encuentro) + precio → Guardar. Aparece en la sección Talleres de la landing y en `taller.html?slug=X`. Ver inscritos con "👥 Inscritos" (CSV).

**Etapa X.81 — link Meet/Zoom opcional en talleres**: en `saveCurso()` la validación `if (isLive && !liveUrl) ...` que exigía el link de videollamada ahora es `if (isLive && !liveUrl && !isWorkshop) ...` — un taller presencial no requiere link de Meet/Zoom (el encuentro es físico) y no muestra el error rojo. Las lecturas de `isWorkshop`/`location`/`maxSeats` se hacen antes de esa validación.

**Etapa X.82 — sección learning_points en taller.html**: la sección `#learn` (renderiza `learning_points`) usa badge "Lo que vas a aprender" + título "¿Qué vas a aprender?" (antes "A quién va dirigido" / "¿Para quién es este taller?"). Solo texto estático del header; el contenido dinámico no cambia.

**Etapa X.83 — instructor dinámico en taller.html**: la sección `#instructor` ya no está hardcodeada con Erika. `renderInstructores(course.id)` llama la RPC `get_course_coaches` (misma que venta-curso.html) y renderiza un `.instructor-card` por coach asignado (foto o iniciales + nombre + bio). Soporta N coaches; si no hay ninguno → oculta la sección (`display:none`).

**Etapa X.84 — descripción de modalidad en taller.html**: `taller.html` ahora trae `modalidad_descripcion` en su SELECT y la renderiza con `renderModalidad(course)` en la sección `#modalidad` (badge "Modalidad" + título "Cómo es el taller"), ubicada entre el hero (características fecha/lugar/cupos) y la sección "¿Qué vas a aprender?", antes del temario. Si el campo está vacío → la sección queda oculta. `white-space: pre-line` preserva los saltos de línea del admin.

**Etapa X.85 — reorden de #talleres en index.html**: la sección `#talleres` se movió de después de `#incompany` a antes. Orden final: `#cursos` → `#proximos` → `#talleres` → `#incompany` → `<footer>`. Solo movimiento de HTML; lógica (`loadTalleres()`) y estilos sin cambios.

**Etapa X.86 — CTA de lanzamientos respeta is_workshop**: la tabla `launches` no guarda URL (solo `course_id` + `cta_text`); el link del CTA se arma en `loadLaunches()` (index.html). Ahora el embed trae `courses(..., is_workshop)` y la URL se construye como `${is_workshop ? 'taller' : 'venta-curso'}.html?slug=X`. `saveLanzamiento`/`loadLanzamientos` (admin) no requirieron cambios (no construyen URL).

**Etapa X.87 — countdown card respeta is_workshop**: el curso vinculado a la cuenta regresiva (`loadSiteConfig` → `renderCountdownCourseCard`) ahora arma la URL con `${is_workshop ? 'taller' : 'venta-curso'}.html?slug=X` (SELECT extendido con `is_workshop`). La misma `url` se usa en el onclick del wrap, el onclick de la card y el botón "Ver curso".

**Etapa X.88 — slider de lanzamientos en mobile/webview**: en `@media (max-width:768px)` el slide pasa a `min-height:480px`, el overlay se aclara (capa plana `0.50`→`0.12`, degradado inferior conservado para legibilidad), `.slide-bg` usa `background-position:center top`. Además `loadLaunches` renderiza un `<img class="slide-img-fallback">` (oculto en desktop, `display:block` en mobile) detrás del overlay como fallback porque el `background-image` a veces no renderiza en el webview de Instagram/TikTok.

**Etapa X.89 — imagen mobile por lanzamiento (`launches.image_url_mobile`)**: columna nueva `image_url_mobile TEXT` (nullable). El form de lanzamientos en admin.html tiene un segundo campo de imagen opcional (upload o URL, global `_lzImageUrlMobile`, funciones `*Mobile`). En `loadLaunches` (index.html) se elige `slideImg = (window.innerWidth < 768 && l.image_url_mobile) ? l.image_url_mobile : l.image_url` y se aplica al `background-image` y al `<img class="slide-img-fallback">`. Si la mobile está vacía → fallback a `image_url`.

**Etapa X.90 — fix recuperación de contraseña (redirect a set-password.html)**: en `login.html` el panel "Recuperar contraseña" usaba `resetPasswordForEmail(redirectTo: origin + '/dashboard.html')` → el link del email rebotaba al login. Ahora `redirectTo: 'https://hblabarg.com/set-password.html'`. En `set-password.html` se agregó `sb.auth.onAuthStateChange((event, session) => { if (event === 'PASSWORD_RECOVERY' && session) revealForm(); })` para mostrar el form de nueva contraseña (nunca redirigir al dashboard) cuando el SDK auto-detecta el link de recovery (`detectSessionInUrl` está activo por default). Flag `_formRevealed` evita que `showError` pise el form ante el race con el bootstrap manual. La URL `hblabarg.com/set-password.html` ya está en la allow-list de Redirect URLs (compartida con el flujo de invite/magic link).

**Etapa X.91 — fix PayPal: procesar `status=APPROVED`**: el branch PayPal de `process-payment` skipeaba el webhook cuando llegaba con `status=APPROVED` (pago autorizado, captura en proceso) → el alumno pagaba y no recibía acceso ni email. Fix: `const isCompleted = orderStatus === 'COMPLETED' || orderStatus === 'APPROVED'`. El flujo aguas abajo es idempotente (UPSERT `onConflict` + lookup en `profiles.email`), así que un webhook `CAPTURE.COMPLETED` posterior del mismo pago no duplica nada. **Requiere re-deploy manual** de `process-payment` en el Dashboard.

**Etapa X.92 — checkout cobra el precio vigente (scheduled_prices)**: `checkout.html` mostraba/cobraba el `price_ars`/`price_usd` base sin aplicar `scheduled_prices` (resolvía el pendiente de X.39). Se agregó `getEffectivePrice` (copia del de index.html/venta-curso.html) y `_basePrice` ahora sale del precio vigente. Para que no rompa la validación de monto server-side (X.30), también se aplicó el precio vigente en `create-preference` (`getEffectivePriceArs`) y `create-paypal-order` (`getEffectivePriceUsd`) — los tres usan la misma lógica. **Requiere re-deploy manual** de `create-preference` y `create-paypal-order`; sin ellos los pagos de cursos con scheduled_price activo fallan con `Monto inválido`.

---

## Usuarios registrados

| Email | Rol |
|-------|-----|
| `ekapradacoach@gmail.com` | `admin` |
| `test@hblab.com` | `student` (password: `HBLab2024!`) |
