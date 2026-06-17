# Tablero · Razor

Tablero Kanban para llevar el control del proyecto del SaaS de citas (Razor).
Convertido de un HTML estático a **Next.js + Supabase**, con login para el
equipo y un único tablero compartido en la nube.

- **Tablero compartido**: los 3 usuarios ven y editan las mismas tareas, en vivo.
- **Login obligatorio** por usuario y contraseña. **No hay registro público.**
- **Usuarios fijos**: Diego Zamora, Keylor Barrantes y Pablo Jiménez.
- Arrastrar tarjetas entre columnas, subtareas, prioridades, responsables, filtros por épica y barra de progreso.

> El HTML original quedó guardado en [`referencia/tablero-citas.html`](referencia/tablero-citas.html).

---

## ✅ Estado actual (ya configurado)

El proyecto de Supabase **ya está creado y listo** (`Tablero-SaaS`, ref `wjnyvhrthuhbnfkjkbur`):

- Tablas, RLS y realtime aplicados (migraciones `0001` y `0002`).
- Las **42 tareas** iniciales ya están cargadas.
- Los **3 usuarios** ya están creados y confirmados.
- El acceso al tablero está restringido por RLS a los usuarios `@tablero.razor`,
  así que aunque alguien se registre con otro correo, no puede ver ni tocar el tablero.
- Las variables públicas están en `.env.local` (local) y `.env.production` (build de Vercel).

**Usuarios del equipo:** `diego`, `keylor`, `pablo`.
Las contraseñas se entregaron por separado (no se guardan en el repositorio).
Cada quien puede cambiarla con `npm run seed:users` definiendo las variables
`SEED_PASS_DIEGO`, `SEED_PASS_KEYLOR`, `SEED_PASS_PABLO`.

Para correr en local solo hace falta: `npm install` y `npm run dev`.

Las secciones de abajo son la referencia por si hay que recrear todo desde cero.

---

## Requisitos

- [Node.js](https://nodejs.org) 18 o superior (probado con 24).
- Una cuenta gratuita de [Supabase](https://supabase.com).
- Una cuenta de [Vercel](https://vercel.com) para el despliegue.

---

## 1. Instalar dependencias

```bash
npm install
```

## 2. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Anota la contraseña de la base de datos (no la necesitas para la app).
3. Cuando termine de crearse, ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon public** key
   - **service_role** key (¡secreta!)

## 3. Configurar las variables de entorno

Copia el archivo de ejemplo y rellénalo:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # anon public
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # service_role (solo local / Vercel)
```

## 4. Crear las tablas (migración)

En Supabase → **SQL Editor** → pega el contenido de
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) y dale **Run**.

Esto crea la tabla `tasks`, activa la seguridad por filas (RLS) para que solo
usuarios con sesión accedan, y habilita el tiempo real.

## 5. Desactivar el registro público

En Supabase → **Authentication → Sign In / Providers** (o **Settings**):

- Deja activado **Email** como proveedor.
- **Desactiva** "Allow new users to sign up" (Permitir registro de nuevos usuarios).
- **Desactiva** "Confirm email" (no usamos correos reales; los usuarios ya se crean confirmados).

Así nadie podrá registrarse: solo existen los 3 usuarios que creamos abajo.

## 6. Crear los usuarios y cargar las tareas

```bash
npm run seed
```

Esto crea los 3 usuarios e inserta las tareas iniciales del tablero.
Al terminar, la consola imprime las **credenciales de cada persona**
(usuario + contraseña). Guárdalas y repártelas.

> Las contraseñas se definen con variables de entorno
> (`SEED_PASS_DIEGO`, `SEED_PASS_KEYLOR`, `SEED_PASS_PABLO`); si no las defines,
> el script genera una contraseña aleatoria y la imprime. `npm run seed:users`
> es idempotente: actualiza la contraseña si el usuario ya existe.

## 7. Levantar en local

```bash
npm run dev
```

Abre <http://localhost:3000>. Te pedirá iniciar sesión (p.ej. usuario `diego`).

---

## Desplegar en Vercel

1. Sube el proyecto a un repositorio de GitHub:

   ```bash
   git init
   git add .
   git commit -m "Tablero Razor"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/tablero-razor.git
   git push -u origin main
   ```

2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo.
3. En **Environment Variables** añade las tres variables del paso 3
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`).
4. **Deploy**. Vercel detecta Next.js automáticamente.

> No hace falta volver a correr el seed en producción: usa la misma base de
> datos de Supabase, así que los usuarios y las tareas ya están ahí.

---

## Estructura

```
src/
  app/
    layout.tsx          · layout raíz + fuentes
    globals.css         · estilos (portados del HTML)
    login/page.tsx      · pantalla de inicio de sesión
    page.tsx            · tablero (protegido)
  components/Board.tsx   · el tablero Kanban (cliente)
  lib/
    users.ts            · lista de usuarios y dominio sintético
    types.ts            · tipos de Tarea/Subtarea
    supabase/           · clientes de Supabase (navegador, servidor, middleware)
middleware.ts            · protege rutas y refresca la sesión
supabase/migrations/     · SQL de la base de datos
scripts/                 · seed de usuarios y tareas
```

## Notas

- Se quitaron los botones **Importar** y **Restablecer** del HTML original
  porque sobrescribirían el tablero compartido de todo el equipo. Se mantiene
  **Exportar** (descarga un JSON de respaldo).
- Para cambiar quién está en el equipo: edita `src/lib/users.ts` **y**
  `scripts/seed-users.mjs`, y vuelve a correr `npm run seed:users`.
