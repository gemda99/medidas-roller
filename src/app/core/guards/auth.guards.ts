import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/** Exige sesión activa. Los guards solo ocultan pantallas: la protección real es RLS. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.isLoggedIn() ? true : router.createUrlTree(['/ingresar'], { queryParams: { volver: state.url } });
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  if (!auth.isLoggedIn()) return router.createUrlTree(['/ingresar']);
  return auth.isAdmin() ? true : router.createUrlTree(['/']);
};

/** Para login y recuperación: si ya hay sesión, va al inicio. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.isLoggedIn() ? router.createUrlTree(['/']) : true;
};
