
const jugadorInput = document.getElementById("jugador");
const botonesRam = document.querySelectorAll(".ram");
const botonJugar = document.getElementById("btnJugar");
const botonCopiar = document.getElementById("btnCopiar");
const botonActualizar = document.getElementById("btnActualizar");

const mensaje = document.getElementById("mensaje");
const progreso = document.getElementById("progreso");

let modsListos = false;
let iniciandoJuego = false;

function mostrarEstadoMods(datos) {
  if (!datos) return;

  mensaje.textContent = datos.mensaje;

  if (datos.estado === "comprobando") {
    modsListos = false;
    botonJugar.disabled = true;
    progreso.style.width = "15%";
  }

  if (datos.estado === "listo") {
    modsListos = true;
    botonJugar.disabled = iniciandoJuego;
    progreso.style.width = "100%";
  }

  if (datos.estado === "error") {
    modsListos = false;
    botonJugar.disabled = true;
    progreso.style.width = "0%";
  }
}

botonJugar.disabled = true;

window.alexander.escucharMods(mostrarEstadoMods);

window.alexander.obtenerEstadoMods()
  .then(mostrarEstadoMods)
  .catch(error => {
    console.error("[MODS] No se pudo consultar el estado:", error);
    mensaje.textContent = "No se pudo comprobar el estado de los mods.";
  });


const textoServidor = document.getElementById("textoServidor");
const jugadoresServidor = document.getElementById("jugadoresServidor");
const puntoServidor = document.getElementById("puntoServidor");

const estadoCabecera = document.getElementById("estadoCabecera");
const puntoCabecera = document.getElementById("puntoCabecera");

let ramSeleccionada = Number(
  localStorage.getItem("extremo_ram") || 4
);

if (![4, 6, 8, 10, 12].includes(ramSeleccionada)) {
  ramSeleccionada = 4;
}

jugadorInput.value =
  localStorage.getItem("extremo_jugador") || "";

// GUARDAR NOMBRE

jugadorInput.addEventListener("input", () => {
  localStorage.setItem(
    "extremo_jugador",
    jugadorInput.value
  );
});

// SELECCIONAR RAM

function actualizarBotonesRam() {
  botonesRam.forEach(boton => {
    const ram = Number(boton.dataset.ram);
    boton.classList.toggle(
      "activo",
      ram === ramSeleccionada
    );
  });
}

botonesRam.forEach(boton => {
  boton.addEventListener("click", () => {
    ramSeleccionada = Number(boton.dataset.ram);

    localStorage.setItem(
      "extremo_ram",
      String(ramSeleccionada)
    );

    actualizarBotonesRam();
  });
});

actualizarBotonesRam();

// CAMBIAR ESTADO VISUAL

function cambiarEstado(estado, titulo, detalle) {
  puntoServidor.className = "punto " + estado;
  puntoCabecera.className = "punto " + estado;

  textoServidor.textContent = titulo;
  jugadoresServidor.textContent = detalle;
  estadoCabecera.textContent = titulo;
}

// COMPROBAR SERVIDOR

let consultando = false;

async function actualizarServidor() {
  if (consultando) return;

  consultando = true;

  cambiarEstado(
    "esperando",
    "Comprobando servidor...",
    "Consultando el estado"
  );

  try {
    const datos = await window.alexander.estadoServidor();

    if (datos.estado === "online") {
      cambiarEstado(
        "online",
        "Servidor en línea",
        `${datos.jugadores}/${datos.maximo} jugadores · ${datos.version}`
      );

    } else if (datos.estado === "offline") {
      cambiarEstado(
        "offline",
        "Servidor apagado",
        "No disponible actualmente"
      );

    } else {
      cambiarEstado(
        "esperando",
        "Estado desconocido",
        "No se pudo consultar el servidor"
      );
    }

  } catch (error) {
    console.error(error);

    cambiarEstado(
      "esperando",
      "Error de conexión",
      "No se pudo consultar el servidor"
    );

  } finally {
    consultando = false;
  }
}

botonActualizar.addEventListener(
  "click",
  actualizarServidor
);

actualizarServidor();

setInterval(actualizarServidor, 15000);
// COPIAR IP

botonCopiar.addEventListener("click", async () => {
  try {
    await window.alexander.copiarServidor();

    botonCopiar.textContent = "¡Copiado!";

    setTimeout(() => {
      botonCopiar.textContent = "Copiar";
    }, 1800);

  } catch (error) {
    mensaje.textContent = "No se pudo copiar la IP.";
    console.error(error);
  }
});

// RECIBIR ESTADO DEL JUEGO

window.alexander.escucharEstado(texto => {
  mensaje.textContent = String(texto);

  if (
    texto.includes("cerró") ||
    texto.startsWith("Error")
  ) {
    iniciandoJuego = false;
    botonJugar.disabled = !modsListos;
    progreso.style.width = "0%";
  }
});

// BOTÓN JUGAR

botonJugar.addEventListener("click", async () => {
  if (!modsListos || iniciandoJuego) return;

  const jugador = jugadorInput.value.trim();
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(jugador)) {
    mensaje.textContent =
      "El nombre debe tener entre 3 y 16 caracteres.";
    jugadorInput.focus();
    return;
  }
iniciandoJuego = true;
botonJugar.disabled = true;
mensaje.textContent = "Preparando Minecraft Extremo...";
progreso.style.width = "35%";

try {
  const resultado = await window.alexander.iniciarJuego({
    jugador,
    ram: ramSeleccionada
  });

  mensaje.textContent = resultado.mensaje;

  if (resultado.ok) {
    progreso.style.width = "100%";
  } else {
    iniciandoJuego = false;
    progreso.style.width = "0%";
    botonJugar.disabled = !modsListos;
  }

} catch (error) {
  console.error(error);

  iniciandoJuego = false;
  mensaje.textContent = "Error al iniciar Minecraft.";
  progreso.style.width = "0%";
  botonJugar.disabled = !modsListos;
}
});
