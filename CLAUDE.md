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
├── login.html                     ← Login + Registro + Recuperar contraseña (3 paneles)
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
- `noindex, nofollow`: `dashboard.html`, `admin.html`, `coach.html`, `curso.html`, `curso-webinar-hipertrofia.html`, `curso-carrera-hibrida.html`, `curso-entrenamiento-hibrido.html`, `checkout.html`, `checkout-success.html`, `checkout-pending.html`

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
- Resultado neto: `loadResultadoNeto()` — ingresos − comisiones − ad_spend
- **Ventas por coach (`loadCoachesVentas`)**: acordeón colapsable por coach (Sesión 53). Cada coach es una fila clicable (`cursor:pointer`, `user-select:none`) con nombre + badge de cantidad de cursos + flecha `▾` + ganancia total. Click en la fila → `toggleCoursesRow('ventas-row-${coachId}', arrowEl)` (helper genérico ya usado en Tab Coaches) abre/cierra la sub-fila `<tr class="coach-courses-row">` que contiene una `<table class="coach-courses-subtable">` con curso, ventas y ganancia. Por default todos colapsados (CSS `.coach-courses-row { display:none; }`). El helper rota la flecha ▾↔▴ vía `innerHTML.replace`. ID prefix `ventas-row-` para no colisionar con `courses-row-` de Tab Coaches.

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

**Ubicación:** `hblab/supabase/functions/<name>/index.ts`. Hay tres funciones listas en el repo:

- **`invite-coach`** — `verify_jwt = true`. POST `{ email, role }`. Verifica que el caller sea admin (lee JWT del Authorization), llama `auth.admin.inviteUserByEmail(email)` con la service role key, hace UPSERT en `profiles.role`. Retorna `{ ok, user_id, email, role }`.
- **`create-preference`** — `verify_jwt = false`. POST `{ slug, email, nombre, apellido, amount, coupon_code }`. Resuelve el `course` por slug (con service role para bypassear RLS), llama a `https://api.mercadopago.com/checkout/preferences` con `MP_ACCESS_TOKEN`, devuelve `{ ok, init_point, sandbox_init_point, preference_id }` al cliente. El cliente redirige a `init_point`. El webhook de MP llega luego a `process-payment`. Etapa X.13.
- **`process-payment`** — `verify_jwt = false`. Webhook público de MP/PayPal. Verifica firma (placeholder hoy — bloque `TODO` con docs links + flag `PAYMENTS_ALLOW_UNVERIFIED=1` para dev), normaliza el payload por proveedor, resuelve `user_id` por email (con invite-on-the-fly si no existe), UPSERT en `user_courses` con `payment_status='paid'`, `status='active'`. Idempotente por `onConflict: 'user_id,course_id'`.

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
