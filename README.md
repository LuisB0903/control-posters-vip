# Control de Pósters · C. VIP Galerías Santa Anita

Sitio web para controlar todo el material publicitario del conjunto:

- **Inventario** de pósters, standees, publicidad del cine, banners (y las categorías que agregues), con **versión** y **cantidad de piezas iguales**. Cada pieza tiene su ubicación: Bodega, Taquilla, Lobby, Gerencia, Pasillo 1-3, Pasillo 4-10 o Sala #.
- **Imágenes automáticas** desde TMDB (todas las versiones del póster), con respaldo de Google Imágenes, pegar un enlace o tomar una foto.
- **Sugeridor semanal**: lee el PDF del _Cronograma de Punto de Venta_, arma la taquilla con los estrenos (si no hay póster, pasa al siguiente; si faltan, rellena con taquilleras), coloca las salas, el lobby y los pasillos sin repetir pósters, y te da la **lista de movimientos** ("quitar X del Pasillo 4-10 → llevar a Taquilla").
- **Página para cinepolitos**: apartan pósters de películas que ya salieron, con su ID de empleado.
- **Entregas** con constancia imprimible para firmar (Gerente General y empleado).
- **Bitácora**: cada movimiento queda registrado con el administrador que lo hizo.

---

## Índice de la guía

1. [Lo que necesitas](#1-lo-que-necesitas)
2. [Crear el proyecto](#2-crear-el-proyecto)
3. [Crear la base de datos en Firebase](#3-crear-la-base-de-datos-en-firebase)
4. [Obtener la clave de TMDB (imágenes de pósters)](#4-obtener-la-clave-de-tmdb)
5. [Probar en tu computadora](#5-probar-en-tu-computadora)
6. [Publicar en GitHub Pages](#6-publicar-en-github-pages)
7. [Primeros pasos dentro del sistema](#7-primeros-pasos-dentro-del-sistema)
8. [Uso de cada semana](#8-uso-de-cada-semana)
9. [Cómo decide el sugeridor](#9-cómo-decide-el-sugeridor)
10. [Estructura de archivos](#10-estructura-de-archivos)
11. [Problemas comunes](#11-problemas-comunes)

---

## 1. Lo que necesitas

| Herramienta                              | Para qué                              | Cómo comprobar             |
| ---------------------------------------- | ------------------------------------- | -------------------------- |
| **Node.js 18 o más nuevo**               | Instalar y compilar el proyecto       | En una terminal: `node -v` |
| **Git**                                  | Subir el código a GitHub              | `git --version`            |
| **Cuenta de GitHub**                     | Hospedar el sitio (GitHub Pages)      | —                          |
| **Cuenta de Google** (la personal sirve) | Firebase: la base de datos compartida | —                          |
| **Cuenta de TMDB** (gratis)              | Búsqueda automática de pósters        | —                          |
| **Visual Studio Code** (recomendado)     | Editar archivos                       | —                          |

> ¿Por qué Firebase? GitHub Pages solo sirve páginas, no guarda datos. Para que los cinepolitos aparten desde su celular y tú lo veas en el panel, se necesita una base de datos en línea. Firebase es de Google, el plan gratuito (Spark) alcanza de sobra para este uso y **el sitio sigue hospedado en GitHub Pages**.

---

## 2. Crear el proyecto

### Opción A (recomendada): usar el ZIP

1. Descomprime `control-posters-vip.zip` donde guardas tus proyectos (por ejemplo `Documentos/Proyectos/`).
2. Abre la carpeta `control-posters-vip` en Visual Studio Code (**Archivo → Abrir carpeta**).
3. Abre la terminal integrada (**Terminal → Nueva terminal**) y ejecuta:

```bash
npm install
```

Esto descarga React, Firebase, el lector de PDF y el lector de texto (OCR). Tarda uno o dos minutos y crea la carpeta `node_modules` y el archivo `package-lock.json`.

### Opción B: crearlo totalmente desde cero

Si quieres ver cómo se arma desde el inicio:

```bash
# 1. Crear un proyecto React + TypeScript con Vite
npm create vite@latest control-posters-vip -- --template react-ts
cd control-posters-vip

# 2. Instalar las librerías que usa el sistema
npm install firebase react-router-dom@6 tesseract.js@5 pdfjs-dist@3.11.174

# 3. Borrar el contenido de ejemplo de la carpeta src/
#    y copiar ahí la carpeta src/ del ZIP (y también: index.html, vite.config.ts,
#    tsconfig.json, firestore.rules, public/favicon.svg y .github/workflows/deploy.yml)
```

> Si Vite te creó `tsconfig.app.json` y `tsconfig.node.json`, puedes borrarlos y usar el `tsconfig.json` del ZIP.

---

## 3. Crear la base de datos en Firebase

### 3.1 Crear el proyecto

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Crear un proyecto** (Add project) → nombre: `control-posters-vip` → puedes desactivar Google Analytics → **Crear**.

### 3.2 Registrar la app web y copiar la configuración

1. En la página principal del proyecto, haz clic en el ícono **`</>`** (Web).
2. Apodo: `posters-web`. **No** marques "Firebase Hosting". → **Registrar app**.
3. Te mostrará un bloque así:

```js
const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "control-posters-vip.firebaseapp.com",
  projectId: "control-posters-vip",
  storageBucket: "control-posters-vip.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef...",
};
```

4. Abre el archivo **`src/firebase-config.ts`** del proyecto y reemplaza los valores de ejemplo con los tuyos. Guarda el archivo.

> Estos datos **no son secretos** (Firebase está diseñado para que vayan en el navegador). Lo que protege la información son las **reglas** del paso 3.5.

### 3.3 Activar el inicio de sesión

1. Menú izquierdo → **Compilación (Build) → Authentication** → **Comenzar**.
2. Pestaña **Método de acceso (Sign-in method)** → **Correo electrónico/contraseña** → **Habilitar** → Guardar.

> Los administradores entran con **ID + contraseña**. Internamente el sistema lo convierte a un correo ficticio (`ID@posters.example.com`), por eso se usa este método. No se envían correos.

### 3.4 Crear la base de datos Firestore

1. Menú izquierdo → **Compilación → Firestore Database** → **Crear base de datos**.
2. Ubicación: la que te sugiera (por ejemplo `nam5 (United States)`). **No se puede cambiar después.**
3. Elige **Iniciar en modo de producción** → **Crear**.

### 3.5 Pegar las reglas de seguridad

1. En Firestore → pestaña **Reglas (Rules)**.
2. Borra todo lo que haya y pega el contenido completo del archivo **`firestore.rules`** del proyecto.
3. **Publicar**.

Estas reglas hacen que:

- Solo los administradores activos puedan modificar el inventario, ver apartados, empleados y la bitácora.
- Los cinepolitos (sin iniciar sesión) solo puedan **ver** los pósters publicados y **crear** un apartado con un ID de empleado que exista, una sola vez por póster, sin poder cancelarlo ni ver cuántos lo apartaron.

### 3.6 Autorizar el dominio de GitHub Pages

1. **Authentication → Configuración (Settings) → Dominios autorizados (Authorized domains)**.
2. **Agregar dominio** → escribe `TU-USUARIO.github.io` (tu usuario de GitHub, sin `https://` ni rutas).

`localhost` ya viene autorizado para las pruebas en tu computadora.

---

## 4. Obtener la clave de TMDB

TMDB (The Movie Database) es una base de datos gratuita de películas con pósters oficiales en español y **varias versiones por película**, que es justo lo que necesitamos para registrar versiones.

> Nota: la API de búsqueda de Google ya no acepta clientes nuevos y deja de funcionar el 1 de enero de 2027, por eso se usa TMDB. El botón **"Google Imágenes ↗"** sigue disponible para abrir la búsqueda y pegar el enlace a mano.

1. Crea una cuenta en <https://www.themoviedb.org/signup> y confirma tu correo.
2. Entra a tu perfil → **Configuración (Settings) → API**.
3. Solicita una clave: tipo **Developer** / uso **personal**. Llena el formulario (nombre de la app: "Control de pósters", URL: tu futura página de GitHub o `http://localhost`).
4. Copia la **API Key** (32 caracteres) _o_ el **API Read Access Token** (el largo). Cualquiera de los dos funciona.
5. La pegarás dentro del sistema en **Configuración → Búsqueda de pósters (TMDB)** (paso 7). No va en el código.

---

## 5. Probar en tu computadora

```bash
npm run dev
```

Abre la dirección que aparece (normalmente <http://localhost:5173>).

- `http://localhost:5173/#/` → página de **cinepolitos**.
- `http://localhost:5173/#/admin` → **panel de administración**.

### Crear el primer administrador

La primera vez entra a **`#/admin/configuracion-inicial`** (o en el login aparece el enlace "Crea el primero aquí"):

1. Escribe tu **ID** (con este vas a iniciar sesión), tu **nombre** y una **contraseña** (mínimo 6 caracteres).
2. **Crear administrador**. Entrarás directo al panel.

> Esa pantalla solo funciona **una vez**. Los demás administradores se crean desde **Administradores** dentro del panel.

Para detener el servidor de pruebas: `Ctrl + C` en la terminal.

---

## 6. Publicar en GitHub Pages

### 6.1 Crear el repositorio

1. En GitHub → **New repository** → nombre: `control-posters-vip` → **Public** (GitHub Pages gratuito requiere repositorio público) → **Create repository** (sin README).

### 6.2 Subir el código

En la terminal, dentro de la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Control de pósters VIP"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/control-posters-vip.git
git push -u origin main
```

### 6.3 Activar GitHub Pages

1. En el repositorio → **Settings → Pages**.
2. En **Build and deployment → Source** elige **GitHub Actions**.
3. Ve a la pestaña **Actions**: verás "Publicar en GitHub Pages" corriendo. Cuando tenga ✅ (1–2 minutos), tu sitio estará en:

```
https://TU-USUARIO.github.io/control-posters-vip/
```

- Cinepolitos: `https://TU-USUARIO.github.io/control-posters-vip/#/`
- Administración: `https://TU-USUARIO.github.io/control-posters-vip/#/admin`

### 6.4 Actualizar el sitio después

Cada vez que cambies algo:

```bash
git add .
git commit -m "Descripción del cambio"
git push
```

GitHub vuelve a publicar solo.

> ¿Es seguro que el repositorio sea público? Sí: no contiene contraseñas. La configuración de Firebase es pública por diseño; los datos están protegidos por las reglas, y la clave de TMDB se guarda en la base de datos (solo la ven los administradores), no en el código.

---

## 7. Primeros pasos dentro del sistema

Haz esto una sola vez, en este orden:

1. **Configuración**
   - Nombre del conjunto: `C. VIP Galerías Santa Anita` (ya viene).
   - **Nombre de quien firma** y **cargo** (Gerente General): salen en la constancia de entrega.
   - Pega la **clave de TMDB** → **Probar** → **Guardar clave**.
   - **Espacios físicos**: ya vienen 27 carteleras en el pasillo 1-3 (salas 1, 2, 3) y 43 en el 4-10 (salas 4 a 10), taquilla 4, lobby 2, gerencia 2. Ajusta los standees si hace falta.
   - **Categorías**: puedes agregar más (por ejemplo "Display de piso"). El **uso** le dice al sugeridor dónde puede ir ese material.
2. **Administradores** → crea a los demás administradores (ID, nombre y contraseña inicial).
3. **Empleados** → **Importar desde PDF de horarios**: sube el reporte semanal del sistema (el mismo PDF de horarios, por ejemplo `SA1224_46_….pdf`). Se leen los ID y nombres (con tu PDF de la semana 46 se leen los 38). Repite cuando haya personal nuevo.
4. **Inventario** → **Registrar material** para cada póster que tengas:
   - Elige la categoría, escribe el título → **Buscar en TMDB** → elige la película → elige la imagen de la versión.
   - **Versión**: como viene en el paquete (v1, v2, v3…). Si la película ya existe, se sugiere la siguiente versión.
   - **Cantidad** de piezas iguales y **ubicación** actual.
   - Si llega una versión nueva y la anterior está colocada, aparece el aviso **"Hay que cambiar pósters"** con el lugar exacto. El aviso sigue en **Inicio** hasta que muevas la versión vieja.
   - Marca como **Taquillera** las películas fuertes que siguen en cartelera: sirven para rellenar taquilla.
5. Comparte con los cinepolitos el enlace que aparece en **Inicio → Enlace para cinepolitos**.

---

## 8. Uso de cada semana

### 8.1 Sugeridor semanal

1. **Cronograma**: sube el PDF (`Cronograma_VIP___SEM_46.pdf`). La semana se detecta del nombre del archivo. El lector tarda alrededor de un minuto; la primera vez descarga el idioma español (~2 MB).
2. **Revisar listas**: verás 7 pestañas (Semana de estrenos, Prioridades VIP, Apoyo especial, Garantía, Lobby y pasillos, Standees, Banners). En cada fila:
   - Corrige el texto si el lector se equivocó.
   - Elige la película del inventario (casi siempre ya viene elegida).
   - En **Estrenos**, desmarca "Se exhibe" si el conjunto no la va a tener.
   - Si registras películas nuevas mientras tanto, usa **Volver a buscar coincidencias**.
3. **Salas y opciones**: asigna la película (o películas) de cada sala. **Copiar de la semana anterior** te ahorra trabajo. Activa **"No repetir en ninguno de los 2 pasillos"** si quieres que los pasillos se vean distintos.
4. **Sugerencia**: revisa taquilla, standees, lobby, salas y pasillos, los avisos y la tabla de movimientos.
   - **🖨 Imprimir hoja**: lista con casillas para el equipo que coloca.
   - **✓ Aplicar al inventario**: actualiza la ubicación de cada pieza y guarda la semana en el historial.

### 8.2 Película que sale de cartelera → cinepolitos

En **Inventario**, cambia el estado de la película a **"Salió de cartelera"**. Sus materiales se publican en la página de cinepolitos con la **fecha de entrega o desecho: un mes exacto** después.

Los cinepolitos entran a la página, escriben su **ID de empleado**, eligen el material y confirman. Cada tarjeta indica qué es (**Póster, Standee grande, Standee pequeño…**). **Cada uno solo una vez, sin poder cancelar y sin ver cuántos lo apartaron.**

### 8.3 Seleccionar, entregar y generar la constancia

Estados de un apartado:

| Estado           | Qué significa                                   | Qué ve el cinepolito                                                                                              |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Apartado**     | Lo pidió; aún no se decide                      | "Ya lo apartaste"                                                                                                 |
| **Seleccionado** | Ustedes decidieron dárselo; falta que lo recoja | Al poner su ID: aviso _"Tienes un material por ser entregado… Acércate con Atziri, Andre o Luis para su entrega"_ |
| **Entregado**    | Ya se le dio y firmó                            | "Ya se te entregó"                                                                                                |
| **No entregado** | No se le dio (o se desechó)                     | —                                                                                                                 |

Las personas del aviso se cambian en **Configuración → Quién entrega el material**.

**Orden de llegada (turnos):** cada apartado recibe un turno según quién lo apartó primero. Los primeros, hasta completar las piezas que hay, quedan **"Apartado #N"** (alcanzan pieza, resaltados en verde en el panel). Los demás quedan **"En fila #N"**: al apartar se les avisa que ya no hay piezas suficientes, y se les entrega solo si alguien de antes no lo recibe y gerencia los selecciona. Si un apartado pasa a "No entregado", los que siguen avanzan en la fila. La lista de apartados del panel se muestra de los más antiguos a los más recientes.

**Al entregar, la pieza sale del inventario automáticamente** (queda en el historial y en la constancia). Si ya no quedan piezas, el material desaparece de la página de cinepolitos. Lo único manual es **desechar**.

**Apartados y entregas**:

- **Apartados**: tabla con filtros por cinepolito, póster, estado y fecha límite; puedes agrupar y **descargar CSV**.
- **Por póster**: quién apartó cada uno, piezas disponibles y fecha. Clic en un nombre → te lleva a entregar.
- **Entregar**: elige al cinepolito y marca su material. **★ Marcar como seleccionado** le activa el aviso en la página. Cuando venga, **Entregar y generar constancia** (los seleccionados ya vienen marcados) → se abre la impresión. Elige **"Guardar como PDF"** o imprime directamente. La constancia lleva: nombre del conjunto, fecha de entrega, ID y nombre del empleado, la lista de pósters y las líneas de firma de la Gerente General (con nombre y cargo) y del empleado.
- Cuando pasa la fecha, **Desechar restantes** (manual): marca las piezas que quedan como desechadas y los apartados abiertos (apartados o seleccionados) como "No entregado".
- **Entregas realizadas**: historial con botón para reimprimir.

---

## 9. Cómo decide el sugeridor

**Taquilla (4)**

1. Toma la lista **Semana de estrenos** en orden. Si no hay póster de una película (o no se exhibe), pasa a la siguiente.
2. Si no se completan los 4, rellena con películas marcadas como **Taquillera** que siguen **En cartelera**.
3. Si la película está en la lista de **Garantía Cinépolis**, avisa que lleve el sello (solo aplica en taquilla).
4. Si el póster estaba en un pasillo, el movimiento dice exactamente de qué pasillo se quita.

**Salas** (1 cartelera por sala)

- **Sala con una sola película:** lleva el póster de esa película. Si la película está sola en varias salas (incluso del mismo pasillo), lleva póster en todas mientras alcancen las piezas; donde ya no alcance, va publicidad del cine.
- **Sala compartida:** lleva el póster de la **otra** película (la que no se repite en otras salas). Si no hay de esa, intenta con las demás películas de la sala.
- Las salas con una sola película se surten primero. Ejemplo con _Yo Soy Rocky_ sola en sala 4 y compartida en sala 5:
  - Hay póster de las dos → sala 4: Rocky · sala 5: la otra película.
  - No alcanza Rocky para ambas → igual: sala 4 Rocky, sala 5 la otra.
  - No hay de Rocky → sala 4: publicidad del cine · sala 5: la otra.
  - No hay de ninguna → publicidad del cine en ambas.
- La regla de "no repetir en el mismo pasillo" **no aplica a las salas**.

**Zonas vigiladas: Lobby (2) y Gerencia (2)**

- Son las carteleras que vigila la cámara. Gerencia está físicamente en el pasillo 1-3: sus 2 carteleras cuentan dentro de las 27 de ese pasillo (quedan 27 − 3 salas − 2 gerencia = **22 libres**) y no se repite el mismo póster en gerencia y en el pasillo 1-3 (se puede cambiar en Configuración).
- Primero van los materiales marcados como **propensos a robo** (escudo 🛡 en Inventario o al registrar). Estos **nunca** se colocan en pasillos; si no caben en lobby ni gerencia, se quedan en bodega con aviso. En una sala solo se usan si es el único póster de esa película.
- Después, las películas próximas con mayor prioridad y, si sobra espacio, publicidad del cine.

**Lobby y pasillos (resto)**

- Solo entran películas **Próximamente**. Quedan fuera las que ya están en cartelera, las que se estrenan esta semana y las que están en salas.
- Orden de preferencia (no estricto): Prioridades VIP → Apoyo especial → Cajas de luz lobby y pasillos → el resto por fecha de estreno.
- **Nunca se repite el mismo póster en el mismo pasillo** (las versiones de una misma película cuentan como el mismo póster).
- Espacios libres por pasillo = carteleras totales − salas (pasillo 1-3: 27 − 3 = 24; pasillo 4-10: 43 − 7 = 36).
- Con **"No repetir en ninguno de los 2 pasillos"**: primero cada película en un solo pasillo; si faltan, publicidad del cine; si aún faltan, se repite **pero en el otro pasillo**.
- Siempre se usa la **versión más nueva**.

**Standees**

- Grandes: solo los de la lista **Standees básicos** del cronograma, en orden, a taquilla (hasta el número configurado).
- Pequeños: primero a taquilla (cantidad configurada) y los restantes al lobby.

**Semana actual:** el sistema cambia de semana el día y hora de **Configuración → Cambio de semana automático** (por defecto martes 8:00 p.m.). En el sugeridor la semana y el año se eligen con listas desplegables (hasta la 52, o la 53 en los años que la tienen, como 2026).

---

## 10. Estructura de archivos

```
control-posters-vip/
├── .github/workflows/deploy.yml   ← publica en GitHub Pages en cada push
├── firestore.rules                ← reglas de seguridad (se pegan en Firebase)
├── index.html
├── package.json
├── vite.config.ts
├── public/favicon.svg
└── src/
    ├── firebase-config.ts         ← ⚠️ aquí va TU configuración de Firebase
    ├── firebase.ts                ← conexión a Firebase
    ├── types.ts                   ← tipos de datos y valores por defecto
    ├── styles.css                 ← diseño (modo claro y oscuro)
    ├── App.tsx                    ← rutas
    ├── context/                   ← sesión y datos en tiempo real
    ├── components/                ← piezas reutilizables (modales, hoja de entrega…)
    ├── lib/
    │   ├── sugeridor.ts           ← reglas de colocación
    │   ├── parseCronograma.ts     ← separa las listas del cronograma
    │   ├── ocr.ts / pdf.ts        ← lectura del PDF en el navegador
    │   ├── parseEmpleados.ts      ← lectura del PDF de horarios
    │   ├── tmdb.ts                ← búsqueda de pósters
    │   └── acciones.ts            ← escrituras a la base de datos + bitácora
    └── pages/                     ← cada pantalla del sistema
```

**Colecciones en Firestore:** `peliculas`, `materiales` (con sus piezas), `empleados`, `apartados`, `entregas`, `semanas`, `movimientos`, `admins`, `config`.

---

## 11. Problemas comunes

| Problema                                      | Solución                                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Pantalla "Falta configurar Firebase"          | No pegaste la configuración en `src/firebase-config.ts`.                                                                            |
| Al iniciar sesión: `auth/unauthorized-domain` | Agrega `TU-USUARIO.github.io` en Authentication → Dominios autorizados (paso 3.6).                                                  |
| "No tienes permiso para esta acción"          | Revisa que pegaste y **publicaste** `firestore.rules`, y que tu administrador esté activo.                                          |
| `auth/operation-not-allowed`                  | No habilitaste Correo/contraseña (paso 3.3).                                                                                        |
| La página publicada sale en blanco            | Revisa la pestaña **Actions** de GitHub: si hay ❌, abre el error. Asegúrate de que Pages use **GitHub Actions** como fuente.       |
| "La clave de TMDB no es válida"               | Copia de nuevo la API Key o el token desde themoviedb.org → Settings → API.                                                         |
| El lector del cronograma no encontró nada     | Usa **Capturar listas a mano**, o revisa "Ver texto leído del PDF" para ver qué detectó.                                            |
| Un cinepolito dice "No encontramos ese ID"    | Importa el PDF de horarios más reciente o agrégalo a mano en **Empleados**.                                                         |
| Olvidaste la contraseña de un administrador   | Otro administrador lo desactiva y crea uno nuevo con otro ID. (Para borrar el usuario viejo: Firebase → Authentication → Usuarios.) |

---

### Límites del plan gratuito de Firebase (Spark)

Firestore gratis permite 50,000 lecturas, 20,000 escrituras y 1 GB de almacenamiento. Las lecturas y escrituras se reinician cada día. Para un conjunto es más que suficiente.
