# Fotos Cloudinary

App web (React + funciones serverless) para administrar **varias cuentas de Cloudinary** desde el celular o la computadora:

- Cambiar entre cuentas (hasta 5, configuradas por variables de entorno)
- Ver, navegar y **crear folders y subfolders**
- **Tomar fotos con la cámara** (o elegir de la galería, varias a la vez) y subirlas al folder abierto
- Ver galería, abrir en pantalla completa, copiar URL, **eliminar** imágenes (una o varias)
- Login con contraseña; el API secret de Cloudinary **nunca llega al navegador**

## Cómo funciona

```
Navegador (React)  ──►  /api/* (funciones serverless, guardan los secrets)  ──►  Cloudinary Admin API
        └──────────── foto firmada, subida directa ────────────────────────────►  Cloudinary Upload API
```

Las fotos no pasan por tu servidor: el backend solo firma la subida y el navegador la envía directo a Cloudinary.
Antes de subir, la app reduce fotos muy grandes (máx. 2560 px) para ahorrar datos móviles.

## 1. Configuración

```bash
npm install
cp .env.example .env     # y completa los valores
```

En `.env` define:

| Variable | Qué es |
|---|---|
| `APP_PASSWORD` | Contraseña para entrar a la app |
| `AUTH_SECRET` | Cadena aleatoria de 32+ caracteres (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `CLOUD_n_LABEL` | Nombre que verás en la pestaña (ej. `Jeep`) |
| `CLOUD_n_NAME` | *Cloud name* de la cuenta |
| `CLOUD_n_KEY` / `CLOUD_n_SECRET` | API Key y API Secret (Cloudinary → Settings → API Keys) |
| `CLOUD_n_MODE` | Opcional: `dynamic` o `fixed`. Si lo omites se detecta solo |

`n` = 1, 2, 3 (hasta 5). Solo aparecen las cuentas que tengan NAME, KEY y SECRET.

## 2. Correr en local

```bash
npm run dev
```

Abre http://localhost:5173. Para probar desde tu celular en la misma red WiFi usa la dirección *Network* que muestra Vite
(la cámara del navegador móvil abre con el botón "Tomar foto").

Pruebas del backend: `npm test`

## 3. Subir a Git y desplegar (Vercel)

```bash
git init
git add .
git commit -m "Fotos Cloudinary"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo (detecta Vite solo).
2. En **Settings → Environment Variables** agrega todas las variables de `.env`.
3. **Deploy**. Cada `git push` a `main` vuelve a desplegar.

> `.env` está en `.gitignore`: tus secrets nunca se suben a GitHub.

Netlify también sirve, pero requiere adaptar las funciones a su formato; Vercel funciona sin cambios.

## Seguridad

- Usa una contraseña larga en `APP_PASSWORD`. Cualquiera con la contraseña puede borrar imágenes de las 3 cuentas.
- Las sesiones duran 30 días; cambiar `AUTH_SECRET` cierra todas las sesiones.
- Si alguna vez un secret se filtra, regénéralo en Cloudinary y actualiza la variable.

## Notas sobre folders de Cloudinary

Cloudinary tiene dos modos: **dynamic** (cuentas nuevas, usa `asset_folder`) y **fixed** (cuentas antiguas, el folder va en el `public_id`).
La app detecta el modo de cada cuenta y usa el método correcto. En la raíz solo se listan folders: para subir hay que abrir o crear uno.

## Estructura

```
api/            Funciones serverless (login, accounts, folders, resources, delete, sign-upload)
api/_lib/       Lógica compartida (auth, cliente de Cloudinary)
src/            Frontend React
dev-api.mjs     Servidor local que emula /api para desarrollo
test/           Pruebas del backend
```
