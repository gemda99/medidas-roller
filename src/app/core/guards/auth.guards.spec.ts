import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { adminGuard, authGuard, guestGuard } from './auth.guards';

function setup(loggedIn: boolean, admin: boolean) {
  const fake = {
    init: () => Promise.resolve(),
    isLoggedIn: signal(loggedIn),
    isAdmin: signal(admin),
  };
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: fake }] });
  return TestBed.inject(Router);
}

const run = (guard: typeof authGuard, url = '/clientes') =>
  TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  ) as Promise<boolean | UrlTree>;

describe('guards', () => {
  it('authGuard deja pasar con sesión', async () => {
    setup(true, false);
    expect(await run(authGuard)).toBe(true);
  });

  it('authGuard sin sesión manda a ingresar y recuerda la ruta', async () => {
    const router = setup(false, false);
    const res = (await run(authGuard, '/clientes/abc')) as UrlTree;
    expect(router.serializeUrl(res)).toBe('/ingresar?volver=%2Fclientes%2Fabc');
  });

  it('adminGuard bloquea a un medidor', async () => {
    const router = setup(true, false);
    const res = (await run(adminGuard)) as UrlTree;
    expect(router.serializeUrl(res)).toBe('/');
  });

  it('adminGuard deja pasar al administrador', async () => {
    setup(true, true);
    expect(await run(adminGuard)).toBe(true);
  });

  it('guestGuard manda al inicio si ya hay sesión', async () => {
    const router = setup(true, false);
    const res = (await run(guestGuard)) as UrlTree;
    expect(router.serializeUrl(res)).toBe('/');
  });
});
