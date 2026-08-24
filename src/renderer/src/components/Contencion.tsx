/**
 * El cortafuegos entre una pantalla rota y el resto de la aplicación.
 *
 * React no perdona un fallo mientras dibuja: si nadie lo recoge, desmonta el
 * árbol entero y la ventana se queda en blanco. Eso fue exactamente lo que pasó
 * con una fecha que no estaba —desapareció la lista, y con ella el menú lateral
 * y todo lo demás, sin forma de irse a otra pestaña—.
 *
 * Un fallo en Movimientos programados tiene que quedarse en Movimientos
 * programados. Con esto la pantalla que revienta enseña un aviso y se puede
 * seguir usando el programa por otro lado, que es la diferencia entre una
 * molestia y no poder abrir la aplicación.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Para volver a intentarlo al cambiar de pestaña: cambia la clave, se reinicia. */
  children: ReactNode
}

interface State {
  error: Error | null
}

export class Contencion extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // A la consola de la ventana, que es donde se mira cuando algo así pasa.
    console.error('Se ha roto una pantalla:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="card card-body" style={{ borderColor: 'var(--danger)' }}>
        <h2 style={{ marginTop: 0 }}>Esta pantalla no ha podido dibujarse</h2>
        <p className="muted">
          El resto de la aplicación sigue funcionando: cambia de pestaña y vuelve. Tus datos no se
          han tocado.
        </p>
        <p className="small muted" style={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
          {error.message}
        </p>
        <div className="row">
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }
}
