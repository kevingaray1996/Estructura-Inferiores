import EstadoContenido from '../ui/EstadoContenido'

export default function DocumentosPerfil({ onPDF, onWellnessPDF, generandoWellness, errorWellnessPDF, fuentesConError }) {
  return <div className="perfil-documentos"><h2>Documentos y exportaciones</h2><p>Los documentos conservan su formato y sus datos actuales. No se crea un repositorio de archivos.</p>
    {fuentesConError && <p role="alert">Hay fuentes con errores o acceso insuficiente. Revisá qué secciones están disponibles antes de exportar; el PDF usa la información cargada.</p>}
    <article><h3>PDF configurable del perfil</h3><p>Conserva las diez secciones seleccionables existentes.</p><button type="button" className="perfil-primario" onClick={onPDF}>Descargar PDF del perfil</button></article>
    {onWellnessPDF && <article><h3>Wellness · últimos 7 días</h3><p>Exportación semanal existente, con su propia lectura de datos y comparación de períodos.</p><button type="button" disabled={generandoWellness} onClick={onWellnessPDF}>{generandoWellness ? 'Generando…' : 'Descargar PDF semanal de Wellness'}</button></article>}
    {errorWellnessPDF && <EstadoContenido estado="error" titulo="No se pudo generar el PDF de Wellness" mensaje={errorWellnessPDF} />}
  </div>
}
