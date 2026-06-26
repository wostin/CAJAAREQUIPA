# Fotos reales del Login (hero)

El Login usa una **foto real de personas** detrás del panel azul, igual que la
web de Caja Arequipa. El orden de carga es:

1. **Tu foto local** (recomendado): coloca aquí un archivo llamado
   `login-hero.jpg` (o `.png`). Se mostrará automáticamente.
   - Ruta: `frontend/public/img/login-hero.jpg`
   - Recomendado: foto horizontal, mínimo 1000 px de ancho, de emprendedores
     o personas (la capa azul oscurece la parte izquierda para que el texto se lea).
2. **Respaldo Unsplash** (licencia libre): si no existe la local, se carga una
   foto de Unsplash definida en `HERO_FALLBACK` dentro de `src/pages/Login.jsx`.
3. **Degradado azul**: si ninguna foto carga, queda el azul marino de marca.

## Cómo poner tu propia foto
- Descarga una foto libre de derechos (por ejemplo de https://unsplash.com o
  https://www.pexels.com buscando "emprendedor", "negocio", "equipo") **o** usa
  una foto propia/de la institución.
- Renómbrala a `login-hero.jpg` y déjala en esta carpeta.
- Listo: no hay que tocar código.

## Cambiar el respaldo Unsplash
Edita la constante `HERO_FALLBACK` en `frontend/src/pages/Login.jsx` con la URL
que prefieras.

> Nota: para uso académico hotlinkear Unsplash está bien. Para producción real,
> usa fotos con licencia confirmada o propias y guárdalas en esta carpeta.

---

## Fotos de la página índice "Nosotros" (Landing)

La página pública institucional (`src/pages/Landing.jsx`) usa 3 fotos, con el
mismo sistema (local → Unsplash → color de respaldo). Coloca aquí tus archivos:

- `nosotros-hero.jpg`    → foto del banner superior (persona / emprendedor)
- `nosotros-valores.jpg` → foto de la sección "Nuestros valores"
- `nosotros-agencia.jpg` → foto de una agencia / local (sección "Nacimiento")

Si no los pones, se cargan fotos de Unsplash (licencia libre) definidas en el
objeto `IMG` de `Landing.jsx`. Cámbialas ahí si quieres otras URLs.
