import { Pipe, PipeTransform } from '@angular/core';
import { formatRut } from '../validation/rut';

/** '12345678-5' → '12.345.678-5'. */
@Pipe({ name: 'rut' })
export class RutPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? formatRut(value) : '';
  }
}
