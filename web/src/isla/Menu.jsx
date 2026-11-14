import Icon from './Icon.jsx'

// Menú de apartados de una pantalla (Convocatorias, Empresas, Perfil): mismo aspecto en todas.
// items: [{id, icono, texto, punto?, separador?}] · separador: línea fina antes de ese elemento.
export default function Menu({ items, valor, onChange, etiqueta, tabs = false }) {
  return (
    <nav className="i-menu" aria-label={etiqueta} role={tabs ? 'tablist' : undefined}>
      {items.map(x => (
        <span key={x.id} style={{ display: 'contents' }}>
          {x.separador && <i className="sep" aria-hidden="true" />}
          <button className={valor === x.id ? 'on' : ''} role={tabs ? 'tab' : undefined} aria-selected={tabs ? valor === x.id : undefined} aria-current={!tabs && valor === x.id ? 'page' : undefined} onClick={() => onChange(x.id)}>
            <Icon n={x.icono} s={21} /><span className="t">{x.texto}</span>
            {x.punto && <i className="pt" title="Cambios sin guardar" aria-label="Cambios sin guardar" />}
          </button>
        </span>
      ))}
    </nav>
  )
}
