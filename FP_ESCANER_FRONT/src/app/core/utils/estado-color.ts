/** Color asociado a cada estado o tipo (badges, chips, dots). */
export function colorEstado(valor: string): string {
  switch (valor) {
    case 'activo':
    case 'exitoso':
    case 'justificada':
    case 'entrada':
      return '#16a34a'; // verde
    case 'pendiente':
    case 'retardo':
      return '#eab308'; // amarillo
    case 'revisada':
    case 'manual':
    case 'mantenimiento':
    case 'salida_sin_registro':
    case 'entrada_sin_registro':
    case 'desconocido':
      return '#f97316'; // naranja
    case 'salida':
      return '#3b82f6'; // azul
    case 'inactivo':
    case 'suspendido':
    case 'rechazado':
    case 'fuera_de_area':
    case 'acceso_otra_empresa':
    case 'area_incorrecta':
    case 'spoofing':
    case 'otra_empresa':
    case 'falta':
    case 'cancelado':
      return '#dc2626'; // rojo
    default:
      return '#9099a5'; // gris
  }
}
