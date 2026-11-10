
const path = require("path");
const { actualizarMods } = require("./actualizador-mods");

const carpetaProyecto = path.join(__dirname, "minecraft");

let sincronizando = false;

async function sincronizar() {
  if (sincronizando) return;

  sincronizando = true;

  try {
    console.log("\n[ALEXANDER] Revisando mods de GitHub...");

    const resultado = await actualizarMods(carpetaProyecto);

    console.log(
      `[ALEXANDER] ${resultado.total} mods sincronizados.`
    );
  } catch (error) {
    console.error(
      "[ALEXANDER] Error de sincronizaci�n:",
      error.message
    );
  } finally {
    sincronizando = false;
  }
}

// Sincronizar inmediatamente
sincronizar();

// Volver a revisar GitHub cada 60 segundos
setInterval(sincronizar, 60 * 1000);
