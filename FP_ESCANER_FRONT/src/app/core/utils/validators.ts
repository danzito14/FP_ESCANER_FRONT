import { AbstractControl, FormArray, ValidatorFn } from '@angular/forms';

import { polygonAreaHectares } from './geo';

/**
 * Valida que un FormArray de vértices {lat, lng} delimite un polígono cuya
 * área esté entre `min` y `max` hectáreas. Si hay menos de 3 vértices no valida
 * (el polígono se considera "sin definir").
 */
export function areaHectareasValidator(min: number, max: number): ValidatorFn {
  return (control: AbstractControl) => {
    const coords = (control as FormArray).controls
      .map((c) => ({ lat: c.value?.lat, lng: c.value?.lng }))
      .filter((c) => c.lat != null && c.lng != null);

    if (coords.length < 3) return null;

    const ha = polygonAreaHectares(coords);
    if (ha < min) return { areaMin: { ha, min } };
    if (ha > max) return { areaMax: { ha, max } };
    return null;
  };
}
