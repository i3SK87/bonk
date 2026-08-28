import { useEffect, useState } from 'react'
import type { EstadoActualizacion } from '@shared/types'

const api = window.bonk

/**
 * Lo que el proceso principal sabe del actualizador, aquí.
 *
 * Quien descarga es él, así que el estado bueno es el suyo y esto solo lo copia.
 * Se pregunta al montar y se escucha después: montando tarde —entrando en
 * Ajustes con la descarga a medias— el primer aviso ya habría pasado, y sin la
 * pregunta inicial la pantalla se quedaría en blanco hasta el siguiente.
 *
 * Cada quien que lo llame se trae la suya. Son cinco campos y llegan enteros en
 * cada aviso, así que dos copias no pueden decir cosas distintas: no hace falta
 * subirlo al almacén ni montarle un contexto propio.
 */
const PARADA: EstadoActualizacion = {
  fase: 'ociosa',
  version: null,
  porcentaje: 0,
  comprobadaEn: null,
  mensaje: null
}

export function useActualizacion(): EstadoActualizacion {
  const [estado, setEstado] = useState<EstadoActualizacion>(PARADA)

  useEffect(() => {
    // Si falla, se queda en parada: no saber si hay versión nueva no es un
    // problema que merezca salir a decírselo a nadie.
    api.updates.estado().then(setEstado).catch(() => undefined)
    return api.events.on('updates:changed', (detalle) =>
      setEstado(detalle as EstadoActualizacion)
    )
  }, [])

  return estado
}

/** Hay algo que enseñar: se está bajando o ya está lista. */
export function hayNovedad(estado: EstadoActualizacion): boolean {
  return estado.fase === 'descargando' || estado.fase === 'lista'
}
