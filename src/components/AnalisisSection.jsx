
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

const AMARILLO = '#F2C230'
const PANEL = '#151D29'
const BORDE = '#2A3548'
const TEXTO = '#F0F2F5'
const SECUNDARIO = '#8A9BB8'
const FONDO = '#0F1419'
const CATEGORIA_ID = '438874e7-e59f-460b-bec4-3c0ef5b44016'

const TIPOS = [
  'Pase correcto',
  'Pase incorrecto',
  'Pérdida',
  'Recuperación',
  'Remate',
  'Centro',
  'Duelo ofensivo',
  'Duelo defensivo',
  'Duelo aéreo',
  'Atajada',
  'Salida de arquera',
  'Gol',
  'Falta cometida',
  'Falta recibida',
  'Intercepción',
]

const TIPOS_RAPIDOS = [
  { nombre: 'Pase correcto', corto: 'Pase +', icono: '↗', color: '#4ADE80' },
  { nombre: 'Pase incorrecto', corto: 'Pase −', icono: '↘', color: '#F87171' },
  { nombre: 'Pérdida', corto: 'Pérdida', icono: '×', color: '#F87171' },
  { nombre: 'Recuperación', corto: 'Recuperación', icono: '↺', color: '#4ADE80' },
  { nombre: 'Remate', corto: 'Remate', icono: '◎', color: '#F2C230' },
  { nombre: 'Centro', corto: 'Centro', icono: '⌁', color: '#F2C230' },
  { nombre: 'Duelo ofensivo', corto: 'Duelo of.', icono: '⚔', color: '#F2C230' },
  { nombre: 'Duelo defensivo', corto: 'Duelo def.', icono: '◆', color: '#60A5FA' },
  { nombre: 'Duelo aéreo', corto: 'Duelo aéreo', icono: '↑', color: '#60A5FA' },
  { nombre: 'Atajada', corto: 'Atajada', icono: '⊙', color: '#4ADE80' },
  { nombre: 'Salida de arquera', corto: 'Salida', icono: '↗', color: '#60A5FA' },
  { nombre: 'Gol', corto: 'Gol', icono: '⚽', color: '#F2C230' },
  { nombre: 'Falta cometida', corto: 'Falta com.', icono: '!', color: '#F87171' },
  { nombre: 'Falta recibida', corto: 'Falta rec.', icono: '+', color: '#4ADE80' },
  { nombre: 'Intercepción', corto: 'Intercepción', icono: '↯', color: '#60A5FA' },
]

const ZONAS = [
  'Defensa izquierda', 'Defensa centro', 'Defensa derecha',
  'Medio izquierda', 'Medio centro', 'Medio derecha',
  'Ataque izquierda', 'Ataque centro', 'Ataque derecha',
]

const RESULTADOS = [
  'Exitoso', 'Fallido', 'Neutro', 'Gol', 'Atajada', 'Fuera', 'Bloqueado',
]

const inputClass =
  'w-full rounded-lg border p-3 text-sm outline-none focus:ring-1 focus:ring-yellow-400'

const inputStyle = {
  backgroundColor: FONDO,
  borderColor: BORDE,
  color: TEXTO,
}

function Boton({
  children,
  onClick,
  disabled = false,
  secundario = false,
  submit = false,
}) {
  return (
    <button
      type={submit ? 'submit' : 'button'}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-4 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
      style={secundario
        ? { backgroundColor: '#202A38', color: TEXTO, border: `1px solid ${BORDE}` }
        : { backgroundColor: AMARILLO, color: '#171717' }}
    >
      {children}
    </button>
  )
}

function Campo({ label, children }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium" style={{ color: TEXTO }}>{label}</span>
      {children}
    </label>
  )
