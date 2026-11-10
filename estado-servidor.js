
const net = require("net");
const dns = require("dns").promises;

// ========================================
// CONFIGURACIÓN DEL SERVIDOR
// ========================================

const HOST = "ALEXANDERGGXD-QR4g.aternos.me";
const TIEMPO_ESPERA = 7000;

// ========================================
// ESCRIBIR VARINT
// ========================================

function escribirVarInt(valor) {
  const bytes = [];

  do {
    let byte = valor & 127;
    valor >>>= 7;

    if (valor !== 0) {
      byte |= 128;
    }

    bytes.push(byte);
  } while (valor !== 0);

  return Buffer.from(bytes);
}

// ========================================
// LEER VARINT
// ========================================

function leerVarInt(buffer, inicio = 0) {
  let resultado = 0;
  let desplazamiento = 0;

  for (let i = 0; i < 5; i++) {
    const posicion = inicio + i;

    if (posicion >= buffer.length) {
      return null;
    }

    const byte = buffer[posicion];

    resultado += (byte & 127) * (2 ** desplazamiento);

    if ((byte & 128) === 0) {
      return {
        valor: resultado,
        siguiente: posicion + 1
      };
    }

    desplazamiento += 7;
  }

  throw new Error("VarInt inválido");
}

// ========================================
// OBTENER DIRECCIÓN Y PUERTO
// ========================================

async function obtenerDireccion() {
  try {
    const registros = await dns.resolveSrv(
      "_minecraft._tcp." + HOST
    );

    if (registros.length > 0) {
      registros.sort((a, b) => a.priority - b.priority);

      return {
        host: registros[0].name,
        puerto: registros[0].port
      };
    }
  } catch (error) {
    console.log(
      "[DNS] No se encontró SRV:",
      error.code || error.message
    );
  }

  return {
    host: HOST,
    puerto: 25565
  };
}

// ========================================
// DETECTAR ESTADO REAL DE ATERNOS
// ========================================

function interpretarRespuesta(datosServidor) {
  const version = String(
    datosServidor.version?.name || "Desconocida"
  );

  const descripcion =
    typeof datosServidor.description === "string"
      ? datosServidor.description
      : JSON.stringify(datosServidor.description || "");

  // Eliminar códigos de colores de Minecraft
  const textoEstado = (version + " " + descripcion)
    .replace(/§[0-9a-fk-or]/gi, "")
    .toLowerCase();

  // Aternos puede responder al ping incluso apagado
  const servidorApagado = /\boffline\b/.test(textoEstado);

  if (servidorApagado) {
    console.log(
      "[ATERNOS] El proxy responde, pero el servidor está apagado."
    );

    return {
      estado: "offline",
      jugadores: 0,
      maximo: 0,
      version: version
    };
  }

  return {
    estado: "online",
    jugadores: datosServidor.players?.online ?? 0,
    maximo: datosServidor.players?.max ?? 0,
    version: version
  };
}

// ========================================
// CONSULTAR MINECRAFT DIRECTAMENTE
// ========================================

function consultarServidor(direccion) {
  return new Promise(resolve => {
    const socket = new net.Socket();

    let terminado = false;
    let buffer = Buffer.alloc(0);

    function finalizar(resultado) {
      if (terminado) return;

      terminado = true;
      socket.destroy();
      resolve(resultado);
    }

    socket.setTimeout(TIEMPO_ESPERA);

    socket.on("timeout", () => {
      finalizar({
        estado: "desconocido",
        motivo: "Tiempo de espera agotado"
      });
    });

    socket.on("error", error => {
      finalizar({
        estado:
          error.code === "ECONNREFUSED"
            ? "offline"
            : "desconocido",
        motivo: error.message
      });
    });

    socket.on("close", () => {
      finalizar({
        estado: "desconocido",
        motivo: "Conexión cerrada sin respuesta"
      });
    });

    socket.on("connect", () => {
      const host = Buffer.from(HOST, "utf8");

      const puerto = Buffer.alloc(2);
      puerto.writeUInt16BE(direccion.puerto);

      const handshake = Buffer.concat([
        escribirVarInt(0),
        escribirVarInt(47),
        escribirVarInt(host.length),
        host,
        puerto,
        escribirVarInt(1)
      ]);

      const paqueteHandshake = Buffer.concat([
        escribirVarInt(handshake.length),
        handshake
      ]);

      // Solicitud de estado de Minecraft Java
      socket.write(paqueteHandshake);
      socket.write(Buffer.from([0x01, 0x00]));
    });

    socket.on("data", datos => {
      buffer = Buffer.concat([buffer, datos]);

      if (buffer.length > 1024 * 1024) {
        finalizar({
          estado: "desconocido",
          motivo: "Respuesta demasiado grande"
        });
        return;
      }

      try {
        const longitudPaquete = leerVarInt(buffer);

        if (!longitudPaquete) return;

        const finalPaquete =
          longitudPaquete.siguiente + longitudPaquete.valor;

        if (buffer.length < finalPaquete) return;

        const id = leerVarInt(
          buffer,
          longitudPaquete.siguiente
        );

        if (!id || id.valor !== 0) {
          throw new Error("Respuesta inesperada");
        }

        const longitudJSON = leerVarInt(
          buffer,
          id.siguiente
        );

        if (!longitudJSON) return;

        const inicioJSON = longitudJSON.siguiente;
        const finalJSON = inicioJSON + longitudJSON.valor;

        if (finalJSON > finalPaquete) {
          throw new Error("JSON incompleto");
        }

        const texto = buffer
          .subarray(inicioJSON, finalJSON)
          .toString("utf8");

        const datosServidor = JSON.parse(texto);

        // Aquí detectamos si Aternos dice Offline
        const resultado = interpretarRespuesta(
          datosServidor
        );

        finalizar(resultado);

      } catch (error) {
        finalizar({
          estado: "desconocido",
          motivo: error.message
        });
      }
    });

    socket.connect(
      direccion.puerto,
      direccion.host
    );
  });
}

// ========================================
// FUNCIÓN PRINCIPAL
// ========================================

async function estadoServidor() {
  try {
    const direccion = await obtenerDireccion();

    console.log(
      "[SERVIDOR] Consultando:",
      direccion
    );

    const resultado = await consultarServidor(
      direccion
    );

    console.log(
      "[SERVIDOR] Resultado:",
      resultado
    );

    return resultado;

  } catch (error) {
    console.error(
      "[SERVIDOR] Error:",
      error
    );

    return {
      estado: "desconocido",
      motivo: error.message
    };
  }
}

module.exports = {
  estadoServidor
};
