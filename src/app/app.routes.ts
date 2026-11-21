import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards/auth.guards';
import { Shell } from './core/layout/shell';

export const routes: Routes = [
  {
    path: 'ingresar',
    canActivate: [guestGuard],
    title: 'Ingresar · Medidas Roller',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'recuperar',
    canActivate: [guestGuard],
    title: 'Recuperar contraseña · Medidas Roller',
    loadComponent: () => import('./features/auth/forgot-password.page').then((m) => m.ForgotPasswordPage),
  },
  {
    // Destino del enlace del correo de recuperación (hay sesión temporal, sin guestGuard).
    path: 'nueva-clave',
    title: 'Nueva contraseña · Medidas Roller',
    loadComponent: () => import('./features/auth/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        title: 'Inicio · Medidas Roller',
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'clientes',
        title: 'Clientes · Medidas Roller',
        loadComponent: () => import('./features/customers/customer-list.page').then((m) => m.CustomerListPage),
      },
      {
        path: 'clientes/nuevo',
        title: 'Nuevo cliente · Medidas Roller',
        loadComponent: () => import('./features/customers/customer-form.page').then((m) => m.CustomerFormPage),
      },
      {
        path: 'clientes/:id',
        title: 'Cliente · Medidas Roller',
        loadComponent: () => import('./features/customers/customer-detail.page').then((m) => m.CustomerDetailPage),
      },
      {
        path: 'rectificaciones',
        title: 'Rectificaciones · Medidas Roller',
        loadComponent: () => import('./features/rectifications/rectification-list.page').then((m) => m.RectificationListPage),
      },
      {
        path: 'rectificaciones/nueva',
        title: 'Nueva rectificación · Medidas Roller',
        loadComponent: () => import('./features/rectifications/rectification-new.page').then((m) => m.RectificationNewPage),
      },
      {
        path: 'rectificaciones/:id',
        title: 'Rectificación · Medidas Roller',
        loadComponent: () => import('./features/rectifications/rectification-detail.page').then((m) => m.RectificationDetailPage),
      },
      {
        path: 'rectificaciones/:id/cortinas/nueva',
        title: 'Nueva cortina · Medidas Roller',
        loadComponent: () => import('./features/rectifications/curtain-editor.page').then((m) => m.CurtainEditorPage),
      },
      {
        path: 'rectificaciones/:id/cortinas/:cid',
        title: 'Cortina · Medidas Roller',
        loadComponent: () => import('./features/rectifications/curtain-editor.page').then((m) => m.CurtainEditorPage),
      },
      {
        path: 'rectificaciones/:id/documentos',
        title: 'Documentos · Medidas Roller',
        loadComponent: () => import('./features/rectifications/documents.page').then((m) => m.DocumentsPage),
      },
      {
        path: 'rectificaciones/:id/cotizaciones/nueva',
        title: 'Nueva cotización · Medidas Roller',
        loadComponent: () => import('./features/quotations/quotation-editor.page').then((m) => m.QuotationEditorPage),
      },
      {
        path: 'cotizaciones/:qid',
        title: 'Cotización · Medidas Roller',
        loadComponent: () => import('./features/quotations/quotation-editor.page').then((m) => m.QuotationEditorPage),
      },
      {
        path: 'cotizaciones/:qid/imagen',
        title: 'Imagen de cotización · Medidas Roller',
        loadComponent: () => import('./features/quotations/quote-image.page').then((m) => m.QuoteImagePage),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin-layout').then((m) => m.AdminLayout),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'tarifarios' },
          {
            path: 'tarifarios',
            title: 'Tarifarios · Medidas Roller',
            loadComponent: () => import('./features/admin/price-lists.page').then((m) => m.PriceListsPage),
          },
          {
            path: 'tarifarios/:id',
            title: 'Tarifario · Medidas Roller',
            loadComponent: () => import('./features/admin/price-list-edit.page').then((m) => m.PriceListEditPage),
          },
          {
            path: 'catalogo',
            title: 'Catálogo · Medidas Roller',
            loadComponent: () => import('./features/admin/catalog-admin.page').then((m) => m.CatalogAdminPage),
          },
          {
            path: 'usuarios',
            title: 'Usuarios · Medidas Roller',
            loadComponent: () => import('./features/admin/users.page').then((m) => m.UsersPage),
          },
          {
            path: 'configuracion',
            title: 'Configuración · Medidas Roller',
            loadComponent: () => import('./features/admin/business-settings.page').then((m) => m.BusinessSettingsPage),
          },
        ],
      },
      {
        path: 'clientes/:id/editar',
        title: 'Editar cliente · Medidas Roller',
        loadComponent: () => import('./features/customers/customer-form.page').then((m) => m.CustomerFormPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
