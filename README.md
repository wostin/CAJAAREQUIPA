# CMAC Arequipa — Sistema de Información Financiera v4.0
> **React + Vite + Node.js/Express + Supabase**  
> Proyecto académico · Ingeniería de Sistemas e Informática

---

## 🚀 Instalación paso a paso

### 1. Configura los archivos .env

**backend/.env** (crea este archivo):
```
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_ANON_KEY=TU_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
PORT=3000
FRONTEND_URL=http://localhost:5173
```

**frontend/.env** (crea este archivo):
```
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

### 2. Instala dependencias

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

### 3. Abre el navegador
- Frontend: http://localhost:5173
- Backend:  http://localhost:3000/health

---

## 🗂 Estructura del proyecto

```
CajaArequipa-v4/
├── sql/
│   ├── 00_setup_supabase.sql          ← EJECUTAR PRIMERO
│   ├── 01_scoring_supabase.sql
│   ├── 02_agencias_asesores_supabase.sql
│   └── 03_seed_demo_supabase.sql
├── backend/
│   ├── .env.example                   ← Copia como .env
│   └── src/
│       ├── routes/
│       └── supabase.js
└── frontend/
    ├── .env.example                   ← Copia como .env
    └── src/
        ├── pages/
        │   ├── homebanking/
        │   └── core/
        └── context/AuthContext.jsx
```

---

## 👤 Usuarios demo

| Rol | Email | Contraseña |
|-----|-------|------------|
| Cliente | cliente1@continental.com | Demo1234! |
| Asesor | asesor1@demo.pe | Demo1234! |
| Gerente | gerente@cmac.pe | Admin1234! |

> ⚠️ Regístralos primero en /register o desde Supabase → Authentication → Users

---

## ⚙️ Configuración Supabase recomendada

- **Authentication → Sign In/Providers → Confirm email**: DESACTIVADO (para desarrollo)
- **Authentication → Users**: verificar que los usuarios tengan `confirmed_at`

