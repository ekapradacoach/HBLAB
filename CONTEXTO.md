# HB Lab — Contexto del Proyecto

> **Última actualización:** 24 de abril de 2026 — Sesión 33 (fix loadProgreso unauthorized: courseId por parámetro)
> **Para Claude/Cursor:** Leer este archivo COMPLETO antes de tocar cualquier código.

---

## ¿Qué es HB Lab?
Plataforma web para vender cursos online de entrenamiento deportivo con respaldo científico.
Orientada a entrenadores y atletas que buscan formación aplicada en hipertrofia, programación y entrenamiento híbrido.

---

## Identidad Visual

| Elemento         | Valor                                                        |
|------------------|--------------------------------------------------------------|
| Fondo principal  | Azul marino oscuro `#1E2A3A`                                 |
| Verde limón      | `#C8E600`                                                    |
| Violeta          | `#7B4FBE` / `#9B6FDE`                                        |
| Blanco           | `#FFFFFF`                                                    |
| Texto gris       | `#94A3B8`                                                    |
| Card bg / border | `#243042` / `#2f3e52`                                        |
| Tipografía       | Inter (sans-serif) + Playfair Display (cursiva para acentos) |
| Logo             | Doble hélice ADN en lime/violeta, letras HB bold blancas, "lab" en cursiva lime |

---

## Archivos del proyecto

```
Landing HBLab/
└── hblab/
    ├── index.html                              ← Landing principal ✅
    ├── webinar-hipertrofia.html                ← Página de venta curso 1 ✅
    ├── carrera-hibrida.html                    ← Página de venta curso 2 ✅
    ├── entrenamiento-hibrido.html              ← Página de venta curso 3 ✅
    ├── login.html                              ← Login + Registro con Supabase Auth ✅
    ├── dashboard.html                          ← Panel del alumno ✅
    ├── curso-webinar-hipertrofia.html          ← Contenido curso 1 (acceso protegido) ✅
    ├── curso-carrera-hibrida.html              ← Contenido curso 2 (acceso protegido) ✅
    ├── curso-entrenamiento-hibrido.html        ← Contenido curso 3 (acceso protegido) ✅
    ├── admin.html                              ← Panel administrador (role='admin') ✅
    ├── coach.html                              ← Panel coach (role='coach'|'admin') ✅
    ├── curso.html                              ← Página de curso dinámica (?slug=) ✅
    ├── venta-curso.html                        ← Página de venta dinámica (?slug=) ✅
    ├── supabase.js                             ← Config cliente Supabase ✅
    ├── IMG_2393__1_-removebg-preview.png       ← Foto Erika Prada ✅
    ├── CONTEXTO.md                             ← Este archivo
    └── assets/
        └── certificados/                       ← PNGs base exportados de Canva (sin nombre ni fecha) ✅
            ├── cert-carrera-hibrida.png        ✅
            ├── cert-webinar-hipertrofia.png    ✅
            └── cert-entrenamiento-hibrido.png  ✅
```

---

## Supabase — configuración

| Campo        | Valor                                                                 |
|--------------|-----------------------------------------------------------------------|
| Project      | HBLAB                                                                 |
| Region       | São Paulo (sa-east-1)                                                 |
| Project URL  | `https://bqkajhxfdybmuilvzchm.supabase.co`                           |
| Anon key     | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxa2FqaHhmZHlibXVpbHZ6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTI3MTcsImV4cCI6MjA5MjEyODcxN30.d0HL1AyK_6LOYDKk6hNtChFtik6gVc-3p77ODrz32Gk` |
| Cliente      | CDN `@supabase/supabase-js@2` (sin npm/node)                          |
| Variable global | `sb` (expuesta por `supabase.js`)                                  |

**Cómo se usa en cada página:**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="supabase.js"></script>
<!-- luego usar `sb.auth.*` -->
```

---

## Base de datos Supabase — estado actual ✅

### Tablas creadas

#### `auth.users` (tabla interna de Supabase Auth)
- Manejada automáticamente por Supabase
- Usuario de prueba creado: `test@hblab.com` / `HBLab2024!`

#### `public.profiles`
Extiende `auth.users` con datos extra del usuario. Incluye `role` para control de acceso y `email` para búsquedas desde el cliente (ya que `auth.users` no es accesible con la anon key).
```sql
CREATE TABLE public.profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name  TEXT,
  avatar_url TEXT,          -- URL de foto de perfil (se muestra en venta-curso.html como instructor)
  bio        TEXT,          -- Biografía corta del coach (se muestra en venta-curso.html)
  email      TEXT,          -- sincronizado desde auth.users.email
  role       TEXT DEFAULT 'student' CHECK (role IN ('student','coach','admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- RLS habilitado ✅
- Policy SELECT: usuario ve solo su propio perfil ✅
- Policy UPDATE: usuario actualiza solo su propio perfil ✅
- Trigger `on_auth_user_created` → crea perfil automáticamente al registrarse ✅
- **Campo `role` activo en Supabase** ✅ — valores posibles:

> ✅ **Columna `email` sincronizada desde `auth.users`** — ejecutado en Supabase (sesión 16).
> Trigger `handle_new_user` actualizado para persistir `email` en nuevos registros.
> Permite buscar el UUID de un usuario por email desde el cliente (anon key no accede a `auth.users`).

| Valor | Acceso |
|-------|--------|
| `'student'` | `dashboard.html` (cursos comprados) |
| `'coach'`   | `coach.html` (foro, materiales, progreso) |
| `'admin'`   | `admin.html` + `coach.html` (acceso total) |

#### `public.courses`
Catálogo de cursos disponibles.
```sql
CREATE TABLE public.courses (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  cover_url     TEXT,
  price_ars     NUMERIC(10,2) DEFAULT 0,
  price_usd     NUMERIC(10,2) DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  total_videos  INT DEFAULT 0,
  videos        JSONB DEFAULT '[]',       -- [{title, url}] — array de videos del curso
  is_live       BOOLEAN DEFAULT false,    -- true = clase en vivo (Meet/Zoom)
  live_url      TEXT,                     -- link Meet/Zoom activo
  live_date     TIMESTAMPTZ,             -- fecha y hora de la clase
  recording_url TEXT,                     -- URL YouTube de la grabación (reemplaza live_url post-clase)
  live_completed BOOLEAN DEFAULT false,   -- true = clase finalizada, certif. disponible
  is_coming_soon  BOOLEAN DEFAULT false,  -- true = muestra en landing con badge "Próximamente", sin botón de compra
  cover_url       TEXT,                   -- imagen de fondo para el hero de venta-curso.html
  banner_text     TEXT,                   -- (opcional) barra lime sobre navbar en venta-curso.html
  learning_points JSONB DEFAULT '[]',     -- [{icon, text}] — puntos clave "lo que vas a aprender"
  syllabus        JSONB DEFAULT '[]',     -- [{title, color, items[]}] — temario completo
  certificate_url TEXT,                   -- PNG base A4 landscape para generar certificado PDF con jsPDF
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```
- RLS habilitado ✅
- Policy SELECT: cursos activos visibles para todos ✅

> ✅ **`commission_pct` en `coach_courses`** — ejecutado en Supabase.
> ✅ **Columnas de video/live en `courses`** — ejecutado en Supabase (sesión 16): `total_videos`, `videos` (JSONB), `is_live`, `live_url`, `live_date`, `recording_url`, `live_completed`.
> ✅ **Columna `is_coming_soon BOOLEAN` en `courses`** — ejecutado en Supabase (sesión 25). Controla si el curso aparece en la landing con badge "Próximamente" y sin botón de compra. Admin puede togglear desde Tab Cursos en `admin.html`.
- **Datos cargados:**

| slug | title | price_ars | price_usd |
|------|-------|-----------|-----------|
| `webinar-hipertrofia` | Webinar: Hipertrofia Basada en Evidencia | $45.000 | USD 40 |
| `carrera-hibrida` | Carrera Híbrida | $45.000 | USD 40 |
| `entrenamiento-hibrido` | Entrenamiento Híbrido | $50.000 | USD 45 |

#### `public.user_courses`
Registra qué cursos compró cada alumno. **Se activa por pago — NO es acceso libre.**
```sql
CREATE TABLE public.user_courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  payment_status TEXT DEFAULT 'pending'  -- 'pending' | 'paid' | 'cancelled'
    CHECK (payment_status IN ('pending','paid','cancelled')),
  payment_method TEXT                    -- 'mercadopago' | 'paypal' | 'manual'
    CHECK (payment_method IN ('mercadopago','paypal','manual')),
  amount_paid NUMERIC(10,2),
  currency TEXT DEFAULT 'ARS',
  status TEXT DEFAULT 'inactive'         -- 'active' | 'inactive' | 'expired'
    CHECK (status IN ('active','inactive','expired')),
  UNIQUE(user_id, course_id)
);
```
- RLS habilitado ✅
- Policy SELECT: usuario ve solo sus propias inscripciones ✅
- **Lógica clave:** un alumno tiene acceso a un curso SOLO si existe un registro con `payment_status = 'paid'` AND `status = 'active'`

#### `public.coach_courses` ✅ (sesión 12 — ejecutado)
Asigna coaches a cursos. Incluye `commission_pct` para el cálculo de ganancias.
```sql
CREATE TABLE public.coach_courses (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  course_id      UUID REFERENCES public.courses(id)  ON DELETE CASCADE NOT NULL,
  commission_pct NUMERIC(5,2) DEFAULT 0,   -- porcentaje de comisión (ej: 30.00 = 30%)
  assigned_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coach_id, course_id)
);
```
- `coach_id` referencia `public.profiles(id)` (no `auth.users`) para permitir JOINs desde PostgREST.
- RLS habilitado ✅ — admin lee/escribe todo; coach solo lee sus propios registros.
- Upsert idempotente: `onConflict: 'coach_id,course_id'`
- **`commission_pct` ejecutado en Supabase** ✅

---

#### `public.forum_posts` ✅ (sesión 12 — ejecutado; columna `is_anonymous` agregada en sesión 22)
Preguntas de alumnos y respuestas de coaches. Estructura de árbol a un nivel (post + replies).
```sql
CREATE TABLE public.forum_posts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id    UUID REFERENCES public.courses(id)    ON DELETE CASCADE NOT NULL,
  user_id      UUID REFERENCES auth.users(id)         ON DELETE CASCADE NOT NULL,
  parent_id    UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT false,   -- ← agregado sesión 22
  image_urls   TEXT[],                  -- ← agregado sesión 25 (hasta 3 URLs de imágenes por post)
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
-- SQLs ejecutados en Supabase:
-- ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;
-- ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS image_urls TEXT[];
-- (columna image_url TEXT singular ya NO se usa — reemplazada por image_urls TEXT[])
```
- `parent_id IS NULL` → pregunta raíz de un alumno
- `parent_id IS NOT NULL` → respuesta a esa pregunta
- `is_anonymous = true` → autor se muestra como "Alumno" para otros alumnos; coaches/admins ven el nombre real (lógica en RPC)
- Badge "Coach 🎓" en lima `#C8E600`: se muestra cuando `profiles.role IN ('coach','admin')`
- RLS habilitado ✅ — alumnos insertan con su propio `user_id`; coaches insertan respuestas; lectura por curso.
- **No hay FK directa entre `forum_posts.user_id` y `public.profiles`** — el JOIN implícito de PostgREST `profiles(full_name)` falla. Se usa la RPC `get_forum_posts` en su lugar.
- **Lectura vía RPC `get_forum_posts(p_course_id)`** ✅ — ver sección de RPCs.
- **⚠️ Policies RLS pendientes de ejecutar en Supabase** (sesión 22):
  ```sql
  -- Permitir a alumnos editar y eliminar sus propios posts:
  CREATE POLICY "forum_posts_update_own" ON public.forum_posts
    FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY "forum_posts_delete_own" ON public.forum_posts
    FOR DELETE USING (auth.uid() = user_id);
  -- Permitir a coaches/admins eliminar cualquier post:
  CREATE POLICY "forum_posts_delete_coach" ON public.forum_posts
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach','admin'))
    );
  ```

---

#### `public.course_materials` ✅ (sesión 12 — ejecutado)
Materiales de estudio cargados por el coach. Columna `drive_url` almacena tanto links externos como URLs públicas de Supabase Storage.
```sql
CREATE TABLE public.course_materials (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id   UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  drive_url   TEXT,        -- URL externa (Drive, YouTube, Notion) O URL pública Storage (PDFs)
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- usuario que subió el material
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```
- **⚠️ Columnas reales confirmadas:** `drive_url` (NO `drive_link`) + `uploaded_by` (NO `coach_id`) — verificado sesión 26.
- RLS habilitado ✅ — coach puede INSERT/UPDATE/DELETE en cursos asignados; alumnos solo SELECT.
- **Bucket `course-materials`** ✅ — creado en Supabase Storage, público. Se usa para subir PDFs desde `coach.html` y para imágenes de lanzamiento desde `admin.html`.
  - Upload PDFs: `sb.storage.from('course-materials').upload(path, file)` — path: `{courseId}/{timestamp}-{titulo}.pdf`
  - Upload imágenes lanzamiento: path `launches/{timestamp}-{random}.{ext}`
  - URL pública: `sb.storage.from('course-materials').getPublicUrl(path)`
- Tipo de material se infiere de la URL: si contiene `/storage/v1/object/public/course-materials/` → PDF, si no → link externo.

---

#### `public.ad_spend` ✅ (sesión 21 — ejecutado)
Registro de inversión publicitaria por curso y plataforma. Permite migrar desde localStorage.
```sql
CREATE TABLE public.ad_spend (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id  UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  platform   TEXT NOT NULL,           -- 'Instagram', 'Google', 'TikTok', etc.
  amount_ars NUMERIC(12,2) DEFAULT 0,
  amount_usd NUMERIC(10,2) DEFAULT 0,
  spend_date DATE,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- RLS habilitado ✅
- Policy SELECT: admin puede leer todos los registros ✅
- Policy INSERT: admin puede insertar ✅

---

#### `public.launches` ✅ (sesión 25 — ejecutado)
Banners de lanzamiento que aparecen en `index.html` como carrusel (máx. 3 activos simultáneos).
```sql
CREATE TABLE public.launches (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  image_url   TEXT,                              -- URL de imagen de fondo del slide
  course_id   UUID REFERENCES public.courses(id) ON DELETE SET NULL,  -- nullable
  active      BOOLEAN DEFAULT false,             -- true = visible en la landing
  cta_text    TEXT DEFAULT 'Ver curso',          -- texto del botón CTA
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```
- RLS habilitado ✅
- Policy SELECT: cualquier usuario (incluso anónimo) puede leer los registros ✅ — necesario para `index.html` sin auth
- Policy INSERT/UPDATE/DELETE: solo admin ✅
- **Regla de negocio:** máximo 3 registros con `active = true` simultáneamente — validado en JS antes de INSERT/UPDATE.
- Relacionado con `courses` vía FK nullable — permite lanzamientos sin curso específico (generales).
- La query en `index.html` usa nested SELECT: `launches(*, courses(slug, price_ars, price_usd))` con `active=true` y `limit 3`.
- La query en `admin.html` usa: `launches(*, courses(title))` para mostrar el título del curso asociado en la tabla.

---

#### `public.video_progress` ✅ (sesión 9 — 19 abril 2026)
Registra qué videos completó cada alumno dentro de cada curso.
```sql
CREATE TABLE public.video_progress (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_id    UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  video_index  INT NOT NULL,
  completed    BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, course_id, video_index)
);
```
- RLS habilitado ✅
- Policy SELECT: usuario ve solo su propio progreso ✅
- Policy INSERT: usuario solo inserta su propio progreso ✅
- Policy UPDATE: usuario solo actualiza su propio progreso ✅
- Upsert con `onConflict: 'user_id,course_id,video_index'` (idempotente) ✅

---

## Lo que está construido

### index.html — Landing principal ✅
1. Navbar fijo — logo SVG ADN, botón "Ingresar" → `login.html`
2. Hero — título, subtítulo, CTA "Ver cursos", stats, blobs
3. ¿Qué es HB Lab? — logo grande, pills, features
4. Cursos — 3 cards clicables (van a páginas individuales)
5. Próximamente — 2 cards bloqueadas, botón lista de espera (placeholder)
6. In-company — botón "Consultar disponibilidad" (placeholder)
7. Footer — logo, links a cursos, Instagram @ekaprada.coach, copyright

### webinar-hipertrofia.html ✅
- Tipo: WEBINAR · ONLINE (badge lime)
- Precio: $45.000 ARS / USD 40
- Temario: Parte 1 Bases Biológicas (10 temas) + Parte 2 Aplicación y Planificación (10 temas)
- Instructores: Erika Prada (foto real) + Lautaro Godoy (placeholder "LG")

### carrera-hibrida.html ✅
- Tipo: CAPACITACIÓN · ONLINE (badge violeta)
- Precio: $45.000 ARS / USD 40
- Temario: 5 módulos
- Instructor: Gastón Caire únicamente (placeholder "GC"). Erika NO aparece.

### entrenamiento-hibrido.html ✅
- Tipo: MASTERCLASS · ONLINE
- Precio: $50.000 ARS / USD 45
- Temario: 4 bloques en grid 2x2
- Instructores: Erika Prada (foto real) + Gonzalo Gonda (placeholder "GG")

### login.html ✅
**3 paneles en una sola página con transición suave (fade + slide):**
- **Panel Login:** email + contraseña, botón "Ingresar", link "¿Olvidaste tu contraseña?" → Panel Forgot, link "¿No tenés cuenta? Crear cuenta →" → Panel Registro
- **Panel Registro:** nombre + apellido (2 columnas), email, contraseña (con indicador de fortaleza en 4 barras), confirmar contraseña (validación en tiempo real). Botón "Crear cuenta". Link "¿Ya tenés cuenta? Ingresar →"
- **Panel Recuperar contraseña:** email, botón "Enviar link", botón "← Volver al login". Pre-rellena el email si ya fue ingresado en el login.
- Registro usa `sb.auth.signUp()` con `options.data.name = "Nombre Apellido"` → el trigger `handle_new_user` lo guarda en `public.profiles.full_name` via `raw_user_meta_data->>'name'`
- Registro exitoso → mensaje de confirmación en pantalla (no redirige — Supabase requiere confirmar email)
- Manejo de errores de Supabase traducidos al español
- Si usuario ya tiene sesión al cargar → redirige a `dashboard.html`

### dashboard.html ✅
- Navbar con email del usuario + botón "Cerrar sesión"
- Protección de ruta: sin sesión → redirige a `login.html` automáticamente
- Loading spinner mientras se verifica sesión y se consulta Supabase
- **Redirección por rol (sesión 16):** después de `getSession()`, consulta `public.profiles` para obtener `role` ANTES de renderizar nada:
  - `admin` → `window.location.replace('admin.html')`
  - `coach` → `window.location.replace('coach.html')`
  - `student` (o sin perfil) → continúa con el dashboard normal
- **Consulta real a Supabase:** JOIN `user_courses` → `courses`, filtrando `payment_status='paid'` AND `status='active'`
- **Con cursos comprados:** renderiza cards desbloqueadas con título, descripción, badge "Acceso activo" y botón "Ir al curso" → redirige a `curso-{slug}.html` ✅
- **Sin cursos comprados:** muestra estado vacío con mensaje y botón "Explorar catálogo" → `index.html#cursos`
- **Error de red/query:** muestra mensaje de error inline sin romper la página
- Sección "Mi cuenta": email, estado activo, último acceso
- `onAuthStateChange` detecta logout desde otra pestaña → redirige a `login.html`
- Nombre del saludo: prioriza `profiles.full_name` → `user_metadata.full_name` → parte local del email

---

## Instructores registrados

| Nombre | Aparece en | Foto | Bio |
|--------|-----------|------|-----|
| Erika Prada | Webinar Hipertrofia + Masterclass Híbrido | `IMG_2393__1_-removebg-preview.png` ✅ | "Entrenadora híbrida y creadora de HB Lab. Especializada en fuerza, potencia y metodología aplicada." |
| Lautaro Godoy | Webinar Hipertrofia | Placeholder "LG" violeta | "Especialista en hipertrofia y musculación." |
| Gastón Caire | Carrera Híbrida | Placeholder "GC" violeta | "Especialista en entrenamiento híbrido y carreras de resistencia." |
| Gonzalo Gonda | Masterclass Híbrido | Placeholder "GG" violeta | "Especialista en entrenamiento híbrido y programación avanzada." |

---


## Flujo de sesión implementado

```
Landing / Páginas de venta
  └── [Ingresar] → login.html
        ├── Panel Login: signInWithPassword() → dashboard.html
        ├── Panel Registro: signUp() → mensaje confirmación (email pendiente)
        ├── Panel Recuperar: resetPasswordForEmail() → email con link
        └── Si ya tiene sesión → dashboard.html (redirect automático)

dashboard.html
  ├── Sin sesión → login.html
  ├── Consulta user_courses → cursos paid+active → cards desbloqueadas
  ├── [Ir al curso] → curso-{slug}.html  ✅
  ├── [Cerrar sesión] → index.html
  └── onAuthStateChange → SIGNED_OUT → login.html

curso-{slug}.html  (webinar-hipertrofia / carrera-hibrida / entrenamiento-hibrido)
  ├── Sin sesión → login.html
  ├── Sin acceso paid+active → dashboard.html
  ├── Videos con iframe YouTube ✅ (URLs reales conectadas)
  ├── [Marcar como completado] → upsert video_progress
  ├── Barra de progreso en tiempo real
  ├── Al 100% → sección certificado → generarCertificado() con jsPDF ✅
  └── onAuthStateChange → SIGNED_OUT → login.html
```

---

## Lógica de acceso a cursos (IMPORTANTE)

- Los cursos **NO son gratuitos**
- Un alumno accede a un curso **solo si lo compró**
- El acceso se registra en `user_courses` con `payment_status = 'paid'` y `status = 'active'`
- El dashboard consulta esa tabla y muestra SOLO los cursos del alumno
- Cursos no comprados → aparecen bloqueados o no aparecen

---

## Placeholders activos — qué falta conectar

| Elemento | Dónde | Qué necesita |
|----------|-------|--------------|
| Botones "Comprar ahora" (x3 en index + x3 en páginas) | `.btn-buy` | Mercado Pago (ARS) + PayPal (USD) |
| Botones "Anotarme en lista de espera" (x2) | `.btn-waitlist` en index | Formulario de email / email marketing |
| Botón "Consultar disponibilidad" | `#incompany` en index | WhatsApp o form de contacto |
| Botón "Ir al curso" en dashboard | `dashboard.html` | ✅ Conectado a `curso-{slug}.html` |
| Videos — Webinar Hipertrofia | `curso-webinar-hipertrofia.html` | ✅ URLs reales conectadas (2 videos) |
| Videos — Carrera Híbrida | `curso-carrera-hibrida.html` | ✅ URL real conectada (1 video) |
| Videos — Entrenamiento Híbrido | `curso-entrenamiento-hibrido.html` | ✅ URLs reales conectadas (2 videos) |
| Certificados (botón "Descargar") | `curso-*.html` | ✅ jsPDF implementado — requiere PNGs en `assets/certificados/` |
| Fotos de Lautaro, Gastón y Gonzalo | Páginas de cursos | Fotos reales cuando estén disponibles |

---

---

## Roadmap de etapas

### ✅ Etapa 1 — Frontend completo
- Landing, 3 páginas de cursos, login, dashboard (estructura)
- Integración Supabase Auth (login, logout, recuperación de contraseña)
- Protección de rutas en dashboard

### ✅ Etapa B — Páginas de contenido de cursos
- `curso-webinar-hipertrofia.html` ✅ — 2 videos, progreso, certificado
- `curso-carrera-hibrida.html` ✅ — 1 video, progreso, certificado
- `curso-entrenamiento-hibrido.html` ✅ — 2 videos, progreso, certificado
- Acceso protegido: verifica sesión + `user_courses` (paid + active) ✅
- Progreso guardado en `video_progress` con RLS (tabla creada en Supabase) ✅
- Barra de progreso animada, sección certificado al llegar al 100% ✅

### ✅ Etapa D — Certificado PDF automático
- jsPDF 2.5.1 vía CDN (`cdnjs.cloudflare.com`) cargado en las 3 páginas de curso ✅
- Al 100% del progreso → botón "Descargar certificado" funcional ✅
- Flujo: consulta `public.profiles.full_name` → carga PNG base → genera PDF A4 landscape → descarga
- Fallback de nombre: `user_metadata.full_name` → `user_metadata.name` → parte local del email
- Nombre en cursiva (helvetica bolditalic), 32pt, color #2D1B6B, **Y = 108 mm** (encima de la línea horizontal)
- Fecha en normal, 16pt, color #2D1B6B, **Y = 72 mm** (entre "DE PARTICIPACIÓN" y "Este certificado se otorga a")
- Centrado horizontal en X = 148.5 mm (mitad de 297 mm A4 landscape)
- Nombre del archivo: `certificado-{COURSE_SLUG}-{nombre-normalizado}.pdf`
- **⚠️ Estas coordenadas son el estándar para TODOS los certificados de HB Lab**, tanto los legacy (`curso-*.html`) como los dinámicos (`curso.html`). Cualquier PNG base nuevo debe diseñarse respetando estos valores de Y.
- Manejo de errores: botón muestra "⚠ Error al generar — intentar de nuevo" sin romper la página
- Imágenes base en `assets/certificados/` ✅ — exportadas de Canva, **sin nombre ni fecha**, listas para que jsPDF escriba encima:
  - `cert-carrera-hibrida.png` ✅
  - `cert-webinar-hipertrofia.png` ✅
  - `cert-entrenamiento-hibrido.png` ✅

### ✅ Etapa A — Registro de usuarios
- `login.html` reescrito con panel de registro integrado
- `sb.auth.signUp()` con `options.data.name` → trigger `handle_new_user` guarda `full_name` en `public.profiles` vía `raw_user_meta_data->>'name'`
- Email de confirmación enviado por Supabase automáticamente ✅
- Trigger `handle_new_user` guarda `full_name` en `public.profiles` ✅

### ✅ Etapa 2 — Dashboard conectado a Supabase
- Base de datos creada: tablas `profiles`, `courses`, `user_courses` con RLS y políticas
- `dashboard.html` reescrito con consulta real a Supabase
- Muestra cursos comprados o estado vacío según `user_courses`
- Loading spinner, manejo de errores, `onAuthStateChange`

### ✅ Bugfix — Tab Coaches en admin.html (sesión 19)

**Bug 1 — Lista de coaches vacía:**
- **Causa:** la query original usaba un nested JOIN `profiles.select('...coach_courses(courses(title))')`. PostgREST con RLS activa en `coach_courses` puede comportarse como INNER JOIN — coaches sin filas en `coach_courses` desaparecen del resultado.
- **Fix:** dos queries separadas + merge client-side:
  1. `profiles WHERE role = 'coach'` → obtiene todos los coaches
  2. `coach_courses JOIN courses(title)` → obtiene asignaciones
  3. Agrupa por `coach_id` en JS → muestra pills de cursos o "Sin cursos asignados"

**Bug 2 — "Agregar coach" no encuentra al usuario (RLS):**
- **Causa raíz:** la RLS policy `SELECT/UPDATE` en `profiles` es `auth.uid() = id`. El admin logueado no puede leer ni modificar el perfil de otro usuario directamente desde el cliente (JWT anon key). Las queries `.select(...).eq('email', email)` y `.update({ role: 'coach' }).eq('id', uuid)` sobre perfiles ajenos son bloqueadas silenciosamente.
- **Fix:** función RPC `assign_coach_by_email(p_email TEXT)` con `SECURITY DEFINER` (bypassa RLS). Hace todo en un call: busca por email → valida → actualiza el rol. El JS llama `sb.rpc('assign_coach_by_email', { p_email: email })` y maneja los casos `not_found`, `already_coach`, `ok`, `unauthorized`.
- **⚠️ Requiere SQL pendiente** — ver sección abajo.

### ✅ Bugfix — `ReferenceError: supabase is not defined` en coach.html (sesión 18)
- **Bug:** faltaba el script CDN `@supabase/supabase-js@2` antes de `supabase.js` en `coach.html`. Sin la librería cargada, `supabase.js` no podía crear el cliente → `ReferenceError` al ejecutar cualquier llamada a `sb.*`.
- **Fix:** agregado `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` justo antes de `<script src="supabase.js"></script>`.
- `admin.html` tenía el orden correcto ✅ — no requirió cambios.
- **Nota para futuras páginas:** siempre incluir el CDN ANTES de `supabase.js`.

### ✅ Bugfix — Loading infinito en coach.html (sesión 17)
- **Bug:** si `loadCoachCourses()` (o cualquier `await` en el IIFE de init) lanzaba una excepción no capturada, el bloque que muestra `#page` y quita el spinner nunca se ejecutaba → loading infinito.
- **Causa real más probable:** coach sin filas en `coach_courses` no causa error (devuelve `[]`), pero si la query falla por RLS u otro motivo, el IIFE explota silenciosamente.
- **Fix — tres partes:**
  1. **try/catch** envuelve todo el IIFE de `init()`. Si cualquier `await` falla → `showLoadingError()` muestra error amigable con botón "Recargar página" en vez de spinner infinito.
  2. **Timeout de 10 s** (`_loadTimer`) — si `init()` no llama `hideLoading()` en 10 segundos, se activa `showLoadingError()` automáticamente.
  3. **Banner "Sin cursos asignados"** (`#no-courses-banner`) — si el coach tiene `coachCourses.length === 0` después de `loadCoachCourses()`, se muestra un aviso visible: *"Todavía no tenés cursos asignados. Contactá al administrador..."*. El panel carga igualmente (no queda bloqueado).
- `hideLoading()` y `showLoadingError()` son funciones reutilizables que también hacen `clearTimeout(_loadTimer)`.

### ✅ Bugfix — Redirección por rol en dashboard.html (sesión 16)
- **Bug:** `dashboard.html` no consultaba el rol del usuario → admins y coaches veían el panel de alumno en vez de ser redirigidos a su panel correspondiente.
- **Fix:** en `init()`, después de `getSession()`, se consulta `public.profiles` para obtener `role`. Si es `admin` → `admin.html`; si es `coach` → `coach.html`; si es `student` → continúa. La redirección ocurre ANTES de renderizar nada (sin flash de contenido incorrecto).
- **Bonus:** el nombre del saludo ahora prioriza `profiles.full_name` sobre `user_metadata`.

### ✅ SQL ejecutados (sesión 16)
- **Columna `email` en `profiles`** + UPDATE + trigger `handle_new_user` → ✅ ejecutado en Supabase
- **ALTER TABLE courses** (total_videos, videos, is_live, live_url, live_date, recording_url, live_completed) → ✅ ejecutado en Supabase

### ✅ Bugfix — "Agregar coach" por email (sesión 15)
- **Bug:** el campo pedía UUID directamente y al usarlo en `.eq('id', userId)` fallaba con `invalid input syntax for type uuid` cuando el admin ingresaba un email.
- **Fix:** modal renombrado al campo `email`, función `confirmarAgregarCoach()` ahora hace:
  1. Busca el perfil con `.from('profiles').select('id, full_name, role').eq('email', email).single()`
  2. Si no encuentra → mensaje de error claro indicando que el usuario debe estar registrado
  3. Si ya es coach → aviso sin error
  4. Si encontró → actualiza `role = 'coach'` usando el UUID real del perfil
- **Requiere SQL pendiente:** columna `email` en `profiles` (ver sección BD arriba).

### ✅ Etapa G — Foro en páginas de curso + Ganancias en coach.html (sesión 14)
- **Sección "Consultas" en las 3 páginas `curso-*.html`** ✅
  - Se carga automáticamente al entrar al curso (llama `loadForo()` al final de `init()`)
  - Muestra preguntas raíz (`parent_id IS NULL`) ordenadas por fecha descendente
  - Cada pregunta: nombre del alumno, contenido, fecha, botón con conteo de respuestas
  - Click en pregunta → expande/colapsa respuestas con toggle CSS
  - Respuestas con `profiles.role IN ('coach','admin')` muestran badge "Coach 🎓" en lima
  - Formulario "Enviá tu pregunta al coach" → `INSERT` en `forum_posts` + recarga el foro
  - CSS con estilos propios (`.forum-section`, `.forum-thread`, `.badge-coach-sm`, etc.) en cada página
- **Tab "💰 Ganancias" en `coach.html`** ✅
  - Selector de mes y año (inicializado automáticamente con el mes/año actual)
  - Botón "Ver ganancias" → `loadGanancias()`
  - Box destacado con total del mes en lima (`$XX.XXX ARS`) y detalle de ventas
  - Tabla por curso: ventas del mes, ingresos brutos, `commission_pct`, ganancia calculada
  - Fórmula: `revenue × commission_pct / 100` — revenue = suma de `amount_paid` o `count × price_ars`
  - Si rol = `admin`: ve todos los cursos con comisión 100% por defecto
  - Query: `coach_courses` JOIN `courses(price_ars)` + `user_courses` filtrando `enrolled_at` en el rango del mes

### ✅ Etapa F — Videos y clase en vivo en admin.html (sesión 13)
- Formulario de cursos extendido con dos secciones nuevas:
  - **Videos del curso**: lista dinámica de filas (título + URL embed), botón "+ Agregar video", botón × por fila. Se guarda como `JSONB` en `courses.videos`. `total_videos` se actualiza automáticamente al guardar.
  - **Clase en vivo**: toggle checkbox que muestra/oculta campos: link Meet/Zoom (`live_url`), fecha y hora (`live_date`), grabación opcional (`recording_url`). Cuando `is_live = true`, los alumnos ven el botón de unirse en vez del reproductor.
- Tabla de cursos actualizada: muestra badge "🔴 En vivo" y conteo de videos por fila.
- La lógica "Marcar clase como finalizada" (`live_completed = true`) la ejecuta el coach desde `coach.html` (pendiente de implementar en ese panel).
- Nuevas columnas en `courses` — **SQL pendiente de ejecutar** (ver sección `public.courses` arriba).

### ✅ Etapa E — Paneles de gestión (sesión 12)
- `admin.html` — Panel de administración (rol `'admin'`) ✅
  - Tab Cursos: tabla de cursos, formulario inline INSERT/UPDATE, toggle `is_active`
  - Tab Alumnos: lista de alumnos con cursos activos, botón "Asignar curso" → upsert `user_courses` con `payment_method='manual'`
  - Tab Coaches: lista de coaches con cursos asignados, agregar coach por UUID, asignar a curso via `coach_courses`
  - Tab Certificados: estado de PNGs por curso + nota sobre reemplazo manual
- `coach.html` — Panel del coach (rol `'coach'` o `'admin'`) ✅
  - Tab Foro: selector de curso, preguntas de alumnos (`parent_id IS NULL`), respuestas expandibles, badge "Coach 🎓" en lima
  - Tab Materiales: selector de curso, CRUD de `course_materials` (título, descripción, Google Drive link)
  - Tab Progreso: selector de curso, tabla alumnos con `video_progress` completados / total / barra porcentaje con colores semáforo
- Tablas `coach_courses`, `forum_posts`, `course_materials` y campo `role` en `profiles` **ejecutados en Supabase con RLS activo** ✅

### 🔜 Próxima sesión — tareas inmediatas

1. ~~**Conectar botón "Ir al curso" en `dashboard.html`**~~ ✅ Completado
2. ~~**Reemplazar URLs de YouTube**~~ ✅ Completado (todos los videos con URLs reales)
3. ~~**Certificado automático con jsPDF**~~ ✅ Completado (ver Etapa D)
4. ~~**Paneles admin.html y coach.html**~~ ✅ Completado (ver Etapa E)

5. ~~**Ejecutar SQL en Supabase**~~ ✅ Completado — `role`, `coach_courses`, `forum_posts`, `course_materials` con RLS activos. `ekapradacoach@gmail.com` tiene `role = 'admin'`.

6. ~~**Ejecutar SQL — columna `email` en `profiles`**~~ ✅ Ejecutado (sesión 16)

7. ~~**Ejecutar ALTER TABLE en Supabase** — agregar columnas nuevas a `courses`~~ ✅ Ejecutado (sesión 16)

8. ~~**Ejecutar SQL — función RPC `assign_coach_by_email`**~~ ✅ Ejecutado (sesión 19)
   - Función `SECURITY DEFINER` que bypassa RLS en `profiles` para buscar por email y asignar rol coach.
   - Retorna JSON con estados: `not_found` / `already_coach` / `ok` / `unauthorized`.
   - Llamada desde `admin.html`: `sb.rpc('assign_coach_by_email', { p_email: email })` ✅

9.  ~~**Ejecutar SQL — función RPC `get_coaches`**~~ ✅ Ejecutado (sesión 21)
    - Retorna `{ id, full_name, course_titles: TEXT[] }` con LEFT JOIN a `coach_courses` + `courses`.
    - Llamada desde `admin.html`: `sb.rpc('get_coaches')` — Tab Coaches y Tab Gestión.

10. ~~**Ejecutar SQL — función RPC `remove_coach_role`**~~ ✅ Ejecutado (sesión 21)
    - Quita el rol coach y setea `role = 'student'`. Verifica que el caller sea admin.
    - Llamada desde `admin.html`: `sb.rpc('remove_coach_role', { p_user_id: id })`.

11. ~~**Ejecutar SQL — función RPC `get_students_without_courses`**~~ ✅ Ejecutado (sesión 21)
    - Fix aplicado: columna `id` era ambigua en el subquery → se calificó como `p.id` y `uc.user_id`.
    - Columnas renombradas con prefijo `p_` para evitar ambigüedad: retorna `{ p_id, p_full_name, p_email, p_created_at }`.
    - Llamada desde `admin.html`: `sb.rpc('get_students_without_courses')` — sección "Sin cursos".
    - El render y el CSV usan `p.p_full_name`, `p.p_email`, `p.p_created_at`.

12. ~~**Ejecutar SQL — función RPC `get_students_with_courses`**~~ ✅ Ejecutado (sesión 21)
    - Retorna `{ user_id, full_name, email, course_titles: TEXT[] }` de alumnos con `payment_status='paid'` y `status='active'`.
    - ⚠️ El campo identificador es `user_id` (no `id`). El render en `loadAlumnos()` debe usar `p.user_id`.
    - Llamada desde `admin.html`: `sb.rpc('get_students_with_courses')` — reemplaza el multi-query de `loadAlumnos()`.

13. ~~**Ejecutar SQL — función RPC `get_forum_posts`**~~ ⚠️ Ejecutada en sesiones 22/24, **pendiente re-ejecutar** (sesión 25: `image_urls TEXT[]`)
    - Retorna todos los posts de un curso (raíces + respuestas) en filas planas con `full_name`, `role`, `is_anonymous` e `image_urls` del autor/post.
    - **Firma vigente (sesión 22/24):** retorna `image_url TEXT` singular — reemplazada por `image_urls TEXT[]` en sesión 25.
    - **Firma correcta y definitiva (sesión 25):** `image_urls TEXT[]` — array de hasta 3 URLs de imágenes.
    - SECURITY DEFINER — resuelve la FK inexistente entre `forum_posts.user_id` y `public.profiles`.
    - **Lógica de anonimato:** si `is_anonymous = true` Y quien consulta tiene `role = 'student'` → `full_name` retorna `'Alumno'`; coaches y admins ven el nombre real.
    - Llamada desde `coach.html` y los 3 `curso-*.html`: `sb.rpc('get_forum_posts', { p_course_id: id })`
    - En JS se separa la respuesta: `data.filter(r => r.parent_id === null)` → posts raíz; `data.filter(r => r.parent_id !== null)` → replies.
    - **⚠️ SQL a ejecutar en Supabase (provisto por el usuario en sesión 25 ✅ — ya ejecutado):**
      ```sql
      DROP FUNCTION IF EXISTS get_forum_posts(UUID);
      CREATE OR REPLACE FUNCTION get_forum_posts(p_course_id UUID)
      RETURNS TABLE (
        id UUID, content TEXT, created_at TIMESTAMPTZ,
        parent_id UUID, user_id UUID, full_name TEXT,
        role TEXT, is_anonymous BOOLEAN, image_urls TEXT[]
      )
      LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public AS $$
      DECLARE
        caller_role TEXT;
      BEGIN
        SELECT p.role INTO caller_role FROM profiles p WHERE p.id = auth.uid();
        RETURN QUERY
          SELECT fp.id, fp.content, fp.created_at,
                 fp.parent_id, fp.user_id,
                 CASE
                   WHEN fp.is_anonymous AND caller_role = 'student' THEN 'Alumno'
                   ELSE p.full_name
                 END,
                 p.role,
                 fp.is_anonymous,
                 fp.image_urls
          FROM forum_posts fp
          JOIN profiles p ON p.id = fp.user_id
          WHERE fp.course_id = p_course_id
          ORDER BY fp.created_at ASC;
      END;
      $$;
      ```

14. ~~**Ejecutar SQL — policy `"Admin puede actualizar coach_courses"`**~~ ✅ Ejecutado (sesión 22)
    - `CREATE POLICY "Admin puede actualizar coach_courses" ON public.coach_courses FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));`
    - Necesaria para que el admin pueda hacer upsert múltiple desde el modal de checkboxes en `admin.html`.

15. ~~**Migrar inversión publicitaria de localStorage a `ad_spend`**~~ ✅ Completado (sesión 25 — Etapa N).
    - **⚠️ Ejecutar en Supabase — policy DELETE en `ad_spend`** (ver Etapa N).

### ✅ Bugfix — Foro: RLS y errores silenciosos (sesión 21)

**Bug 1 — coach.html tira "Error al cargar el foro":**
- **Causa probable:** la policy SELECT de `forum_posts` solo contempla alumnos con `user_courses` activos. Coaches no tienen filas en `user_courses` → el SELECT devuelve error de permisos.
- **Fix en JS:** `loadForo()` en coach.html ahora muestra `error.message` en pantalla y hace `console.error` para debug inmediato.
- **⚠️ Fix en Supabase pendiente de ejecutar** — reemplazar/ampliar la policy SELECT de `forum_posts`:
  ```sql
  -- Ejecutar en Supabase → SQL Editor:
  DROP POLICY IF EXISTS "<nombre-actual-policy-select>" ON public.forum_posts;
  CREATE POLICY "forum_posts_lectura" ON public.forum_posts
  FOR SELECT USING (
    -- Alumno con acceso activo al curso
    EXISTS (
      SELECT 1 FROM public.user_courses uc
      WHERE uc.user_id = auth.uid()
        AND uc.course_id = forum_posts.course_id
        AND uc.payment_status = 'paid'
        AND uc.status = 'active'
    )
    OR
    -- Coach asignado al curso
    EXISTS (
      SELECT 1 FROM public.coach_courses cc
      WHERE cc.coach_id = auth.uid()
        AND cc.course_id = forum_posts.course_id
    )
    OR
    -- Admin
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
  ```

**Bug 2 — curso-*.html: mensaje desaparece sin confirmación ni error:**
- **Causa:** `submitPregunta()` usaba `const { error }` sin `.select()`. Cuando RLS bloquea un INSERT silenciosamente (devuelve 0 rows sin error), el textarea se limpiaba y el post nunca aparecía.
- **Fix:** se cambió a `.insert({...}).select()` — si `data` viene vacío o `error` presente, se muestra un `<div id="forum-send-error">` con el mensaje real. Se eliminó el `alert()`.
- Aplicado en los 3 archivos: `curso-webinar-hipertrofia.html`, `curso-carrera-hibrida.html`, `curso-entrenamiento-hibrido.html` ✅

### ✅ Bugfix — Sección "Sin cursos" en tab Alumnos (sesión 21)
- **Error reportado:** `"column reference id is ambiguous"` al llamar `get_students_without_courses`.
- **Fix en RPC (Supabase):** columna `id` era ambigua en el subquery de `NOT EXISTS` → columnas renombradas con prefijo `p_` en la firma de retorno: `p_id`, `p_full_name`, `p_email`, `p_created_at`. ✅
- **Fix en admin.html:** la llamada `const { data, error } = await sb.rpc('get_students_without_courses');` es correcta (sin encadenado). El render y el export CSV usan los nuevos nombres `p.p_full_name`, `p.p_email`, `p.p_created_at`. ✅
  - Se eliminó el bloque de comentarios `TODO` (la RPC ya está desplegada en Supabase).
  - **Regla confirmada:** `sb.rpc()` no admite `.select()`, `.eq()` ni ningún modificador PostgREST encadenado.

### ✅ Etapa H — Panel admin completo (sesión 21)
**RPCs ejecutadas en Supabase ✅:**
- `get_coaches()` — lista coaches con `course_titles TEXT[]` (SECURITY DEFINER, LEFT JOIN) ✅
- `remove_coach_role(p_user_id UUID)` — quita rol coach, setea `'student'` (SECURITY DEFINER) ✅
- `get_students_without_courses()` — alumnos sin cursos para email marketing; columnas con prefijo `p_` (`p_id`, `p_full_name`, `p_email`, `p_created_at`) ✅
- `get_students_with_courses()` — alumnos con cursos activos y títulos agrupados ✅
- `assign_coach_by_email(p_email)` — ya existía, confirmada funcionando ✅

**Policies RLS ejecutadas ✅:**
- `"Admin puede insertar coach_courses"` ON `public.coach_courses` FOR INSERT ✅
- `"Admin puede leer ad_spend"` ON `public.ad_spend` FOR SELECT ✅
- `"Admin puede insertar ad_spend"` ON `public.ad_spend` FOR INSERT ✅
- `DROP POLICY "Admin puede leer todos los profiles"` — se revirtió (era incorrecta) ✅

**Tabla nueva `public.ad_spend` ✅ — ejecutada en Supabase.**

**Cambios en `admin.html` ✅:**
- **Tab Coaches:** lista vía `get_coaches()` ✅; botón "Quitar rol" vía `remove_coach_role()` ✅; botón "Asignar curso" → modal con **checkboxes multi-selección** (cursos ya asignados pre-marcados, upsert de todos los seleccionados) ✅
- **Tab Alumnos:** tabla principal vía `get_students_with_courses()` ✅; sección "Sin cursos" para email marketing con botón Exportar CSV vía `get_students_without_courses()` (campos `p_full_name`, `p_email`, `p_created_at`) ✅
- **Tab Gestión (nuevo):** Chart.js 4.4.3 CDN; tarjetas resumen (ventas, ARS, USD); gráfico torta ventas por curso; gráfico barras ingresos 6 meses ARS; tabla ventas por coach con sub-filas por curso; formulario inversión publicitaria (localStorage → pendiente migrar a `ad_spend`) ✅

**Cambios en `coach.html` ✅:**
- **Tab Foro:** `loadForo()` muestra `error.message` en pantalla + `console.error` para debug ✅
- **Tab Materiales:** formulario reescrito con campo "Tipo" (Link externo / PDF):
  - **Link:** campo URL genérico (Drive, YouTube, Notion, etc.) ✅
  - **PDF:** `input[type=file]` → upload a bucket `course-materials` con `sb.storage.from('course-materials').upload()` → guarda URL pública en `drive_link` ✅
  - Lista de materiales: ícono `🔗` para links, `📄` para PDFs (detectado por URL) ✅
  - Edición: pre-rellena el tipo y muestra link al PDF actual si existe ✅

**Cambios en `curso-*.html` (3 archivos) ✅:**
- `loadForo()`: muestra `error.message` inline + `console.error` ✅
- `submitPregunta()`: usa `.insert({...}).select()` para detectar bloque silencioso de RLS; muestra `#forum-send-error` con mensaje visible; elimina `alert()` ✅

### ✅ Etapa I — Foro vía RPC + multi-curso + materiales flexibles (sesión 22)

**RPC nueva ejecutada en Supabase ✅:**
- `get_forum_posts(p_course_id UUID)` — retorna filas planas con `full_name` y `role` del autor. Resuelve el fallo de PostgREST por FK inexistente entre `forum_posts.user_id` y `public.profiles`.

**Policy nueva ejecutada en Supabase ✅:**
- `"Admin puede actualizar coach_courses"` ON `public.coach_courses` FOR UPDATE — necesaria para el upsert múltiple del modal de checkboxes.

**Cambios en `coach.html` ✅:**
- `loadForo()`: reemplazadas las 2 queries directas por `sb.rpc('get_forum_posts', { p_course_id })`. Separación posts/replies en JS con `.filter(r => r.parent_id === null/!== null)`.
- `renderReply()`: usa `r.full_name` y `r.role` directos (antes `r.profiles?.full_name`).
- `submitReply()`: eliminada la re-query directa post-envío; ahora llama `loadForo()`.

**Cambios en los 3 `curso-*.html` ✅:**
- `loadForo()`: misma migración a `sb.rpc('get_forum_posts', { p_course_id: currentCourseId })`.

---

### ✅ Etapa J — Foro mejorado: anonimato, editar/eliminar (sesión 22)

**SQL ejecutado en Supabase ✅:**
- `ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;`
- `DROP FUNCTION / CREATE OR REPLACE FUNCTION get_forum_posts(UUID)` — firma ampliada con `is_anonymous BOOLEAN` en retorno y lógica condicional de `full_name` según rol del caller.

**⚠️ SQL pendiente de ejecutar en Supabase (policies RLS para editar/eliminar):**
```sql
-- Alumnos pueden editar y eliminar sus propios posts:
CREATE POLICY "forum_posts_update_own" ON public.forum_posts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "forum_posts_delete_own" ON public.forum_posts
  FOR DELETE USING (auth.uid() = user_id);
-- Coaches y admins pueden eliminar cualquier post:
CREATE POLICY "forum_posts_delete_coach" ON public.forum_posts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach','admin'))
  );
```

**Bugfix en `curso-carrera-hibrida.html` ✅:**
- `loadForo()` y `submitPregunta()` usaban `currentCourseId` (indefinida); corregido a `courseId` que es la variable correcta en ese archivo.

**Cambios en `coach.html` ✅:**
- CSS: `.forum-post-actions`, `.btn-forum-action`, `.btn-forum-action.danger:hover`, `.forum-anon-tag`.
- `loadForo()`: muestra tag "🎭 anónimo" si `post.is_anonymous`; agrega `.forum-post-actions` con botón "🗑 Eliminar post" por cada thread.
- Nueva función `eliminarPost(postId)`: confirmación → DELETE → `loadForo()`.

**Cambios en los 3 `curso-*.html` ✅:**
- CSS: todos los estilos de foro mejorado (`.forum-anon-row`, `.forum-post-actions`, `.btn-forum-action`, `.forum-edit-wrap`, `.forum-edit-textarea`, `.forum-edit-row`, clases `.btn`, `.btn-sm`, `.btn-lime`, `.btn-ghost`).
- HTML: checkbox "Publicar como anónimo" (`#forum-anon-check`) antes del `.forum-ask-footer`.
- JS — `let _forumPostData = {}` (global): cachea posts para el inline edit.
- JS — `loadForo()`: cachea cada post en `_forumPostData`; muestra `anonTag` si `post.is_anonymous`; si `post.user_id === currentUser.id` → agrega `.forum-post-actions` (✏️ Editar + 🗑 Eliminar) y `.forum-edit-wrap` (textarea inline + botones Cancelar/Guardar).
- JS — `submitPregunta()`: lee el checkbox, pasa `is_anonymous` al INSERT, resetea el checkbox al éxito.
- JS — nuevas funciones: `showForumNotif(msg, isError)`, `eliminarPost(postId)`, `iniciarEdicion(postId)`, `cancelarEdicion(postId)`, `guardarEdicion(postId)`.

### ✅ Etapa K — Foro: emojis, links, fotos, editar respuestas coach (sesión 23)

**⚠️ SQL pendiente de ejecutar en Supabase:**
```sql
-- Agregar columna image_url a forum_posts:
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS image_url TEXT;
```
También actualizar la RPC `get_forum_posts` para que retorne `image_url TEXT` en su firma:
```sql
DROP FUNCTION IF EXISTS get_forum_posts(UUID);
CREATE OR REPLACE FUNCTION get_forum_posts(p_course_id UUID)
RETURNS TABLE (
  id UUID, content TEXT, created_at TIMESTAMPTZ,
  parent_id UUID, user_id UUID,
  full_name TEXT, role TEXT,
  is_anonymous BOOLEAN, image_url TEXT
) ...
-- (resto idéntico al SQL de sesión 22, solo agregando image_url TEXT en RETURNS TABLE y en el SELECT final)
```

**Cambios en `coach.html` ✅:**
- CSS: `.reply-edit-wrap`, `.reply-edit-textarea`, `.reply-edit-row`, `.emoji-picker-btn`, `.emoji-picker-wrap`, `.emoji-item`, `.forum-img-attach-btn`, `.forum-img-uploading`, `.forum-img-preview`, `.forum-post-image`.
- Globals: `let _replyData = {}`, `let _replyImageUrl = {}`.
- `renderReply(r)`: cachea en `_replyData`; usa `linkify()`; muestra imagen si `r.image_url`; si `r.user_id === currentUser.id` → botones ✏️ Editar / 🗑 Eliminar + inline edit wrap.
- `loadForo()` posts.forEach: usa `linkify(post.content)`; muestra imagen si `post.image_url`; reply form con emoji 😊 + adjuntar 📎; `_replyData = {}; _replyImageUrl = {}` al inicio.
- `submitReply()`: incluye `image_url: _replyImageUrl[parentId]` si existe; resetea preview al éxito.
- Nuevas funciones: `iniciarEdicionReply`, `cancelarEdicionReply`, `guardarEdicionReply`, `eliminarReply`, `handleReplyImage`, `cancelarReplyImage`, `linkify`, `toggleEmojiPicker`, `insertEmoji`, IIFE `_emojiPicker`.

**Cambios en los 3 `curso-*.html` ✅:**
- CSS: `.emoji-picker-btn`, `.emoji-picker-wrap`, `.emoji-item`, `.forum-img-attach-btn`, `.forum-img-uploading`, `.forum-img-preview`, `.forum-post-image`.
- HTML ask form: botones 😊 y 📎 integrados en `.forum-anon-row`; divs `ask-img-status` y `ask-img-preview`.
- Global: `let _pendingImageUrl = null`.
- `loadForo()` forEach: usa `linkify()` en posts y respuestas; muestra imagen si `post.image_url` / `r.image_url`.
- `submitPregunta()`: incluye `image_url: _pendingImageUrl`; resetea preview al éxito; acepta enviar solo imagen sin texto.
- Nuevas funciones: `linkify`, `handleAskImage`, `cancelAskImage`, `toggleEmojiPicker`, `insertEmoji`, IIFE `_emojiPicker`.

### ✅ Etapa L — Foro: multi-imagen hasta 3 por post (sesión 25)

**SQL ejecutado en Supabase ✅** (provisto por el usuario):
- `ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS image_urls TEXT[];`
- `DROP FUNCTION IF EXISTS get_forum_posts(UUID); CREATE OR REPLACE FUNCTION ...` — firma actualizada con `image_urls TEXT[]` en RETURNS TABLE y en SELECT.
- La columna anterior `image_url TEXT` singular ya NO se usa.

**Cambios en `coach.html` ✅:**
- CSS: `.forum-img-preview` → `flex + flex-wrap`; nueva `.forum-img-preview-item` con botón × absoluto; nueva `.forum-img-grid` para mostrar hasta 3 imágenes en grilla.
- Global: `_replyImageUrl` → `_replyImageUrls` (objeto de arrays `{ parentId: string[] }`).
- Input file reply form: agrega `multiple`; `onchange="handleReplyImage(this.files,'${post.id}')"`.
- `renderReply()`: usa `renderImgGrid(r.image_urls)` en lugar de single `<img>`.
- `loadForo()` posts.forEach: usa `renderImgGrid(post.image_urls)`; **inner div del forum-thread-head tiene `style="flex:1;min-width:0;"` (sesión 26 — fix crítico)**.
- **Bugfix sesión 26:** el div que envuelve `.q-meta`, `.q-text` e imágenes dentro de `.forum-thread-head` no tenía `flex:1;min-width:0;`. En un contenedor flex, sin ese atributo el div colapsa a su ancho mínimo de contenido y `.forum-img-grid` hereda un ancho de 0 → imágenes `flex: 1 1 calc(33.33% - 6px)` se renderizan a 0px (invisibles). En `curso-*.html` el mismo div ya tenía `flex:1;min-width:0;` → funcionaba. Fix: agregar `style="flex:1;min-width:0;"` al div.
- `submitReply()`: `payload.image_urls = [..._replyImageUrls[parentId]]`; limpia el array al éxito.
- `handleReplyImage(files, parentId)`: sube hasta (3 − ya subidas) imágenes en loop; acumula en `_replyImageUrls[parentId]`.
- Nueva `renderReplyImgPreview(parentId)`: regenera los thumbnails con × individual.
- Nueva `cancelarReplyImageAt(parentId, index)`: elimina imagen por índice y re-renderiza preview.
- Nueva `renderImgGrid(urls)`: helper para grilla de imágenes en posts.

**Cambios en los 3 `curso-*.html` ✅:**
- CSS: mismas clases que coach.html (`.forum-img-preview` flex, `.forum-img-preview-item`, `.forum-img-grid`).
- Input file: agrega `multiple`; `onchange="handleAskImage(this.files)"`.
- Global: `_pendingImageUrl = null` → `_pendingImageUrls = []`.
- `loadForo()` forEach: usa `renderImgGrid(post.image_urls)` y `renderImgGrid(r.image_urls)`.
- `submitPregunta()`: `payload.image_urls = [..._pendingImageUrls]`; limpia el array al éxito.
- `handleAskImage(files)`: sube hasta (3 − ya subidas); acumula en `_pendingImageUrls`.
- Nueva `renderAskImgPreview()`: regenera thumbnails con × individual.
- Nueva `cancelAskImageAt(index)`: elimina por índice y re-renderiza.
- Nueva `renderImgGrid(urls)`: helper compartido.

### ✅ Etapa N — Resultado neto + migración ad_spend a Supabase (sesión 25)

**⚠️ SQL pendiente de ejecutar en Supabase — policy DELETE en `ad_spend`:**
```sql
CREATE POLICY "Admin puede eliminar ad_spend"
  ON public.ad_spend FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
```
Sin esta policy, el botón "Eliminar" en inversión publicitaria fallará silenciosamente.

**Cambios en `admin.html` — Tab Gestión ✅:**

**Sección "Resultado neto" (nueva):**
- Bloque `.resultado-neto-card` insertado entre `.stats-grid` y `.charts-grid`.
- Oculto al cargar (`display:none`), se muestra cuando `loadResultadoNeto()` completa.
- Muestra 3 filas de deducción + total final:
  - **Ingresos totales** → suma `amount_paid` de `user_courses` donde `currency = 'ARS'`
  - **− Comisiones coaches** → para cada `coach_course`: `revenue × commission_pct / 100` (usa revenue real si hay `amount_paid`; fallback a `count × price_ars`)
  - **− Inversión publicitaria** → suma `amount_ars` de `ad_spend`
  - **Ganancia neta** → ingresos − comisiones − adSpend. Color lime si ≥ 0, rojo si negativo.
- CSS nuevo: `.resultado-neto-card`, `.resultado-neto-title`, `.resultado-neto-row`, `.resultado-neto-row.deduccion`, `.resultado-neto-divider`, `.resultado-neto-final`, `.rn-total`, `.rn-positive`, `.rn-negative`.
- Nueva función `loadResultadoNeto()`: tres queries en paralelo (`user_courses`, `coach_courses`, `ad_spend`) + lógica de cálculo + actualiza DOM + muestra la card.

**Migración inversión publicitaria (localStorage → Supabase):**
- `const AD_STORAGE_KEY` eliminado. Funciones `getAdInversiones()`, `saveAdInversiones()`, `renderAdTable()` eliminadas.
- Campo `#ad-curso` cambiado de `<input type="text">` a `<select>`. `loadAdInversiones()` lo puebla con `allCourses` (fallback a query directa si vacío). Opción por defecto: `"— General —"` → `course_id = null`.
- `loadAdInversiones()` (reescrita): `SELECT id, course_id, platform, amount_ars, spend_date, courses(title) FROM ad_spend ORDER BY spend_date DESC`. Muestra "— General —" si `courses` es null.
- `agregarAdInversion()` (reescrita): `INSERT INTO ad_spend { platform, amount_ars, course_id?, spend_date? }`. Luego llama `loadAdInversiones() + loadResultadoNeto()` en paralelo.
- `deleteAdInversion(id)` (reescrita): `DELETE FROM ad_spend WHERE id = uuid`. Luego recarga ambas funciones. ⚠️ Requiere policy DELETE (ver arriba).
- `loadGestion()` actualizado: `Promise.all([..., loadAdInversiones(), loadResultadoNeto()])`. Ya no llama `loadAdInversiones()` en serie al final.

### ✅ Etapa O — Banner lanzamientos + cursos próximamente dinámicos (sesión 25)

**Tabla nueva `public.launches` ✅ — ejecutada en Supabase (ver esquema completo arriba).**
**Columna nueva `courses.is_coming_soon BOOLEAN` ✅ — ejecutada en Supabase.**

---

**Cambios en `index.html` ✅ — Reestructuración completa:**

- **CDN Supabase agregado:** `@supabase/supabase-js@2` + `supabase.js` antes del `<script>` inline. `index.html` ahora consulta Supabase directamente (sin auth — política pública).
- **CSS slider:**
  - `.slider-wrap` (relative, overflow hidden, border-radius), `.slider-track` (flex, transition transform 0.45s ease), `.slide` (flex-shrink 0, width 100%), `.slide-bg` (cover center, min-height 420px), `.slide-overlay` (gradient negro), `.slide-content` (posición absoluta, texto encima de imagen).
  - `.slide-tag`, `.slide-title`, `.slide-desc`, `.slide-price` (lime), `.slide-cta` (botón lime).
  - `.slider-arrow.prev/.next` (botones flotantes, ocultos si solo 1 slide o en mobile < 680px).
  - `.slider-dots`, `.slider-dot`, `.slider-dot.active`.
- **HTML `#launches-section`** (antes de `#cursos`, `display:none` por defecto):
  - Header "🚀 Próximos Lanzamientos", subtitle.
  - `.slider-wrap` con `#slider-track`, `.slider-arrow prev/next`.
  - `.slider-dots` con `#slider-dots`.
- **Bugfix legibilidad slider (sesión 25):** `.slide-overlay` ahora usa `background: linear-gradient(...) + rgba(0,0,0,0.50)` (doble capa CSS) — base semitransparente uniforme de 50% + degradado extra en la parte inferior. `.slide-tag` tiene `z-index:2` y `text-shadow: 0 1px 6px rgba(0,0,0,0.80)`. `.slide-title`, `.slide-desc` y `.slide-price` tienen `text-shadow` suave (0.65–0.75 opacidad) para garantizar legibilidad sobre cualquier imagen de fondo.
- **Bugfix superposición "NOVEDAD" (sesión 25):** `#launches-section` tenía `padding-top: 60px` pero el navbar es `position:fixed` con altura ≈68px → el badge "🚀 NOVEDAD" (uppercase via CSS) arrancaba por debajo del navbar translúcido, apareciendo cortado. Fix: `padding-top: 110px` para que el contenido quede claramente debajo del navbar. Además, `#hero` (que tiene `.blob-1` con `top: -120px`) ya contaba con `overflow: hidden` para contener los blobs dentro del hero y evitar que sangren hacia la sección de lanzamientos.
- **Orden de secciones en el `<body>`:** `<nav>` → `#launches-section` → `#hero` → `#cursos` → `#proximos` → `#incompany` → `<footer>`. El bloque `#launches-section` fue movido para que quede justo después del navbar, antes del hero — así cuando hay lanzamientos activos es lo primero que ve el usuario al entrar a la landing.
- **Sección `#cursos`:** `.courses-grid` → `<div class="courses-grid" id="courses-grid"><!-- dinámico --></div>`. Se puebla con `loadCursos()`.
- **Sección `#proximos`:** `style="display:none"` por defecto. `.soon-grid` → `<div class="soon-grid" id="soon-grid"></div>`. Se muestra solo si hay cursos `is_coming_soon=true`.
- **JS completamente reescrito:**
  - `escHtml(s)` — escapa HTML para datos de Supabase.
  - Globals: `sliderIndex`, `sliderTotal`.
  - `goToSlide(i)`, `prevSlide()`, `nextSlide()` — mueven el track, actualizan dots.
  - `SLUG_TAG` — mapa `{ slug → display tag }` para badges de cursos.
  - IIFE `initIndex()`: `await Promise.all([loadLaunches(), loadCursos(), loadProximos()])`.
  - `loadLaunches()`: `SELECT id, title, description, image_url, cta_text, active, courses(slug, price_ars, price_usd) FROM launches WHERE active=true LIMIT 3`. Renderiza slides dinámicamente. Oculta flechas y dots si `sliderTotal <= 1`. Muestra `#launches-section`.
  - `loadCursos()`: `SELECT * FROM courses WHERE is_active=true AND (is_coming_soon.is.null OR is_coming_soon.eq.false)`. Renderiza `.course-card` dinámicas. Llama `observer.observe(el)` en cada card. Badge de tipo tomado de `SLUG_TAG`.
  - `loadProximos()`: `SELECT * FROM courses WHERE is_coming_soon=true`. Renderiza `.soon-card` con badge "PRÓXIMAMENTE". Muestra `#proximos`. Si 0 resultados → sección queda oculta.
  - `IntersectionObserver` solo observa `.feature-item` estáticos; las cards dinámicas se observan individualmente.

---

**Cambios en `admin.html` ✅ — Tab Lanzamientos + toggle Próximamente:**

**Tab Lanzamientos (nuevo):**
- Botón de tab: `<button class="tab-btn" data-tab="lanzamientos" onclick="switchTab('lanzamientos')">🚀 Lanzamientos</button>` (entre Certificados y Gestión).
- Panel `#tab-lanzamientos`:
  - **Formulario** con campos: `lz-title` (texto, requerido), `lz-desc` (textarea), `lz-image` (URL imagen de fondo), `lz-course` (select de cursos — "— Sin curso específico —" como opción nula), `lz-cta` (texto CTA, default "Ver curso"), `lz-active` (toggle checkbox).
  - Botón "Guardar lanzamiento" → `saveLanzamiento()`.
  - `<div id="alert-lanzamientos">` para feedback.
  - **Tabla** con columnas: Título, Curso, CTA, Activo, Acciones.
  - `<tbody id="tbody-lanzamientos">`.
- `switchTab()` actualizado: `if (name === 'lanzamientos') loadLanzamientos();`.
- **JS — `loadLanzamientos()`:**
  - Puebla `#lz-course` con `allCourses` (fallback fetch si vacío).
  - `SELECT id, title, description, image_url, course_id, cta_text, active, created_at, courses(title) FROM launches ORDER BY created_at DESC`.
  - Renderiza filas con badge activo/inactivo, botón toggle y botón eliminar.
  - Calcula `activeCount` de los resultados para pasárselo a `toggleLanzamientoActivo`.
- **JS — `saveLanzamiento()`:**
  - Valida título requerido.
  - Si `active = true`: consulta `launches WHERE active=true`; rechaza si `count >= 3` con mensaje de error.
  - `INSERT INTO launches { title, description, cta_text, active, image_url?, course_id? }`.
  - Resetea form + llama `loadLanzamientos()`.
- **JS — `toggleLanzamientoActivo(id, current, activeCount)`:**
  - Si activando (`!current`) y `activeCount >= 3`: muestra error, no actualiza.
  - `UPDATE launches SET active = !current WHERE id = id`.
  - Llama `loadLanzamientos()`.
- **JS — `deleteLanzamiento(id)`:**
  - `confirm()` → `DELETE FROM launches WHERE id = id` → `loadLanzamientos()`.

**Toggle `is_coming_soon` en formulario de cursos:**
- Sección nueva en el form (antes del toggle `is_live`):
  ```html
  <label class="toggle-row" for="cf-is-coming-soon">
    <input type="checkbox" id="cf-is-coming-soon" />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-label">Próximamente <span>(aparece en la landing sin botón de compra)</span></span>
  </label>
  ```
- `resetCursoForm()`: `document.getElementById('cf-is-coming-soon').checked = false;`
- `editCurso()`: `document.getElementById('cf-is-coming-soon').checked = !!c.is_coming_soon;`
- `saveCurso()`: lee `isComingSoon`, incluye `is_coming_soon: isComingSoon` en el payload de INSERT/UPDATE.
- `loadCursos()` SELECT: agrega `is_coming_soon` a los campos seleccionados.
- `loadCursos()` render: muestra badge "Próximamente" (violeta) junto al título si `c.is_coming_soon = true`.

---

### ✅ Etapa P — Lanzamientos: editar + upload imagen directo (sesión 25)

**Cambios en `admin.html` ✅ — Tab Lanzamientos mejorado:**

**TAREA 1 — Edición inline de lanzamientos existentes:**
- **Botón "Editar"** agregado en cada fila de la tabla. Llama `editLanzamiento(id)`.
- **Global `_lanzamientosData`** (`{ id → launch_object }`): cachea todos los lanzamientos cargados en `loadLanzamientos()` para acceso O(1) desde `editLanzamiento`.
- **Global `_lzEditingId`** (`null` = nuevo, `string` = ID del lanzamiento en edición).
- **Título del formulario dinámico** (`#lz-form-title`): "Nuevo lanzamiento" ↔ "Editando lanzamiento".
- **Función `editLanzamiento(id)`:**
  - Pre-carga todos los campos del formulario (título, desc, CTA, activo, curso, imagen).
  - Si tiene `image_url`: muestra la imagen en el preview + llena el campo URL.
  - Cambia el botón Guardar a "Actualizar lanzamiento".
  - Muestra el botón "Cancelar edición" (oculto por defecto).
  - Scroll suave al formulario (`scrollIntoView`).
- **Función `cancelarLanzamiento()`:** limpia todos los campos, resetea `_lzEditingId`, vuelve al modo "nuevo", oculta botón Cancelar.
- **`saveLanzamiento()` actualizado (INSERT → INSERT o UPDATE):**
  - Si `_lzEditingId` → `UPDATE launches SET ... WHERE id = _lzEditingId`.
  - Si no → `INSERT INTO launches`.
  - Validación de máx. 3 activos: al editar, excluye el ID actual del conteo (`filter(a => a.id !== _lzEditingId)`).
  - Feedback diferenciado: "Lanzamiento creado." vs "Lanzamiento actualizado."
  - Llama `cancelarLanzamiento()` antes de `loadLanzamientos()` para limpiar el form.
- **`deleteLanzamiento(id)`** actualizado: si `_lzEditingId === id` → llama `cancelarLanzamiento()` antes de eliminar (evita que el form quede en modo "editar" con un ID inexistente).
- **Tabla actualizada:** filas ahora muestran thumbnail 42×42px de la imagen (si existe) junto al título/descripción.
- **`loadLanzamientos()`** actualizado: preserva la selección del `#lz-course` select al recargar (útil si el admin está en medio de una edición).

**TAREA 2 — Upload de imagen de fondo a Supabase Storage:**
- **Campo `lz-image` (URL text)** reemplazado por un widget de imagen con dos opciones:
  1. **Upload local** (`#lz-image-file`, `type="file"`, `accept="image/*"`): selecciona una imagen del disco.
  2. **URL directa fallback** (`#lz-image-url`): pegar una URL externa.
- **`_lzImageUrl`** (global `null` | `string`): fuente de verdad única para la URL de imagen en el payload. Se resuelve desde upload o desde URL tipada.
- **Preview inmediato:** al seleccionar un archivo, `FileReader.readAsDataURL()` muestra la imagen en `#lz-img-preview-thumb` antes de que termine el upload (UX optimista).
- **Upload a Storage:** `sb.storage.from('course-materials').upload(path, file, { upsert: true })`. Path: `launches/{timestamp}-{random6}.{ext}`. Bucket reutilizado: `course-materials` (ya existente y público).
- **URL pública:** `sb.storage.from('course-materials').getPublicUrl(path)` → `_lzImageUrl`.
- **Estado del upload** (`#lz-img-status`): "⏳ Subiendo imagen..." → "✓ Imagen subida correctamente" (lime) / "❌ Error al subir: …" (rojo).
- **`handleLzUrlInput(val)`:** si se tipea una URL directa → `_lzImageUrl = val`, preview con la URL, limpia el file input. Si se borra → `_lzImageUrl = null`.
- **Mutua exclusión:** seleccionar archivo limpia el campo URL; tipear URL limpia el file input y el status del upload.
- **`cancelLzImage()`:** limpia todo el estado de imagen (preview, status, `_lzImageUrl`, file input, URL input). Llamada desde el botón "✕ Quitar imagen" y desde `cancelarLanzamiento()`.
- **CSS nuevo:** `.lz-img-upload-wrap`, `.lz-img-file-label` (borde punteado, hover lime), `.lz-img-status`, `.lz-img-preview-wrap` (fondo oscuro, border-radius), `.btn-cancel-lz-img`, `.lz-url-fallback`.

### ✅ Etapa M — Comisión editable por coach desde admin.html (sesión 25)

**Policy RLS ejecutada en Supabase ✅** (ya ejecutada antes de esta sesión):
- `"Admin puede actualizar coach_courses"` ON `public.coach_courses` FOR UPDATE — permite que el admin haga UPDATE de `commission_pct` desde el cliente.

**Cambios en `admin.html` ✅:**
- **Tab Coaches — tabla:**
  - `<th>` "Cursos asignados" → "Cursos / Comisión".
  - Cada coach tiene **dos filas** en el tbody:
    1. Fila principal: nombre | botón toggle "N cursos ▾" | acciones (Asignar curso, Quitar rol).
    2. Fila colapsable (`.coach-courses-row`, oculta por defecto): subtabla con una fila por curso asignado.
  - **Subtabla por coach** (`.coach-courses-subtable`): columnas `Nombre del curso | Input comisión % | Botón Guardar`.
    - Input `type="number"` con `min=0 max=100 step=0.01`, `id="comm-{coachId}-{courseId}"`.
    - Botón "Guardar" llama `guardarComision(coachId, courseId, btn)`.

- **`loadCoaches()` actualizada:**
  - Hace dos queries en paralelo (`Promise.all`):
    1. `sb.rpc('get_coaches')` — coaches con sus nombres (SECURITY DEFINER).
    2. `sb.from('coach_courses').select('coach_id, course_id, commission_pct, courses(title)')` — datos de comisión.
  - Construye mapa `ccMap: { coachId → [{ courseId, title, commission_pct }] }`.
  - Renderiza pares de filas (`<tr>` principal + `<tr class="coach-courses-row" id="courses-row-{coachId}">`).

- **Nueva función `toggleCoursesRow(rowId, btn)`:**
  - Alterna `.open` en la fila colapsable.
  - Rota la flecha ▾/▴ en el botón toggle.

- **Nueva función `guardarComision(coachId, courseId, btn)`:**
  - Lee el input `comm-{coachId}-{courseId}`, valida rango 0-100.
  - `sb.from('coach_courses').update({ commission_pct: pct }).eq('coach_id', coachId).eq('course_id', courseId)`.
  - Muestra éxito/error vía `showAlert('alert-coaches', ...)`.

- **CSS nuevo:**
  - `.btn-toggle-courses` — botón borde gris, hover lime.
  - `.coach-courses-row` / `.coach-courses-row.open` — display none / table-row.
  - `.coach-courses-subtable` — tabla interna compacta (padding 7px, border separator sutil).
  - `.commission-input` — input 72px, border lime en focus.
  - `.btn-save-commission` — botón lime pequeño, hover opacity.

**Verificación `coach.html` Tab Ganancias ✅:**
- `loadGanancias()` ya lee `commission_pct` de `coach_courses` en la query `.select('course_id, commission_pct, courses(id, title, price_ars)')`.
- Muestra `${r.commissionPct}% comisión` debajo de cada título de curso en la tabla.
- **Si un coach ve 0% no es un bug de código** — refleja el valor real almacenado en `coach_courses.commission_pct`. El admin debe actualizarlo desde Tab Coaches → expandir el coach → editar el input.

### 🔜 Próximos pasos — pendientes reales

1. ~~**Ejecutar en Supabase — RPC `get_forum_posts` con `image_urls TEXT[]`**~~ ✅ SQL provisto y ejecutado (sesión 25)
   - La RPC retorna `image_urls TEXT[]`; el JS en los 4 archivos lee `post.image_urls` y las muestra en grilla de hasta 3 columnas.
   - La columna `image_url TEXT` (singular) ya no se usa — reemplazada por `image_urls TEXT[]`.

4. **⚠️ Ejecutar en Supabase — policies RLS para editar/eliminar posts** — SQL completo en Etapa J arriba.

5. **⚠️ Ejecutar policy RLS de forum_posts en Supabase** — ver sección "Bugfix Foro (sesión 21)". Permite que coaches y admins lean el foro de sus cursos (actualmente bloqueados si no tienen `user_courses`).

2. ~~**Migrar inversión publicitaria de localStorage a tabla `ad_spend`**~~ ✅ Completado (sesión 25 — Etapa N).
   - **⚠️ Pendiente: ejecutar policy DELETE en `ad_spend`** — ver Etapa N arriba.

3. **Personalizar email de confirmación de Supabase**
   - Ir a: Supabase → Authentication → Email Templates → Confirm signup
   - Redactar en español con branding HB Lab (logo, colores, tono)

6. **🔔 Notificaciones en la app**
   - Campanita en el navbar del alumno con contador de no leídas
   - Tabla `notifications` en Supabase: `id`, `user_id`, `title`, `body`, `link`, `read`, `created_at`
   - Suscripción con **Supabase Realtime** (`channel.on('postgres_changes', ...)`) para recibir notifs en tiempo real sin recargar
   - Cuando el coach responde un post → INSERT en `notifications` del alumno autor
   - Admin puede enviar notificación manual a todos los alumnos de un curso
   - Al hacer click en la notif → marcar `read = true` + navegar al link

7. **📚 Cursos pregrabados con módulos y submódulos**
   - Estructura jerárquica: Curso → Módulos → Submódulos (videos individuales)
   - Tabla `course_modules` (`id`, `course_id`, `title`, `order`) y `course_lessons` (`id`, `module_id`, `title`, `video_url`, `duration`, `order`)
   - Barra de progreso por módulo: `completed_lessons / total_lessons`
   - Progreso global del curso visible en el dashboard del alumno
   - Certificado de compleción: se desbloquea al completar todos los módulos (PDF generado con jsPDF, ya incluido en los cursos)
   - Sidebar de navegación colapsable por módulo dentro de cada `curso-*.html`

8. ~~**🚀 Banner de lanzamiento en index.html**~~ ✅ Completado (sesión 25 — Etapa O)
   - Tabla `launches` creada en Supabase ✅
   - Carrusel de 3 slides en `index.html` con flechas, dots e imagen de fondo ✅
   - Tab "🚀 Lanzamientos" en `admin.html` con CRUD completo y validación máx. 3 activos ✅
   - `courses.is_coming_soon` toggle en form de cursos (admin.html) ✅
   - Grilla de cursos activos y sección Próximamente en `index.html` son 100% dinámicas desde Supabase ✅

9. **🗑 Soft delete en el foro**
   - Agregar columnas a `forum_posts`: `deleted_at TIMESTAMPTZ DEFAULT NULL` y `deleted_by UUID REFERENCES auth.users`
   - Al eliminar un post/respuesta: UPDATE `deleted_at = NOW(), deleted_by = auth.uid()` en vez de DELETE
   - En la vista del alumno: mostrar `"[Mensaje eliminado]"` en lugar del contenido
   - En `coach.html`: opción de ver posts eliminados con info de quién y cuándo eliminó
   - RPC `get_forum_posts` filtra `WHERE deleted_at IS NULL` por defecto; admins pueden ver todos
   - Permite auditoría completa desde `admin.html`

---

### 🔜 Hosteo en GitHub Pages ← PRÓXIMO PASO INMEDIATO

- Subir el directorio `hblab/` a un repositorio en GitHub.
- Activar **GitHub Pages** apuntando a la rama `main` (o `gh-pages`) y carpeta raíz.
- Verificar que todos los assets relativos (`assets/certificados/`, `IMG_2393…png`, `supabase.js`, `notifs.js`) cargan bien.
- Actualizar los placeholders de `canonical` / `og:url` (`https://hblab.com`) por el dominio final una vez que esté el dominio real apuntando a GitHub Pages.
- Verificar que las redirecciones de Supabase Auth (Email Confirm, Password Reset) apuntan al dominio público — Supabase → Authentication → URL Configuration.
- Tests en producción: registro, login, dashboard, acceso a `curso.html`, foro, quiz, certificado.

### 🔜 Etapa 3 — Integración de pagos ← PRÓXIMO PASO GRANDE (después del hosteo)
- Conectar botones "Comprar ahora" con **Mercado Pago** (ARS) y **PayPal** (USD)
- Al confirmar pago: registrar en `user_courses` con `payment_status='paid'`, `status='active'`
- Decisión pendiente: ¿links directos o SDK embebido?

### 🔜 Etapa 4 — Contenido de cursos
- Reproducción de videos / materiales descargables dentro del dashboard
- Una vez que el pago esté integrado y los cursos desbloqueados

### 🔜 Etapa 5 — Lista de espera y contacto
- Formulario real en cursos "Próximamente"
- Formulario in-company
- Integrar con email marketing

### 🔜 Etapa 6 — SEO y analítica
- Meta tags Open Graph y Twitter Card
- Google Analytics / Plausible
- Favicon
- Optimización Lighthouse

---

## Usuarios registrados

| Email | Rol | Notas |
|-------|-----|-------|
| `ekapradacoach@gmail.com` | `admin` ✅ | Cuenta principal. Acceso a `admin.html` y `coach.html`. |
| `test@hblab.com` | `student` | Usuario de prueba. Sin cursos comprados (testear estado bloqueado). Password: `HBLab2024!` |

Para testear el flujo completo con un curso desbloqueado, ejecutar en Supabase:
```sql
-- Asignar webinar-hipertrofia al usuario de prueba manualmente
INSERT INTO public.user_courses (user_id, course_id, payment_status, payment_method, amount_paid, currency, status)
SELECT
  u.id,
  c.id,
  'paid',
  'manual',
  45000,
  'ARS',
  'active'
FROM auth.users u, public.courses c
WHERE u.email = 'test@hblab.com'
AND c.slug = 'webinar-hipertrofia';
```

---

### ✅ Etapa Q — Página de curso dinámica + routing de cursos nuevos (sesión 26)

**Archivo nuevo: `curso.html` ✅**

Página universal que reemplaza los `curso-*.html` para cursos creados desde el admin (los 3 legacy siguen con sus páginas propias).

**Lógica:**
1. Lee `?slug=` de la URL → consulta `courses` por slug
2. Verifica acceso: `user_courses` con `payment_status='paid'` + `status='active'`; si no pasa → `dashboard.html`
3. Si `is_live = false` → carga `courses.videos` (JSONB), renderiza lista de videos con iframes, barra de progreso (`video_progress`), certificado al 100%
4. Si `is_live = true` → oculta progreso, muestra botón "Unirse a la clase" (`live_url`) o grabación (`recording_url`) si `live_completed = true`
5. Foro: mismo sistema que `curso-*.html` via RPC `get_forum_posts`, con emojis, imágenes, editar/eliminar
6. Certificado PDF: `jsPDF` + imagen `assets/certificados/cert-${slug}.png`

**Cambios en archivos existentes:**

- **`dashboard.html`** — `COURSE_META` fallback actualizado:
  ```js
  // Antes: page: '#'
  // Ahora: page: `curso.html?slug=${course.slug}`
  ```
  Cursos no reconocidos apuntan a `curso.html?slug=X` en lugar de `#`.

- **`index.html`** — `loadCursos()` actualizado con mapa de páginas legacy:
  ```js
  const LEGACY_PAGES = {
    'webinar-hipertrofia':   'webinar-hipertrofia.html',
    'carrera-hibrida':       'carrera-hibrida.html',
    'entrenamiento-hibrido': 'entrenamiento-hibrido.html',
  };
  // onclick y href usan: LEGACY_PAGES[c.slug] || `curso.html?slug=${c.slug}`
  ```

- **`admin.html`** — Tab Cursos, campo Slug:
  - `oninput="updateSlugHint(this.value)"` → muestra hint dinámico bajo el input
  - Hint: *"La URL del curso será: `curso.html?slug=<valor>`"*
  - Nueva función `updateSlugHint(val)` — también llamada desde `editCurso()` y `resetCursoForm()`

---

### ✅ Etapa R — Página de venta dinámica + campos enriquecidos en courses (sesión 26)

**Archivo nuevo: `venta-curso.html` ✅**

Página de venta universal para cursos creados desde el admin (los 3 legacy conservan sus páginas propias).
Lee `?slug=` de la URL, es pública (no requiere auth), y renderiza todo desde Supabase.

**Secciones renderizadas dinámicamente:**

1. **Banner** (condicional) — si `courses.banner_text` tiene contenido → barra fija lima sobre el navbar. Ajusta `navbar.top` y `hero.paddingTop` vía JS.
2. **Hero** — título, descripción, badge de tipo (SLUG_TAG map + fallback), precios ARS y USD, botón "Comprar ahora". Si `cover_url` → usa como background-image con overlay `rgba(20,30,44,0.75)` + oculta blobs; si no → grid animado + blobs estándar.
3. **Lo que vas a aprender** — itera `learning_points JSONB` `[{icon, text}]`. Si vacío → mensaje placeholder.
4. **Temario completo** — itera `syllabus JSONB` `[{title, color, items[]}]`. `color='lime'` → `lime-bg`; cualquier otro → `violet-bg`. Label auto: "P1", "P2"… Si vacío → placeholder.
5. **Instructores** — llama RPC `get_course_coaches(p_course_id)` (SECURITY DEFINER). Si RPC no existe o no devuelve datos → sección oculta silenciosamente.
6. **CTA final** — precio + botón comprar.

**SQL pendiente de ejecutar en Supabase:**
```sql
-- Nuevas columnas en courses
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS cover_url       TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS banner_text     TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS learning_points JSONB DEFAULT '[]';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS syllabus        JSONB DEFAULT '[]';

-- Nuevas columnas en profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio        TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- RPC para leer instructores de un curso sin violar RLS de profiles
CREATE OR REPLACE FUNCTION get_course_coaches(p_course_id UUID)
RETURNS TABLE(
  coach_id   UUID,
  full_name  TEXT,
  avatar_url TEXT,
  bio        TEXT
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id          AS coach_id,
    p.full_name,
    p.avatar_url,
    p.bio
  FROM public.coach_courses cc
  JOIN public.profiles p ON p.id = cc.coach_id
  WHERE cc.course_id = p_course_id;
$$;
```

**Cambios en archivos existentes:**

- **`admin.html`** — Tab Cursos, formulario enriquecido:
  - Campo `cover_url` (URL, texto libre): imagen de fondo del hero en la página de venta
  - Campo `banner_text` (texto libre, opcional): barra de anuncio lime sobre el navbar
  - Sección **"Lo que vas a aprender"**: lista dinámica de filas `[icono emoji] + [texto]` con botón "Agregar punto" / × por fila
  - Sección **"Temario"**: lista dinámica de módulos. Cada módulo tiene: título, selector color (violeta/lima), lista de ítems con "+" y × individuales. Botón "× Módulo" elimina todo el módulo.
  - Nuevas funciones JS: `addLpRow()`, `getLpFromForm()`, `renderLpRows()`, `addSyModule()`, `addSyItem()`, `_addSyItemToList()`, `getSyFromForm()`, `renderSyModules()`
  - `saveCurso()` incluye `cover_url`, `banner_text`, `learning_points`, `syllabus` en payload
  - `editCurso()` pre-rellena todos los campos nuevos
  - `resetCursoForm()` limpia `cf-cover-url`, `cf-banner-text`, `#lp-list`, `#sy-list`
  - SELECT de `loadCursos()` incluye los 4 campos nuevos

- **`index.html`** — `loadCursos()`: fallback de `LEGACY_PAGES` cambiado de `curso.html?slug=X` a `venta-curso.html?slug=X`

---

### ✅ Bugfixes sesión 26 — materiales, upload imagen lanzamiento, link banner

**Fix 1 — `coach.html` Tab Materiales (columnas reales de `course_materials`):**
- La tabla real tiene `drive_url` (no `drive_link`) y `uploaded_by` (no `coach_id`)
- SELECT, INSERT, UPDATE y toda la lógica de `getMaterialType/Icon/LinkText` actualizados a `drive_url`
- INSERT ahora usa `uploaded_by: currentUser.id` en lugar del inexistente `coach_id`

**Fix 2 — `index.html` `loadLaunches()` link CTA del slider:**
- Antes: `courseUrl = l.courses?.slug ? \`${l.courses.slug}.html\` : '#'` → siempre `{slug}.html`, roto para cursos nuevos
- Ahora: usa el mismo `LEGACY_PAGES` map que `loadCursos()`:
  ```js
  const courseSlug = l.courses?.slug;
  const courseUrl  = courseSlug
    ? (LEGACY_PAGES[courseSlug] || `venta-curso.html?slug=${courseSlug}`)
    : '#';
  ```
- Los 3 cursos legacy siguen yendo a su HTML propio; cursos nuevos → `venta-curso.html?slug=X`

**Fix 3 — Upload imagen en lanzamientos (ya estaba implementado en Etapa P):**
- Confirmado: `handleLzImage()` en `admin.html` ya hace upload a `course-materials/launches/` con FileReader preview inmediato → upload async → URL pública en `_lzImageUrl`
- No requirió cambios adicionales

---

### ✅ Mejora sesión 26 — Upload imagen de portada en Tab Cursos (admin.html)

**Campo "Imagen de portada" (`cover_url`) en Tab Cursos:**

Reemplazado el simple `<input type="url">` por el mismo widget de upload que usa Tab Lanzamientos:

- **Selección de archivo local** → `<input type="file" id="cf-cover-file">` oculto, activado por `<label class="lz-img-file-label">`
- **Preview inmediato** con `FileReader.readAsDataURL()` antes de que termine el upload
- **Upload async** a Supabase Storage `course-materials/covers/{timestamp}-{random}.{ext}`
- **URL pública** almacenada en `_cfCoverUrl` → incluida en payload como `cover_url`
- **Fallback URL directa** — campo `<input type="url" id="cf-cover-url">` con `oninput="handleCfCoverUrlInput(val)"` — exclusión mutua con el upload

**Nuevas funciones JS:**
- `handleCfCoverImage(file)` — preview + upload a `covers/` + `_cfCoverUrl = publicUrl`
- `cancelCfCoverImage()` — limpia `_cfCoverUrl`, preview, status, file input y URL input
- `handleCfCoverUrlInput(val)` — `_cfCoverUrl = val`, preview con URL directa

**Integraciones actualizadas:**
- `saveCurso()` — `coverUrl = _cfCoverUrl || null` (antes leía el input de texto directo)
- `editCurso()` — llama `cancelCfCoverImage()` → si `c.cover_url` existe: `_cfCoverUrl = c.cover_url` + muestra preview
- `resetCursoForm()` — llama `cancelCfCoverImage()` en lugar de limpiar `cf-cover-url` manualmente

**Reutiliza CSS existente** de Tab Lanzamientos: `.lz-img-upload-wrap`, `.lz-img-file-label`, `.lz-img-status`, `.lz-img-preview-wrap`, `.btn-cancel-lz-img`, `.lz-url-fallback`

---

---

### ✅ Etapa T — Certificados dinámicos para cursos nuevos (sesión 27)

**SQL ejecutado en Supabase ✅:**
```sql
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS certificate_url TEXT;
```

**Cambios en `admin.html` ✅ — Tab Cursos, campo "Certificado (PNG base)":**

Nuevo campo con el mismo widget de upload que `cover_url` y lanzamientos:

- **Selección de archivo local** → `<input type="file" id="cf-cert-file" accept="image/png,image/*">` oculto, activado por `<label class="lz-img-file-label">`
- **Preview inmediato** con `FileReader.readAsDataURL()` antes de que termine el upload
- **Upload async** a Supabase Storage `course-materials/certificados/{timestamp}-{random}.{ext}`
- **URL pública** almacenada en `_cfCertUrl` → incluida en payload como `certificate_url`
- **Fallback URL directa** — campo `<input type="url" id="cf-cert-url">` con `oninput="handleCfCertUrlInput(val)"`
- Global: `let _cfCertUrl = null;`

**Nuevas funciones JS en `admin.html`:**
- `handleCfCertImage(file)` — preview + upload a `certificados/` + `_cfCertUrl = publicUrl`
- `cancelCfCertImage()` — limpia `_cfCertUrl`, preview, status, file input y URL input
- `handleCfCertUrlInput(val)` — `_cfCertUrl = val`, preview con URL directa

**Integraciones actualizadas en `admin.html`:**
- `saveCurso()` — `certUrl = _cfCertUrl || null` → `certificate_url: certUrl` en payload
- `editCurso()` — llama `cancelCfCertImage()` → si `c.certificate_url` existe: `_cfCertUrl = c.certificate_url` + muestra preview
- `resetCursoForm()` — llama `cancelCfCertImage()`
- `loadCursos()` SELECT — incluye `certificate_url`

**Cambios en `curso.html` ✅ — certificado dinámico:**

- **Global nuevo:** `let currentCertUrl = null;`
- **SELECT actualizado:** incluye `certificate_url` en la query de `courses`
- **Init:** `currentCertUrl = course.certificate_url || null;` después de cargar el curso
- **`showCertSection()`:** solo se llama si `currentCertUrl` es no-null (en el flujo de clase en vivo completada Y en el cálculo de progreso de videos al 100%)
- **`generarCertificado()`:** usa `currentCertUrl` en lugar de `assets/certificados/cert-${currentSlug}.png`. Si `currentCertUrl` es null (no debería llegar aquí, pero por seguridad) → lanza error controlado.

**Mismas coordenadas jsPDF que los cursos legacy:**
- Nombre: Y = 108 mm, helvetica bolditalic, 32pt, #2D1B6B, centrado en X = 148.5 mm
- Fecha: Y = 72 mm, helvetica normal, 16pt, #2D1B6B, centrado en X = 148.5 mm
- Formato: A4 landscape (297 × 210 mm)
- Nombre de archivo: `certificado-{slug}-{nombre-normalizado}.pdf`

**Reutiliza CSS existente** de Tab Lanzamientos / Tab Cursos cover: `.lz-img-upload-wrap`, `.lz-img-file-label`, `.lz-img-status`, `.lz-img-preview-wrap`, `.btn-cancel-lz-img`, `.lz-url-fallback`

---

---

### ✅ Bugfix — Tab Alumnos: "Asignar curso" tiraba UUID inválido (sesión 27)

**Error:** `"invalid input syntax for type uuid: undefined"` al confirmar el modal "Asignar curso" desde la tabla de alumnos con cursos activos.

**Causa:** `loadAlumnos()` usaba `p.id` al construir el `onclick` del botón, pero la RPC `get_students_with_courses` retorna el identificador como `user_id` (no `id`). `p.id` era `undefined` → `selectedAlumnoId = 'undefined'` (string) → el upsert en `user_courses` fallaba al parsear como UUID.

**Fix en `admin.html`:**
```js
// Antes (roto):
onclick="openAsignarCurso('${p.id}','${safeNombre}')"
// Después (correcto):
onclick="openAsignarCurso('${p.user_id}','${safeNombre}')"
```

**Contexto:** la RPC real retorna `{ user_id, full_name, email, course_titles: TEXT[] }`. El campo `user_id` es el UUID del alumno en `auth.users` / `public.profiles`. El comentario en `loadAlumnos()` fue actualizado para reflejar la firma real.

---

---

### ✅ Etapa U — Sección "📚 Materiales" para alumnos (sesión 27)

**Archivos modificados:** `curso.html`, `curso-webinar-hipertrofia.html`, `curso-carrera-hibrida.html`, `curso-entrenamiento-hibrido.html` ✅

**Sección nueva entre el certificado y el foro en los 4 archivos.**

**Comportamiento:**
- Consulta `course_materials` filtrando por `course_id` del curso actual:
  ```js
  sb.from('course_materials')
    .select('id, title, description, drive_url')
    .eq('course_id', currentCourseId)
    .order('created_at')
  ```
- Cada material se renderiza como `.material-row` con: ícono + título + descripción (opcional) + botón "Abrir" (`<a target="_blank">`)
- Detección de tipo igual que en `coach.html`: URL contiene `/storage/v1/object/public/course-materials/` → `📄` (PDF); caso contrario → `🔗` (link externo)
- Si no hay materiales o hay error: `"El coach aún no cargó materiales para este curso."`
- `loadMateriales()` se llama desde `init()` junto con `loadForo()`, sin await (paralelo implícito — ambas son independientes)

**Diferencia legacy vs dinámico:**
- `curso-*.html` (3 legacy): `currentCourseId` ya estaba disponible (se setea consultando `courses` por `COURSE_SLUG`). `loadMateriales()` sigue el mismo patrón.
- `curso.html` (dinámico): igual — `currentCourseId = course.id` ya existía en `init()`.

**CSS añadido en los 4 archivos** (antes del bloque `.forum-section`):
```css
.materiales-section { margin-top: 48px; padding-top: 40px; border-top: 1px solid var(--card-border); }
.materiales-section-title { font-size: 1.05rem; font-weight: 800; letter-spacing: -0.01em; margin-bottom: 16px; }
.materiales-list { display: flex; flex-direction: column; gap: 10px; }
.material-row { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; gap: 14px; }
.material-icon { font-size: 1.4rem; flex-shrink: 0; line-height: 1; }
.material-info { flex: 1; min-width: 0; }
.material-title { font-weight: 600; font-size: 0.9rem; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.material-desc { font-size: 0.78rem; color: var(--gray-text); line-height: 1.4; margin: 0; }
.btn-material-open { flex-shrink: 0; background: transparent; border: 1px solid var(--card-border); border-radius: 8px; color: var(--lime); font-size: 0.8rem; font-weight: 600; padding: 7px 14px; text-decoration: none; display: inline-block; transition: background 0.15s, border-color 0.15s; }
.btn-material-open:hover { background: rgba(200,230,0,0.08); border-color: var(--lime); }
.materiales-empty { font-size: 0.85rem; color: var(--gray-text); padding: 8px 0; margin: 0; }
```

**No se tocó:** lógica de acceso, progreso, certificado, foro.

---

---

### ✅ Etapa V — Tab "🔴 Clase en vivo" en coach.html + RPC set_live_completed (sesión 27)

**RPC ejecutada en Supabase ✅:**
```sql
-- Firma (SECURITY DEFINER):
set_live_completed(p_course_id UUID) → void
-- Permite al coach asignado o admin setear live_completed = true en el curso indicado.
-- Verifica que el caller tenga acceso (coach asignado o role='admin').
```

**Cambios en `coach.html` ✅:**

**Nuevo tab "🔴 Clase en vivo"** (entre Progreso y Ganancias):
- **Selector de curso** (`#live-curso-sel`) → se puebla automáticamente junto con Foro, Materiales y Progreso (agregado al objeto `SELECTORS`)
- Al seleccionar un curso → llama `loadLiveTab()` que consulta `courses` por `id` con `select('id, title, is_live, live_url, live_date, live_completed')`

**Lógica de renderizado de `loadLiveTab()`:**
| Estado | Qué muestra |
|--------|-------------|
| Sin curso seleccionado | Mensaje de placeholder |
| `is_live = false` | "Este curso no es una clase en vivo. No hay acciones disponibles." |
| `is_live = true AND live_completed = true` | "✅ Clase finalizada — El certificado ya está habilitado…" |
| `is_live = true AND live_completed = false` | Fecha, link Meet/Zoom (si existe) + botón "✅ Finalizar clase y liberar certificado" |

**Función `finalizarClase(courseId)`:**
1. `confirm()` con mensaje de advertencia de irreversibilidad
2. `sb.rpc('set_live_completed', { p_course_id: courseId })`
3. Error → muestra mensaje inline rojo (no reemplaza el botón)
4. Éxito → muestra "Certificado liberado para los alumnos." en verde → `setTimeout(() => loadLiveTab(), 1400)` para recargar el estado (el botón desaparece y queda el estado "✅ Clase finalizada")

**No se tocó:** foro, materiales, progreso, ganancias, lógica de acceso.

---

---

### ✅ Etapa W — Rediseño completo de coach.html (sesión 28)

**Motivación:** el panel anterior tenía 5 tabs con selector de curso independiente en cada uno (Foro, Materiales, Progreso, Clase en vivo). Esto era redundante y fragmentado. El nuevo flujo es: selector único → todo el contenido del curso en secciones verticales.

**Nueva estructura de tabs:** solo 2 botones:
- **📋 Mi curso** (activo por defecto) — todo el contenido del curso seleccionado
- **💰 Ganancias** — sin cambios (idéntico al anterior)

**Tab "Mi curso":**
- Un único `<select id="mi-curso-sel" class="course-select-prominent">` en la parte superior (más grande que el anterior, `font-size: 1rem`, `max-width: 520px`)
- Al cambiar → llama `onCursoChange()` → llama `loadCursoCompleto(courseId)`
- Auto-selección si `coachCourses.length === 1` (desde `init()`)
- Banner "Sin cursos asignados" sigue mostrándose si coach sin cursos

**Función `loadCursoCompleto(courseId)`:**
- Setea `currentCourseId = courseId` y `_loadSeq = ++seq`
- Renderiza el esqueleto HTML de las 4 secciones dentro de `#micurso-content`:
  1. **🔴 Clase en vivo** — `#live-content`
  2. **📁 Materiales** — formulario `#mat-form-wrap` + `#mat-content`
  3. **💬 Foro** — `#foro-content`
  4. **📊 Progreso de alumnos** — `#prog-content`
- Llama los 4 loaders en paralelo: `Promise.all([loadLiveSection(), loadMateriales(), loadForo(), loadProgreso()])`
- Resetea el estado del form de materiales (`editingMaterialId = null`)

**Funciones adaptadas:**
| Función antigua | Función nueva | Cambio clave |
|----------------|--------------|-------------|
| `loadLiveTab()` | `loadLiveSection(seq)` | Usa `currentCourseId` (global), no `live-curso-sel` |
| `loadMateriales()` | `loadMateriales(seq)` | Usa `currentCourseId`, no `mat-curso-sel` |
| `loadForo()` | `loadForo(seq)` | Usa `currentCourseId`, no `foro-curso-sel` |
| `loadProgreso()` | `loadProgreso(seq)` | Usa `currentCourseId`, no `prog-curso-sel` |
| `saveMaterial()` | `saveMaterial()` | Lee `currentCourseId` (antes `mat-curso-sel.value`) |

**Anti-stale render:** cada loader recibe el `seq` del `loadCursoCompleto` que lo invocó. Al terminar la fetch, compara `seq !== _loadSeq`; si el curso cambió mientras cargaba, descarta el resultado (no escribe en el DOM). También hace null-check de `document.getElementById(...)` por si el DOM fue reemplazado.

**Bugfixes incluidos:**
- `escHtml` (indefinido) → reemplazado por `escapeHtml` en `loadLiveSection()` (la versión anterior del tab live usaba `escHtml` que no existía)
- `clearMaterialForm()`: todos los `document.getElementById(...)` tienen null-check (el form se renderiza dinámicamente, no estaba en el HTML inicial)
- `document.querySelector('#mat-form-wrap h3')` también con null-check

**CSS nuevo:**
```css
.curso-section { margin-top: 44px; padding-top: 40px; border-top: 1px solid var(--card-border); }
.curso-section:first-child { margin-top: 0; padding-top: 0; border-top: none; }
.curso-selector-main { margin-bottom: 32px; }
.curso-selector-main label { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gray-text); margin-bottom: 8px; }
.course-select-prominent { font-size: 1rem; font-weight: 600; padding: 13px 16px; border-radius: 10px; max-width: 520px; }
```

**Eliminado del HTML:**
- Tabs `tab-foro`, `tab-materiales`, `tab-progreso`, `tab-live` (todos removidos)
- Sus selectores individuales (`foro-curso-sel`, `mat-curso-sel`, `prog-curso-sel`, `live-curso-sel`)
- `SELECTORS` simplificado a una función: `{ micurso: () => document.getElementById('mi-curso-sel') }` (poblado directamente en `loadCoachCourses()`)

**No se tocó:** auth, routing, `loadGanancias()`, `initGananciasSelectors()`, todas las funciones del foro (renderReply, submitReply, eliminarPost, edición inline, emoji picker, upload imágenes), funciones de materiales (editMaterial, deleteMaterial), `finalizarClase()`, `escapeHtml()`, `linkify()`, `renderImgGrid()`, `showToast()`, `fmtARS()`, `mesNombre()`.

---

---

### ✅ Sesión 29 — Fix nombres nulos + foro paginado con búsqueda (coach.html)

#### Fix 1 — Fallback de nombre en Progreso y Foro

**Problema:** cuando `profiles.full_name` es `NULL` (usuario registrado sin haber completado su nombre), se mostraba el UUID crudo (o "Alumno"/"Usuario" como texto genérico poco útil).

**Fix en Progreso (`loadProgreso`):**
- SELECT cambiado a `'id, full_name, email'`
- `profileMap` ahora almacena `{ full_name, email }` por uid
- Resolución del nombre: `p?.full_name || p?.email || 'Alumno sin nombre'`

**Fix en Foro (`loadForo` + `renderReply`):**
- La RPC `get_forum_posts` solo retorna `full_name`. Tras el retorno de la RPC, se colectan los `user_id` con `full_name` nulo y se hace una query secundaria a `profiles` para obtener sus emails.
- Los resultados se augmentan con `r._email = emailMap[r.user_id]` en memoria (sin modificar la RPC).
- En `renderForoSection`: `post.full_name || post._email || 'Alumno sin nombre'`
- En `renderReply`: `r.full_name || r._email || 'Alumno sin nombre'`
- Nota: la query secundaria a `profiles` está limitada por la policy RLS `auth.uid() = id` (solo devuelve el perfil propio). Si el coach es quien tiene `full_name` nulo, se resuelve su email. Para alumnos con nombre nulo y bloqueados por RLS, cae en `'Alumno sin nombre'`. Para resolución completa se requeriría ajustar la RPC (SQL) — el JS está listo para cuando eso suceda.

---

#### Fix 2 — Foro con paginación y búsqueda en memoria

**Nuevos globals:**
```js
let _foroPosts           = [];  // posts raíz, ordenados desc (más nuevo primero)
let _foroRepliesByParent = {};  // { postId → reply[] }
let _foroCourseId        = '';  // courseId al cargar
let _foroVisibleCount    = 5;   // posts visibles actualmente
let _foroSearchQuery     = '';  // texto de búsqueda activo
```

**Flujo:**
1. `loadForo(seq)` hace la RPC, augmenta emails, invierte el array de posts (desc), guarda en globals, resetea `_foroVisibleCount = 5` y `_foroSearchQuery = ''`, llama `renderForoSection()`.
2. `renderForoSection()` — renderiza sin re-query:
   - Si hay `_foroSearchQuery`: filtra `_foroPosts` por `full_name || _email` o `content` (case-insensitive); muestra todos los resultados; oculta "Ver más".
   - Si no hay query: muestra `_foroPosts.slice(0, _foroVisibleCount)`; muestra botón "Ver más (N restantes)" si hay más.
   - Al inicio renderiza el input de búsqueda `#foro-buscar`.
   - Después del re-render, restaura el foco en el input y mueve el cursor al final (evita que el usuario pierda el foco al tipear).
3. `onForoBuscar(value)` — llamado por `oninput` del input: actualiza `_foroSearchQuery`, resetea `_foroVisibleCount = 5`, llama `renderForoSection()`.
4. `foroVerMas()` — llamado por el botón: incrementa `_foroVisibleCount += 5`, llama `renderForoSection()`.

**CSS añadido:**
```css
.foro-search-wrap { margin-bottom: 18px; }
.foro-search-input { width: 100%; max-width: 420px; background: var(--card-bg); border: 1.5px solid var(--card-border); color: var(--white); font-size: 0.87rem; padding: 9px 13px; border-radius: 8px; }
.foro-search-input:focus { border-color: var(--violet); }
.foro-ver-mas-wrap { text-align: center; margin-top: 18px; }
```

**No se tocó:** replies, formulario nueva pregunta, materiales, progreso (excepto el fix de nombre), clase en vivo, ganancias, auth.

---

---

### ✅ Sesión 30 — Fix Progreso: query de perfiles bloqueada por RLS (coach.html)

**Causa raíz:** `loadProgreso()` consultaba `public.profiles` directamente con `.from('profiles').select('id, full_name, email').in('id', userIds)`. La policy RLS de `profiles` es `auth.uid() = id` — cada usuario solo puede leer su propio perfil. El coach/admin solo recibía su propio perfil (o ninguno), así que `profileMap` quedaba vacío → todos los alumnos mostraban `'Alumno sin nombre'`.

**Fix:** reemplazar la query directa a `profiles` por la RPC `get_students_with_courses()` (ya existente, `SECURITY DEFINER`, bypasea RLS). Esta RPC retorna `{ user_id, full_name, email, course_titles }` para todos los alumnos con `payment_status='paid'` y `status='active'`. El `profileMap` se construye desde esos datos y el fallback `full_name → email → 'Alumno sin nombre'` ya estaba correcto.

**Mejora de rendimiento incluida:** las tres queries post-enrollments (studentsData, courseCfg, vpRows) ahora corren en paralelo con `Promise.all`.

```js
// Antes (bloqueado por RLS):
const { data: profiles } = await sb.from('profiles')
  .select('id, full_name, email').in('id', userIds);

// Después (SECURITY DEFINER, bypasea RLS, paralelo):
const [{ data: studentsData }, { data: courseCfg }, { data: vpRows }] = await Promise.all([
  sb.rpc('get_students_with_courses'),
  sb.from('courses').select('total_videos').eq('id', courseId).single(),
  sb.from('video_progress').select('user_id, video_index, completed')
    .eq('course_id', courseId).in('user_id', userIds).eq('completed', true),
]);
const profileMap = {};
(studentsData || []).forEach(s => {
  profileMap[s.user_id] = { full_name: s.full_name || null, email: s.email || null };
});
```

**Nota general para futuras queries a `profiles` desde `coach.html`:** la policy RLS `auth.uid() = id` bloquea leer perfiles de otros usuarios. Siempre usar RPCs con `SECURITY DEFINER` (`get_students_with_courses`, `get_coaches`, etc.) o crear una nueva RPC cuando se necesiten datos de perfiles ajenos.

---

---

### ✅ Sesión 31 — loadProgreso reemplazado por RPC get_course_progress (coach.html)

**Motivación:** la sesión 30 ya usaba `get_students_with_courses()` para bypasear RLS en `profiles`, pero `loadProgreso` aún necesitaba 3 queries adicionales en paralelo (`courses.total_videos`, `video_progress`, y la propia RPC de perfiles). Se creó una nueva RPC dedicada que resuelve todo en una sola llamada server-side.

**Nueva RPC en Supabase ✅ (SQL ejecutado por el usuario):**
```sql
-- Firma:
get_course_progress(p_course_id UUID)
-- SECURITY DEFINER — bypasea RLS de profiles, user_courses y video_progress.
-- Retorna una fila por alumno inscripto con payment_status='paid' y status='active'.
-- Columnas retornadas: user_id UUID, full_name TEXT, email TEXT, completed BIGINT, total BIGINT
--   completed = videos completados por ese alumno en el curso
--   total     = total de videos del curso (courses.total_videos)
```

**Cambios en `coach.html` — `loadProgreso(seq)` ✅:**

- **Eliminado:** query a `user_courses` para obtener `userIds`, luego `Promise.all` de 3 queries (`get_students_with_courses`, `courses.total_videos`, `video_progress`), construcción de `profileMap` y `completedMap`.
- **Reemplazado por:** una única llamada `sb.rpc('get_course_progress', { p_course_id: courseId })`.
- La RPC retorna directamente `{ user_id, full_name, email, completed, total }` por alumno.
- Fallback de nombre: `r.full_name || r.email || 'Alumno sin nombre'` (igual que antes).
- El resto de la lógica de renderizado no cambió: barra de progreso, colores semáforo (lime ≥80%, amarillo ≥40%, rojo <40%), ordenamiento por `pct` descendente, tabla HTML.

**Patrón anti-stale preservado:** el `seq` se verifica tras el `await rpc(...)` antes de escribir en el DOM. Si `seq !== _loadSeq` (cambió el curso mientras cargaba), se descarta el resultado.

**Impacto en rendimiento:** de 4 queries (1 serial + 3 paralelas) a 1 sola llamada RPC. La lógica de JOIN entre `user_courses`, `profiles` y `video_progress` se ejecuta en el servidor (PostgreSQL), no en JS.

**Nota para futuras queries de progreso:** `get_course_progress` es la fuente canónica para "alumnos + progreso de videos de un curso". No usar queries directas a `profiles`, `user_courses` ni `video_progress` desde el cliente para este propósito — todas están bloqueadas por RLS para coaches.

---

---

### ✅ Sesión 32 — Progreso: manejo de total no configurado + fix total_videos en admin

#### Fix 1 — `coach.html` — tabla de progreso cuando `total` es null/0

**Problema:** cuando `courses.total_videos` es null o 0 (curso sin videos cargados, o clase en vivo), la RPC `get_course_progress` retornaba `total = 0`. El render mostraba `0%` y `— ` como si fuera un error de progreso, siendo que en realidad el total simplemente no está configurado.

**Cambios en `loadProgreso(seq)` — `coach.html`:**

- Nueva bandera `hasTotal = total > 0` en cada fila del `rows.map()`.
- **Columna "Videos completados":**
  - `hasTotal`: `${completed} / ${total}` (igual que antes)
  - `!hasTotal`: `${N} video(s) completado(s)` — muestra el conteo en texto natural, sin fracción
- **Columna "Progreso":**
  - `hasTotal`: barra de progreso + porcentaje con colores semáforo (igual que antes)
  - `!hasTotal`: badge gris `.badge-no-total` con texto "Total no configurado" — sin barra
- **Ordenamiento:** filas con `hasTotal` van primero (orden por pct desc); filas sin total van al final.

**CSS añadido:**
```css
.badge-no-total { display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 3px 9px; border-radius: 20px; background: rgba(148,163,184,0.12); color: var(--gray-text); letter-spacing: 0.02em; }
```

---

#### Fix 2 — `admin.html` — `saveCurso()` siempre guarda `total_videos = videos.length`

**Problema:** la línea era `total_videos: isLive ? 0 : videos.length`. Para cursos en vivo, siempre guardaba 0, lo que hacía que `get_course_progress` retornara `total = 0` y el coach viera "Total no configurado" aunque en un futuro se agreguen videos al curso.

**Fix:**
```js
// Antes:
total_videos: isLive ? 0 : videos.length,

// Después:
total_videos: videos.length,
```

`getVideosFromForm()` siempre retorna un array (nunca null/undefined), por lo que `.length` es siempre seguro. Si un curso en vivo no tiene videos, `videos.length = 0` y el badge "Total no configurado" aparece en coach.html — comportamiento correcto y consistente.

---

### ✅ Sesión 33 — Fix `loadProgreso` unauthorized: courseId explícito por parámetro (coach.html)

**Problema:** `loadProgreso(seq)` leía `const courseId = currentCourseId;` del global. La RPC `get_course_progress` devolvía "unauthorized" porque en algunos casos `courseId` llegaba vacío (string `''`), y al pasar `{ p_course_id: '' }` la RPC lo trataba como no autorizado (el coach no tiene acceso a un curso sin ID).

**Fix en `loadProgreso` — `coach.html`:**

- Firma cambiada: `loadProgreso(seq)` → `loadProgreso(courseId, seq)` — ahora recibe el UUID del curso como parámetro explícito.
- Eliminada la línea `const courseId = currentCourseId;`.
- Guard añadido `if (!courseId) return;` — corta temprano si se llama sin ID.
- Call site en `loadCursoCompleto`: `loadProgreso(seq)` → `loadProgreso(courseId, seq)` (única línea tocada fuera de `loadProgreso`, necesaria para la firma).

**Resultado:** la RPC recibe siempre el UUID real del curso seleccionado (ya sea por auto-selección con 1 curso o cambio manual del `<select>`). Las demás funciones (`loadForo`, `loadMateriales`, `loadLiveSection`, `saveMaterial`) siguen usando `currentCourseId` global — no se tocaron.

---

### ✅ Etapa X — Sistema de evaluaciones (quizzes)

> **Nota:** la letra "U" ya se había usado en Sesión 27 (sección de Materiales para alumnos). Esta etapa toma "X" — la próxima libre — pero a fines prácticos del briefing del usuario es la "Etapa de Sistema de evaluaciones".

**Resumen:** se incorpora la posibilidad de que un curso requiera aprobar una evaluación final (quiz) para liberar el certificado. El admin habilita el feature por curso con un toggle; el coach configura preguntas y condiciones desde su panel; el alumno rinde el quiz al completar el 100% del progreso.

**SQL ejecutado en Supabase (provisto por el usuario):**

```sql
-- Tabla principal del quiz por curso (o por módulo cuando aplique)
CREATE TABLE public.course_quizzes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id     UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  module_id     UUID REFERENCES public.course_modules(id) ON DELETE CASCADE,  -- nullable
  min_score     INT  NOT NULL DEFAULT 70,                                     -- 0..100
  max_attempts  INT  NOT NULL DEFAULT 3,                                      -- 0 = ilimitado
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_required   BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, module_id)
);

-- Preguntas del quiz
CREATE TABLE public.quiz_questions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id       UUID REFERENCES public.course_quizzes(id) ON DELETE CASCADE NOT NULL,
  question      TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('single','multiple','text')),
  options       JSONB DEFAULT '[]',         -- array de strings (vacío si type='text')
  correct_idxs  JSONB DEFAULT '[]',         -- array de índices correctos (vacío si type='text')
  image_urls    TEXT[],                     -- hasta 3 URLs de Storage
  order_num     INT  DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Intentos del alumno
CREATE TABLE public.quiz_attempts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  quiz_id     UUID REFERENCES public.course_quizzes(id) ON DELETE CASCADE NOT NULL,
  course_id   UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  score       INT NOT NULL,                 -- 0..100 (% de preguntas evaluables correctas)
  passed      BOOLEAN NOT NULL,
  answers     JSONB DEFAULT '[]',           -- [{question_id, selected_idxs:[], text_answer:''}]
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Toggle a nivel curso
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS has_quiz BOOLEAN DEFAULT false;
```

**RLS:** activa en las 3 tablas. Coaches y admins pueden escribir `course_quizzes` y `quiz_questions`; alumnos solo pueden insertar y leer sus propios `quiz_attempts`.

**Tipos de preguntas:**

| Tipo | Render alumno | Cómo se evalúa | Almacena |
|------|---------------|----------------|----------|
| `single` | radio buttons | sumatoria booleana — la respuesta es correcta solo si el `selected_idxs` matchea exactamente con `correct_idxs` (ambos sets de 1 ítem) | `selected_idxs: [n]` |
| `multiple` | checkboxes | la respuesta es correcta solo si los sets ordenados de `selected_idxs` y `correct_idxs` son idénticos (todos los correctos marcados, ninguno extra) | `selected_idxs: [n,m,...]` |
| `text` | textarea libre | NO se evalúa automáticamente — se guarda para revisión manual; no afecta el score | `text_answer: '...'` |

**Score:** `Math.round(correctas / total_evaluables * 100)`. `total_evaluables` cuenta solo preguntas `single` y `multiple`. Si no hay preguntas evaluables (todas `text`) → score = 100. `passed = score >= min_score`.

**Flujo de intentos al 100% del progreso (curso.html):**

```
Al disparar updateProgress() con pct >= 100:
  └── checkQuizGateAndShowCert()
        ├── SELECT course_quizzes WHERE course_id = X AND module_id IS NULL AND is_active = true
        │     ├── Sin quiz / quiz inactivo → showCertSection() (legacy)
        │     └── Con quiz:
        │           ├── SELECT quiz_attempts (count + flag passed)
        │           ├── Ya aprobó → showCertSection()
        │           ├── Sin más intentos (max>0 && used >= max) → #quiz-attempts-exhausted
        │           └── Puede intentar → showQuizSection(quiz, questions, used)
        │
        └── Tras submitQuiz():
              ├── Aprueba → panel verde "✅ ¡Aprobaste!" + showCertSection()
              ├── Reprueba con intentos restantes → panel rojo + botón "Reintentar"
              └── Reprueba sin intentos restantes → panel rojo "Agotaste los X intentos"
```

**Archivos modificados:**

- **`admin.html`** — Tab Cursos, wizard paso 3:
  - Toggle `#cf-has-quiz` ("¿Este curso tiene evaluación?") al final de la sección "Página de venta", debajo de "Coaches asignados".
  - `saveCurso()` incluye `has_quiz: hasQuiz` en el payload INSERT/UPDATE.
  - `editCurso(c)` setea `cf-has-quiz.checked = !!c.has_quiz`.
  - `resetCursoForm()` apaga el toggle.
  - `loadCursos()` SELECT incluye `has_quiz`.
  - `renderCursosRows()` muestra `<span class="badge badge-violet">📝 Test</span>` si `c.has_quiz` es `true`.

- **`coach.html`** — Nuevo tab "📝 Tests" entre "Mi curso" y "Ganancias":
  - Selector `#quiz-course-select` poblado por `populateQuizCourseSelector()` que filtra `coachCourses` por `has_quiz=true` (query rápido a `courses(id, has_quiz)`). Si ninguno → opción deshabilitada "Ningún curso tiene evaluación habilitada".
  - `onQuizCourseChange()` → `loadQuizEditor(courseId)`.
  - `loadQuizEditor`: query `course_quizzes` (course+module_id IS NULL) + `quiz_questions` ordenadas por `order_num`. Si no existe → arranca formulario vacío en modo creación.
  - `renderQuizEditor`: form de configuración (`#qz-min-score`, `#qz-max-attempts`, toggle `#qz-is-active`) + lista de preguntas + sección "Tests por módulo" (placeholder con aviso) + tabla de "Resultados de alumnos".
  - Lista de preguntas (`#quiz-questions-list`): cada pregunta es una card con select de tipo (single/multiple/text), textarea de enunciado, lista dinámica de opciones (mín 2, máx 6) con radio/checkbox para marcar correctas, botón "× Opción", botón "+ Opción", sección de imágenes (upload a `course-materials/quiz-images/{quizId}/{ts}.{ext}`, máx 3, preview thumbnail), botón "🗑 Eliminar pregunta".
  - `saveQuizConfig(courseId)`: valida (cada pregunta tiene enunciado; single/multiple ≥2 opciones y ≥1 correcta) → upsert `course_quizzes` con `onConflict: 'course_id,module_id'` → DELETE todas las `quiz_questions` del quiz → INSERT todas las del form con `order_num` por índice.
  - `loadQuizResults(courseId)`: SELECT `quiz_attempts` + JOIN `profiles` por `user_id` para nombres → tabla con Alumno · Score · Aprobó · Intentos · Fecha último intento. Si hay preguntas de texto → botón "Ver respuestas" abre `#qz-text-modal` con las respuestas abiertas del último intento.
  - Globals nuevas: `_quizCourseId`, `_quizId`, `_quizQuestions`, `_quizSaveSeq`.

- **`curso.html`** — flujo post-100%:
  - Sección `#quiz-section` (oculta por default, dentro de `<section class="videos-section">` justo antes de `#cert-section`) con header (título + badge de intentos), lista `#quiz-q-list`, botón "Enviar respuestas" (deshabilitado hasta que todas las preguntas single/multiple tengan respuesta) y `#quiz-result-panel` para feedback inline.
  - Sección `#quiz-attempts-exhausted` (oculta por default) con mensaje pasivo cuando se agotaron los intentos.
  - `updateProgress()` reemplaza `if (currentCertUrl) showCertSection()` por `checkQuizGateAndShowCert()`.
  - `checkQuizGateAndShowCert()`: query `course_quizzes` (active, module_id IS NULL) → si no hay → cert directo (legacy). Si hay → cuenta intentos del usuario, busca aprobación, decide branch.
  - `showQuizSection(quiz, questions, attemptsUsed)`: setea `_quizState`, calcula badge "Intento N de M", renderiza preguntas.
  - `submitQuiz()`: valida obligatorias, calcula score (solo single+multiple), INSERT `quiz_attempts` con `answers` JSONB array de `{question_id, selected_idxs, text_answer}`, muestra resultado inline.
  - `retryQuiz()`: limpia `_quizState.answers`, oculta panel de resultado, re-renderiza preguntas, scroll al inicio del quiz. Actualiza badge de intentos con el contador incrementado.
  - CSS nuevo prefijado `#quiz-section`, `.quiz-card`, `.quiz-option` (`.selected`), `.quiz-text-answer`, `#quiz-result-panel.success/.failure`, `.quiz-exhausted-card`. Mismo estilo dark card que el resto de la página (lime para selected/aprobado, rojizo sutil para reprobado).

**Storage:** las imágenes de las preguntas viven en `course-materials/quiz-images/{quizId}/{timestamp}.{ext}` (bucket público existente). Cuando el quiz aún no fue creado en BD el upload usa `quiz-images/tmp/{ts}.{ext}` y los archivos se conservan luego del primer save (la URL pública ya quedó en `quiz_questions.image_urls`).

**Pendientes / fuera de alcance de esta etapa:**

- **Tests por módulo** — Sección visible en el panel del coach pero con aviso pasivo: "Esta funcionalidad estará disponible cuando el curso tenga módulos configurados". El esquema (`course_quizzes.module_id`) ya soporta el feature; falta UI para crear quizzes por `course_modules.id` y gating en `curso.html` durante la navegación de módulos.
- **Revisión manual de respuestas de texto** — el coach las puede ver desde el modal "Ver respuestas" en la tabla de resultados, pero no hay UI para que escriba feedback ni ajuste manualmente el score. El campo `passed` se calcula solo con preguntas evaluables.
- **Visibilidad de `passed` en el dashboard del alumno** — la página `dashboard.html` aún no muestra si un curso tiene evaluación pendiente; solo `curso.html` reacciona. Posible mejora futura: badge "Quiz pendiente" en la card del curso si `total_videos completados` y `quiz_attempts.passed = false`.
- **Notificación al coach** cuando un alumno rinde el quiz — no se dispara nada en `notifications`. Se puede agregar después en `submitQuiz()` con la RPC `notify_coaches`.

---

*Última actualización: 30 de abril de 2026 — Sistema de evaluaciones (quizzes) implementado en admin.html, coach.html y curso.html*

---

### 🐛 Bugfix — `saveCoachModules` perdía las lecciones en silencio (coach.html)

**Síntoma reportado:** al guardar módulos desde el panel del coach, los módulos se persistían en `course_modules` pero las lecciones nunca llegaban a `course_lessons`. Al recargar el curso, los módulos aparecían vacíos.

**Causa raíz — tres puntos de falla silenciosa:**

1. **`sb.from('course_lessons').insert(lessonPayload)`** sin `.select()` ni captura de `error`. Si RLS permite INSERT pero bloquea SELECT (o si cualquier check de RLS falla), el INSERT retorna sin error visible y la lección nunca se persiste; el contador `totalLessons++` se incrementaba igual y el mensaje "✅ N lecciones guardadas" mentía al usuario.
2. **`sb.from('course_modules').insert(modPayload).select('id').single()`** capturaba `data` pero no `error`. Si `.select()` retornaba `null` (RLS bloqueando SELECT post-INSERT), `modId` quedaba `null` y `if (!modId) continue;` saltaba la inserción de lecciones para ese módulo. El módulo quedaba creado en BD pero huérfano de lecciones.
3. **DELETE/UPDATE/SELECT intermedios** sin destructurar `error`. Cualquier falla de policy o constraint era invisible.

Era el mismo problema que admin.html resolvió en Sesión 49 con el helper `fail(label, err, extra)` y el patrón "INSERT + `.select().single()` + null check explícito". Coach.html nunca lo recibió.

**Fix en `saveCoachModules` — `coach.html`:**

- **Helper `fail(label, err, extra)`** agregado al tope de la función — espejo del de `syncCourseModules` en admin.html. Loguea `console.error` con el payload completo y `throw new Error()` con mensaje legible.
- **Cada llamada a Supabase ahora destructura `error`** y lo pasa a `fail` si está set: `SELECT course_modules`, `DELETE course_modules`, `UPDATE course_modules`, `INSERT course_modules`, `SELECT course_lessons`, `DELETE course_lessons`, `UPDATE course_lessons`, `INSERT course_lessons`, `UPDATE courses.total_videos`.
- **INSERT de módulos**: `.insert(modPayload).select().single()` (cambiado de `.select('id')` a `.select()` para devolver fila completa) + null check explícito que lanza con mensaje "¿RLS bloqueando SELECT?" si `data` viene null.
- **INSERT de lecciones**: ahora también usa `.insert(lessonPayload).select().single()` con captura de `error` y null check (antes era `.insert()` pelado, sin nada de eso — el bug raíz estaba acá).
- **Guard inicial**: `if (!courseId) fail('saveCoachModules', new Error('courseId vacío'));` — corta temprano si la función se invoca con curso sin seleccionar.
- **Re-render desde BD post-save**: tras el éxito, la función llama a `loadCoachModulesForCourse(courseId)` y reemplaza el HTML del `#mod-list` con los datos reales. Esto sincroniza los `data-mod-id` y `data-lesson-id` del DOM con los UUIDs recién creados, así que la próxima edición pasa por la rama UPDATE (idempotente) en vez de re-INSERT (duplicaría).

**`loadCoachModulesForCourse`**: no se tocó. Sigue haciendo `SELECT course_modules` + `SELECT course_lessons IN (modIds) ORDER BY order_num` y agrupa lecciones por `module_id`. La lectura ya estaba bien — el problema era 100% de escritura.

**Verificación mental del flujo:**

1. Coach abre Tab "Mi curso" → selecciona curso con `course_type='modules'`.
2. `loadModulos` detecta el tipo y muestra el manager de módulos. `loadCoachModulesForCourse` retorna `[]` si no hay módulos → se renderiza una card vacía.
3. Coach completa título del módulo → click "+ Agregar lección" → completa título + URL de YouTube.
4. Click "Guardar módulos":
   - `getCoachModulesFromForm()` arma `[{id:null, title:'…', order_num:0, lessons:[{id:null, title:'…', url:'…', order_num:0}]}]`.
   - `dbModules = []` (curso sin módulos previos), `toDeleteMods = []`.
   - Loop `for (const mod of formModules)`: `mod.id=null` → INSERT module → `.select().single()` retorna `{id:'<UUID>'}` → `modId='<UUID>'`.
   - `dbLessons = []` para ese `modId`, `toDeleteLessons = []`.
   - Loop lecciones: `l.id=null` → INSERT lesson con `module_id=<UUID>` → `.select().single()` retorna `{id:'<lesson-UUID>'}` → si llegara `null`, ahora lanza error visible en lugar de silenciar.
   - UPDATE `courses.total_videos = 1`.
   - Re-render desde BD → la card en pantalla ahora tiene `data-mod-id='<UUID>'` y `data-lesson-id='<lesson-UUID>'`.
5. Si el coach recarga la página o cambia de curso y vuelve, `loadCoachModulesForCourse` retorna el módulo con su lección. Render correcto.
6. Edición posterior: el form pre-popula con IDs → save toma rama UPDATE → idempotente.

**Resultado:** las lecciones ahora se persisten correctamente. Si por alguna razón la BD/RLS rechaza el INSERT, el coach ve el mensaje de error con la causa concreta en `#mod-action-msg` (rojo) y el detalle completo en la consola — antes era una falla totalmente silenciosa.

**Archivos modificados:** `coach.html` únicamente. No se tocó nada del Tab Tests, ni admin.html, ni curso.html.

---

### ✅ Etapa X.1 — Rediseño del editor de quiz en coach.html

Tres cambios concurrentes sobre el sistema de evaluaciones (Etapa X). Se reorganiza la UX y se agrega soporte para tests por módulo. **No** cambia el esquema de BD.

**0. Fix de columna `quiz_attempts.attempted_at`** — el SQL original usaba `created_at`; tras un ALTER en Supabase la columna pasó a llamarse `attempted_at`. Coach.html tenía 3 referencias a `created_at` en `loadQuizResults`: el `SELECT` (`select('id, user_id, quiz_id, course_id, score, passed, answers, created_at')`), el `.order('created_at', ...)` y la lectura `last.created_at` en el render. Las 3 actualizadas a `attempted_at`. `curso.html` no tenía referencias a esa columna (solo lee `id` y `passed`, e `INSERT` sin timestamp explícito). Otras tablas (`forum_posts`, `course_materials`) siguen usando `created_at` y no se tocan.

**1. Eliminación del tab "📝 Tests"** — el tab tenía su propio selector de curso y rendereaba el editor en un panel aparte. Ahora coach.html tiene solo 2 tabs (`📋 Mi curso` · `💰 Ganancias`).

**2. Editor de quiz integrado en "Mi curso"** — nueva sección colapsable detrás de un botón `📝 Configurar test` (estilo botón con borde lima, `.btn-quiz-toggle`). Solo visible cuando el curso seleccionado tiene `courses.has_quiz = true` (toggle del admin). Click → expande/colapsa el contenido. Lazy-load: la primera apertura dispara `loadQuizDataForCourse(courseId)`; aperturas posteriores son instantáneas (estado en memoria).

**3. "Tests por módulo" funcional** — el placeholder anterior ("Esta funcionalidad estará disponible cuando el curso tenga módulos") ahora se renderiza solo si **no** hay módulos. Si hay → una scope-card por módulo, cada una con su propio editor independiente. Cuando hay módulos pero sin row en `course_quizzes` para ellos, la card arranca con defaults (min_score=70, max_attempts=3, is_active=true) y el row se crea al primer save.

**4. Rediseño del editor de preguntas — vistas Config / Preguntas con modal**

Cada scope-card (sea curso completo o módulo) tiene 2 botones tipo pill: `⚙ Configuración` (default) y `❓ Preguntas (N)`. Los pills toggle visibilidad CSS, sin recargar nada.

- **Vista Configuración**: solo `min_score` (number 0–100), `max_attempts` (number, hint "0 = ilimitado"), toggle `is_active` y botón **"Guardar config"**. Persistencia: upsert en `course_quizzes` con `onConflict: 'course_id,module_id'` (la primera vez crea el row y guarda el `quizId` retornado en memoria).
- **Vista Preguntas**: lista de mini-cards (`.qz-mini-q-card`) con enunciado truncado a 60 chars + badge de tipo + cantidad de opciones + cantidad de imágenes (`📎 N`) + botones `✏️ Editar` y `🗑`. Botón `+ Nueva pregunta` al final. Click en `+` o `✏️ Editar` abre el modal global `qz-question-modal`.

**Modal de edición de pregunta** (`qz-question-modal`): editor completo con select de tipo, textarea de enunciado, lista de opciones (single/multiple, mín 2 / máx 6) con marca de correcta (radio/checkbox), uploader de imágenes (máx 3, suben a `course-materials/quiz-images/{quizId}/{ts}.{ext}`). Footer con `Cancelar` y `Guardar pregunta`. Cada save commit-ea **una sola pregunta** a la BD: `INSERT` o `UPDATE` individual sobre `quiz_questions` (con `.select('id').single()` para obtener el UUID en INSERT). Si el `course_quizzes` row no existe aún, se auto-crea por upsert con la config actual del scope (defaults si el coach no la tocó). Eliminar pregunta desde la mini-card hace `DELETE` directo en BD + splice in-memory + re-render.

Esto reemplaza al patrón anterior de "guardar todo" (donde un único click hacía DELETE de todas las preguntas + INSERT batch). Ventajas: cada cambio es atómico, los UUIDs se preservan, y los intentos de alumnos referenciando preguntas por id no quedan colgados.

**Cambios estructurales en globals (coach.html):**

```js
// Antes (Etapa X — un solo quiz por curso):
let _quizCourseId = '';
let _quizId = null;
let _quizQuestions = [];
let _quizSaveSeq = 0;

// Después (Etapa X.1 — N scopes por curso: 'course' + un UUID por módulo):
let _quizCourseId    = '';
let _quizModulesList = [];   // [{id, title, order_num}]
let _quizScopes      = {};   // { 'course' | moduleUUID: { quizId, moduleId, min_score, max_attempts, is_active, questions[] } }
let _quizActiveView  = {};   // { [scopeKey]: 'config' | 'questions' }
let _editingQuestion = null; // { scopeKey, idx, draft } — modal state
```

**Funciones nuevas / renombradas:**

- `loadQuizSection(seq)` — entry point desde `loadCursoCompleto` (agregada al `Promise.all`). Verifica `courses.has_quiz` y muestra/oculta `#quiz-section-wrap`. Resetea estado al cambiar de curso.
- `toggleQuizSection()` — handler del botón `📝 Configurar test`. Lazy-loads en la primera apertura.
- `loadQuizDataForCourse(courseId)` — single-flight: SELECT `course_modules`, SELECT `course_quizzes` por curso, SELECT `quiz_questions IN quizIds`. Arma `_quizScopes` con el scope `'course'` siempre presente + un scope por módulo.
- `renderQuizSection(courseId)` — renderiza la card del curso completo + las cards por módulo + el bloque "Resultados de alumnos".
- `renderQuizScopeCard(scopeKey, title, subtitle)` — markup con pills + 2 vistas (`#qz-${scopeKey}-view-config`, `#qz-${scopeKey}-view-questions`).
- `setQuizPill(scopeKey, view)` — toggle visual; recarga la lista de preguntas si pasa a `'questions'`.
- `renderQuizScopeQuestionsList(scopeKey)` — render de mini-cards.
- `saveQuizScopeConfig(scopeKey)` — upsert de config del scope.
- `openQuestionModal(scopeKey, idx)` / `closeQzQuestionModal()` — abre el modal con un draft (copia profunda) de la pregunta o draft vacío para nueva.
- `renderQuestionModalBody()`, `renderModalOptionRow()`, `changeModalType()`, `addModalOption()`, `removeModalOption()`, `toggleModalCorrect()`, `handleModalImageFile()`, `removeModalImage()` — manipulan `_editingQuestion.draft` y re-renderean el modal.
- `saveQuestionFromModal()` — valida → auto-crea `course_quizzes` row si hace falta → INSERT/UPDATE single `quiz_questions` row → commit a `_quizScopes[scopeKey].questions` → re-render mini-list + actualizar contador del pill → `closeQzQuestionModal()`.
- `deleteQuestionFromList(scopeKey, idx)` — confirm + DELETE + splice + re-render.
- `updateQuizPillCount(scopeKey)` — refresca el `(N)` del pill `❓ Preguntas`.

**Funciones eliminadas:** `populateQuizCourseSelector`, `onQuizCourseChange`, `loadQuizEditor`, `renderQuizEditor`, `renderQuizQuestionsList`, `renderQuestionCard`, `renderOptionRow`, `addQuizQuestion`, `removeQzQuestion`, `changeQzQuestionType`, `addQzOption`, `removeQzOption`, `toggleQzCorrect`, `handleQzImageFile`, `removeQzImage`, `saveQuizConfig`. Las globales `_quizId`, `_quizQuestions`, `_quizSaveSeq` ya no existen.

**Funciones conservadas:** `loadQuizResults(courseId)` (con `attempted_at` ya corregido) y `openQzTextModal(attemptId)` / `closeQzTextModal()` — siguen funcionando con el nuevo state map (cruzan `att.answers` contra todas las preguntas de todos los scopes vía `Object.values(_quizScopes).flatMap(s => s.questions)`).

**HTML / CSS nuevos:**

- `#tab-tests` y su `<button class="tab-btn">` removidos.
- `#quiz-section-wrap` agregada al skeleton de `loadCursoCompleto` después de `#modulos-section`.
- Modal nuevo `#qz-question-modal` (al lado del existente `#qz-text-modal`).
- CSS nuevo: `.btn-quiz-toggle` (+ `.open` con flecha rotada), `.qz-scope-card`, `.qz-scope-head`, `.qz-pill-row`, `.qz-pill` (+ `.active`), `.qz-view` (+ `.active`), `.qz-mini-list`, `.qz-mini-q-card`, `.qz-mini-q-info`, `.qz-mini-q-stmt`, `.qz-mini-q-meta`, `.qz-mini-q-type-badge`, `.qz-mini-q-actions`, `.btn-qz-mini-action` (+ `.danger`), `.qz-add-q-row`, `.qz-subhead`, `.qz-modal-wide`, `.qz-modal-footer`.

**Verificación mental del flujo:**

1. Coach selecciona un curso con `has_quiz=false` → `loadQuizSection` oculta `#quiz-section-wrap`. No se ve nada del editor.
2. Coach selecciona un curso con `has_quiz=true` → `#quiz-section-wrap` se muestra con el botón `📝 Configurar test` colapsado.
3. Click en el botón → `toggleQuizSection()` abre el contenido y dispara `loadQuizDataForCourse(courseId)` → se renderiza la card del curso completo + (si hay módulos) cards por módulo + sección Resultados.
4. Pill `⚙ Configuración` activa por defecto. Coach edita min_score/max_attempts/is_active → click "Guardar config" → upsert en `course_quizzes`. La primera vez crea el row y guarda el `quizId` retornado.
5. Coach hace click en `❓ Preguntas (0)` → vista vacía con mensaje + botón `+ Nueva pregunta`.
6. Click `+ Nueva pregunta` → modal abre con draft vacío, tipo single. Coach escribe enunciado, agrega opciones, marca la correcta, opcionalmente sube imágenes → "Guardar pregunta" → INSERT `quiz_questions` (auto-crea `course_quizzes` row si todavía no se había guardado config) → mini-card aparece en la lista, pill muestra `❓ Preguntas (1)`.
7. Click ✏️ en una mini-card → modal abre pre-poblado con copia profunda de la pregunta. Coach edita y guarda → UPDATE individual.
8. Click 🗑 → confirm → DELETE individual + splice.
9. Si el curso tiene módulos: cada card de módulo opera independientemente con la misma UX. Sus preguntas viven en `quiz_questions` con `quiz_id` apuntando al `course_quizzes` row de `module_id = <moduleUUID>`.

**Impacto en `curso.html` (alumno):** ninguno. La query `checkQuizGateAndShowCert` sigue buscando `course_quizzes` con `module_id IS NULL` para gatear el certificado. Los quizzes por módulo se persisten pero todavía no tienen flujo de rendición en la página del alumno (queda como mejora futura — el alumno podría rendir el quiz del módulo al terminar el último video de ese módulo).

**Archivos modificados:** `coach.html` únicamente. No se tocó admin.html, ni curso.html, ni el SQL. La columna `quiz_attempts.attempted_at` ya estaba renombrada en Supabase por el usuario antes de este cambio.

---

### 🐛 Bugfix Etapa X.2 — Avance entre lecciones + scroll al quiz/cert (curso.html)

**Síntoma reportado:** al marcar una lección/video como completado el alumno percibe "no pasa nada": el botón cambia a "Completado" pero la página queda en el mismo lugar, no avanza a la siguiente lección, y al terminar la última no aparece visualmente el quiz ni el certificado.

**Diagnóstico — la lógica detrás estaba bien, faltaban señales visuales:**

- `markComplete(videoIndex)` (modo videos sueltos) y `markLessonComplete(lessonId)` (modo módulos) ya hacían el upsert a `video_progress` y llamaban a `updateProgress()` después.
- `updateProgress()` ya disparaba `checkQuizGateAndShowCert()` cuando `pct >= 100`.
- `checkQuizGateAndShowCert()` ya consultaba `course_quizzes` (con `module_id IS NULL` AND `is_active = true`) + `quiz_attempts` y decidía entre `showQuizSection()`, `showQuizExhausted()` o `showCertSection()`.

El bug estaba en que **el resultado quedaba fuera del viewport** y **no había auto-advance** entre lecciones, así que el alumno no percibía cambios visibles después del click y reportaba "no pasa nada".

**Fix — sólo se conectaron las piezas (sin reescribir lógica):**

1. **Auto-advance en modo módulos** (`markLessonComplete`): tras `completedSet.add(lessonId)`, busca `LESSONS_FLAT.findIndex(l => String(l.id) === String(lessonId))`. Si `currentIdx < LESSONS_FLAT.length - 1`, guarda `next = LESSONS_FLAT[currentIdx + 1]`. Render inmediato (`renderModulesView()`) para mostrar feedback "Completado", luego `updateProgress()` (que dispara el gate del quiz/cert si era la última). Si `next` existe, `setTimeout(600ms)` → cambia `activeLessonId = next.id` → re-render → `scrollIntoView` del `.modules-main` (el iframe del nuevo video). El delay de 600ms da al alumno una confirmación visual de la lección completada antes del salto.

2. **Auto-scroll en modo videos sueltos** (`markComplete`): tras actualizar el botón a "Completado" y llamar `updateProgress()`, busca `document.getElementById(`card-video-${videoIndex + 1}`)`. Si existe **y** `completedSet.size < TOTAL_VIDEOS` (no era el último), `setTimeout(350ms)` → `scrollIntoView` smooth al siguiente card. Si era el último, el chequeo `< TOTAL_VIDEOS` es falso → no scroll lateral, y `updateProgress()` ya disparó `checkQuizGateAndShowCert()` que se encarga del scroll al quiz/cert.

3. **Scroll automático en `showCertSection`, `showQuizSection` y `showQuizExhausted`**: al final de cada una se agregó `setTimeout(100ms, () => section.scrollIntoView({ behavior:'smooth', block:'start' }))` (en `showCertSection` se enganchó dentro del segundo `requestAnimationFrame` que ya existía, después de aplicar `.animated`). Esto garantiza que cuando el gate del quiz decide qué mostrar, el alumno ve la sección llegar a su viewport.

**Verificación mental del flujo:**

- **Caso A (módulos, no última):** alumno marca lección 2 de 5 → upsert OK → `completedSet.size = 2` → render con "Completado" → `updateProgress()` muestra "2 de 5 lecciones" → 600ms después, salto automático a lección 3 con el iframe del nuevo video centrado en pantalla.
- **Caso B (módulos, última lección):** alumno marca lección 5 de 5 → upsert OK → `completedSet.size = 5` → render con "Completado" → `updateProgress()` calcula `pct = 100` → muestra "¡Curso completado! 🎉" → `checkQuizGateAndShowCert()` consulta. Si hay quiz activo y no aprobó: `showQuizSection()` lo monta y hace scroll. Si ya aprobó o no hay quiz: `showCertSection()` con scroll. Si agotó intentos: `showQuizExhausted()` con scroll. **`next` es `null`, así que no hay setTimeout de avance** — el flujo del quiz/cert tiene la palabra final.
- **Caso C (videos sueltos, no último):** alumno marca video 2 de 3 → upsert OK → botón "Completado" → `updateProgress()` muestra "2 de 3 videos" → 350ms después, scroll smooth al `card-video-3` ya visible en la lista.
- **Caso D (videos sueltos, último):** alumno marca video 3 de 3 → upsert OK → botón "Completado" → `updateProgress()` calcula 100% → `checkQuizGateAndShowCert()` muestra quiz/cert con scroll al viewport. La búsqueda de `card-video-3` (next) tampoco existe + `completedSet.size === TOTAL_VIDEOS` → guard hace skip del scroll lateral, así que sólo el quiz/cert tira del foco.

**Notas importantes:**

- El upsert a `video_progress` **no se tocó**: en modo módulos sigue guardando el `lesson.id` (UUID) como string en la columna `video_index`, y la columna ya soporta texto en la BD del usuario (Sesión 48 / 50). Si el upsert fallara, el log existente (`console.error('Error guardando progreso (lesson):', error.message)`) seguiría siendo el indicador.
- `updateProgress()` se sigue llamando en el orden correcto (después del upsert OK, antes del setTimeout de avance), así que el dispatch del gate del quiz no se altera.
- En modo módulos, el sidebar se re-renderiza completo en cada llamada a `renderModulesView()`, así que la lección activa siempre aparece resaltada y la lección recién completada queda con `✓` en su check.
- `checkQuizGateAndShowCert()` puede dispararse más de una vez si el alumno modifica progreso en sesiones distintas, pero como las funciones `show*` son idempotentes (set de `.classList`), no hay efecto duplicado más que un re-scroll inocuo.

**Archivos modificados:** `curso.html` únicamente. No se tocó admin.html, coach.html, ni schema. No se cambió la lógica del gate del quiz ni la del upsert; sólo se sumaron las señales de avance (auto-advance + scrolls).

---

### 🐛 Bugfix Etapa X.3 — `video_progress.video_index` es INT, no UUID (curso.html)

**Síntoma reportado:** al marcar una lección como completada en modo módulos, el upsert a `video_progress` fallaba con `invalid input syntax for type integer` y silenciosamente no guardaba nada. Resultado visible: la marca de completado nunca se persistía, el progreso quedaba en 0 / N, y el flujo de quiz/certificado nunca se disparaba.

**Causa raíz — bad assumption en CLAUDE.md/CONTEXTO.md:**

La documentación previa afirmaba que `video_progress.video_index` aceptaba texto y se usaba para guardar el UUID de la lección. La afirmación era incorrecta: **la columna es `INT NOT NULL`** (como definía el schema original de Sesión 9). El upsert pasaba el UUID-string como `video_index`, lo que PostgreSQL rechazaba con error de tipo. El `console.error` quedaba en consola pero el alumno no veía nada.

El fix anterior de la Etapa X.2 (auto-advance + scrolls) cubrió las señales visuales pero la causa de fondo seguía: ningún registro llegaba a la BD, así que ni el avance se persistía entre sesiones, ni `pct` llegaba al 100% que dispara `checkQuizGateAndShowCert()`.

**Diseño del fix — usar el índice numérico de la lección en el array aplanado:**

`LESSONS_FLAT` ya existía como un array plano de todas las lecciones del curso, aplanado en el orden definitivo: módulos por `order_num` ascendente, lecciones dentro de cada módulo por `order_num` ascendente. Su índice (0..N-1) es estable mientras el coach no reordene módulos/lecciones, así que sirve como `video_index` integer para `video_progress`.

Mantengo dos representaciones porque las usa cada capa:
- **UUID** (`lesson.id`) — UI, selección de lección activa, navegación, sidebar.
- **Flat-index** (entero) — DB (`video_progress.video_index`), `completedSet`, comparaciones de avance.

Para cruzar ambas, agregué una global nueva `LESSON_IDX_BY_ID = {}` que es `{ <lessonUUID>: <flatIdx> }`. Se construye una sola vez en `init()` después de armar `LESSONS_FLAT`.

**Cambios concretos en `curso.html`:**

1. **Global nueva** (junto a las globals de modo módulos):
   ```js
   let LESSON_IDX_BY_ID = {}; // lesson UUID → índice numérico en LESSONS_FLAT
   ```

2. **`init()` — bloque modules-mode** — después de armar `LESSONS_FLAT`, popula el mapa:
   ```js
   LESSON_IDX_BY_ID = {};
   LESSONS_FLAT.forEach((l, i) => { LESSON_IDX_BY_ID[l.id] = i; });
   ```
   Y la SELECT de progreso al cargar: ya no filtra por `.in('video_index', [UUIDs])` (que retornaba vacío contra la columna INT), sino solo por `course_id` + `completed=true`. Cada `r.video_index` se valida contra el rango válido `[0, LESSONS_FLAT.length)` antes de añadirse a `completedSet` — descarta registros viejos potencialmente desfasados si el coach reordenó la estructura.

3. **`markLessonComplete(lessonId)`** — ahora resuelve el flat-index antes del upsert:
   ```js
   const flatIdx = LESSON_IDX_BY_ID[lessonId];
   if (typeof flatIdx !== 'number' || flatIdx < 0) {
     console.error('markLessonComplete: lesson sin flat-index en LESSON_IDX_BY_ID', lessonId);
     return; // guard defensivo
   }
   await sb.from('video_progress').upsert({
     user_id, course_id, video_index: flatIdx, completed: true, completed_at: ...
   }, { onConflict: 'user_id,course_id,video_index' });
   completedSet.add(flatIdx);
   ```
   El cálculo de `next` para auto-advance (Etapa X.2) ahora usa directamente `flatIdx` (`LESSONS_FLAT[flatIdx + 1]`) en vez del `findIndex` redundante.

4. **`renderModulesView`** — los chequeos `completedSet.has(String(l.id))` y `completedSet.has(String(active.id))` se reemplazaron por `completedSet.has(LESSON_IDX_BY_ID[l.id])` y `completedSet.has(LESSON_IDX_BY_ID[active.id])`. Tanto el checkmark del sidebar como el botón "Completado" del main reflejan el estado correcto.

5. **`completedSet` en modo videos sueltos** — sin cambios. Ese flujo siempre usó índices numéricos (`video.index`); el bug era exclusivo del modo módulos.

**Verificación mental del flujo:**

- **Carga inicial:** `init()` arma MODULES, LESSONS_FLAT, popula LESSON_IDX_BY_ID. SELECT trae progreso del curso → entries numéricas dentro del rango → completedSet poblado. `renderModulesView` muestra ✓ en cada lección completada gracias al map. `updateProgress` calcula `pct` correctamente; si era 100% antes (alumno ya había terminado en otra sesión), `checkQuizGateAndShowCert` dispara directo.
- **Marcar lección 0 (primera):** click → `markLessonComplete(uuid0)` → `flatIdx = 0` → upsert con `video_index: 0` ✓ → `completedSet.add(0)` → `renderModulesView` (✓ aparece) → `updateProgress` (1 de N) → setTimeout 600ms → activeLessonId = LESSONS_FLAT[1].id → re-render con scroll.
- **Marcar última lección (N-1):** flatIdx = N-1 → upsert OK → completedSet.add(N-1) → completedSet.size = N → `updateProgress` calcula 100% → `checkQuizGateAndShowCert()` dispara → quiz o cert con scroll. `next` es null → no setTimeout de avance. ✓
- **Recargar la página después:** SELECT progreso retorna N filas con video_index 0..N-1 → completedSet poblado → updateProgress = 100% → checkQuizGate dispara → alumno ve quiz/cert directo sin tener que re-marcar nada. ✓

**Estabilidad de los índices:** mientras el coach no reordene módulos/lecciones en el panel admin, `LESSONS_FLAT[i]` apunta siempre a la misma lección, y `video_progress.video_index = i` sigue siendo válido. Si el coach reordena, los registros viejos podrían apuntar a lecciones distintas — caso conocido del enfoque por índice. La validación de rango en `init()` mitiga el caso de borrado (lecciones eliminadas dejarían registros con `video_index >= LESSONS_FLAT.length` que se descartan al cargar). Una migración futura a `lesson_id UUID` en `video_progress` lo resolvería de forma estructural; por ahora queda fuera de alcance.

**Impacto en CLAUDE.md:** la nota previa "`video_progress.video_index` guarda el UUID de la lección como string" debe leerse como obsoleta — ahora es y siempre fue un INT, y se usa el flat-index. (No actualizo CLAUDE.md acá porque el usuario lo gestiona aparte; queda anotado en este bugfix.)

**Archivos modificados:** `curso.html` únicamente. No se tocó schema, ni admin.html, ni coach.html. No se intentó migrar registros viejos de `video_progress` (si existieran con UUIDs serían rechazados por la columna INT, así que asumimos que la tabla está limpia para módulos).

---

### 🐛 Bugfix Etapa X.4 — Dropdown ⋮ del Tab Cursos cortado por overflow (admin.html)

**Síntoma reportado:** en `admin.html` Tab Cursos, el menú desplegable de los 3 puntos (⋮) de las últimas filas de la tabla queda cortado: las opciones "Editar", "Activar/Desactivar", "Eliminar" no se ven o se cortan en la parte inferior del contenedor.

**Causa raíz:** `.data-table-wrap` (línea 144) tiene `overflow: hidden` para que la tabla respete el `border-radius: 14px` y los bordes redondeados se rendericen prolijos. Esto recorta cualquier hijo que se extienda fuera del rectángulo, incluyendo `.action-menu` que es `position: absolute` con `top: calc(100% + 4px)`. Para las filas cerca del borde inferior de la tabla, el dropdown sale del wrap y queda invisible.

`.data-table-wrap` se usa en al menos 7 tablas distintas (Cursos, Alumnos, Coaches, Lanzamientos, etc.) — cambiar a `overflow: visible` afectaría todas y rompería el redondeo de las esquinas. Además, en mobile las tablas pueden necesitar scroll horizontal en algunas vistas (no actualmente, pero es deuda técnica futura). Por eso el fix toma la segunda ruta sugerida: **mantener `overflow: hidden` en el wrap y mover el dropdown a `position: fixed`**, que es viewport-relative y escapa cualquier ancestor con clip.

**Cambios concretos en `admin.html`:**

1. **CSS `.action-menu`** (línea 582):
   - `position: absolute; right: 0; top: calc(100% + 4px);` → `position: fixed;`
   - Se suben las coordenadas a JS (calculadas en cada apertura).
   - `z-index: 50` → `z-index: 1000` para asegurar que el dropdown queda por encima de cualquier overlay/sticky bar (las tabs-bar tiene `z-index: 50`).

2. **JS `toggleRowMenu(ev, courseId)`** — antes de aplicar `.open`, ahora calcula viewport-coords a partir del botón `⋮`:
   ```js
   const btn = ev.currentTarget;
   const r   = btn.getBoundingClientRect();
   menu.style.top   = (r.bottom + 4) + 'px';
   menu.style.right = (window.innerWidth - r.right) + 'px';
   menu.classList.add('open');
   ```
   El menú queda alineado a la derecha del botón, justo debajo (4px de gap, igual que antes).

**Lo que NO se tocó:**

- `.data-table-wrap` mantiene `overflow: hidden` y `border-radius: 14px` — el resto de tablas no se ve afectado.
- `.action-menu-wrap { position: relative; display: inline-block; }` queda igual; el `position: relative` ya no es relevante para el menú (que es fixed) pero no estorba.
- El listener click-outside (`document.addEventListener('click', ...)` que llama `closeAllRowMenus`) funciona tal cual — el menú sigue siendo descendiente de `.action-menu-wrap` así que `closest('.action-menu-wrap')` no falla.
- Los estilos `.action-menu-item`, `.action-menu-btn`, etc. quedan intactos.

**Verificación mental del flujo:**

- **Fila al medio de la tabla:** click ⋮ → JS lee rect del botón (ej: `right=900, bottom=420` viewport). Menú aparece a `top:424px, right:124px` (`window.innerWidth=1024 - 900`). Se ve completo. ✓
- **Última fila pegada al borde inferior del wrap:** click ⋮ → mismo cálculo. El menú aparece **fuera** del wrap (porque es position:fixed) → **NO se corta**. Si el wrap está cerca del fondo del viewport, el menú podría salirse del viewport por debajo — caso menor, queda como mejora futura (flip-up). En la práctica con las pocas filas habituales no se da. ✓
- **Click en un item del menú:** el item sigue dentro del wrapper, el handler dispara, `closeAllRowMenus()` corre, menú desaparece. ✓
- **Click fuera del wrap:** `e.target.closest('.action-menu-wrap')` devuelve null → `closeAllRowMenus()`. ✓
- **Scroll mientras el menú está abierto:** con position:fixed, el menú "flota" en su posición original mientras la tabla scrollea por debajo. No es ideal pero tampoco es regresión — el usuario puede cerrarlo con click outside. Si en el futuro molesta, agregar un listener de scroll que llame `closeAllRowMenus`.

**Archivos modificados:** `admin.html` únicamente — un cambio de CSS (`.action-menu`) y uno de JS (`toggleRowMenu`). No se tocó nada más, ningún otro tab, ni coach.html, ni curso.html, ni schema.

---

### ✅ Etapa X.5 — Tab Alumnos rediseñado: usuarios unificados + acciones por fila + buscador + CSV (admin.html)

**Resumen:** se reemplaza el Tab Alumnos viejo (que tenía dos tablas separadas — "con cursos" y "sin cursos" — con dos RPCs distintas) por una única tabla unificada que lista TODOS los usuarios de la plataforma (admin/coach/student) usando la nueva RPC `get_all_users()`. Se suman acciones por fila (asignar curso / eliminar usuario), buscador en tiempo real y export CSV de la vista filtrada.

**SQL ya ejecutado en Supabase (provisto por el usuario):**

- `get_all_users() RETURNS TABLE (...)` — SECURITY DEFINER. Devuelve todos los usuarios con sus cursos asignados agrupados. Columnas esperadas: `user_id`, `full_name`, `email`, `role`, `created_at`, y un agrupamiento de cursos asignados (la implementación normaliza tanto `courses: [{id, title}, ...]` como `course_ids: TEXT[]` + `course_titles: TEXT[]` por defensiva, aceptando cualquiera de las dos shapes).
- `delete_user(p_user_id UUID)` — borra el usuario y sus dependencias (CASCADE via FKs).
- `remove_user_course(p_user_id UUID, p_course_id UUID)` — quita un `user_courses` row específico.

**Cambios en `admin.html`:**

1. **HTML del panel** (`#panel-alumnos`):
   - Título cambia de "Alumnos" a "Usuarios"; sub-título "Todos los usuarios registrados en la plataforma — admins, coaches y alumnos."
   - Botonera del header: "📥 Exportar CSV" (nuevo) + "📢 Enviar notificación" (preexistente, sin cambios).
   - Buscador en tiempo real: `<input id="alumnos-search-input">` con `oninput="filterAlumnos()"` y `max-width:420px`.
   - Tabla con 6 columnas: **Nombre · Email · Rol · Cursos asignados · Registrado · Acciones**.
   - **Sub-section "Sin cursos" + tabla `tbody-sin-cursos` ELIMINADAS** — el filtrado equivalente se hace ahora en JS sobre la tabla unificada (alumnos sin cursos quedan visibles con la pill placeholder "Sin cursos" en gris).

2. **CSS nuevo** (junto a `.pills`):
   - `.alumnos-pills` — wrap flex-wrap para los pills de cursos.
   - `.alumnos-pill` — pill lime con padding asimétrico (más estrecho a la derecha para alojar el ×).
   - `.alumnos-pill-x` — botón × inline, opacidad 0.55 → 1 al hover, color rojo al hover.
   - `.badge-student` — variante gris para el rol STUDENT (los otros dos roles reusan `badge-violet` para ADMIN y `badge-lime` para COACH).

3. **Globals** (al lado de `selectedAlumnoId`/`selectedCoachId`):
   - **Eliminada** `let sinCursosData = []`.
   - **Agregadas** `let allUsers = []` (cache de `get_all_users`) y `let _alumnosFilterQuery = ''` (texto de búsqueda activo).

4. **`switchTab` cuando `name === 'alumnos'`** — antes llamaba `loadAlumnos(); loadSinCursos();`. Ahora solo `loadAlumnos();`.

5. **`loadAlumnos()` rediseñada** — antes llamaba a `get_students_with_courses` y rendereaba directo. Ahora:
   - Llama `sb.rpc('get_all_users')` con captura explícita de `error`.
   - Normaliza cada row aceptando tanto `u.courses: [{id, title}]` como `u.course_ids[]` + `u.course_titles[]` (defensivo contra distintas shapes de la RPC).
   - Guarda el resultado normalizado en `allUsers` y delega el render a `renderAlumnosRows()`.

6. **`renderAlumnosRows()` nueva** — render puro a partir de `allUsers + _alumnosFilterQuery`. Por cada usuario:
   - Filtro local (`full_name` + `email` lowercased) si `q !== ''`.
   - Estado vacío específico para "filtro sin resultados" vs "no hay usuarios".
   - Por fila: badge de rol (`renderRoleBadge`), pills de cursos con × por cada uno (o "Sin cursos" en gris si vacío), fecha formateada, botón ⋮ con dropdown de acciones (**reusa el patrón Etapa X.4 de `position:fixed` + `getBoundingClientRect`**, espejo de `toggleRowMenu`).
   - Cada item de delete pasa por el guard de `confirmDeleteUser` (validación local + `confirm()` antes de la RPC).

7. **`renderRoleBadge(role)`** — pequeño helper: ADMIN → `badge-violet`, COACH → `badge-lime`, STUDENT → `badge-student` (gris).

8. **`filterAlumnos()`** — lee el input, normaliza a lowercase + trim, llama `renderAlumnosRows()`. Re-render en memoria, sin re-query.

9. **`toggleUserRowMenu(ev, userId)`** — espejo exacto del `toggleRowMenu` de cursos (Etapa X.4). Calcula coords con `getBoundingClientRect` y posiciona el menú con `position:fixed` para escapar el `overflow:hidden` del `.data-table-wrap`.

10. **`removeUserCourse(userId, courseId, courseTitle)`** — `confirm("¿Quitar el curso \"X\" a este usuario?")` → `sb.rpc('remove_user_course', { p_user_id, p_course_id })` → recarga `loadAlumnos()`. Errores van a `#alert-alumnos`.

11. **`confirmDeleteUser(userId, nombre)` / `doDeleteUser(userId)`** — flujo en dos pasos:
    - **Validación client-side primero** (evita round-trip cuando es obvio): si `userId === currentUser.id` → mensaje "No podés eliminar tu propio usuario." y return. Si el usuario tiene `role === 'admin'` (lookup en `allUsers`) → "No se permite eliminar a otro admin desde la UI." y return.
    - `confirm()` con el mensaje exacto pedido: `"¿Eliminar a {nombre}? Esta acción no se puede deshacer."`.
    - `sb.rpc('delete_user', { p_user_id })` → recarga la tabla.
    - El item del menú ⋮ también se renderiza **deshabilitado visualmente** (opacity 0.45, cursor not-allowed, title con la razón) cuando `canDelete === false` — doble defensa.

12. **`exportarUsuariosCSV()`** — exporta los usuarios visibles **respetando el filtro activo**. Headers: `Nombre, Email, Rol, Cursos, Fecha de registro`. Cursos se serializan como `"Curso A | Curso B | Curso C"` (separados por pipe + espacio). BOM `﻿` para que Excel respete UTF-8. Nombre del archivo: `usuarios-YYYY-MM-DD.csv`.

13. **Funciones eliminadas / inertes:**
    - `loadSinCursos()` y `exportarSinCursosCSV()` quedaron como un placeholder vacío `_alumnosSinCursosLegacyRemoved()` con el cuerpo viejo en un block comment (no se ejecuta — la función sale en la primera línea con `return;`). Ningún call site remanente: el botón viejo "Exportar CSV" estaba en la sub-section eliminada del HTML, y el `loadSinCursos()` solo se invocaba desde `switchTab` (también actualizado).
    - `sinCursosData` global removida.
    - El RPC `get_students_without_courses` ya no se invoca desde admin.html (sigue existiendo en BD por si otras páginas lo usan; no se borró schema-side).

**Lo que NO se tocó:**

- Modal `#modal-asignar-curso` (HTML + `openAsignarCurso` + `confirmarAsignarCurso`): sin cambios. Se reusa desde el item "➕ Asignar curso" del nuevo menú ⋮ de cada fila. `confirmarAsignarCurso` sigue llamando `loadAlumnos()` al cerrar, lo que ahora refresca la tabla unificada.
- Modal `#modal-manual-notif` y todo el flujo de `openManualNotifModal` / `sendManualNotification` / `_populateMNUsersSelector`: sin cambios. El selector de usuarios del modal sigue usando `get_students_with_courses` (no afectaba al rediseño y el usuario no pidió tocarlo).
- Tab Coaches, Tab Cursos, Tab Landing, Tab Gestión: sin cambios.
- RPC `get_students_with_courses` y `get_students_without_courses` siguen existiendo en BD; admin.html simplemente no las consume más en el Tab Alumnos.

**Verificación mental del flujo:**

- **Carga del tab:** click "Alumnos" → `loadAlumnos()` → `get_all_users()` → tabla con todos los usuarios + pills de cursos por fila + dropdown ⋮ por acciones.
- **Buscar:** escribir "juan" en el input → `filterAlumnos()` → `_alumnosFilterQuery='juan'` → `renderAlumnosRows()` filtra in-memory por `full_name + email`. Sin re-query.
- **Asignar curso:** click ⋮ en una fila → menú ⋮ aparece (position:fixed, no se corta) → click "➕ Asignar curso" → modal preexistente con selector → confirmar → `confirmarAsignarCurso` upsertea `user_courses` → cierra modal → `loadAlumnos()` refresca la tabla.
- **Quitar curso:** click × en una pill → confirm → `remove_user_course` RPC → recarga.
- **Eliminar usuario (caso happy):** click ⋮ en un student → click "🗑 Eliminar usuario" → `confirmDeleteUser` valida (no es self, no es admin) → confirm con `"¿Eliminar a {nombre}? Esta acción no se puede deshacer."` → `delete_user` RPC → recarga.
- **Eliminar usuario (caso bloqueado):** intentar eliminar al admin logueado → el item del menú aparece deshabilitado en gris con tooltip "No podés eliminar tu propio usuario". Si por algún truco se invoca `confirmDeleteUser` igual, el guard JS aborta antes del RPC con un mensaje en `#alert-alumnos`.
- **Exportar CSV:** click "📥 Exportar CSV" → `exportarUsuariosCSV()` → respeta el filtro actual → blob descargado con BOM + headers + filas (cursos serializados con pipe).

**Archivos modificados:** `admin.html` únicamente. No se tocó coach.html, curso.html, ni el SQL (las 3 RPCs nuevas las creó el usuario fuera del editor).

---

### 🐛 Bugfix Etapa X.6 — Pills de cursos vacíos + alert que se desvanece (admin.html Tab Alumnos)

**Bug 1 — La columna "Cursos asignados" siempre mostraba "Sin cursos":**

La normalización de `loadAlumnos` (Etapa X.5) tenía dos branches: `u.courses[] = [{id, title}]` o `u.course_ids[]` + `u.course_titles[]` paralelos. La RPC real `get_all_users()` devuelve **solo `course_titles TEXT[]`** (sin `course_ids` paralelo), así que ningún branch matcheaba y `courses` quedaba `[]` para todos los usuarios → la celda renderizaba siempre el placeholder gris "Sin cursos".

**Fix:** se agregó un tercer branch en la normalización:

```js
} else if (Array.isArray(u.course_titles)) {
  // course_titles puede venir solo o con course_ids paralelo
  const ids = Array.isArray(u.course_ids) ? u.course_ids : [];
  courses = u.course_titles
    .filter(t => t != null && String(t).trim() !== '')
    .map((title, i) => ({
      id:    ids[i] || null,   // null → render del pill sin botón ×
      title: title || '(sin título)',
    }));
}
```

Cuando el array tiene elementos, los pills se renderean. El render del × se condiciona a `c.id`: si la RPC no devuelve los IDs (caso actual), el pill aparece **sin** el botón × (gracefully degrades — el coach/admin puede ver los cursos pero no quitarlos uno a uno desde el pill; la opción de "Asignar curso" sigue intacta y puede usarse para gestionar). Cuando la RPC empiece a devolver `course_ids` paralelo a `course_titles`, los × aparecen automáticamente sin tocar más código.

```js
${c.id
  ? `<button class="alumnos-pill-x" title="Quitar curso"
            onclick="removeUserCourse('${u.user_id}','${c.id}','${escapeAttr(c.title)}')">×</button>`
  : ''}
```

**Bug 2 — El mensaje de éxito desaparecía con el reload:**

El patrón anterior era `showAlert(...)` → `loadAlumnos()` (sin await). El alert sí tenía 5s de timeout (en `showAlert`), pero el flujo visual era: alert aparece → modal cierra → tbody se reemplaza por "Cargando…" (spinner del `loadAlumnos`) → tbody re-rendea con la tabla nueva. Durante esa secuencia la atención del usuario está en el centro de la pantalla, no en la barra de alert arriba; cuando el render termina y miran arriba, la mayor parte de los 5s ya pasaron y el mensaje "se siente" fugaz.

**Fix:** invertir el orden — `await loadAlumnos()` PRIMERO, `showAlert()` DESPUÉS. Así el alert aparece **cuando la tabla ya está renderizada**, sin spinner compitiendo, y los 5s del timeout se contabilizan a partir de ese momento.

Aplicado en las 3 funciones que tienen el mismo patrón (todas en Tab Alumnos, todas con la misma race):

- `confirmarAsignarCurso()` — flujo "asignar curso" (el explícitamente reportado).
- `removeUserCourse(userId, courseId, courseTitle)` — flujo "quitar curso desde pill ×".
- `doDeleteUser(userId)` — flujo "eliminar usuario".

En las tres ahora va:
```js
// (en lugar de: showAlert(...); loadAlumnos();)
await loadAlumnos();
showAlert('alert-alumnos', 'Mensaje de éxito.', 'success');
```

El `showAlert` mantiene su `setTimeout(() => el.classList.remove('show'), 5000)` original — no se tocó esa función.

**Lo que NO se tocó:**

- `loadAlumnos()`, `renderAlumnosRows()`, `renderRoleBadge()`, `filterAlumnos()`, `toggleUserRowMenu()`, `exportarUsuariosCSV()`, `confirmDeleteUser()` — funcionan exactamente igual.
- `showAlert()` global — los 5s de timeout siguen.
- Modales (`modal-asignar-curso`, `modal-manual-notif`).
- El resto del Tab Alumnos y los demás tabs.
- Schema / RPCs.

**Verificación mental del flujo:**

- **Asignar curso:** click "➕ Asignar curso" → modal → seleccionar curso → confirmar → `confirmarAsignarCurso` upsertea → cierra modal → **await `loadAlumnos()`** (spinner breve, luego tabla con la nueva pill ya visible) → **showAlert verde** "Curso asignado correctamente." aparece arriba de la tabla con todo ya renderizado. El alert dura 5s desde el momento en que la tabla ya está estable.
- **Quitar curso desde pill:** si la RPC devuelve `course_ids` (futuro) → click × en pill → confirm → `remove_user_course` RPC → `await loadAlumnos()` → showAlert "Curso quitado.". Mientras tanto, en el estado actual de la RPC (sin ids), el botón × no aparece — el pill solo muestra el título.
- **Eliminar usuario:** click ⋮ → "🗑 Eliminar usuario" → confirm → `delete_user` RPC → `await loadAlumnos()` → showAlert "Usuario eliminado.".

**Archivos modificados:** `admin.html` únicamente (3 ediciones puntuales en `confirmarAsignarCurso`, `removeUserCourse`, `doDeleteUser`, más el branch nuevo en `loadAlumnos` y el conditional render del × en `renderAlumnosRows`). No se tocó nada más.

---

### ✅ Etapa X.7 — Materiales por lección (coach.html + curso.html)

**Resumen:** se introduce el concepto de **alcance** (scope) en `course_materials`. Hasta ahora todos los materiales eran "del curso" (visibles globalmente). A partir de esta etapa cada material puede ser:
- **General del curso** (`lesson_id IS NULL`) — sigue apareciendo en la sección "Materiales" global del curso, como antes.
- **Específico de una lección** (`lesson_id = <UUID>`) — aparece debajo del video correspondiente cuando el alumno navega esa lección, **no** en la sección global.

Adicionalmente, el coach puede subir hasta 5 PDFs en una sola operación (antes era de a uno).

**SQL ya ejecutado en Supabase (provisto por el usuario):**

```sql
-- Columna nueva en course_materials, nullable, FK a course_lessons
ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.course_lessons(id) ON DELETE CASCADE;
```

Semántica:
- `lesson_id IS NULL` → material del curso completo (visible en la sección Materiales global de `curso.html`).
- `lesson_id IS NOT NULL` → material específico de esa lección (visible solo bajo el iframe de esa lección en `curso.html` modo módulos). El `ON DELETE CASCADE` hace que si la lección se borra, sus materiales también.

**Cambios en `coach.html` — Tab Mi curso → Sección Materiales:**

1. **Selector de alcance `#mat-lesson-select`** — agregado al tope de la sección, antes del form. Default: `<option value="">— Material general del curso —</option>` (sin lesson_id). Si el curso tiene módulos+lecciones, se completa con `<optgroup label="Módulo X">` por cada módulo y un `<option value="<UUID>">` por cada lección. Helper hint debajo: "General = visible en la sección Materiales de la página del curso. Si elegís una lección, el material se asocia a esa lección y aparece debajo del video."

2. **`loadLessonsForCourse(courseId)` (nueva)** — popula el selector cada vez que `loadMateriales(seq)` corre. SELECT a `course_modules` ordenados por `order_num` + SELECT batch a `course_lessons IN (modIds)` ordenados por `order_num`. Resetea `sel.value = ''` en cada repoblado (al cambiar de curso). Si el curso no tiene módulos, deja solo la opción general (única).

3. **`loadMateriales(seq)` refactorizado** — ahora orquesta dos pasos: (a) `await loadLessonsForCourse(courseId)` que reset+popula el selector, (b) `await _renderMaterialesList(seq)` que renderea la tabla.

4. **`_renderMaterialesList(seq)` (nueva)** — render puro. Lee el valor del selector y filtra: si `selectedLessonId === ''` → `.is('lesson_id', null)` (general); si tiene UUID → `.eq('lesson_id', <UUID>)`. La tabla de materiales solo muestra el alcance activo. Mensajes de empty-state contextuales: "Esta lección aún no tiene materiales cargados." vs "No hay materiales generales cargados para este curso.".

5. **Onchange del selector** — `<select onchange="_renderMaterialesList()">`. Re-filtra sin re-popular el selector ni resetear el form. Cambia de "general" a "Lección A" instantáneamente.

6. **Multi-PDF en INSERT mode (1..5 archivos)** — `<input type="file" id="mat-pdf" accept=".pdf,application/pdf" multiple />`. En `saveMaterial`:
   - **Modo edición**: sigue siendo single-file (replace o keep). El UPDATE no toca `lesson_id` (preserva el scope original del material editado — si el coach quiere "mover" un material a otra lección, debe borrar+recrear).
   - **Modo INSERT + tipo=link**: 1 row, igual que antes. Incluye `lesson_id: selectedLessonId` en el payload.
   - **Modo INSERT + tipo=pdf + 1 archivo**: comportamiento original, INSERT 1 row con `lesson_id`.
   - **Modo INSERT + tipo=pdf + N archivos (2..5)**: branch dedicado al inicio de `saveMaterial` que hace return temprano. Loop de uploads a Storage (`course-materials/{courseId}/{ts}-{slug}-{i}-{rand}.pdf`) con el botón mostrando "Subiendo N de M..." en cada iteración. Al final, INSERT batch con N rows; cada uno tiene `title: "${title} (${i+1})"` y comparte `description`, `lesson_id`, `course_id`, `uploaded_by`. Si un upload falla, el flujo se aborta y el resto no se inserta (atomicidad parcial — los archivos ya subidos quedan en Storage como huérfanos, aceptable para v1). Mensaje de éxito: `"${N} materiales agregados ✓"`. Si seleccionan más de 5: toast de error y abort.

7. **`deleteMaterial` y `saveMaterial` finales** — al cerrar el flujo, llaman `_renderMaterialesList()` (no `loadMateriales()`) para preservar el scope activo del selector. Antes, `loadMateriales()` reseteaba el selector a "general" tras cada save/delete; ahora el coach mantiene su selección.

**Cambios en `curso.html`:**

1. **Sección "Materiales" global filtrada a solo generales** — `loadMateriales()` (la global, en `curso.html`) ahora añade `.is('lesson_id', null)` al SELECT. Los materiales específicos por lección dejaron de aparecer ahí (aparecen solo bajo su lección).

2. **Materiales por lección en modo módulos** — `renderModulesView()` agrega un `<div id="lesson-materials-${active.id}" class="lesson-materials-wrap">` justo debajo de los `.modules-active-actions` (botón "Marcar como completado"). Después de renderear el contenedor, dispara `loadLessonMaterials(active.id)` async (fire-and-forget).

3. **`loadLessonMaterials(lessonId)` (nueva)** — SELECT `course_materials` filtrado por `.eq('lesson_id', lessonId)` ordenado por `created_at`. Si no hay materiales o hay error → no inyecta nada (silencio total: ni encabezado, ni empty-state). Si hay → renderea `<p class="lesson-materials-title">📎 Materiales de esta lección</p>` + reusa `.materiales-list` / `.material-row` / `.material-icon` / `.material-info` / `.btn-material-open` existentes para mantener visual idéntico al de la sección global.

4. **CSS nuevo** — `.lesson-materials-wrap { margin-top: 24px; }` y `.lesson-materials-title { font-size: 0.95rem; font-weight: 700; margin-bottom: 12px; color: var(--white); }`. Todo lo demás reusa estilos preexistentes.

5. **Modo videos sueltos / live**: sin cambios. La sección global "📚 Materiales" al final de la página sigue funcionando como antes (con el filtro nuevo `lesson_id IS NULL`). Cursos no-modules ignoran la nueva columna por completo.

**Verificación mental del flujo:**

- **Coach asigna 3 PDFs a la Lección A**: en Mi curso → sección Materiales → selecciona "Módulo 1 → Lección A" en el selector → completa título "Apunte" → tipo PDF → selecciona 3 archivos → click "Guardar material". Botón muestra "Subiendo 1 de 3...", "Subiendo 2 de 3...", "Subiendo 3 de 3..." → "Guardando..." → toast "3 materiales agregados ✓". La tabla se re-renderea con los 3 nuevos rows: "Apunte (1)", "Apunte (2)", "Apunte (3)" — el selector sigue en "Lección A".
- **Coach cambia el selector a "general"**: la tabla se re-renderea instantáneamente mostrando solo materiales con `lesson_id IS NULL`. Los 3 PDFs de "Apunte" desaparecen de la vista (porque tienen lesson_id).
- **Alumno entra a la Lección A en `curso.html`**: ve el iframe del video → botón "Marcar como completado" → debajo aparece "📎 Materiales de esta lección" con los 3 PDFs (filtrados por `lesson_id`). Si pasa a la Lección B (sin materiales asignados), la sección no se renderea (silencioso). La sección "📚 Materiales" al final de la página solo muestra los materiales generales del curso.
- **Coach edita un material existente**: click "Editar" en una row → form se puebla → cambia título o reemplaza el PDF → click "Guardar". El UPDATE no toca `lesson_id` — el material conserva su scope original. Si quería moverlo a otra lección, debe borrar+recrear (limitación documentada de v1).
- **Coach borra un material**: click "Eliminar" → confirm → DELETE → re-render preservando el scope del selector (no resetea a general).

**Lo que NO se tocó:**

- Schema más allá del `ALTER TABLE` que ya hizo el usuario. RLS de `course_materials` no se cambió.
- `editMaterial`, `clearMaterialForm`, `getMaterialIcon`, `getMaterialLinkText`, `getMaterialType`, `toggleMaterialTipo` — todas siguen idénticas.
- Modo videos sueltos en `curso.html` y modo live: la sección Materiales global sigue siendo la única, ahora con el filtro `is('lesson_id', null)`.
- `admin.html` Tab Cursos modal "Ver curso" → sección Materiales: NO se actualizó al nuevo modelo de scope. Sigue mostrando todos los materiales del curso (sin distinguir general vs por-lección). Queda como deuda menor — el flujo principal de gestión es coach.html.
- Otros tabs y otras páginas.

**Archivos modificados:** `coach.html` y `curso.html`. La columna `lesson_id` ya estaba ejecutada en Supabase por el usuario antes del cambio.

---

### ✅ Etapa X.8 — Rediseño UX del Tab "Mi curso" (coach.html)

**Resumen:** se reorganiza la disposición de las secciones del Tab "Mi curso" sin cambiar lógica de guardado, queries ni schema. Para cursos **con módulos**, los materiales se gestionan inline por lección (botón 📚 en cada fila) y la sección de materiales generales pasa a ser un bloque colapsable debajo del editor de módulos. Para cursos **sin módulos** (videos sueltos / live), el orden visible queda explícito: Live/Videos → Materiales → Configuración del test → Foro → Progreso (Materiales antes del test).

**1) Reordenamiento del skeleton DOM en `loadCursoCompleto`**

Orden previo: `Live → Materiales → Modulos (hidden si no aplica) → Quiz → Foro → Progreso`.

Orden nuevo: `Live → Modulos (hidden si no aplica) → Materiales → Quiz → Foro → Progreso`.

Resultado por modo:

- **Cursos sin módulos** (Modulos hidden): visible `Live → Materiales → Quiz → Foro → Progreso`. Materiales queda antes del test, como pidió el usuario.
- **Cursos con módulos**: visible `Live → Modulos → Materiales (collapsed) → Quiz → Foro → Progreso`. Materiales generales queda como bloque colapsado debajo del editor de módulos.

Solo se movió un nodo en el HTML. Ningún call site, ninguna query y ningún ID cambió.

**2) Sección Materiales con header dual (default vs toggle colapsable)**

El bloque `<div class="curso-section" id="materiales-section">` ahora tiene dos headers mutuamente excluyentes y un body envoltorio:

- `#mat-section-head-default` — `<h2>📁 Materiales</h2>` clásico. Visible cuando el curso NO es de módulos.
- `#btn-mat-toggle` — botón estilo `.btn-quiz-toggle` con texto "📚 Materiales generales del curso" y arrow `▾`. Visible cuando el curso SÍ es de módulos. Click → `toggleMatSection()` que agrega/quita la clase `.open` en el botón y cambia `display` del `#mat-section-body`.
- `#mat-section-body` — wrapper del scope selector + form + tabla. Toggleable.
- `#mat-scope-wrap` — el selector de alcance preexistente, ahora oculto siempre (en non-modules no hay lecciones; en modules el per-lesson va inline). Permanece en el DOM intacto para no romper `loadLessonsForCourse`/`saveMaterial`.

Helper `_applyMatSectionMode(isModules)` aplica el toggle correcto. Lo invoca `loadModulos(seq)` después de detectar `course_type`:

```js
if (error || !course || course.course_type !== 'modules') {
  section.style.display = 'none';
  _applyMatSectionMode(false);
  return;
}
section.style.display = '';
_applyMatSectionMode(true);
```

`_applyMatSectionMode(true)`: oculta `#mat-section-head-default`, muestra `#btn-mat-toggle` (sin `.open` → body cerrado), oculta `#mat-scope-wrap`.
`_applyMatSectionMode(false)`: muestra `#mat-section-head-default`, oculta `#btn-mat-toggle`, muestra `#mat-section-body`, oculta `#mat-scope-wrap`.

**3) Botón 📚 inline por lección + panel colapsable**

`addCoachLessonRow(listEl, lessonId, title, url)` ahora envuelve cada lección en un `.mod-lesson-block` que contiene:

```html
<div class="mod-lesson-block" data-lesson-id="...">
  <div class="mod-lesson-row" data-lesson-id="...">
    <input> <input>          <!-- title + URL — sin cambios -->
    <button class="btn-lesson-mats">📚<span class="lmat-badge">N</span></button>
    <button class="btn-icon-rec">×</button>
  </div>
  <div class="mod-lesson-mats" id="lmat-panel-{lessonId}" style="display:none"></div>
</div>
```

- **Lecciones existentes** (con `lessonId`): el botón 📚 está habilitado, click → `toggleLessonMats(lessonId)` que expande el `#lmat-panel-{lessonId}` y al primer toggle dispara `loadLessonMaterialsCoach(lessonId)`.
- **Lecciones nuevas sin guardar** (sin `lessonId`): el botón 📚 aparece **disabled** con `opacity:.4` y title `"Guardá los módulos para poder asignar materiales a esta lección"`. Tras `saveCoachModules` el `loadCoachModulesForCourse` re-renderiza con los UUIDs reales y el botón pasa a estar habilitado.

El × también se actualizó: ahora es `this.closest('.mod-lesson-block').remove()` (en vez de `.mod-lesson-row`) para llevarse el panel junto con la fila al eliminar.

**Compatibilidad de selectores preservada:** `getCoachModulesFromForm()` sigue usando `card.querySelectorAll('.mod-lesson-row')` y `row.querySelectorAll('input')[1]` para la URL. Como `.mod-lesson-row` sigue existiendo dentro de `.mod-lesson-block` y los `<button>` no son `<input>`, los índices `[0]=title, [1]=url` se mantienen. Ningún cambio en `saveCoachModules`.

**4) Helpers nuevos para materiales por lección (Tab Mi curso)**

Reusan `course_materials` con `lesson_id = <UUID>` (Etapa X.7). No cambian queries existentes:

| Función | Qué hace |
|---|---|
| `toggleLessonMats(lessonId)` | Abre/cierra `#lmat-panel-{lessonId}`. Al primer abrir dispara `loadLessonMaterialsCoach`. Marca `panel.dataset.loaded='1'` para no re-querear cada vez. |
| `loadLessonMaterialsCoach(lessonId)` | `SELECT id, title, drive_url, lesson_id, created_at FROM course_materials WHERE lesson_id = X ORDER BY created_at DESC`. Llama `renderLessonMaterialsList` y `updateLessonMatsBadge`. |
| `renderLessonMaterialsList(lessonId, mats)` | Renderea lista (`.lesson-mat-row` con icon + título + link "Ver" + 🗑) + botón "+ Agregar material" + mini-form oculto. Si `mats=[]` muestra `.lmat-empty` "Esta lección aún no tiene materiales.". |
| `toggleLessonMatForm(lessonId)` | Muestra/oculta el mini-form `#lmat-form-{lessonId}`. |
| `toggleLessonMatType(lessonId)` | Toggle Link↔PDF dentro del mini-form. |
| `saveLessonMaterial(lessonId)` | Lee título + tipo + url|file del mini-form. Sube PDF a `course-materials/{courseId}/{ts}-{slug}-{rand}.pdf` si aplica. INSERT en `course_materials` con `lesson_id` fijo + `course_id` + `uploaded_by`. Limpia el form y dispara `loadLessonMaterialsCoach` para refrescar lista + badge. |
| `deleteLessonMaterial(matId, lessonId)` | confirm + DELETE + recarga lista + badge. |
| `updateLessonMatsBadge(lessonId, count)` | Muestra `<span class="lmat-badge">N</span>` si `count > 0`, oculto si 0. |
| `preloadLessonMatCounts(lessonIds)` | Una sola query batch `SELECT lesson_id FROM course_materials WHERE lesson_id IN (...)`. Agrupa counts por `lesson_id` y dispara `updateLessonMatsBadge` para cada uno. Llamado desde `loadModulos` después de pintar todas las cards. |

El mini-form es deliberadamente más slim que el form global: sin descripción, sin multi-PDF (un archivo a la vez), sin scope selector. Para cargas masivas el coach sigue teniendo el form global expandible "📚 Materiales generales del curso" + scope selector vía la sección Materiales general.

**5) `loadModulos` — preload de badges**

Tras `addCoachModuleRow` para todos los módulos:

```js
const allLessonIds = (modules || []).flatMap(m => (m.lessons || []).map(l => l.id).filter(Boolean));
if (allLessonIds.length) preloadLessonMatCounts(allLessonIds);  // fire-and-forget
```

Una sola query, N badges actualizados. Si una lección no tiene materiales, su badge queda oculto.

**6) CSS nuevo**

- `.mod-lesson-block` — wrapper flex column.
- `.btn-lesson-mats` — botón violeta con badge absoluto. `.lmat-badge` lime, position:absolute top/right -6px.
- `.mod-lesson-mats` — panel inline con `border:1px dashed`, padding interno, margen-left de 18px (alineado al árbol de lecciones).
- `.lesson-mats-list`, `.lesson-mat-row`, `.lesson-mat-icon`, `.lesson-mat-title`, `.lmat-empty` — estilos del listado.
- `.lesson-mats-add-btn` — botón dashed para abrir el mini-form.
- `.lesson-mats-form`, `.lesson-mats-form .field-input`, `.lesson-mats-form-actions` — mini-form sutil con tinte violeta.

**Verificación mental del flujo:**

- **Curso CON módulos al cargar:** se ven los módulos arriba; cada lección con su botón 📚 (badge si hay materiales). Debajo, botón "📚 Materiales generales del curso" colapsado. `_applyMatSectionMode(true)` ya escondió el header default y el scope selector. El coach que quiere agregar un material general expande el botón y usa el form completo. El que quiere agregar un material a una lección específica hace click en 📚 → expande el panel inline → click "+ Agregar material" → mini-form → guarda. El badge en 📚 incrementa automáticamente.
- **Curso SIN módulos:** orden visible Live → Materiales (con header default `<h2>📁 Materiales</h2>` y body abierto) → Quiz → Foro → Progreso. El scope selector queda oculto (no hay lecciones a las que apuntar). El coach gestiona sus materiales generales con el form preexistente.
- **Coach agrega una lección nueva en modules:** el botón 📚 aparece disabled hasta que guarde el módulo. Tras "Guardar módulos" la BD asigna UUIDs, el editor se re-renderiza y los 📚 quedan habilitados.
- **Coach borra una lección con materiales asociados:** el `ON DELETE CASCADE` de `course_lessons.id` ya hace que sus `course_materials` se borren del lado BD. Visualmente el `.mod-lesson-block` desaparece junto con su panel.

**Lo que NO se tocó:**

- Schema, RLS, RPCs.
- `saveCoachModules`, `getCoachModulesFromForm`, `loadCoachModulesForCourse` — selectores y lógica intactos.
- `saveMaterial`, `_renderMaterialesList`, `loadLessonsForCourse`, `loadMateriales` — la sección Materiales general sigue funcionando exactamente igual cuando el coach la expande.
- `curso.html` — el alumno no se entera de este cambio. Sigue viendo materiales generales en la sección global y materiales por lección debajo del video (Etapa X.7 ya lo cubría).
- Otros tabs (Ganancias) y otras páginas.

**Archivos modificados:** `coach.html` únicamente. Solo HTML/CSS/JS dentro del Tab Mi curso. No hay cambios de queries ni de estructura de datos.

---

### ✅ Etapa X.9 — Migración de cursos legacy al sistema dinámico

**Resumen:** los 3 cursos hardcodeados (`webinar-hipertrofia`, `carrera-hibrida`, `entrenamiento-hibrido`) ya no tienen páginas estáticas dedicadas. Pasan a usarse exactamente como cualquier curso creado desde admin: página de venta en `venta-curso.html?slug=X` y página de contenido en `curso.html?slug=X`. El objeto `LEGACY_PAGES` (en `index.html`) y `COURSE_META` (en `dashboard.html`) fueron eliminados. Los 6 archivos legacy quedan como **redirects permanentes** para no romper enlaces que usuarios pudieran tener guardados.

**Cambios concretos:**

1. **`index.html`** — eliminado el `const LEGACY_PAGES`. Las 3 referencias (`loadCursos`, `loadLaunches`, countdown course card) ahora usan directamente `\`venta-curso.html?slug=${slug}\``. Footer de la sección Cursos: links cambiados de `webinar-hipertrofia.html` / `carrera-hibrida.html` / `entrenamiento-hibrido.html` a `venta-curso.html?slug=X` correspondiente. Marcador en línea 1338 dejado como comentario para trazabilidad: `// ── Etapa X.9: LEGACY_PAGES eliminado. TODOS los cursos usan venta-curso.html?slug=X ──`.

2. **`dashboard.html`** — eliminado el `const COURSE_META` (mapa de `slug → {tag, page}`). Todos los cursos del alumno renderizan ahora con `meta = { tag: 'Curso · Online', page: \`curso.html?slug=${course.slug}\` }`. La etiqueta visual perdió diferenciación por tipo (antes: "Webinar · Online" / "Capacitación · Online" / "Masterclass · Online" para los 3 legacy; ahora: "Curso · Online" para todos). Es una pérdida menor de granularidad cosmética; el tipo de curso real está en `courses.course_type` de la BD si en el futuro se quiere recuperar.

3. **`venta-curso.html`** — footer links del bloque "Cursos" actualizados a `venta-curso.html?slug=X` (3 links).

4. **`admin.html`** — sin cambios de routing. No tenía `LEGACY_PAGES` ni `COURSE_META`. Su único hardcode era el `placeholder="webinar-hipertrofia"` del input `cf-slug` (cosmético) — preservado.

5. **6 archivos legacy convertidos a redirects** — el contenido completo de cada uno fue reemplazado por un HTML mínimo de 14 líneas con triple redirect:
   - `<meta http-equiv="refresh" content="0;url=...">`  ← funciona sin JS
   - `<link rel="canonical" href="...">`  ← señal SEO de la URL definitiva
   - `<script>window.location.replace('...')</script>`  ← redirect inmediato sin entrada en el history
   - `<meta name="robots" content="noindex,follow">` (venta) o `noindex,nofollow` (curso) — para que Google deje de indexar las URLs viejas y siga al canonical.
   - Body: un párrafo con link manual de fallback por si alguno de los 3 mecanismos falla.

   Mapeo:

   | Archivo legacy | Redirige a |
   |---|---|
   | `webinar-hipertrofia.html` | `venta-curso.html?slug=webinar-hipertrofia` |
   | `carrera-hibrida.html` | `venta-curso.html?slug=carrera-hibrida` |
   | `entrenamiento-hibrido.html` | `venta-curso.html?slug=entrenamiento-hibrido` |
   | `curso-webinar-hipertrofia.html` | `curso.html?slug=webinar-hipertrofia` |
   | `curso-carrera-hibrida.html` | `curso.html?slug=carrera-hibrida` |
   | `curso-entrenamiento-hibrido.html` | `curso.html?slug=entrenamiento-hibrido` |

   Los archivos NO se borran (preservan los enlaces guardados de usuarios viejos). Su contenido legacy (videos hardcoded, jsPDF integrado, footer original, etc.) queda completamente eliminado — el routing dinámico se encarga del flujo a partir del slug.

6. **`supabase.js`, `notifs.js`** — verificados, ningún hardcode de los 3 slugs. Sin cambios.

7. **`coach.html`, `curso.html`** — sin cambios para esta etapa. `curso.html` mantiene el `const SLUG_TAG = {...}` (3 slugs como labels visuales del badge superior); no se tocó porque es estrictamente cosmético, no routing — para slugs no listados, el fallback `'Curso · Online'` se aplica naturalmente. Si en el futuro se quiere migrar 100%, se puede eliminar y dejar solo el fallback.

**Verificación mental del flujo:**

- **Usuario hace click en "Webinar Hipertrofia" desde la landing** → `index.html` ya redirige directo a `venta-curso.html?slug=webinar-hipertrofia`. Sin saltos intermedios.
- **Usuario tiene un link guardado a `webinar-hipertrofia.html`** → carga el archivo, `<script>` dispara `window.location.replace('venta-curso.html?slug=webinar-hipertrofia')` instantáneo. Si JS está desactivado, `<meta refresh>` toma el relevo (0s). Si ambos fallan, el `<a>` del body es manual.
- **Bot de Google indexa el archivo legacy** → ve `<meta name="robots" content="noindex,...">` y `<link rel="canonical">` apuntando al destino — desindexa el legacy y mantiene/refresca el canonical en su índice.
- **Alumno entra al dashboard** → cards renderizan con tag genérico "Curso · Online" + botón "Ir al curso →" que lleva a `curso.html?slug=X`. El curso debe existir en `courses` (creado por admin con esos slugs).

**Lo que NO se tocó:**

- Schema, RLS, RPCs, lógica de Supabase, certificados.
- `curso.html` const `SLUG_TAG` (visual cosmético, no routing).
- `admin.html` input `cf-slug` placeholder (cosmético).
- Lógica de `course_type` (videos / modules / live), de `total_videos`, de `video_progress`, etc.
- `assets/certificados/cert-*.png` — los PNGs de certificados de los 3 cursos legacy siguen disponibles para que `courses.certificate_url` los apunte si fue así configurado por el admin.

**Pre-requisito implícito:** los 3 cursos legacy deben existir como rows en `courses` con sus respectivos slugs (`webinar-hipertrofia`, `carrera-hibrida`, `entrenamiento-hibrido`) y con todos los campos que `venta-curso.html` y `curso.html` necesitan (title, description, price_ars, price_usd, cover_url, certificate_url, learning_points, syllabus, videos, etc.). Si no existen o faltan campos, la página dinámica mostrará empty-state en las secciones afectadas. La carga de esos rows queda fuera de alcance de esta etapa de migración (es trabajo de admin desde su Tab Cursos).

**Archivos modificados:** `index.html`, `dashboard.html`, `venta-curso.html`, y los 6 archivos legacy (reescritos completos como redirects). No se tocó admin.html, coach.html, curso.html, supabase.js, notifs.js, login.html, perfil.html.

---

### ✅ Etapa X.10 — Indicadores de estado en cards del dashboard

**Resumen:** las cards de cursos comprados en `dashboard.html` ahora muestran progreso (barra slim + label "X de Y clases completadas") y un badge de estado (Sin comenzar / En progreso / Test disponible / Completado). Las queries que calculan estos indicadores corren en paralelo con un único SELECT batch por tabla, no N queries por curso.

**Cambios concretos en `dashboard.html`:**

1. **CSS nuevo** (después de `.btn-ir`):
   - `.card-progress-block` — wrapper flex column con `margin-top:14px`.
   - `.card-status-badge` — pill genérica con 4 variantes:
     - `.complete` (lime, fondo `rgba(200,230,0,0.12)`)
     - `.test` (violeta, fondo `rgba(123,79,190,0.15)`)
     - `.nuevo` (gris, fondo `rgba(148,163,184,0.12)`)
     - `.progreso` (amarillo `#f6c90e`, fondo `rgba(246,201,14,0.12)`)
   - `.card-progress-bar` — track 4px alto con `border-radius:100px` y `overflow:hidden`. Color base `var(--card-border)`.
   - `.card-progress-fill` — fill lime con `transition: width 0.5s ease`.
   - `.card-progress-label` — texto pequeño (0.72rem) en gris.

2. **SELECT en `init()` (paso 4)**: agregado `total_videos` al sub-select de `courses`. Ahora cada `row.courses` trae también `total_videos` para calcular el porcentaje. La llamada a `renderCourses(data)` pasó a `await renderCourses(data, user)` para que la función pueda hacer queries adicionales con el `user.id`.

3. **`renderCourses(rows, user)` ahora `async`**: tras el chequeo de empty-state, arma `courseIds = rows.map(r => r.courses?.id)` y dispara las 3 queries batch en `Promise.all`:
   ```js
   const [progRes, quizRes, attRes] = await Promise.all([
     sb.from('video_progress')
       .select('course_id')
       .eq('user_id', user.id)
       .eq('completed', true)
       .in('course_id', courseIds),
     sb.from('course_quizzes')
       .select('course_id')
       .in('course_id', courseIds)
       .is('module_id', null)
       .eq('is_active', true),
     sb.from('quiz_attempts')
       .select('course_id')
       .eq('user_id', user.id)
       .eq('passed', true)
       .in('course_id', courseIds),
   ]);
   ```
   - `progRes` se agrupa en `completedByCourse[course_id] = N` (count de filas con `completed=true`).
   - `quizRes` se reduce a un `Set` `activeQuizCourses` (cursos con `course_quizzes.is_active=true` AND `module_id IS NULL` — el quiz "del curso completo", no por módulo).
   - `attRes` se reduce a un `Set` `passedCourses` (cursos donde el alumno tiene al menos un `quiz_attempts.passed=true`).

   Si las queries fallan (RLS u otra), se loguea `console.warn` y el render sigue con badges en estado por defecto — la card no se rompe.

4. **Render por card**: para cada `row`, calcula:
   - `completed = completedByCourse[course.id] || 0`
   - `total = course.total_videos || 0`
   - `pct = total > 0 ? Math.min(100, Math.round(completed / total * 100)) : 0` — el cap a 100 es defensivo: si `video_progress` quedó con índices viejos tras un reordenamiento de módulos en el admin, el contador podría exceder el total; el cap evita pct > 100% en pantalla.
   - `hasPendingQuiz = activeQuizCourses.has(course.id) && !passedCourses.has(course.id)`.

   Decisión del badge (precedencia literal del spec):
   ```js
   if (total > 0 && pct >= 100) → '✅ Completado' (.complete)
   else if (hasPendingQuiz)     → '📝 Test disponible' (.test)
   else if (completed === 0)    → '🆕 Sin comenzar' (.nuevo)
   else                         → '▶ En progreso' (.progreso)
   ```

   La barra solo se renderiza si `total > 0`. Cuando `total === 0` (curso sin videos cargados o curso live sin grabación), la barra se omite — el badge sigue apareciendo.

5. **Posición en la card**: el bloque `.card-progress-block` se inserta dentro de `.card-body`, **debajo de `<p class="card-desc">` y por encima del `card-divider`**, exactamente como pidió el usuario. El `.card-footer` (con badge "Acceso activo" + botón "Ir al curso →") queda intacto.

**Verificación mental del flujo:**

- **Alumno con 3 cursos comprados** (uno con 5/5 videos + quiz aprobado, otro con 2/5 sin quiz, otro recién comprado):
  - Card 1: `pct=100%`, no hay quiz pendiente → badge "✅ Completado" lime + barra al 100% + label "5 de 5 clases completadas".
  - Card 2: `pct=40%`, no hay quiz → badge "▶ En progreso" amarillo + barra al 40% + label "2 de 5 clases completadas".
  - Card 3: `pct=0%`, no hay quiz → badge "🆕 Sin comenzar" gris + barra al 0% + label "0 de 5 clases completadas".
- **Alumno termina todos los videos de un curso con quiz activo no aprobado:** `pct=100%` → la regla 1 gana → badge "✅ Completado" (no "Test disponible"), porque la precedencia literal del spec es `100% > test pendiente`. (Si el usuario quisiera "100% con test no aprobado → Test disponible", se invierten las primeras dos reglas — fácil de cambiar.)
- **Alumno con 0% pero con quiz activo asignado al curso:** la regla 2 captura → badge "📝 Test disponible". (Caso poco frecuente en la práctica, pero respetando la precedencia literal del spec.)
- **Curso `total_videos = 0`** (live sin grabación, o videos no cargados aún): no se renderiza la barra; el badge se calcula con `completed === 0` → "🆕 Sin comenzar".
- **Performance**: 3 queries (paralelas) por carga del dashboard, independiente del número de cursos. Antes, 0 queries de progreso. La carga visual sigue siendo rápida (Promise.all), el `await` añade un delay de la peor query.

**Lo que NO se tocó:**

- Schema, RLS, RPCs.
- Diseño general de la card (.card-tag, .card-title, .card-desc, .card-divider, .card-footer, .badge-access, .btn-ir) — sin cambios.
- Routing de cards (sigue usando `curso.html?slug=X` de Etapa X.9).
- Empty-state, error-state, navbar, sección "Mi cuenta" del dashboard.
- `index.html`, `coach.html`, `curso.html`, `admin.html` — ningún cambio.

**Archivos modificados:** `dashboard.html` únicamente. Solo HTML/CSS/JS dentro de `renderCourses` + agregado de `total_videos` al SELECT de `init()`. Ninguna nueva tabla ni columna; las 3 tablas consultadas (`video_progress`, `course_quizzes`, `quiz_attempts`) ya existen y tienen RLS configurada para que el alumno lea sus propios registros.

---

### ✅ Etapa X.11 — Estructura de Edge Functions de Supabase

**Resumen:** se creó la estructura de carpetas y código de dos Edge Functions de Supabase (Deno) que cubren los flujos administrativos que requieren la **service role key** (no se pueden hacer desde el cliente con anon key sin romper RLS o exponer el secreto). El código está listo para deploy con el CLI cuando se vincule el proyecto; mientras tanto, los archivos viven en el repo.

**Estructura creada dentro de `hblab/`:**

```
supabase/
  config.toml
  functions/
    invite-coach/
      index.ts
    process-payment/
      index.ts
```

**`supabase/config.toml`** — configuración mínima local. Define `project_id = "hblab"`, puertos por defecto del CLI (api 54321, db 54322, studio 54323), buckets de storage, ajustes de auth (jwt_expiry, signup, confirmations) y dos secciones específicas para Edge Functions:

- `[functions.invite-coach]` con `verify_jwt = true` — exige header `Authorization: Bearer <jwt>` válido. La función verifica adentro que el JWT pertenezca a un admin.
- `[functions.process-payment]` con `verify_jwt = false` — los webhooks de MP/PayPal no envían JWT de Supabase; la autenticación es por firma del proveedor, validada dentro de la función.

**Variables de entorno requeridas (configuradas con `supabase secrets set`):**

| Secret | Función | Para qué |
|---|---|---|
| `SUPABASE_URL` | ambas | URL del proyecto. Inyectada por defecto en runtime. |
| `SUPABASE_SERVICE_ROLE_KEY` | ambas | Service role key — bypassea RLS. Permite invitar usuarios y escribir en `user_courses` desde el server. **Nunca se hardcodea**, se lee con `Deno.env.get(...)`. |
| `MP_WEBHOOK_SECRET` | process-payment | Secreto de Mercado Pago para HMAC del header `x-signature` (placeholder hasta integrar). |
| `PAYPAL_WEBHOOK_ID` | process-payment | Webhook ID de PayPal para llamar a `/v1/notifications/verify-webhook-signature` (placeholder hasta integrar). |
| `PAYMENTS_ALLOW_UNVERIFIED` | process-payment | Flag de desarrollo (`=1`) para bypassear la verificación de firma mientras se hace sandbox. **NUNCA en producción.** |

---

#### `invite-coach/index.ts`

**Endpoint:** `POST /functions/v1/invite-coach`
**Body:** `{ email: string, role: 'coach' | 'admin' | 'student' }`
**Headers:** `Authorization: Bearer <admin-jwt>`
**Respuesta:** `{ ok: true, user_id, email, role }` o `{ error: '...' }`

**Flujo interno:**

1. **CORS preflight** — responde `OPTIONS` con `access-control-allow-*` headers.
2. **Parse del body** — valida que `email` y `role` estén presentes y sean válidos.
3. **Verifica caller es admin** — toma el JWT del header `Authorization`, llama `sb.auth.getUser(jwt)` para obtener el `userId`, y consulta `profiles.role` con la service role key (bypassea RLS). Si `role !== 'admin'` → `403`.
4. **Invita por email** — `sb.auth.admin.inviteUserByEmail(email)`. Si el email ya estaba registrado, el SDK retorna error con mensaje "already exists / registered"; ese caso se maneja haciendo `listUsers` y resolviendo el `id` por match de email (no es un error real, solo significa "este usuario ya tiene cuenta").
5. **UPSERT del rol en `profiles`** — con `onConflict: 'id'`. El trigger `handle_new_user` crea la fila al confirmar email, pero el upsert garantiza que `role` quede seteado inmediatamente (idempotente: si la fila ya existía, solo cambia `role`).
6. **Retorna** `{ ok: true, user_id, email, role }`.

**Punto de integración futuro en `admin.html`:** `confirmarAgregarCoach()` y/o un botón nuevo en Tab Alumnos pueden llamar:
```js
const { data: { session } } = await sb.auth.getSession();
const r = await fetch(`${SUPABASE_URL}/functions/v1/invite-coach`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type':  'application/json',
  },
  body: JSON.stringify({ email: 'nuevo@ejemplo.com', role: 'coach' }),
});
```
La RPC actual `assign_coach_by_email` requiere que el usuario YA exista; esta Edge Function lo invita si no existe — flujos complementarios.

---

#### `process-payment/index.ts`

**Endpoint:** `POST /functions/v1/process-payment` (público, recibe webhooks)
**Body:** payload JSON crudo de Mercado Pago o PayPal.
**Respuesta:** `{ ok: true, user_id, course_id, payment_method, external_ref }` o `{ error: '...' }`.

**Flujo interno:**

1. **Lee body raw** primero (necesario para HMAC en MP — calcular sobre el body exacto).
2. **Verifica firma** (`verifySignature`):
   - **MP**: header `x-signature` (formato `ts=...,v1=...`). HMAC-SHA256 sobre `id:{data.id};request-id:{x-request-id};ts:{ts}` con `MP_WEBHOOK_SECRET`. Comparar con `v1`.
   - **PayPal**: headers `paypal-transmission-id`, `-time`, `-cert-url`, `-auth-algo`, `-transmission-sig`. Llamada a `/v1/notifications/verify-webhook-signature` con esos headers + body raw + `PAYPAL_WEBHOOK_ID`.
   - **Implementación: PLACEHOLDER**. Hoy retorna `ok: false` con razón "Verificación de firma no implementada", o `ok: true` si `PAYMENTS_ALLOW_UNVERIFIED=1` (solo dev). El bloque tiene un comentario `TODO` con el detalle exacto de cómo implementar cada uno + links a docs oficiales.
3. **Detecta proveedor** por headers (`x-signature` → MP, `paypal-transmission-sig` → PayPal).
4. **Normaliza el payload** a `NormalizedPayment { email, course_id, amount, currency, payment_method, external_ref }`. Cada proveedor tiene su parser:
   - `normalizeMP(payload)` — lee de `payload.data.payer.email`, `metadata.course_id`, `transaction_amount`, `currency_id`.
   - `normalizePayPal(payload)` — lee de `payload.resource.payer.email_address`, `purchase_units[0].custom_id`, `amount.value`, `amount.currency_code`.

   **Nota:** los parsers son placeholders pragmáticos. En producción, especialmente para MP, hay que hacer un **GET adicional a `/v1/payments/{id}`** con el access token de MP para obtener el estado confirmado del pago — el body del webhook puede mentir o estar incompleto. Comentado en el código.
5. **Cliente service role** — `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)` con `autoRefreshToken: false, persistSession: false`.
6. **Resuelve `user_id` por email**:
   - Primero intenta `auth.admin.listUsers({ page:1, perPage:200 })` y busca por email.
   - Si no aparece → `auth.admin.inviteUserByEmail(email)` y usa el `id` del response.
   - **Limitación conocida**: `listUsers` con `perPage:200` no escala para miles de usuarios. Para producción, conviene cachear o usar un RPC dedicado tipo `get_user_id_by_email` con SECURITY DEFINER. Marcado como deuda técnica.
7. **UPSERT en `user_courses`** con `onConflict: 'user_id,course_id'`:
   ```ts
   { user_id, course_id, payment_status: 'paid', payment_method, amount_paid: amount, currency, status: 'active' }
   ```
   Idempotente: si MP/PayPal re-envía el webhook (es común por reintentos), no se duplica el registro. La fila simplemente se "refresca".
8. **Retorna** `{ ok: true, user_id, course_id, payment_method, external_ref }`.

**Configuración del webhook en cada proveedor (tarea pendiente al integrar):**

- **Mercado Pago** → Panel del developer → Webhooks → URL = `https://<project>.supabase.co/functions/v1/process-payment`. Tipo de eventos: `payment` (`payment.created`, `payment.updated`).
- **PayPal** → Developer Dashboard → My Apps → Webhooks → URL = misma. Eventos: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`. Anotar el `webhook_id` y setear `PAYPAL_WEBHOOK_ID` con `supabase secrets set`.

---

#### Despliegue

Comandos cuando se conecte el CLI al proyecto remoto (`supabase link --project-ref bqkajhxfdybmuilvzchm`):

```bash
# 1. Setear secrets una vez
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
supabase secrets set MP_WEBHOOK_SECRET=<placeholder>
supabase secrets set PAYPAL_WEBHOOK_ID=<placeholder>

# 2. Deploy (cada vez que se modifica el código)
supabase functions deploy invite-coach
supabase functions deploy process-payment

# 3. (Opcional) Test local
supabase functions serve invite-coach --env-file .env.local
```

**SUPABASE_URL** y **SUPABASE_SERVICE_ROLE_KEY** los inyecta el runtime de Edge Functions automáticamente cuando se despliega — no hay que setearlos manualmente. Los demás (MP_WEBHOOK_SECRET, PAYPAL_WEBHOOK_ID, PAYMENTS_ALLOW_UNVERIFIED) sí.

---

#### Lo que NO se hizo en esta etapa

- Implementación real de las **verificaciones de firma** de MP y PayPal — bloque `TODO` con docs links en `verifySignature()`. Hasta que se implementen, la flag `PAYMENTS_ALLOW_UNVERIFIED=1` permite testear en dev.
- **Wiring desde el cliente** — `admin.html` no llama todavía a `invite-coach`. Las páginas de venta no integran MP/PayPal todavía. Esa integración (botón "Comprar" → MP/PayPal SDK → webhook → función) es la Etapa siguiente.
- **No se modificó schema, RLS, RPCs, ningún HTML/JS existente.** Solo se creó la carpeta `supabase/` con los 3 archivos.
- No se ejecutó CLI ni deploy — el usuario lo hará manualmente cuando esté listo.

---

**Archivos creados:**

- `hblab/supabase/config.toml` — 35 líneas, configuración local del CLI.
- `hblab/supabase/functions/invite-coach/index.ts` — 130 líneas, Edge Function de invitación con verificación de admin.
- `hblab/supabase/functions/process-payment/index.ts` — 200 líneas, webhook de pagos con normalización por proveedor + verificación de firma (placeholder) + invite-on-the-fly + UPSERT idempotente.

---

### ✅ Etapa X.12 — Checkout, cupones y selección de moneda

**Resumen:** se cierra el flujo end-to-end de compra desde el front. El alumno hace click en "Comprar ahora" → modal elige moneda (ARS o USD) → llega a `checkout.html` con un form completo (datos personales + cupón opcional + términos) → al confirmar se redirige al medio de pago externo (placeholders por ahora). El admin gestiona cupones desde un nuevo tab con CRUD completo.

**SQL ya ejecutado en Supabase (provisto por el usuario):**

```sql
CREATE TABLE public.coupons (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  discount_pct    INT,                                       -- 0..100, mutuamente excluyente con discount_fixed
  discount_fixed  NUMERIC(10,2),                             -- en ARS, mutuamente excluyente con discount_pct
  valid_until     TIMESTAMPTZ,                               -- null = sin vencimiento
  max_uses        INT DEFAULT 0,                             -- 0 = ilimitado
  uses_count      INT DEFAULT 0,                             -- incrementado por backend al confirmar pago
  course_id       UUID REFERENCES public.courses(id) ON DELETE CASCADE,  -- null = todos los cursos
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
-- admin gestiona todo
CREATE POLICY coupons_admin_all ON public.coupons FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
-- público (anon key) solo lee activos — necesario para validateCoupon() en checkout
CREATE POLICY coupons_public_read ON public.coupons FOR SELECT USING (is_active = true);
```

**Cambios concretos:**

1. **`venta-curso.html` — Modal de selección de moneda**
   - Los dos botones "Comprar ahora" del hero y de la sección CTA final ahora llaman `openCurrencyModal()` en vez del `alert("Próximamente…")` placeholder.
   - **CSS nuevo**: `.currency-modal-overlay`, `.currency-modal`, `.currency-modal-close`, `.currency-btn` (+ `.ars` lime / `.usd` violet), `.currency-btn-label`, `.currency-btn-amount`, `.cm-foot-note`. El overlay usa `backdrop-filter:blur(4px)`.
   - **Modal HTML** insertado al final del body (`#modal-currency`): título "¿Cómo querés pagar?", subtítulo, dos `.currency-btn` (`#cm-btn-ars` lime + `#cm-btn-usd` violet) con label de moneda + amount dinámico, botón × para cerrar.
   - **JS nuevo**: `_ventaCourse` global se popula con `{id, slug, price_ars, price_usd}` vía un `MutationObserver` ligero que detecta cuando `#hero-price-ars` ya tiene contenido (señal de que el init terminó), y entonces hace una mini-query `select('id, slug, price_ars, price_usd')` para tener los precios crudos sin parsear strings con formato. `openCurrencyModal()` actualiza los amounts y oculta el botón si esa moneda no tiene precio configurado (`price_ars=0` o `price_usd=0`). `goToCheckout(currency)` redirige a `checkout.html?slug=X&currency=Y`.
   - **Las 3 páginas legacy** (webinar-hipertrofia.html, carrera-hibrida.html, entrenamiento-hibrido.html) ya eran redirects a venta-curso.html desde Etapa X.9, así que no requieren cambios — heredan el modal automáticamente cuando el alumno aterriza en la página dinámica.

2. **`checkout.html` — Archivo nuevo (~430 líneas)**
   - Página pública sin auth requerida. Lee `?slug=` y `?currency=` (validados como ARS|USD).
   - **Layout 2 columnas** en desktop (`grid-template-columns: 1.5fr 1fr`), 1 columna en mobile (< 880px) con el resumen reordenado a `order:-1` para quedar arriba.
   - **Navbar simple**: logo HB Lab + sin links (no ofrece distracciones).
   - **Form (60%)**:
     - Sección "Tus datos": nombre + apellido (grid 2 columnas), email, confirmar email. Validaciones inline: nombre/apellido no vacíos, email regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, los dos emails coinciden. Cada campo tiene `<span class="field-error">` que se toggle con `.show`.
     - Sección "Cupón de descuento": input texto + botón "Aplicar" → `validateCoupon()`. Resultado en `.coupon-msg.ok` lime o `.coupon-msg.bad` rojo.
     - Checkbox "Acepto los términos y condiciones" (requerido).
     - Botón "Continuar al pago →" deshabilitado hasta que `formOk = nombre && apellido && emailOk && emailMatchOk && terms`.
   - **Resumen del curso (40%)**: card sticky en desktop (`top:84px`). Cover (background-image), tag, título. Divisor. Filas: precio del curso, descuento (oculto si no hay cupón), total. Si hay cupón aplicado → tag lime "🎟 Cupón {CODE} aplicado".
   - **Helpers JS**:
     - `init()` async — query `courses where slug=X and is_active=true`, valida que `_basePrice > 0` para la moneda elegida, sino muestra `#checkout-error`.
     - `renderSummary()` — actualiza el card con precios formateados (`$X ARS` / `USD X`). Si `_appliedCoupon` está set → muestra el descuento + el total con strikethrough del original.
     - `onFieldChange()` — re-valida el form en cada input/check, toggle `.invalid` por field, habilita/deshabilita el botón.
     - `validateCoupon()` — pasos:
       1. Trim + uppercase del code.
       2. SELECT con `eq('code', code).eq('is_active', true)`.
       3. Si no hay match → "❌ Cupón inválido o inexistente".
       4. Chequea `valid_until` vencido → "❌ Cupón vencido".
       5. Chequea `max_uses > 0 && uses_count >= max_uses` → "❌ Cupón agotado".
       6. Chequea `course_id != null && course_id !== currentCourseId` → "❌ Cupón no válido para este curso".
       7. Si `discount_fixed > 0 && currency !== 'ARS'` → "❌ Este cupón solo aplica para pagos en ARS" (cupones fijos están en ARS).
       8. Calcula `finalPrice`: `discount_pct` → `base * (1 - pct/100)`; `discount_fixed` → `Math.max(0, base - fixed)`. Redondeo a 2 decimales.
       9. Setea `_appliedCoupon` + `_finalPrice` y re-renderiza summary.
     - `goToPayment()` — guarda en `sessionStorage.checkout_payload` un JSON con `{nombre, apellido, email, slug, course_id, currency, base_price, coupon_code, coupon_id, final_price, timestamp}`. Muestra "Redirigiendo al medio de pago…". Setea `window.location.href = '#mercadopago-pending'` (ARS) o `'#paypal-pending'` (USD) tras 1.2s. Al integrar de verdad, esos placeholders se cambian por las URLs hosteadas que MP/PayPal devuelven al crear la preference/order.
   - **Robots**: `noindex,nofollow` (checkout no se indexa).
   - **CSS dark consistente** con HB Lab (vars locales declaradas: `--lime`, `--violet`, `--card-bg`, etc., copiados del dashboard para que el archivo sea autocontenido).

3. **`admin.html` — Tab "🎟 Cupones"**
   - Botón nuevo en `tabs-bar` entre Coaches y Landing: `<button data-tab="cupones" onclick="switchTab('cupones')">🎟 Cupones</button>`.
   - `switchTab` ahora despacha `if (name === 'cupones') loadCupones();`.
   - **Panel `#panel-cupones`**:
     - Form `#cupon-form-card` con: `cp-code` (uppercase auto via oninput), `cp-discount-pct`, `cp-discount-fixed` (mutuamente excluyentes — validación en `saveCupon()`), `cp-valid-until` (datetime-local), `cp-max-uses` (default 0 = ilimitado), `cp-course` (selector con "— Todos los cursos —" como default value="" + opciones de `allCourses` cache o query a `courses`), toggle `cp-is-active`. Botones "Cancelar edición" (oculto en modo crear) + "Crear cupón" (cambia a "Guardar cambios" en edit).
     - Tabla `#tbody-cupones` con 7 columnas: Código (lime), Descuento (% o $), Vencimiento (formateado o "Sin vencimiento"), Usos (`X / Y` o `X / ∞`), Curso ("Todos" o título), Estado (badge active/inactive), Acciones (✏️ Editar + ✅/❌ toggle + 🗑 eliminar).
   - **Funciones JS nuevas**: `loadCupones()`, `resetCuponForm()`, `editCupon(c)`, `saveCupon()`, `toggleCuponActive(id, current)`, `deleteCupon(id, code)`. Globals nuevas: `_cupones` (cache), `_editingCuponId` (null=crear, UUID=editar).
   - Validaciones en `saveCupon()`: `code` obligatorio, debe haber descuento (% O fijo), no ambos > 0 simultáneamente. UPSERT por id (UPDATE en edit, INSERT con `uses_count: 0` en create).

**Verificación mental del flujo:**

- **Compra estándar**: alumno entra a `venta-curso.html?slug=X` → click "Comprar ahora" → modal con 2 opciones → click ARS → redirige a `checkout.html?slug=X&currency=ARS` → completa form → aplica cupón "VERANO20" (20% off) → ve resumen actualizado con strikethrough + total nuevo + tag lime → tilda terms → click "Continuar al pago →" → mensaje "Redirigiendo…" → `window.location.href = '#mercadopago-pending'`. En producción, ese hash será reemplazado por la URL real de MP retornada al crear la preference.
- **Cupón inválido**: alumno escribe "OLDCODE" (vencido) → `validateCoupon()` ve `valid_until < now` → "❌ Cupón vencido" + summary sin descuento.
- **Cupón fijo en USD**: alumno entra con `currency=USD` y aplica un cupón de `discount_fixed=5000` → "❌ Este cupón solo aplica para pagos en ARS" — comportamiento documentado.
- **Curso sin precio en una moneda**: si `course.price_usd = 0`, el botón USD del modal queda oculto. Si igual el alumno fuerza `?currency=USD` en la URL del checkout, init detecta `_basePrice <= 0` y muestra `#checkout-error`.
- **Admin crea cupón "VERANO20"** con 20% off, sin vencimiento, max_uses=100, todos los cursos, activo → INSERT exitoso → tabla refresca → fila nueva visible. Luego edita → cambia max_uses a 50 → "Guardar cambios" → UPDATE. Toggle ❌ → `is_active=false` → badge cambia a Inactivo → checkout no lo encuentra (RLS público filtra). 🗑 → confirm → DELETE.
- **Sin login en checkout.html**: la SELECT a `coupons WHERE is_active=true` funciona porque el RLS público lo permite. La SELECT a `courses WHERE is_active=true` también es pública.

**Lo que NO se hizo en esta etapa:**

- **Integración real de MP/PayPal**: las URLs `#mercadopago-pending` y `#paypal-pending` son placeholders. Cuando se integre:
  - **ARS**: del cliente se hace `fetch` a un endpoint propio (Edge Function nueva o backend) que crea una `preference` con MP usando el access token del partner. La response trae `init_point` (URL hosteada por MP) → `window.location.href = init_point`. Al confirmar el pago, MP llama al webhook `process-payment` (Etapa X.11) que upsertea `user_courses`.
  - **USD**: análogo con PayPal — POST a `/v2/checkout/orders`, redirect al `approval_url` del response, webhook → process-payment.
- **Incremento de `coupons.uses_count`**: la lógica de incrementar el contador al confirmar pago vive en `process-payment` (Edge Function). Hoy el código del checkout ya pasa `coupon_id` al sessionStorage y a process-payment vía la preference; falta agregar al edge function: `UPDATE coupons SET uses_count = uses_count + 1 WHERE id = X` cuando el webhook confirme el pago.
- **`auth.signUp` automático del comprador**: hoy el alumno entra como anon, completa el form, va al medio de pago. Cuando el webhook llega a `process-payment` (Etapa X.11), ya está la lógica de `auth.admin.inviteUserByEmail(email)` que crea el usuario y lo invita por email. No se requiere wiring extra del lado cliente.
- **Página de "pago confirmado / pago rechazado"**: hoy el placeholder hash no lleva a ningún lado real. En producción, MP/PayPal redirigen a una URL `back_url` configurable — falta crear `pago-ok.html` y `pago-fallido.html`.
- **Campos `nombre`/`apellido`** en `user_courses`: el form los pide pero hoy no se persisten. La data del comprador se guarda en `auth.users.user_metadata` cuando `inviteUserByEmail` se ejecuta del lado del webhook. Si el caller del invite envía `data: { full_name: 'X' }`, el trigger `handle_new_user` lo guarda en `profiles.full_name` automáticamente. Falta wiring en `process-payment` Edge Function.

**Archivos modificados:**

- `venta-curso.html` — CSS del modal (~50 líneas) + 2 reemplazos de `onclick` + modal HTML (~25 líneas) + script del modal (~50 líneas).
- `admin.html` — botón tab nuevo + dispatch en `switchTab` + panel HTML (~85 líneas) + bloque JS del CRUD (~150 líneas).
- `CLAUDE.md` — fila `coupons` en la tabla de tablas, archivo `checkout.html` en el árbol, sección nueva "Flujo de checkout (Etapa X.12)", `checkout.html` en `noindex,nofollow`, `🎟 Cupones` en la lista de tabs activos del admin.

**Archivos creados:**

- `checkout.html` — ~430 líneas. Página de checkout pública con form 2 columnas, validación de cupones contra `coupons` con 7 chequeos (existencia, activo, vencimiento, max_uses, course_id, currency-mismatch para fixed, cálculo del final price), redirect a placeholder MP/PayPal con sessionStorage del payload.

---

## Etapa — Drip + Lives + Precios programados

**Fecha:** 22 de mayo de 2026. Sesión orientada a sumar tres features al editor de cursos con `course_type='modules'`: liberación temporal de módulos (drip), clases en vivo asociadas a un módulo, e incrementos automáticos de precio por fecha.

### SQL ejecutado (manual, vía Supabase SQL Editor)

```sql
ALTER TABLE public.course_modules
  ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.course_lives (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  live_url      TEXT,
  live_date     TIMESTAMPTZ,
  recording_url TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS scheduled_prices JSONB DEFAULT '[]'::jsonb;
```

**Modelo:**
- `course_modules.unlock_at TIMESTAMPTZ` (nullable) — fecha/hora de desbloqueo del módulo en el panel del alumno. Si `NULL`, disponible desde siempre.
- `course_lives (id, module_id, live_url, live_date, recording_url, created_at)` — relación 0..1 por módulo. Pensado para almacenar el link Meet/Zoom previo al live y luego la grabación post-live, sin tocar `courses.live_url` (legacy del modo `course_type='live'`). FK con `ON DELETE CASCADE` para limpiar el live si se borra el módulo.
- `courses.scheduled_prices JSONB DEFAULT '[]'` — array de pares `{date: 'YYYY-MM-DD', price_ars: N, price_usd: N}`. A partir de cada fecha el curso pasa a ese precio. La aplicación real (en venta-curso.html / checkout.html) queda pendiente para una etapa siguiente — esta etapa solo monta la captura/edición desde admin.

### Cambios en `admin.html`

**Modules manager extendido** (función `addModuleRow` y compañía). Cada `.cf-module-card` ahora incluye un bloque `.cf-mod-meta` con:

- **Input `datetime-local` `cf-mod-unlock`** — fecha de desbloqueo del módulo. Si está vacío al guardar, se persiste como `NULL` (= disponible siempre). Si tiene valor, se convierte a ISO via `new Date(raw).toISOString()`.
- **Toggle `cf-mod-has-live`** — checkbox con la estética de los `toggle-row` del admin. Cuando se tilda, muestra los campos `.cf-mod-live-fields` (un grid 1fr / 1.4fr con `live_date` datetime-local + `live_url` text); cuando se destilda, los oculta. La función `toggleModuleLiveFields(checkbox)` maneja el toggle inline. En mobile (≤600px) los campos pasan a una sola columna.
- El id del live preexistente (si lo hay) se guarda en `card.dataset.liveId`, y la URL de grabación en `card.dataset.liveRecording`. Esto permite distinguir UPDATE de INSERT en el sync. La columna `recording_url` se preserva (no se edita desde este form — queda para coach.html en una etapa futura).

`getModulesFromForm()` ahora retorna por cada módulo: `{ id, title, order_num, unlock_at, lessons, has_live, live: { id, live_date, live_url, recording_url } | null }`. `renderModuleRows(modules)` pasa los campos extra a `addModuleRow`. `loadModulesForCourse(courseId)` selecciona `unlock_at` y joinea `course_lives` con un segundo query en paralelo (vía `Promise.all`), buildando un map `liveByMod[module_id]` para asociar 1:0..1 a cada módulo.

`syncCourseModules` extendido para:
1. Incluir `unlock_at` en el `modPayload` del UPSERT a `course_modules`.
2. Tras procesar las lecciones del módulo, sync de `course_lives`:
   - **`mod.has_live && mod.live`** → si `mod.live.id` existe → `UPDATE course_lives SET ... WHERE id = mod.live.id`. Si no → `INSERT` nuevo.
   - **No tiene live** → `DELETE FROM course_lives WHERE module_id = modId` (idempotente — si no había nada, no rompe).

**Precios programados (nueva sección en wizard step 1)**:

Bloque agregado debajo del input de Precio USD, antes de Descripción. UI: una `div.scheduled-prices-wrap` que contiene filas `.scheduled-price-row` con `<input type="date">`, dos `<input type="number">` (ARS, USD) y botón `×` para eliminar. Botón `+ Agregar precio programado` con estilo `.btn-add-sched-price` (borde dashed, hover lime — espejo de `.cf-add-lesson-btn`).

Funciones nuevas:
- `addSchedPriceRow(date, priceArs, priceUsd)` — agrega una fila vacía o pre-cargada.
- `getSchedPricesFromForm()` — itera las filas, descarta las que no tengan fecha, parsea precios a float (default 0), ordena por `date.localeCompare` ASC y retorna el array.
- `renderSchedPriceRows(arr)` — limpia el contenedor y agrega una fila por cada item. Tolerante: si recibe string lo parsea como JSON; si no es array, queda vacío.

Wiring:
- `loadCursos()` ahora selecciona también `scheduled_prices` para que `editCurso(c)` lo tenga disponible.
- `editCurso(c)` llama `renderSchedPriceRows(c.scheduled_prices || [])` después de poblar los inputs de precio.
- `saveCurso()` agrega `scheduled_prices: getSchedPricesFromForm()` al payload de la `UPDATE/INSERT` en `courses`.
- `resetCursoForm()` limpia el contenedor `#cf-sched-prices-list`.

### CSS nuevo

```css
.cf-mod-meta { ... background rgba(30,42,58,0.35); border 1px violeta soft; }
.cf-mod-meta-row { flex column; gap 6px; }
.cf-mod-meta-label { uppercase tracked, color gray-text; }
.cf-mod-live-fields { grid 1fr/1.4fr; padding-left 56px (alineado con el toggle); }
.scheduled-prices-wrap { flex column; gap 8px; }
.scheduled-price-row { grid 1fr 1fr 1fr auto; }
.btn-add-sched-price { dashed border, hover lime — clone de .cf-add-lesson-btn. }
```

Media query `≤600px`: los grids colapsan a una columna.

### Lo que NO se hizo en esta etapa

- **Aplicación en venta-curso.html / checkout.html del incremento por fecha**: hoy `courses.scheduled_prices` solo se captura/edita desde admin. Falta lógica del lado cliente que, al cargar el curso, recorra el array, encuentre el último item cuya `date <= now()` y sustituya `price_ars` / `price_usd` por esos valores. Sin esto, el precio mostrado al alumno sigue siendo `courses.price_ars` / `price_usd` directos.
- **Aplicación del drip en curso.html / coach.html**: la columna `unlock_at` se guarda, pero los módulos siguen visibles para el alumno sin importar la fecha. Falta el filtro en el render de `curso.html` (course_type='modules') que oculte o marque como "🔒 Disponible el DD/MM" los módulos con `unlock_at > now()`.
- **Render de course_lives en curso.html**: cada módulo con un registro en `course_lives` debería mostrar un bloque "🔴 Live el DD/MM a las HH:MM" + botón "Unirme" cuando `now() ∈ [live_date - 15min, live_date + 2hs]`. Hoy la tabla se popula correctamente desde admin pero el alumno aún no la ve.
- **RLS de `course_lives`**: el SQL crea la tabla pero no agrega policies. Por default Supabase la deja con RLS deshabilitado, lo que hace pública para el rol `anon`. Antes de pasar a producción habría que: `ALTER TABLE course_lives ENABLE ROW LEVEL SECURITY` + policy de SELECT pública (los lives son visibles para todos los alumnos del curso) + policy de INSERT/UPDATE/DELETE para `admin` y `coach`.
- **Edición de `recording_url` en course_lives desde coach.html**: el campo se preserva durante el sync (el dataset lo guarda y lo restaura) pero no se expone para edición desde admin — coherente con que la grabación se sube post-live, típicamente desde el panel del coach.
- **Validación de orden cronológico en `scheduled_prices`**: hoy admite cualquier orden de entrada, lo ordena por fecha ASC al guardar/render. No valida que haya fechas duplicadas (si las hay, el "último ganador" depende del orden en el array — se acepta como caso edge ya que la UI ordena visualmente).

**Archivos modificados:**
- `admin.html` — `addModuleRow` extendido, `getModulesFromForm` extendido, `loadModulesForCourse` extendido, `syncCourseModules` con sync de `course_lives`, nuevas funciones `toggleModuleLiveFields` + `addSchedPriceRow` + `getSchedPricesFromForm` + `renderSchedPriceRows`, payload de `saveCurso` con `scheduled_prices`, SELECT de `loadCursos` con `scheduled_prices`, `editCurso` carga `scheduled_prices`, `resetCursoForm` limpia. CSS nuevo (~25 líneas).
- `CONTEXTO.md` — esta sección.

---

## Etapa — Precio vigente en venta-curso.html (aplicación de scheduled_prices)

**Fecha:** 22 de mayo de 2026. Follow-up de la etapa anterior. Antes solo se podía editar el array `scheduled_prices` desde admin; ahora `venta-curso.html` lo respeta al mostrar precios y al armar el flujo de checkout.

### Implementación

**Nueva función `getEffectivePrice(course)`** definida arriba del `init()` en `venta-curso.html`:

```js
function getEffectivePrice(course) {
  const base = {
    price_ars: Number(course?.price_ars || 0),
    price_usd: Number(course?.price_usd || 0),
  };
  let arr = course?.scheduled_prices;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { arr = []; }
  }
  if (!Array.isArray(arr) || !arr.length) return base;

  const now   = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const vigentes = arr
    .filter(r => r && r.date && r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));   // DESC: la más reciente primero

  if (!vigentes.length) return base;
  const w = vigentes[0];
  return {
    price_ars: Number(w.price_ars != null ? w.price_ars : base.price_ars) || base.price_ars,
    price_usd: Number(w.price_usd != null ? w.price_usd : base.price_usd) || base.price_usd,
  };
}
```

**Comportamiento:**
- `scheduled_prices` vacío / null / no-array → retorna los precios base de `courses`.
- Tolera string JSON (caso edge si la columna llega serializada).
- Calcula `today` en formato `YYYY-MM-DD` con zona local del cliente. Los `date` del array son strings sin TZ, así que la comparación lexicográfica `r.date <= today` es válida.
- Si ninguna fecha es `<= today` (todas son futuras) → fallback al precio base.
- Si hay matches → ordena DESC y toma el primer (la más reciente vigente).

### Cambios en `venta-curso.html`

1. **SELECT extendido**: la query del init y la re-query del `MutationObserver` ahora seleccionan también `scheduled_prices`.
2. **Render hero + CTA**: las 4 asignaciones `*-price-ars/-usd` usan `effective.price_ars` / `effective.price_usd` en lugar de `course.price_ars` / `course.price_usd`.
3. **Cache `_ventaCourse`**: en lugar de delegar al `MutationObserver` (que hacía una re-query mínima), ahora `_ventaCourse` se setea directamente en el init con los precios vigentes ya aplicados. Esto evita una segunda llamada a Supabase y garantiza que el modal de moneda (`openCurrencyModal()` → `goToCheckout(currency)`) trabaje con el precio correcto. El observer queda como fallback defensivo: si por alguna razón `_ventaCourse` quedara null cuando el hero ya tiene precio renderizado, re-querea y aplica `getEffectivePrice` antes de cachear.
4. **Auto-open `?buy=1`**: el trigger del modal cuando viene `?buy=1` se movió al init (después de cachear `_ventaCourse`), porque el branch del observer ya no se ejecuta en el happy path.

### URL del checkout

`goToCheckout(currency)` sigue redirigiendo a `checkout.html?slug=X&currency=Y` sin precio en query — la implementación actual de checkout re-querea por slug. **Por lo tanto, `checkout.html` también necesita aplicar `getEffectivePrice` para mantener consistencia entre el precio mostrado en venta-curso y el final price del form**. Esto queda **pendiente** y debería resolverse en una etapa siguiente (replicar `getEffectivePrice` en `checkout.html`, idealmente extrayéndolo a un helper compartido). Sin ese fix, un curso con `scheduled_prices` puede mostrar el precio incrementado en venta-curso pero cobrar el precio base en checkout (o viceversa si la fecha programada cayó entre las dos vistas).

### Lo que NO se hizo en esta etapa

- **`checkout.html`**: aún lee `price_ars` / `price_usd` directos. Riesgo de inconsistencia con venta-curso si hay `scheduled_prices` activos. Próxima etapa: aplicar el mismo helper.
- **Edge Functions `create-preference` + `create-paypal-order`**: estas funciones reciben el `amount` del cliente como parámetro y crean la preference/order con ese monto. Si el cliente manda el precio efectivo correcto, todo bien — pero queda como **vector potencial de manipulación**: un cliente podría enviar el precio base aunque el scheduled_price ya esté activo. Idealmente las Edge Functions deberían hacer su propio `getEffectivePrice` server-side antes de crear la preference. No urgente porque el flujo normal manda el precio vigente desde checkout.html (cuando se aplique ahí también), pero queda anotado.
- **`index.html` (cards de cursos en la landing)**: el card de cada curso muestra el precio base de `courses.price_ars`. Cuando un scheduled_price está activo, debería mostrar el efectivo. Pendiente.

**Archivos modificados:**
- `venta-curso.html` — función nueva `getEffectivePrice` (~30 líneas), SELECT del init/observer extendido con `scheduled_prices`, render del hero + CTA usando `effective.*`, cacheo de `_ventaCourse` con precios vigentes, auto-open `?buy=1` movido al init.
- `CONTEXTO.md` — esta sección.

---

## Etapa — Soporte de URLs Drive + YouTube en curso.html

**Fecha:** 22 de mayo de 2026. Fix de embed que estaba fallando con Google Drive: el `<iframe>` del player asumía que la `video_url` venía en formato YouTube embed, y los links de Drive (`drive.google.com/file/d/{id}/view`) quedaban en pantalla negra porque Drive no permite que esa URL se sirva en iframe sin transformarla a `/preview`.

### Implementación

**Nueva función `getEmbedUrl(url)`** en `curso.html`, definida junto a `toYoutubeEmbed` (que se mantiene por compatibilidad):

```js
function getEmbedUrl(url) {
  if (!url) return '';
  const s = String(url).trim();

  // YouTube (watch / youtu.be / embed)
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  // Google Drive — /file/d/ID/{view|preview|edit}?...
  const gd = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gd) return `https://drive.google.com/file/d/${gd[1]}/preview`;

  // Fallback: la URL tal cual
  return s;
}
```

**Comportamiento:**
- `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID` → `https://www.youtube.com/embed/ID` (matcher único que cubre las 3 variantes).
- `drive.google.com/file/d/ID/view?usp=sharing` (o cualquier sufijo después del ID) → `https://drive.google.com/file/d/ID/preview`. El sufijo `/preview` es el único que Drive sirve embed-friendly: `/view` deniega el iframe.
- URLs vacías → string vacío.
- Cualquier otro link (Vimeo, Bunny, mp4 directo, etc.) → devuelta sin cambios. Si el server remoto manda `X-Frame-Options: DENY` o `Content-Security-Policy: frame-ancestors`, el iframe queda en blanco — caso edge no resuelto pero esperado (sin lista blanca de proveedores no podemos hacer más).

### Cambios en `curso.html`

Reemplazos en los dos lugares donde se construye el `src` del `<iframe>` del player:

1. **Modo videos sueltos / live recordings** (`renderVideos()` línea ~831): `<iframe src="${escHtml(getEmbedUrl(video.src))}">`. Antes usaba `video.src` directo, que asumía YouTube embed.
2. **Modo módulos** (`renderModulesView()` línea ~984): el `<iframe>` de la lección activa pasa de `toYoutubeEmbed(active.video_url)` a `getEmbedUrl(active.video_url)`. Esto permite que coexistan lecciones con video en YouTube y otras en Drive dentro del mismo curso.

### Por qué no se eliminó `toYoutubeEmbed`

Sigue siendo usado en otros archivos (`admin.html` — al guardar lecciones normaliza la URL de YouTube en `syncCourseModules`). Mantenemos `toYoutubeEmbed` como helper específico de YouTube (más estricto: solo matchea IDs de 11 chars y NO toca URLs no-YouTube) y `getEmbedUrl` como el dispatcher general para el render. Si en el futuro queremos que `admin.html` también normalice URLs de Drive al guardar, se puede portar `getEmbedUrl` allí y reemplazar las llamadas.

### Lo que NO se hizo en esta etapa

- **Normalizar URLs de Drive al guardar en `admin.html`**: hoy si el coach pega un link `/view`, queda en BD como `/view` — el embed lo corrige al renderizar. Funciona pero ensucia los datos. Idealmente al guardar lección/video se debería pasar por `getEmbedUrl` también para normalizar a `/preview` en BD.
- **Otros proveedores**: Vimeo, Loom, Bunny.net, Wistia. No agregamos lógica específica — cada uno con su formato embed. Cuando aparezca el primer caso real, se suma al matcher.
- **Validación del lado del editor**: el form de admin no avisa si la URL es de un proveedor no soportado por iframe. Mejora UX futura.

**Archivos modificados:**
- `curso.html` — función nueva `getEmbedUrl` (~20 líneas), reemplazo de `video.src` → `getEmbedUrl(video.src)` y `toYoutubeEmbed(active.video_url)` → `getEmbedUrl(active.video_url)`.
- `CONTEXTO.md` — esta sección.

---

## Etapa — Precio vigente en index.html (cards de landing)

**Fecha:** 22 de mayo de 2026. Sigue la línea de `venta-curso.html` (etapa anterior): aplicar `scheduled_prices` también en la landing. Antes los 3 spots donde se muestra precio en `index.html` leían `course.price_ars` / `course.price_usd` directos, ignorando si ya había un incremento vigente.

### Implementación

**Copia textual de `getEffectivePrice(course)`** desde `venta-curso.html`, colocada al lado de `escHtml` en la sección de helpers del script de `index.html`. Misma firma, misma lógica:
- `scheduled_prices` vacío / null / no-array → precios base.
- Tolerante con string JSON.
- Calcula `today` en `YYYY-MM-DD` con zona local; filtra `date <= today`, ordena DESC, primera entrada gana.
- Si ninguna fecha pasó todavía → fallback a base.

### Cambios en `index.html`

Tres sitios actualizados, cada uno con (a) ampliar el SELECT para traer `scheduled_prices` y (b) aplicar `getEffectivePrice(c)` antes de renderizar:

1. **`loadCursos()` — grid principal de cursos** (`#courses-grid`). Es el caso visible más relevante de la landing. SELECT pasa de `..., price_ars, price_usd, is_active, ...` a `..., price_ars, price_usd, scheduled_prices, is_active, ...`. Render reemplaza `c.price_ars` / `c.price_usd` por `eff.price_ars` / `eff.price_usd`.
2. **`loadLaunches()` — slider de lanzamientos**. La data viene del JOIN `courses(slug, price_ars, price_usd)` dentro del query a `launches`. Se extiende a `courses(slug, price_ars, price_usd, scheduled_prices)`. El `priceStr` que arma el subtítulo de la slide ahora viene de `getEffectivePrice(l.courses)` con guard `l.courses ? ... : { price_ars: 0, price_usd: 0 }` para el caso donde el launch no tiene curso asociado.
3. **`renderCountdownCourseCard()` — card del countdown** (cuando `site_config.countdown` tiene `course_id`). SELECT del countdown pasa a incluir `scheduled_prices`. Render aplica `getEffectivePrice(course)`.

### Lo que NO se hizo en esta etapa

- **Sección "Próximamente"** (line ~1636: `loadProximamente()` o similar — cursos con `is_coming_soon=true`). Muestra solo `c.price_ars` y NO trae `scheduled_prices`. Caso de uso ambiguo: un curso aún no lanzado tiene precio "inicial" pero el incremento programado típicamente arranca después del lanzamiento. Lo dejamos sin tocar porque la semántica es discutible — si se quiere unificar, agregar `scheduled_prices` al SELECT y aplicar `getEffectivePrice` también ahí.
- **Centralizar `getEffectivePrice`**: hoy hay 2 copias literales (venta-curso + index). Tercera copia vendrá cuando se aplique a checkout.html (etapa pendiente documentada en la sección X.39). Idealmente se extrae a un helper compartido — pero esto rompe el stack "sin módulos ES, sin build", así que la opción concreta es definirlo en `supabase.js` (que ya se carga en todas las páginas como global). Pendiente.
- **Edge Functions**: igual que en venta-curso, `create-preference` y `create-paypal-order` siguen confiando en el `amount` que el cliente les envía. Sin server-side `getEffectivePrice` queda como vector de manipulación. No urgente, anotado.

**Archivos modificados:**
- `index.html` — función nueva `getEffectivePrice` (~30 líneas, copia textual de venta-curso), SELECTs extendidos en `loadCursos`, `loadLaunches`, render de countdown card; aplicación de `eff.price_ars` / `eff.price_usd` en los 3 sitios de render.
- `CONTEXTO.md` — esta sección.

---

## Etapa — Lives por módulo en curso.html (cierre del feature drip/lives)

**Fecha:** 22 de mayo de 2026. Cierra el feature Lives/Drip que arrancó en la sesión anterior (admin podía cargar lives en `course_lives`, pero el alumno no los veía). Esta etapa monta la visualización en `curso.html` para `course_type='modules'`.

### Lógica de visualización

Para cada módulo con un registro en `course_lives`, se inserta un bloque entre el título del módulo y la lista de lecciones (en el sidebar), con uno de 3 estados:

1. **Live futura** (`live_date > now`): botón lime **"📡 Unirse al live"** que abre `live_url` en nueva pestaña (`target="_blank"`). Debajo, la fecha formateada en español (`Jue 23 May · 19:30`).
2. **Live pasada con grabación** (`live_date <= now && recording_url`): botón violet **"▶ Ver grabación"** que reproduce el video en el panel principal (mismo `<iframe>` que usan las lecciones). Subtexto: "Grabación del {fecha del live original}".
3. **Live pasada sin grabación** (`live_date <= now && !recording_url`): texto gris italic **"⏳ Grabación próximamente"**. Sin botón.

Si el módulo no tiene `live` → no se renderiza nada extra (string vacío). El comportamiento del módulo queda idéntico al anterior.

### Implementación

**Query extendido**: `loadStudentModules(courseId)` ahora hace en paralelo (`Promise.all`) la query de `course_lessons` y la de `course_lives`. Mergea ambos al objeto del módulo: `{ ...m, lessons: [...], live: liveByMod[m.id] || null }`. Pattern idéntico al `loadModulesForCourse` de admin.html (Etapa X.38).

**Helper `formatLiveDate(iso)`**: convierte un timestamp ISO a `Día DD Mes · HH:MM` en zona local del cliente. Usa arrays cortos `['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']` y `['Ene','Feb',...,'Dic']`. Si el input es inválido o vacío, devuelve string vacío.

**Helper `renderModuleLiveInfo(m)`**: devuelve el HTML del bloque según el estado. Centraliza la lógica de los 3 cases. Si `m.live == null` → string vacío. Si `m.live` existe pero `live_date` está vacío → cae al branch de "live pasada" (asume que pasó si no tiene fecha explícita).

**Helper `playLiveRecording(moduleId)`**: setea una variable global `_liveOverride = { moduleId, title, src }` y llama a `renderModulesView()`. La variable se chequea al principio del render del panel principal: si está set, en lugar de mostrar la lección activa, muestra el `iframe` con la grabación + título "🔴 {nombre módulo} — Grabación". Hace `scrollIntoView` suave al `#videos-container` para que el alumno vea el cambio.

**`selectLesson(lessonId)` modificado**: ahora limpia `_liveOverride = null` antes de re-renderizar. Esto permite que el alumno vuelva del modo "grabación de live" a una lección normal con un click en el sidebar.

**`renderModulesView()` modificado**:
- Sidebar: inserta `renderModuleLiveInfo(m)` entre `.modules-mod-head` y `.modules-lessons`.
- Sidebar: las lecciones se marcan como `active` solo si `l.id === activeLessonId && !_liveOverride` — así cuando estamos viendo una grabación de live, ninguna lección queda highlighted (lo cual sería confuso).
- Main: branch nuevo `if (_liveOverride) { ... } else { ... lección normal ... }`. El branch de grabación NO muestra el botón "Marcar como completado" ni el wrap de materiales (porque la grabación no es una lección — no afecta progreso ni tiene materiales asociados todavía).

### Estilos nuevos

```css
.modules-mod-live           /* borde-left lime + bg lime soft — estado live futura */
.modules-mod-live.recording /* borde-left violet + bg violet soft */
.modules-mod-live.pending   /* borde-left gray + sin bg */
.btn-live-join              /* bg lime, texto #1E2A3A — botón "Unirse al live" */
.btn-live-recording         /* bg violet, texto blanco — botón "Ver grabación" */
.modules-mod-live-meta      /* subtexto con fecha o "Grabación próximamente" */
```

Todos los botones tienen hover con `opacity: 0.88` + `translateY(-1px)`. Los bloques están dentro del sidebar pegados al borde izquierdo del card de módulo, alineados con la barra de live/recording/pending color-coded.

### Lo que NO se hizo en esta etapa

- **Notificación pre-live**: no se manda email/notif al alumno cuando faltan X minutos para el live. Próxima etapa podría usar el sistema de `notifications` (Sesión 58) + algún cron/Edge Function.
- **Tracking de asistencia al live**: el click en "Unirse al live" abre el `live_url` en nueva pestaña sin loguear que el alumno entró. Si interesa medir asistencia, habría que agregar una columna `attended` en alguna tabla y disparar un INSERT en el click.
- **Marcar la grabación como "completada"**: hoy el botón "Ver grabación" no afecta el progreso del alumno. Si las lives son parte del temario completable, podría agregarse una integración con `video_progress` usando un `video_index` reservado o una tabla nueva.
- **Edición de `recording_url` desde admin.html**: el campo se preserva en el sync de `course_lives` pero no se expone en el form del módulo del admin. Coherente con el flujo esperado (la grabación se sube post-live, típicamente desde el panel del coach). El coach panel (`coach.html`) tampoco lo expone aún — pendiente.
- **Render del live en `course_type='videos'` o `'live'` (legacy)**: esta etapa solo aplica al modo `modules`. El modo `live` (Sesión 37 — `courses.live_url` directo) sigue funcionando con su propio flujo.
- **RLS de `course_lives`**: pendiente desde Etapa X.38 (sin policies, queda public-readable por default). El SELECT del alumno funciona por ese motivo. Antes de prod, agregar `ENABLE ROW LEVEL SECURITY` + policy de SELECT pública para alumnos con `user_courses.payment_status='paid'`.

**Archivos modificados:**
- `curso.html` — `loadStudentModules` extendido (paralelo a `course_lives`), helpers nuevos `formatLiveDate` + `renderModuleLiveInfo` + `playLiveRecording`, global `_liveOverride`, `renderModulesView` con bloque live en sidebar + branch override para grabaciones en el main panel, `selectLesson` limpia el override. CSS nuevo (~25 líneas) para `.modules-mod-live` y sus variantes.
- `CONTEXTO.md` — esta sección.

---

## Etapa — Drip de módulos en curso.html (aplicación de unlock_at)

**Fecha:** 22 de mayo de 2026. Cierra el feature de drip empezado en la sesión X.38 (que sumó la columna `course_modules.unlock_at` + editor en admin). Hasta ahora la fecha de desbloqueo se guardaba pero los módulos seguían visibles para el alumno sin importar el valor. Esta etapa monta la lógica de bloqueo del lado alumno.

### Lógica

Por cada módulo en el sidebar:

- **`unlock_at` null o pasada** (`isModuleLocked === false`): comportamiento actual — módulo expandible con sus lecciones clickeables + bloque de live si corresponde (Etapa X.42).
- **`unlock_at` futura** (`isModuleLocked === true`):
  - Sidebar: el head muestra el título con un **🔒** adelante. No se renderiza la lista de lecciones (`.modules-lessons`) ni el bloque de live (`renderModuleLiveInfo` se saltea). La flecha de expansión queda oculta (`.modules-mod-arrow { display: none }`). Opacidad reducida a 0.55 y `cursor: not-allowed`.
  - Click en el head → setea `_lockedView = { moduleId, unlock_at, title }` y re-renderiza. El main panel muestra un card centrado con:
    - Ícono grande **🔒** (3rem).
    - Texto bold: `"Este módulo estará disponible el <strong>{fecha formateada}</strong>"`. El nombre del módulo en sí no se muestra (UX más limpio, foco en la fecha; si más adelante se quiere agregar, basta usar `_lockedView.title`).
    - Subtexto italic gris: `"Vas a recibir una notificación cuando se habilite."`

### Formato de fecha

Helper `formatUnlockDate(iso)` usa `Date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })` → output tipo `"lunes 6 de junio"`. Si el environment no soporta el locale `es-AR` (caso edge muy raro hoy en día), hay un fallback manual con arrays hardcoded de días/meses en español.

### Globals nuevos

```js
let _lockedView = null;  // { moduleId, unlock_at, title } | null
```

Se limpia (= null) en `selectLesson()` (cuando el alumno elige una lección normal) y en `playLiveRecording()` (cuando entra al modo grabación de live). De la misma forma, `showLockedModule()` limpia `_liveOverride` antes de setear `_lockedView`. Solo uno de los dos puede estar activo a la vez.

### Prioridad en el main panel

El branch del render del main panel es: `_lockedView > _liveOverride > lección activa`. Esto significa que si el alumno está viendo una grabación de live y clickea un módulo bloqueado, sale de la grabación y entra al panel de lock (esperable). Si está en una lección normal y clickea un módulo bloqueado, idem.

### Fix: default de lección activa

Antes, `activeLessonId` defaultaba a `LESSONS_FLAT[0].id` (la primera lección del primer módulo). Si el primer módulo está bloqueado, esto **filtraba contenido**: la lección se cargaba en el main panel aunque el módulo estuviera locked. Fix: ahora se construye `lockedModIds = new Set(MODULES.filter(isModuleLocked).map(m => m.id))` y se busca el default sobre `LESSONS_FLAT.filter(l => !lockedModIds.has(l.module_id))`. Si todas las lecciones están bloqueadas → `activeLessonId = null` (el main panel muestra "Seleccioná una lección" hasta que el alumno clickee algo).

⚠️ **Nota:** esto no impide que un alumno chusma vea el `video_url` directamente en el DOM si abre las herramientas de desarrollador y mira el state de `MODULES`. Para enforcement real habría que filtrar `course_lessons` server-side via RLS basada en `course_modules.unlock_at`. Por ahora es un soft-lock (UX-only). Documentado como pendiente.

### CSS nuevo

```css
.modules-mod.locked { opacity: 0.55; }
.modules-mod.locked .modules-mod-head { cursor: not-allowed; }
.modules-mod.locked .modules-mod-head:hover { background: transparent; }   /* no hover effect */
.modules-mod.locked .modules-mod-arrow { display: none; }
.modules-mod-lock-icon { margin-right: 6px; color: var(--gray-text); }     /* 🔒 inline en el title */
.locked-module-panel  { /* card centrado en el main, padding 60px, borde dashed */ }
.lock-icon-lg         { font-size: 3rem; }
.lock-msg             { font-size: 1.05rem; font-weight: 700; }
.lock-msg strong      { color: var(--lime); font-weight: 800; }            /* la fecha en lime */
.lock-sub             { color: gray-text; italic; max-width: 420px; }
```

### Lo que NO se hizo en esta etapa

- **Notificación cuando se desbloquea**: el subtexto promete "Vas a recibir una notificación cuando se habilite" pero hoy no hay nada que dispare esa notif. Falta un cron/Edge Function que recorra `course_modules` con `unlock_at <= now AND unlock_at > now - 1h` (ventana de 1h para no spammear retroactivamente) y INSERT en `notifications` para los alumnos del curso. Pendiente.
- **Enforcement server-side**: hoy es soft-lock cliente. Un user técnico puede ver el `video_url` en `MODULES`. Para fix real → RPC `get_unlocked_lessons(course_id)` que filtre por `unlock_at IS NULL OR unlock_at <= now()`, o policy de RLS en `course_lessons` joining a `course_modules.unlock_at`. Pendiente.
- **Auto-refresh cuando pasa la fecha**: si el alumno tiene la pestaña abierta cuando `unlock_at` se cumple, sigue viendo el módulo bloqueado hasta que recargue. Un `setInterval` chequeando `Date.now() >= unlock_at` y re-renderizando sería trivial — pero queda para una etapa de polish.
- **Indicador de "se desbloquea pronto"** (ej: "Disponible en 2 días" en el sidebar): hoy el alumno ve solo el 🔒 + título; tiene que clickear para ver la fecha. Podría sumarse un subtítulo gray-text con la fecha resumida al lado del lock. Opcional UX.

**Archivos modificados:**
- `curso.html` — SELECT extendido con `unlock_at`, helpers nuevos `isModuleLocked` + `formatUnlockDate`, global `_lockedView`, `showLockedModule` setter, `selectLesson` + `playLiveRecording` limpian el lock, `renderModulesView` con render diferenciado de módulos bloqueados (sidebar) + branch nuevo en el main panel + fix del default `activeLessonId` para saltear módulos locked, CSS nuevo (~30 líneas).
- `CONTEXTO.md` — esta sección.

---

## Etapa — Completado de lives + certificado por módulo en curso.html

**Fecha:** 22 de mayo de 2026. Cierra el feature lives sumando (a) la posibilidad de que el alumno marque su asistencia y (b) cambia el gate del certificado de "todas las lecciones completas" a "todos los módulos completos" — donde un módulo se considera completo si tiene al menos 1 lección hecha O bien la asistencia al live registrada.

### Convención de identificación en `video_progress`

La columna `video_progress.video_index INT` se reutiliza para guardar la "asistencia al live de un módulo" usando **valores negativos**:

```
liveAttendanceIndex(m) = -1 * order_num     (con order_num = 1 si order_num <= 0)
```

El signo negativo garantiza que no haya colisión con los índices reales de lecciones (que son 0..N-1 en `LESSONS_FLAT`). Caso edge: si algún módulo tiene `order_num = 0`, mapea al bucket -1; si dos módulos compartieran `order_num=0`, la asistencia se confunde — en la práctica el editor de admin asigna order_num secuencial desde 0 sin duplicados, pero queda anotado como caso teórico.

⚠️ **Esto reutiliza una columna sin migración**. La alternativa correcta sería una tabla `live_attendance` separada. Decidimos esta convención pragmática para no agregar otra tabla solo para esto; si en el futuro hace falta más metadata (timestamp del check-in, etc.), se migra.

### 5 estados del bloque de live en el sidebar

`renderModuleLiveInfo(m)` cubre los siguientes casos:

| Condición | UI |
|---|---|
| `live_date > now` (futura) + NO asistió | `📡 Unirse al live` (lime, abre tab nueva) + `✅ Asistí al live` (lime soft, marca atendence) + fecha formateada |
| `live_date > now` + ya asistió | `📡 Unirse al live` + badge "✅ Asististe a este live" + fecha |
| `live_date <= now` + asistió + sin grabación | `✅ Asististe a este live` (solo el badge, sin botones, sin fecha) |
| `live_date <= now` + NO asistió + sin grabación | `⏳ La grabación estará disponible en las próximas 72hs` (gris italic) |
| `live_date <= now` + asistió + con grabación | `▶ Ver grabación` + "Grabación del {fecha}" + badge "✅ Asististe a este live" |
| `live_date <= now` + NO asistió + con grabación | `▶ Ver grabación` + "Grabación del {fecha}" (el botón "Marcar como completado" aparece **en el main panel debajo del iframe** cuando el alumno abre la grabación) |

### Marca de asistencia (`markLiveAttended(moduleId)`)

UPSERT a `video_progress` con:
```js
{
  user_id, course_id,
  video_index:  liveAttendanceIndex(m),
  completed:    true,
  completed_at: <ISO now>,
}
```

`onConflict: 'user_id,course_id,video_index'`. Tras el UPSERT, hace `completedSet.add(idx)`, re-renderiza el sidebar (para que el botón se convierta en badge) y llama a `updateProgress()` (que dispara el cert si todos los módulos quedaron completos).

### Lógica del certificado

**Antes:** el cert se mostraba cuando `completedSet.size >= TOTAL_VIDEOS` (= todas las lecciones del curso).

**Ahora (modo módulos):** cert se muestra cuando `areAllModulesCompleted() === true`, donde un módulo está completo si:

- Tiene al menos 1 lección con `completed=true`, **O**
- Tiene live y el live fue asistido (`completedSet.has(-order_num)`), **O**
- No tiene ni lecciones ni live (módulo "vacío" — no bloquea el cert).

`isModuleCompleted(m)` encapsula esta lógica. `areAllModulesCompleted()` itera `MODULES.every(isModuleCompleted)`.

En modo videos sueltos / live (no-modules) el gate sigue siendo `pct >= 100` como antes.

### `updateProgress` rediseñado

- El cálculo del % de la barra ahora cuenta solo `completedSet` con `index >= 0` (los negativos son asistencias de live y no aportan al progreso visual de "lecciones vistas"). Esto evita que la barra se infle artificialmente cuando el alumno marca asistencia.
- El label sigue diciendo "X de Y lecciones completadas" en modo módulos — pero la **gate del cert** ya no depende del % sino de `areAllModulesCompleted()`. Esto puede generar un caso UX peculiar: el alumno asistió a todos los lives + 1 lección por módulo, el % está en 30% pero el card "¡Curso completado! 🎉" + cert ya está visible. Es esperable según la spec.

### Carga inicial de `video_progress`

El filtro anterior `idx >= 0 && idx < LESSONS_FLAT.length` excluía los índices negativos. Ahora se aceptan los dos rangos: `[0, LESSONS_FLAT.length)` para lecciones reales y cualquier `idx < 0` para asistencias a lives. `isLiveAttended(m)` se encarga del matching final.

### Main panel: botón "Marcar como completado" en grabación

Cuando `_liveOverride` está activo (alumno viendo grabación de un live pasado), se busca el módulo origen del live. Si la asistencia AÚN no fue marcada, debajo del iframe aparece un botón `<button class="btn-video">Marcar como completado</button>` (mismo look que el de lecciones). Click → `markLiveAttended(moduleId)`. Si la asistencia ya estaba marcada, se muestra el botón "Completado" disabled con check, igual que las lecciones.

### CSS nuevo

```css
.btn-live-attended { bg lime soft, color lime, border lime soft }
.modules-mod-live-meta.live-attended { color lime, font-weight 700, no italic }
.modules-mod-live.attended-only { border-left lime brillante }
```

### Lo que NO se hizo en esta etapa

- **Tabla `live_attendance` dedicada**: hoy reusamos `video_progress` con índices negativos. Funcional pero ensucia un poquito la semántica. Si en el futuro se quiere trackear timestamps de join, duración asistida, etc., conviene una tabla aparte.
- **Validación server-side de que el alumno asistió de verdad**: el botón "Asistí al live" es self-reportado — un alumno puede clickearlo sin haber entrado nunca al meet. Sin integración con Zoom/Meet API no hay forma técnica de verificar.
- **Backfill de asistencias**: no hay migración para usuarios que ya marcaron lecciones — su gate del cert sigue funcionando porque `areAllModulesCompleted` retorna true cuando todas las lecciones están done (caso compatible). Pero un módulo con ÚNICAMENTE live (sin lecciones), si el alumno no clickea "Asistí al live", no completa el curso. Mensaje pendiente o algún tour la primera vez.
- **Cancelar asistencia**: una vez marcada, no se puede desmarcar. Si fue por error, hay que ir a la BD.
- **72hs hardcoded en el copy**: el texto "La grabación estará disponible en las próximas 72hs" es estático. No hay lógica que despache notif a las 72hs o cambie el copy si pasaron más.
- **Coach panel**: la subida de `recording_url` post-live sigue sin estar expuesta en `coach.html`. Pendiente desde X.42.

**Archivos modificados:**
- `curso.html` — helpers nuevos `liveAttendanceIndex` + `isLiveAttended` + `isModuleCompleted` + `areAllModulesCompleted` + `markLiveAttended`; `renderModuleLiveInfo` reescrito para los 5 estados; main panel con botón "Marcar como completado" debajo de la grabación cuando el live no fue asistido; `updateProgress` con cálculo de % filtrado a índices no-negativos + cert gate vía `areAllModulesCompleted` en modo módulos; load inicial de `video_progress` admite índices negativos; CSS nuevo `.btn-live-attended` + `.live-attended` + `.modules-mod-live.attended-only`.
- `CONTEXTO.md` — esta sección.

---

## Etapa — Finalizar live + gate de asistencia (live_ended)

**Fecha:** 22 de mayo de 2026. Sigue el feature de lives. Antes, el botón "✅ Asistí al live" en curso.html aparecía únicamente cuando `live_date` estaba en el futuro — comportamiento extraño porque el alumno marcaría asistencia ANTES de que la clase empezara. Esta etapa cambia el control al coach: ahora hay un explícito **"finalizar el live"** que destraba la asistencia para los alumnos. Mientras el coach no marque `live_ended = true`, los alumnos solo ven el botón "Unirse al live" y la fecha — no pueden marcar asistencia.

### SQL ejecutado (manual)

```sql
ALTER TABLE public.course_lives
  ADD COLUMN IF NOT EXISTS live_ended BOOLEAN DEFAULT FALSE;
```

### `coach.html` — botón en cada módulo con live

En el tab "Mi curso" → sección Módulos, cada `.mod-card` con live asociado y `live_date <= now` muestra arriba un bloque `.coach-live-status`:

- **`!live_ended`** → botón **`🔴 Finalizar live`** (rosa coral, color `#fc8181`) + meta gris "Live realizado el {fecha}".
- **`live_ended`** → badge **`✅ Live finalizado`** (lime) + "Realizado el {fecha}". Sin botón.
- **`live_date` futura** → no se renderiza nada (no hay nada que finalizar todavía).
- **Sin live** → no se renderiza nada.

El click en "Finalizar live" abre un `confirm()` con copy `"¿Finalizar este live? Después de confirmar, los alumnos verán el botón 'Asistí al live'."`. Tras confirmar, UPDATE `course_lives SET live_ended = true WHERE id = X`, y reemplaza el bloque inline por el estado finalizado sin recargar toda la sección.

Implementación:
- `loadCoachModulesForCourse` ahora hace `Promise.all` con `course_lessons` + `course_lives` (incluyendo `live_ended` en el SELECT) — espejo del patrón ya usado en `loadStudentModules` (curso.html) y `loadModulesForCourse` (admin.html).
- `addCoachModuleRow(modId, title, lessons, live)` recibe el live como cuarto argumento. Si existe y `live_date <= now`, renderiza `renderCoachLiveStatus(live)` al inicio de la card.
- `renderCoachLiveStatus(live)` y `formatCoachLiveDate(iso)` son helpers nuevos. Patrón similar a `renderModuleLiveInfo` de curso.html.
- `finalizarLive(liveId, btn)` hace el UPDATE puntual sin tocar el resto del módulo. Maneja botón disabled + texto "Finalizando..." durante el await.

### `admin.html` — mismo flujo en el editor de cursos

Espejo de coach.html en `addModuleRow` del wizard. Se agrega `renderAdminLiveStatus(live)` y `finalizarLiveAdmin(liveId, btn)`. Diferencias menores con coach:
- `loadModulesForCourse` ya traía `course_lives`; se extiende el SELECT para incluir `live_ended`.
- El estado `live_ended` se persiste en `card.dataset.liveEnded = '1'` después del finalize manual → `getModulesFromForm` lo lee y lo pasa en el `live.live_ended` del payload → `syncCourseModules` lo incluye en el `livePayload` del UPDATE. Esto **es crítico**: sin la preservación, un "Guardar curso" posterior haría UPDATE de `course_lives` sin `live_ended`, y el flag por defecto (FALSE) lo pisaría. La doble persistencia (UPDATE puntual + preservación en sync) garantiza idempotencia.

### `curso.html` — gate del botón "Asistí al live"

**Antes** (Etapa X.44): el botón aparecía cuando `live_date > now`. **Ahora** (Etapa X.45): el botón aparece SOLO cuando `live_date <= now` Y `live_ended = true` Y el alumno no marcó asistencia todavía.

Re-escritura del switch de `renderModuleLiveInfo`:

| Condición | Bloque renderizado |
|---|---|
| `isFuture || !ended` | "📡 Unirse al live" + fecha (sin botón asistí — antes de la finalización el alumno no puede marcar) |
| pasada + finalizada + asistió + con grabación | "▶ Ver grabación" + "Grabación del {fecha}" + "✅ Asististe a este live" |
| pasada + finalizada + NO asistió + con grabación | "▶ Ver grabación" + "Grabación del {fecha}" + botón "✅ Asistí al live" |
| pasada + finalizada + asistió + sin grabación | "✅ Asististe a este live" (solo el badge) |
| pasada + finalizada + NO asistió + sin grabación | "⏳ La grabación estará disponible en las próximas 72hs" + botón "✅ Asistí al live" |

El gate `!ended` colapsa los casos "futuro" y "pasado-no-finalizado" en el mismo bloque — UX consistente: el alumno ve siempre Unirse + fecha hasta que el coach explícitamente marque el cierre.

El SELECT en `loadStudentModules` se extiende para traer `live_ended`. El `_liveOverride` y el botón "Marcar como completado" en el main panel (Etapa X.44) siguen igual: el alumno puede ver la grabación y marcar asistencia desde ahí también una vez que `live_ended = true`.

### CSS

Mismo bloque `.coach-live-status` + `.btn-finalize-live` definido en ambos archivos (admin + coach). Color base coral `#fc8181` para el botón (matchea con `--red` de la paleta pero un poco más cálido). Variante `.ended` con fondo lime soft. Bloques compactos (`padding: 8px 12px`) para no inflar el alto del card.

### Lo que NO se hizo en esta etapa

- **Tabla `course_lives` sigue sin RLS**: pendiente desde X.38. El UPDATE de `live_ended` lo hace cualquier authenticated cliente — para producción habría que policy de UPDATE solo para `role IN ('coach','admin')` joining a `coach_courses` para verificar que el coach esté asignado al curso. Hoy es trust-by-default.
- **Reabrir un live finalizado**: no hay forma desde el panel. Si el coach hace click por error, hay que ir a la BD. Un toggle bidireccional sería trivial pero abre la puerta a inconsistencias (alumnos que ya marcaron asistencia perderían el badge). Decidimos finalize-only.
- **Notificación a alumnos cuando se finaliza**: el coach finaliza el live y los alumnos verán el botón "Asistí al live" la próxima vez que carguen la página. Sin push real-time. Podría sumarse un INSERT en `notifications` dentro de `finalizarLive`/`finalizarLiveAdmin` para que el alumno reciba el aviso.
- **Auto-finalizar después de 24hs**: el spec sugería 72hs para la grabación pero no implica auto-finalize. Sigue siendo manual.
- **Coach panel completo del live**: subida de `recording_url` post-live desde coach.html sigue pendiente desde X.42.

**Archivos modificados:**
- `coach.html` — SELECT de `course_lives` con `live_ended`, `addCoachModuleRow` recibe `live`, helpers `renderCoachLiveStatus` + `formatCoachLiveDate` + `finalizarLive`, CSS nuevo `.coach-live-status` + `.btn-finalize-live`.
- `admin.html` — SELECT con `live_ended`, `addModuleRow` renderiza `renderAdminLiveStatus`, helpers `renderAdminLiveStatus` + `finalizarLiveAdmin`, `getModulesFromForm` y `syncCourseModules` preservan/escriben `live_ended`, CSS nuevo idéntico al de coach.
- `curso.html` — SELECT con `live_ended`, `renderModuleLiveInfo` reescrito con el gate `!ended` que oculta el botón asistir hasta que el coach finalice.
- `CONTEXTO.md` — esta sección.

---

## Etapa — Sección "Clase en vivo" del coach con lives por módulo

**Fecha:** 23 de mayo de 2026. Cierre del flujo del coach: la sección "Clase en vivo" del tab Mi curso estaba leyendo `courses.is_live` (legacy de Sesiones 37–40, un único live por curso). Con la migración a `course_lives` (Etapa X.38+), esa sección quedó obsoleta. Ahora se rediseña para listar TODOS los lives de los módulos del curso seleccionado.

### Cambios en `coach.html`

Reemplazo completo de `loadLiveSection(seq)`:

1. **SELECT `course_modules`** del curso actual (id, title, order_num).
   - Sin módulos → mensaje "No hay lives configurados para este curso."
2. **SELECT `course_lives`** filtrando por `.in('module_id', modIds)` con todas las columnas relevantes: `id, module_id, live_url, live_date, recording_url, live_ended`.
   - Sin lives → mismo mensaje.
3. **Sort** por `order_num` del módulo padre (los lives heredan el orden visual de su módulo).
4. **Render por live** — card `.live-row` con:
   - **Título del módulo** (resuelto vía `modById[lv.module_id].title`).
   - **Fecha formateada**: `toLocaleString('es-AR', { weekday, day, month, year, hour, minute })`. Si no hay fecha → "Sin fecha".
   - **Link al `live_url`** si existe (lime, target `_blank`).
   - **Estado / acción** según condición:
     - `!live_ended && live_date <= now` → botón **🔴 Finalizar live** (clase `.btn-finalize-live`, mismo CSS que ya existía en la sección Módulos).
     - `!live_ended && live_date > now` → texto gris italic **"⏳ Live programado"**.
     - `live_ended` → texto verde **"✅ Live finalizado"** + label "URL de la grabación (YouTube o Drive)" + `<input type="url" class="field-input live-recording-input">` con la `recording_url` actual + botón "Guardar grabación".

### Funciones nuevas

- **`finalizarLiveAndReload(liveId, btn)`** — confirm + UPDATE `course_lives SET live_ended = true` + `loadLiveSection()` para recargar la sección entera. Diferencia con el `finalizarLive` ya existente en la sección Módulos: ese hace reemplazo inline (sin recargar); este recarga para que aparezca el input de grabación que no existía antes.
- **`saveLiveRecording(liveId, btn)`** — UPDATE `course_lives.recording_url`. UX: botón pasa a "Guardando..." durante el await; si OK, "✅ Guardado" por 1.5s y vuelve al label original; si error, `alert` + revert. Si el input está vacío, se persiste `null` (limpia la URL previa).

### Decisiones de diseño

- **Legacy `course_type='live'` queda sin gestión desde coach panel**. Las funciones `finalizarClase`, `addRecRow`, `renderRecRows`, `saveRecordings` siguen en el código por compatibilidad pero ya no se invocan desde `loadLiveSection`. Si un curso legacy sigue activo y necesita gestión, se hace desde admin.
- **No se editan `live_url` ni `live_date` desde acá** — esa edición sigue en el editor del wizard (admin) o el módulo de la sección "Mi curso" (coach). Esta sección es operativa: finalizar el live y subir la grabación post-clase.
- **El input de grabación admite YouTube o Drive** — `getEmbedUrl` (curso.html, Etapa X.40) ya normaliza ambos al render. El placeholder describe los dos formatos válidos.
- **Reload completo** tras `finalizarLiveAndReload`: simple y robusto. Costo es 2 queries adicionales (modules + lives) pero el wrap suele tener pocos items.

### Lo que NO se hizo en esta etapa

- **Notificación al alumno cuando se sube la grabación**: hoy el alumno se entera al recargar la página. Podría sumarse un INSERT en `notifications` dentro de `saveLiveRecording`.
- **Preview de la URL antes de guardar**: el coach puede pegar cualquier string. Validación mínima vía `type="url"` del HTML pero no más. Si pegan basura, el alumno verá un iframe roto.
- **RLS de `course_lives`**: sigue pendiente desde X.38/X.45. Tanto el UPDATE de `live_ended` como el de `recording_url` son public-writable hoy.
- **Auto-detección de YouTube/Drive y embed inline en la card del coach**: solo se muestra como link. Si el coach quiere ver la grabación previa al alumno, debe abrir el link.
- **Historial de cambios**: si el coach edita la URL varias veces, no hay trazabilidad. Probablemente innecesario.

**Archivos modificados:**
- `coach.html` — reemplazo completo de `loadLiveSection` (~110 líneas), funciones nuevas `finalizarLiveAndReload` + `saveLiveRecording`. Las funciones legacy quedan en el código pero sin referrer.
- `CLAUDE.md` — sección X.43 + X.44 + X.45 + X.46 agregadas (estaban faltando de etapas previas) + fila de schema de `course_lives` actualizada con `live_ended` y referencias a las etapas.
- `CONTEXTO.md` — esta sección.

---

## Etapa X.79 — Instalación del Píxel de Meta

**Fecha:** 28 de mayo de 2026.

Píxel ID `1909301979776543`. Se instaló el bloque base (PageView) en los 18 archivos `.html` del proyecto — ninguno lo tenía previamente. Como el sitio no tiene head compartido, fue pegado manualmente en el `<head>` de cada archivo, como primer elemento.

En `checkout-success.html` se agregó además el evento `Purchase` con `value` + `currency` reales tomados de `sessionStorage.checkout_payload` (campos `final_price` + `currency` persistidos por `checkout.html` antes de redirigir a MP). Fallback a query params del PSP. Si no hay datos confiables → no dispara y loguea `console.warn` (no se hardcodea ningún valor).

Nueva regla en `CLAUDE.md`: toda página `.html` nueva debe incluir el bloque base del píxel en su `<head>` — no se hereda automáticamente.

**Archivos modificados:** los 18 `.html` (PageView base), `checkout-success.html` (Purchase extra), `CLAUDE.md` (sección + regla), `CONTEXTO.md` (esta entrada).

---

## Etapa X.75 — Fix evento Purchase del Píxel de Meta

**Fecha:** 28 de mayo de 2026.

### Síntoma

Hubo una compra real vía Mercado Pago. En el Administrador de Eventos de Meta apareció solo `PageView`, nunca `Purchase`.

### Diagnóstico

Doble problema combinado:

1. **`back_urls` apuntaban a dominio legacy** — `create-preference/index.ts` tenía hardcoded `https://ekapradacoach.github.io/HBLAB/checkout-success.html` (GitHub Pages viejo) en lugar de `https://hblabarg.com/checkout-success.html` (prod real).

2. **`sessionStorage` cross-origin** — el payload del checkout se persistía en `hblabarg.com` pero MP redirigía a `ekapradacoach.github.io`. sessionStorage es per-origin, así que `getPurchaseData()` no podía leerlo y `fbq(track, 'Purchase')` nunca se ejecutaba.

El `PageView` SÍ disparaba porque GitHub Pages servía la copia legacy del repo (con el píxel base ya instalado en X.79) y el mismo Pixel ID dispara desde cualquier dominio. Pero Purchase requería el monto, que vivía solo en sessionStorage del origin original.

Flujos NO afectados (redirect relativo same-origin): cupón 100% off y PayPal capture.

### Fix doble

1. **`back_urls` corregidos a `hblabarg.com`** en `create-preference/index.ts`.
2. **`external_reference` enriquecido** con `amount` (= expectedPrice) y `currency` (= 'ARS'). MP devuelve el external_reference URL-encoded como query param en el back_url → checkout-success lo lee, parsea el JSON y extrae monto + moneda.
3. **`checkout-success.html` con cascada de fuentes** (`getPurchaseData()` reescrita): 1) external_reference (resiliente cross-origin), 2) sessionStorage (works same-origin para cupón/PayPal), 3) query params sueltos como fallback. Logging activo para debug.

`process-payment` no requiere cambios — sigue ignorando los campos extra del external_reference.

### Deploy pendiente

Re-deploy manual de `create-preference` en Supabase Dashboard → Edge Functions. Sin ese deploy los pagos MP siguen rotos.

**Archivos modificados:** `supabase/functions/create-preference/index.ts`, `checkout-success.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.80 — Talleres presenciales (in-person workshops)

Feature completo de talleres presenciales que reusa la infraestructura de cursos pero con UX diferenciada. Un taller es un `courses` row con `is_workshop = true`.

### SQL ejecutado (manual, confirmado por el usuario)

```sql
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_workshop BOOLEAN DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS max_seats INT;
-- + INSERT del taller 'taller-post-rehabilitacion' con is_workshop = true.
```

- **`is_workshop BOOLEAN DEFAULT false`** — distingue taller presencial de curso online.
- **`location TEXT`** — dirección/lugar del encuentro.
- **`max_seats INT`** — cupos máximos.
- Fecha/hora del taller reusa `courses.live_date` (no se agregó columna nueva).

### 1. `taller.html` — página de venta dinámica (NUEVO)

Modelada sobre `venta-curso.html`. Lee `?slug=` (NO `?course=`), query `courses WHERE slug = X AND is_workshop = true`. Hero con badge violeta "🏋️ Presencial", fecha formateada (`live_date`), lugar (`location`), CTA "Reservar lugar" → `checkout.html?slug=X&currency=ARS`. Soporta `?buy=1` para auto-abrir el flujo de compra (mismo patrón que venta-curso.html). Aplica `getEffectivePrice` para precios programados.

### 2. `admin.html` — Tab Cursos extendido

- **Badge violeta "🏋️ Presencial"** en la columna Estado de la tabla para filas con `is_workshop = true`.
- **Toggle "Es taller presencial"** (`cf-is-workshop`) en el wizard que revela los campos `location` (`cf-location`) y `max_seats` (`cf-max-seats`).
- **Botón "👥 Inscritos"** por fila de taller → modal que lista los inscritos (query `user_courses` join `profiles`) con **exportación CSV** (BOM UTF-8, nombre `inscritos-{slug}-YYYY-MM-DD.csv`).
- Wiring en `editCurso` / `saveCurso` / `resetCursoForm` / `loadCursos` (SELECT extendido con `is_workshop, location, max_seats`).

### 3. `dashboard.html` — card de taller diferenciada

Cuando `course.is_workshop = true`, la card del alumno muestra: badge violeta, fecha + lugar, **sin barra de progreso**, y botón "Ver entrada" que abre un modal-ticket con los datos del encuentro (título, fecha, dirección) en vez de "Ir al curso →".

### 4. `process-payment/index.ts` — email diferenciado para talleres

Cuando el curso comprado tiene `is_workshop = true`, se envía un email distinto al de bienvenida de curso online:
- **Subject**: `🎟️ ¡Tu lugar está reservado! — {courseTitle}`.
- **Body** (mismo dark theme inline): confirmación de reserva, fecha formateada, dirección del lugar, instrucción de presentar el ticket/entrada, + credenciales de acceso al portal (magic link, igual que el flujo normal).
- Reusa la lógica de creación de usuario + magic link; solo cambia el template del email según `is_workshop`.

### 5. `index.html` — sección "Talleres presenciales"

Sección `#talleres` insertada antes del footer. `loadTalleres()` query `is_workshop = true AND is_active = true` ordenado por `display_order` + `created_at`. Renderiza cards (badge violeta, fecha vía `formatTallerDate`, lugar, precio efectivo, CTA "Reservar lugar") que linkean a `taller.html?slug=X`. La sección se auto-oculta (`display:none`) si no hay talleres. Los talleres se **excluyen** de `loadCursos()` con un `.or('is_workshop.is.null,is_workshop.eq.false')` para no aparecer en ambas secciones.

### ⚠️ Deploy pendiente

Re-deploy manual de `process-payment` en Supabase Dashboard → Edge Functions (cambió el template de email para talleres). Sin el deploy, los compradores de talleres reciben el email genérico de curso online.

### Cómo crear un taller desde el admin

1. Tab Cursos → Nuevo curso → completar identidad.
2. Activar toggle "Es taller presencial" → completar `location` (dirección) y `max_seats` (cupos).
3. Setear `live_date` (fecha/hora del encuentro) y precio.
4. Guardar → aparece en `index.html` sección Talleres y en `taller.html?slug=X`.
5. Ver inscritos con el botón "👥 Inscritos" (exporta CSV).

**Archivos modificados:** `taller.html` (nuevo), `admin.html`, `dashboard.html`, `index.html`, `supabase/functions/process-payment/index.ts`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.81 — Link de Meet/Zoom opcional para talleres presenciales

Fix de la validación del wizard de cursos en `admin.html` (Step 2 — Contenido). El toggle "Clase en vivo (Meet / Zoom)" (`cf-is-live`) exigía un `live_url` obligatorio. Pero un taller presencial (`is_workshop = true`) no tiene link de videollamada — el encuentro es físico. Si el admin marcaba "Clase en vivo" en un taller (o el flujo lo activaba), `saveCurso()` cortaba con el error rojo *"Si es clase en vivo, el link de Meet/Zoom es obligatorio."* impidiendo guardar.

### Cambio en `saveCurso()` (admin.html)

- **Validación condicionada a `!isWorkshop`**: `if (isLive && !liveUrl && !isWorkshop) return showAlert(...)`. Para talleres presenciales el link de Meet/Zoom es **opcional** — no se muestra el error.
- **Reordenamiento**: las lecturas `isWorkshop` / `location` / `maxSeats` se movieron ARRIBA de la validación del link (antes estaban después, lo que las hacía inaccesibles al momento del check). Se eliminó la declaración duplicada que vivía más abajo para evitar el `SyntaxError` de doble `const`.

Sin cambios en el resto del flujo: si el taller igual tuviera un `live_url` cargado, se guarda normal; si no, se guarda con `live_url = null`. La validación sigue intacta para cursos online normales (no-workshop) con clase en vivo.

**Archivos modificados:** `admin.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.82 — Renombrar sección de learning_points en taller.html

Cambio cosmético en `taller.html`. La sección `#learn` (que renderiza `learning_points` vía `renderLearn`) tenía el título "¿Para quién es este taller?" con el badge "A quién va dirigido" — semántica de "público objetivo", no de contenido formativo. Se renombró a contenido de aprendizaje:

- **Badge (`.section-label`)**: "A quién va dirigido" → **"Lo que vas a aprender"**.
- **Título (`.section-title`)**: "¿Para quién es este taller?" → **"¿Qué vas a aprender?"**.
- Comentario HTML de la sección actualizado a `¿QUÉ VAS A APRENDER?`.

El contenido dinámico (`learning_points` del curso) y la lógica de `renderLearn` no cambian — solo los textos estáticos del header de la sección.

**Archivos modificados:** `taller.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.83 — Instructor dinámico en taller.html (course_coaches)

La sección `#instructor` de `taller.html` estaba **hardcodeada** con los datos de Erika Prada (foto `IMG_2393__1_-removebg-preview.png`, nombre y bio fijos en HTML). Ahora lee el/los coach(es) asignado(s) al taller desde la BD, igual que `venta-curso.html` (Sesión 45).

### Mecanismo

Usa la RPC **`get_course_coaches(p_course_id UUID)`** SECURITY DEFINER (la misma que venta-curso.html) que joinea `coach_courses + profiles` y retorna `{ coach_id, full_name, avatar_url, bio }`. Se pasa `course.id` (UUID), NUNCA el slug.

> Nota: la tabla real es `coach_courses` (la consigna la mencionó como "course_coaches"). La RPC abstrae el join, así que el cliente no toca la tabla directamente.

### Cambios en `taller.html`

- **HTML**: la sección `#instructor` pasa a `style="display:none"` por default, con header (`<span class="section-label">Quién lo dicta</span>` + `<h2 class="section-title">Tu instructor</h2>`) y un contenedor `#instructores-grid` poblado por JS. Se eliminó el bloque hardcodeado de Erika.
- **`renderInstructores(courseId)`** nueva (espejo de venta-curso.html): llama la RPC, y
  - error o `data` vacío → `section.style.display = 'none'` (oculta silenciosamente, `console.warn` para debug).
  - con datos → `section.style.display = ''` + renderiza un `.instructor-card` por coach: `<img class="instructor-photo">` si hay `avatar_url`, o `.instructor-initials` (primeras 2 iniciales del `full_name`) como fallback, + nombre + bio. **Soporta N coaches** (grid `repeat(auto-fit, minmax(280px, 1fr))`).
  - Envuelto en try/catch → excepción inesperada también oculta la sección.
- Se llama con `await renderInstructores(course.id)` en `init()`, después de `renderLearn`/`renderTemario`.
- **CSS**: se reemplazó `.instructor-wrap` (card único centrado) por `.instructor-header` + `.instructores-grid` + `.instructor-card` + `.instructor-initials` (fallback violeta). `.instructor-photo`/`.instructor-name`/`.instructor-bio` se conservan.

La imagen `IMG_2393__1_-removebg-preview.png` ya no se referencia desde `taller.html` (sigue en el repo, usada en otras páginas).

**Archivos modificados:** `taller.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.84 — Descripción de modalidad en taller.html

El campo `courses.modalidad_descripcion` (texto libre cargado desde el admin, Etapa X.75) se guardaba pero **no se mostraba** en `taller.html` — la página ni siquiera lo traía en su SELECT. Ahora se renderiza igual que en `venta-curso.html`.

### Cambios en `taller.html`

- **SELECT extendido** con `modalidad_descripcion`.
- **Nueva sección `#modalidad`** insertada **entre el hero (que contiene las características: fecha/lugar/cupos) y la sección "¿Qué vas a aprender?" (learn) → antes del temario**. Mismo orden relativo que venta-curso.html (modalidad va después de las características y antes de "Lo que vas a aprender"). Header con badge "Modalidad" + título "Cómo es el taller" + `<p id="modalidad-desc">`. La sección arranca con `style="display:none"`.
- **`renderModalidad(course)`** nueva: si `course.modalidad_descripcion` tiene texto (trim) → `el.textContent = txt` + muestra la sección; si está vacío → la deja oculta. `textContent` escapa HTML automáticamente; los saltos de línea del admin se respetan vía CSS `white-space: pre-line`. Se llama en `init()` justo después de `renderFacts(course)`.
- **CSS** `.modalidad-desc` (centrado, `max-width: 760px`, `white-space: pre-line`) + `.modalidad-header` + `#modalidad { background: var(--navy) }` para alternar con la sección learn (navy-light) que le sigue.

> Nota: la consigna lo llamó `modal_description`; la columna real es `modalidad_descripcion` (la misma que usan admin.html y venta-curso.html).

**Archivos modificados:** `taller.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.85 — Reordenar sección #talleres en index.html

Cambio puramente de orden en el DOM de `index.html`. La sección `#talleres` (talleres presenciales) estaba **después** de `#incompany` ("¿Querés que llevemos un curso a tu box o institución?"), lo que dejaba los talleres casi al final, pegados al footer. Se movió para que quede **antes** de `#incompany`.

**Orden final de secciones**: `#cursos` → `#proximos` → `#talleres` → `#incompany` → `<footer>`.

Solo se movió el bloque HTML de `#talleres` (comentario + `<section>`). **No cambió** ni la lógica (`loadTalleres()` sigue igual, el SELECT y el auto-ocultado intactos) ni los estilos (clases y estilos inline sin tocar).

**Archivos modificados:** `index.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.86 — CTA de lanzamientos respeta is_workshop (taller.html)

El slider de lanzamientos de la landing generaba el link del CTA siempre como `venta-curso.html?slug=X`, incluso cuando el curso vinculado era un taller presencial (`is_workshop = true`) — esos deben ir a `taller.html?slug=X`.

### Dónde se genera la URL

Importante: la tabla `launches` **NO almacena ninguna URL** — solo guarda `course_id` + `cta_text` (label del botón). La URL del CTA se construye **en tiempo de render** dentro de `loadLaunches()` en `index.html`, resolviendo el slug del curso vinculado vía el embed `courses(...)`. Por eso:

- **`saveLanzamiento()` (admin.html)**: sin cambios — su payload solo tiene `title, description, cta_text, active, image_url, course_id`. No hay URL que corregir.
- **`loadLanzamientos()` (admin.html)**: sin cambios — solo renderiza la tabla admin (título, curso vinculado por `courses(title)`, estado, acciones). No construye URL del CTA.
- **`loadLaunches()` (index.html)** — único lugar con el fix:
  1. El embed pasa de `courses(slug, price_ars, price_usd, scheduled_prices)` a `courses(slug, price_ars, price_usd, scheduled_prices, is_workshop)`.
  2. La URL se arma con: `` `${l.courses?.is_workshop ? 'taller' : 'venta-curso'}.html?slug=${courseSlug}` `` (antes era siempre `venta-curso.html?slug=${courseSlug}`). Si no hay curso vinculado → `'#'` (sin cambios).

Fuera de alcance en X.86 (resuelto luego en X.87): la card del countdown (`renderCountdownCourseCard`) también linkeaba siempre a `venta-curso.html`.

**Archivos modificados:** `index.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.87 — Countdown card respeta is_workshop (taller.html)

Follow-up de X.86 para dejar el comportamiento 100% consistente. La card del curso vinculado a la cuenta regresiva (`#countdown-course-wrap`) generaba el link siempre como `venta-curso.html?slug=X`. Ahora respeta `is_workshop`.

### Cambio en `loadSiteConfig()` (index.html, bloque del countdown)

- El SELECT del curso vinculado pasa a incluir `is_workshop`: `.select('id, slug, title, description, price_ars, price_usd, scheduled_prices, cover_url, is_live, is_coming_soon, is_workshop')`.
- La URL se arma con: `` const url = `${course.is_workshop ? 'taller' : 'venta-curso'}.html?slug=${course.slug}` `` (antes siempre `venta-curso.html?slug=X`).

Esa misma `url` se usa para (a) hacer el wrap del countdown clickeable (`cdWrap.onclick`) y (b) `renderCountdownCourseCard(course, url)` — que la reutiliza tanto en el `onclick` de la card como en el botón "Ver curso". Con un solo cambio, todo el countdown apunta correctamente al taller.

**Archivos modificados:** `index.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.88 — Slider de lanzamientos: imagen de fondo en mobile/webview

El slider de lanzamientos (`#launches-section`) no mostraba bien la imagen de fondo del slide en mobile: el overlay oscuro la tapaba demasiado, el alto era chico, y el `background-image` de `.slide-bg` a veces no renderiza en el webview embebido de Instagram/TikTok. Se mejoró la visualización en `@media (max-width: 768px)`.

### Cambios en `index.html`

**1. Markup (`loadLaunches`)** — además del `.slide-bg` (background-image), se renderiza un `<img class="slide-img-fallback">` cuando el lanzamiento tiene `image_url`:
```js
const imgFallback = l.image_url
  ? `<img class="slide-img-fallback" src="${escHtml(l.image_url)}" alt="" aria-hidden="true" loading="lazy" />`
  : '';
```
Se inserta entre `.slide-bg` y `.slide-overlay` → queda detrás del overlay y del contenido (`z-index: 0`). El `src` se escapa con `escHtml` (escapa `"`).

**2. CSS base** — `.slide-img-fallback` arranca `display: none` (en desktop manda el `background-image` de `.slide-bg`). `position: absolute; inset: 0; object-fit: cover; object-position: center top; z-index: 0`.

**3. `@media (max-width: 768px)`** (bloque nuevo, ubicado después del de 680px para que sus reglas ganen por orden de cascada en viewports chicos):
- `.slide` y `.slide-bg` → `min-height: 480px` (antes el slide quedaba en 340px a ≤680). El `min-height` en `.slide` es el que efectivamente agranda el alto (el `.slide-bg` con `inset:0` hereda ese alto).
- `.slide-bg` → `background-size: cover; background-position: center top`.
- `.slide-overlay` → opacidad reducida: la capa plana baja de `rgba(0,0,0,0.50)` a `rgba(0,0,0,0.12)`, conservando un degradado fuerte solo en la base (`0.62 → 0`) para que el texto (anclado abajo con `align-items:flex-end`) siga legible.
- `.slide-img-fallback` → `display: block` (se muestra el `<img>` de fallback).

**Stacking**: en el DOM el orden es `.slide-bg` → `.slide-img-fallback` → `.slide-overlay` → `.slide-content`. Con `z-index` 0/0/0/1, el overlay pinta sobre la img (la atenúa) y el contenido queda arriba de todo. En desktop la img está oculta y se ve el `background-image`; en mobile la img garantiza que la foto aparezca aunque el webview no pinte el `background-image`.

**Archivos modificados:** `index.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.89 — Imagen de lanzamiento optimizada para mobile (`image_url_mobile`)

Se agrega una segunda imagen por lanzamiento, específica para mobile, para poder subir un arte con encuadre vertical (las imágenes pensadas para desktop suelen recortarse mal en pantallas angostas).

### SQL ejecutado (manual, confirmado por el usuario)

```sql
ALTER TABLE public.launches
  ADD COLUMN IF NOT EXISTS image_url_mobile TEXT;
```

Columna `TEXT` nullable. Lanzamientos existentes quedan con `image_url_mobile = NULL` → se usa `image_url` como fallback (sin romper nada retroactivo). Las policies RLS de `launches` ya cubren la columna nueva.

### admin.html — formulario de lanzamientos

- **Nuevo campo "Imagen de fondo (mobile)"** (opcional) debajo del de escritorio, espejo exacto del patrón existente: upload local a Storage (`course-materials/launches/{ts}-{rand}-mob.{ext}`) + campo de URL directa + preview + botón quitar. IDs: `lz-image-mobile-file`, `lz-img-mob-file-text`, `lz-img-mob-status`, `lz-img-mob-preview`, `lz-img-mob-preview-thumb`, `lz-image-url-mobile`.
- **Global nueva** `_lzImageUrlMobile` (paralela a `_lzImageUrl`).
- **Funciones nuevas** `handleLzImageMobile(file)`, `cancelLzImageMobile()`, `handleLzUrlInputMobile(val)` — espejo de las de escritorio.
- **Wiring**: `saveLanzamiento` agrega `image_url_mobile: imageUrlMobile` al payload; `editLanzamiento` pre-carga la imagen mobile; `cancelarLanzamiento` llama `cancelLzImageMobile()`; `loadLanzamientos` extiende el SELECT con `image_url_mobile`.

### index.html — `loadLaunches`

El SELECT ya usa `*` (la columna nueva viene incluida). Se elige la imagen del slide con:
```js
const slideImg = (window.innerWidth < 768 && l.image_url_mobile)
  ? l.image_url_mobile
  : l.image_url;
```
`slideImg` se usa tanto para el `background-image` de `.slide-bg` como para el `<img class="slide-img-fallback">` (Etapa X.88). La detección es al render (carga de página); si el usuario rota/redimensiona no re-elige (comportamiento aceptado según la consigna, que pide chequear `window.innerWidth`).

**Archivos modificados:** `admin.html`, `index.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.90 — Fix recuperación de contraseña: redirect a set-password.html + PASSWORD_RECOVERY

Bug: al usar "Recuperar contraseña" en `login.html`, el link del email aterrizaba en el dashboard (o de ahí rebotaba al login) en vez de la pantalla para crear la nueva contraseña. Causa: `resetPasswordForEmail` usaba `redirectTo: window.location.origin + '/dashboard.html'`.

### Cambio en `login.html` (panel "Recuperar contraseña")

```js
// Antes
await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/dashboard.html' });
// Ahora
await sb.auth.resetPasswordForEmail(email, { redirectTo: 'https://hblabarg.com/set-password.html' });
```

El link del email ahora lleva a `set-password.html`, la misma página que ya se usa para activar cuentas de alumnos invitados (Etapa X.17). **Pre-requisito**: `https://hblabarg.com/set-password.html` debe estar en la allow-list de Supabase → Auth → URL Configuration → Redirect URLs (ya estaba por el flujo de invite/magic link de X.20).

### Cambio en `set-password.html` — manejo de `PASSWORD_RECOVERY`

El cliente Supabase (`supabase.js`) usa la config por default → `detectSessionInUrl: true`. Al abrir el link de recovery, el SDK auto-detecta la sesión y dispara `onAuthStateChange` con el evento `PASSWORD_RECOVERY`. Se agregó un listener que, ante ese evento, muestra el form de nueva contraseña (`#panel-form`) — **nunca redirige al dashboard**:

```js
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) revealForm();
});
```

Además, para evitar un parpadeo del panel de error cuando el SDK auto-detecta la sesión y el bootstrap manual corre en paralelo (race), se agregó el flag `_formRevealed`:
- `revealForm()` lo setea en `true`.
- `showError(detail)` hace `if (_formRevealed) return;` al inicio → no pisa el form una vez revelado.

El bootstrap manual (casos A/B/C: hash con `access_token`, `?code=` PKCE, `?token_hash=&type=`) sigue intacto y cubre el link de recovery igual que el de invite (recovery usa los mismos flujos). El listener `PASSWORD_RECOVERY` es la red de seguridad ante el race con `detectSessionInUrl`.

### Flujo final

1. Alumna → login.html → "Recuperar contraseña" → "Enviar link" → `resetPasswordForEmail(redirectTo: set-password.html)`.
2. Recibe email → toca el botón → llega a `set-password.html` con sesión de recovery activa.
3. `set-password.html` detecta la sesión (bootstrap manual o `PASSWORD_RECOVERY`) → muestra `#panel-form`.
4. Elige contraseña → `sb.auth.updateUser({ password })` → redirect a `dashboard.html`.

**Archivos modificados:** `login.html`, `set-password.html`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.91 — Fix PayPal: procesar también `status=APPROVED` (no solo COMPLETED)

Bug en el branch PayPal (sección 2b) de `process-payment/index.ts`. La condición que decide si procesar el pago era demasiado estricta: solo procesaba si `order.status === 'COMPLETED'` o si había captures con status `COMPLETED`. Pero PayPal a veces manda el webhook con `status=APPROVED` e `intent=CAPTURE` cuando el pago ya fue autorizado pero la captura todavía está en proceso. En ese caso el handler skipeaba silenciosamente (`{ ok: true, skipped: true, reason: 'status=APPROVED' }`) → **no se creaba el usuario, no se hacía el UPSERT en `user_courses` ni se enviaba el email** — el alumno pagaba y no recibía acceso.

### Cambio

```js
// Antes
const isCompleted = orderStatus === 'COMPLETED';
// Ahora
const isCompleted = orderStatus === 'COMPLETED' || orderStatus === 'APPROVED';
```

El resto de la condición (`hasCapture` con `intent === 'CAPTURE'` + capture `COMPLETED`) queda igual. Ahora un order `APPROVED` también dispara el flujo completo (creación de usuario + UPSERT + email de bienvenida/confirmación), idéntico al de `COMPLETED`.

**Nota**: el flujo aguas abajo es idempotente (UPSERT en `user_courses` con `onConflict: 'user_id,course_id'`), así que si después llega el webhook `PAYMENT.CAPTURE.COMPLETED` del mismo pago, no se duplica el acceso ni se re-crea el usuario (el lookup en `profiles.email` lo encuentra y saltea el alta + email de bienvenida).

### ⚠️ Deploy pendiente

Re-deploy manual de `process-payment` en Supabase Dashboard → Edge Functions → process-payment → Code → pegar el archivo actualizado → Deploy updates. Sin el deploy, los pagos PayPal que llegan como `APPROVED` siguen sin procesarse.

**Archivos modificados:** `supabase/functions/process-payment/index.ts`, `CLAUDE.md`, `CONTEXTO.md`.

---

## Etapa X.92 — checkout.html cobra el precio vigente (scheduled_prices) + sync server-side

Bug: `checkout.html` mostraba y cobraba `course.price_ars` / `course.price_usd` crudos, sin aplicar `scheduled_prices`. Con un precio programado activo, el resumen del checkout mostraba el precio base ($40.000) en vez del vigente ($52.000) — y peor, **el monto enviado a las Edge Functions era el viejo**, así que el alumno podía pagar el precio desactualizado. Cierra el pendiente que venía anotado desde la Etapa X.39 ("checkout.html aún lee precio base").

### El problema de consistencia client ↔ server

No alcanzaba con corregir solo `checkout.html`: las Edge Functions `create-preference` y `create-paypal-order` validan el `amount` recibido contra el precio reconstruido server-side (hardening X.30), con tolerancia ±1 ARS / ±0.01 USD. Esas funciones usaban `course.price_ars` / `course.price_usd` base. Si el front empezaba a mandar el precio vigente ($52.000) y el server seguía esperando el base ($40.000), la validación fallaba con **`Monto inválido`** y el pago se rompía por completo. Por eso el fix se aplicó en los **tres** lugares, con el mismo `getEffectivePrice` en todos.

### Cambios

**`checkout.html`:**
- SELECT del init extendido con `scheduled_prices`.
- Se copió el helper `getEffectivePrice(course)` (idéntico al de index.html / venta-curso.html, Etapa X.41).
- En el init: `const eff = getEffectivePrice(course); _basePrice = currency === 'ARS' ? eff.price_ars : eff.price_usd;`. Todo lo demás (resumen, `validateCoupon`, `_finalPrice`, ramas de pago MP/PayPal/cupón-100%) ya derivaba de `_basePrice`/`_finalPrice`, así que ahora usa el precio vigente automáticamente.

**`supabase/functions/create-preference/index.ts` (ARS):**
- SELECT del curso extendido con `scheduled_prices`.
- Helper nuevo `getEffectivePriceArs(course)` (espejo server-side del front).
- `const basePrice = getEffectivePriceArs(course)` (antes `Number(course.price_ars || 0)`). El descuento de cupón se aplica sobre ese base vigente, igual que el front.

**`supabase/functions/create-paypal-order/index.ts` (USD):**
- SELECT del curso extendido con `scheduled_prices`.
- Helper nuevo `getEffectivePriceUsd(course)`.
- `const basePriceUsd = getEffectivePriceUsd(course)` (antes `Number(course.price_usd || 0)`).

**`process-payment` sin cambios**: el webhook confía en el monto realmente capturado por MP/PayPal contra la preference/order ya creada, no recalcula contra el precio base. La rama de cupón-100% manda `amount: 0` y valida el cupón aparte, así que tampoco depende del precio vigente.

### ⚠️ Deploy pendiente

Re-deploy manual de **`create-preference`** y **`create-paypal-order`** en Supabase Dashboard → Edge Functions → cada función → Code → pegar archivo actualizado → Deploy updates. **Crítico**: sin estos dos deploys, apenas el front (ya en producción tras el push) empiece a mandar el precio vigente, las funciones lo rechazarán con `Monto inválido` y **se rompen todos los pagos de cursos con un scheduled_price activo**. Los dos deploys deben hacerse cuanto antes para mantener el front y el server en sync.

**Archivos modificados:** `checkout.html`, `supabase/functions/create-preference/index.ts`, `supabase/functions/create-paypal-order/index.ts`, `CONTEXTO.md`.

---

## Etapa X.93 — Enviar email a los alumnos de un curso (admin)

Nueva feature en `admin.html` Tab Cursos: el admin puede mandar un email a los alumnos inscriptos de cualquier curso. Útil para avisos (cambio de fecha, material nuevo, recordatorios).

### admin.html

- **Nuevo item "📧 Enviar email"** en el action menu (⋮) de cada fila de curso (todos los cursos, no solo talleres). `onclick="openEmailCursoModal('${c.id}', this.dataset.t)"` con `data-t` = título.
- **Modal `#modal-email-curso`** en dos pasos:
  - **Paso 1 — Destinatarios**: título del curso arriba, botones "✅ Seleccionar todos" / "☐ Quitar selección", contador `seleccionados/total`, y lista de checkboxes (nombre + email) de los alumnos con `payment_status='paid' AND status='active'`. Todos arrancan tildados.
  - **Paso 2 — Contenido**: input Asunto + textarea Mensaje (texto plano). Botón "📧 Enviar a X seleccionados" deshabilitado si no hay ninguno tildado (se actualiza en vivo).
- **Carga de alumnos** (`openEmailCursoModal`): intento primario con el embed `sb.from('user_courses').select('user_id, profiles(full_name, email)')` (como pide la consigna); **fallback a la RPC `get_ventas()`** filtrando por `course_title` si el embed no resuelve (el FK de `user_courses.user_id` apunta a `auth.users`, no a `profiles` → PostgREST no arma la relación, ver CLAUDE X.26). Dedupe por email + orden alfabético.
- **Funciones nuevas**: `openEmailCursoModal`, `ecRenderRecipients`, `ecToggle`, `ecSelectAll`, `ecSelectedCount`, `ecUpdateCounts`, `ecUpdateSendBtn`, `sendCourseEmail`. Globals `_ecCourseId`, `_ecRecipients`.
- **`sendCourseEmail()`**: arma `recipients = [{email, name}]` de los tildados, valida asunto + mensaje, hace `fetch POST` a la Edge Function `send-course-email` con `Authorization: Bearer ${session.access_token}` + `apikey` (mismo patrón que `confirmarAgregarCoach`). Muestra loading en el botón y resultado inline (`#ec-msg`): `✅ Emails enviados: N · Fallaron: M`.

### Edge Function `supabase/functions/send-course-email/index.ts` (NUEVA)

- `verify_jwt = true` (en `config.toml`) + verificación explícita en código de que el caller sea `profiles.role === 'admin'` (mismo patrón que `invite-coach-new`).
- Body: `{ recipients: [{ email, name }], subject, message }`. Valida asunto, mensaje, al menos 1 destinatario, máximo 1000.
- Envía **un email individual por destinatario** (loop secuencial) vía Resend, `from: 'HB Lab <noreply@hblabarg.com>'`, subject = el del admin. El cuerpo usa el **dark theme estándar** (fondo `#1E2A3A`, card `#243042`, texto `#FFFFFF`/`#94A3B8`, acento lime `#C8E600`, table layout inline, `meta color-scheme dark`), con el saludo "Hola {name}," arriba del mensaje. El mensaje (texto plano) se escapa con HTML-escape y los `\n` se convierten en `<br>`.
- Retorna `{ ok: true, sent, failed, errors: [{email, error}] }`. Un envío fallido no aborta el resto (se acumula en `errors`).
- Secrets: usa los ya configurados `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`.

### ⚠️ Deploy pendiente

Deploy manual de la función nueva: Supabase Dashboard → Edge Functions → **New function** → nombre `send-course-email` → "Via Editor" → pegar `supabase/functions/send-course-email/index.ts` → Deploy → Settings → activar **"Enforce JWT verification"**. Sin secrets nuevos (reusa los de `process-payment`/`invite-coach-new`). Hasta el deploy, el botón "Enviar email" falla con 404.

**Archivos modificados:** `admin.html`, `supabase/functions/send-course-email/index.ts` (nuevo), `supabase/config.toml`, `CLAUDE.md`, `CONTEXTO.md`.

---
