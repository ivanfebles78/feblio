# Deploy de Feblio (GitHub + Railway)

El proyecto ya compila en producción (`cd frontend && npm run build`).
Estos son los pasos que debes ejecutar tú (requieren tus cuentas).

## 1. Subir a GitHub

Crea un repo vacío en https://github.com/new (recomendado **privado**, nombre `feblio`).
Luego, desde `C:\Users\ivanf\Desktop\feblio`:

```bash
git remote add origin https://github.com/<tu-usuario>/feblio.git
git branch -M main
git push -u origin main
```

## 2. Desplegar el frontend en Railway

1. Entra en https://railway.app → **New Project → Deploy from GitHub repo** → elige `feblio`.
2. En el servicio, ve a **Settings**:
   - **Root Directory:** `frontend`   ← importante (el código está en esa subcarpeta)
   - Build/Start los detecta `nixpacks.toml` automáticamente
     (build: `npm run build`, start: `serve -s dist`).
3. En **Variables**, añade:
   ```
   VITE_SUPABASE_URL=https://zpwwquujvqhlhjbvhqvd.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_U2GFocbREKHmDReH0r98yQ_aACNFHfr
   ```
   (Se usan en tiempo de build; si las cambias, redeploy.)
4. **Deploy**. Railway te dará una URL pública `https://feblio-xxxx.up.railway.app`.

## 3. (Opcional) Ajustar Supabase Auth

Usamos login por email/contraseña, así que no hace falta configurar redirects.
Si más adelante añades registro por email con confirmación, añade la URL de
Railway en **Supabase → Authentication → URL Configuration → Site URL / Redirect URLs**.

## Notas

- La clave `anon`/publishable es pública por diseño; la seguridad la impone RLS.
- `.env.local` NO se sube al repo (está en `.gitignore`). En Railway las variables
  se definen en el panel, no en el repo.
- Para desarrollo local: `cd frontend && npm install && npm run dev`.
