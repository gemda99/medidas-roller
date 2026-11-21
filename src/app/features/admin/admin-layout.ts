import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Panel de administración: tarifarios, catálogo, usuarios y datos de la empresa. Solo para el perfil administrador. */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="page" style="padding-bottom:0">
      <h1>Administración</h1>
      <nav class="tabs" aria-label="Secciones de administración">
        <a routerLink="tarifarios" routerLinkActive="on">Tarifarios</a>
        <a routerLink="catalogo" routerLinkActive="on">Catálogo</a>
        <a routerLink="usuarios" routerLinkActive="on">Usuarios</a>
        <a routerLink="configuracion" routerLinkActive="on">Configuración</a>
      </nav>
    </div>
    <router-outlet />
  `,
  styles: `
    .tabs { display: flex; gap: 6px; overflow-x: auto; }
    .tabs a { flex: none; min-height: 40px; padding: 0 16px; border-radius: 99px; border: 1px solid var(--line-strong); background: #fff; font: 600 14px Inter, sans-serif; color: var(--ink); text-decoration: none; display: inline-flex; align-items: center; }
    .tabs a.on { background: var(--navy); border-color: var(--navy); color: #fff; }
  `,
})
export class AdminLayout {}
