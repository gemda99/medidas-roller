import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LoginPage } from './login.page';

async function render(signIn: (e: string, p: string) => Promise<void>) {
  await TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [provideRouter([]), { provide: AuthService, useValue: { signIn } }],
  }).compileComponents();
  const fixture = TestBed.createComponent(LoginPage);
  await fixture.whenStable();
  return fixture;
}

describe('LoginPage', () => {
  it('no llama al servidor si el formulario está incompleto y muestra los errores', async () => {
    const calls: string[] = [];
    const fixture = await render(async (e) => void calls.push(e));
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(calls.length).toBe(0);
    expect(text).toContain('Escribe un correo válido.');
    expect(text).toContain('Escribe tu contraseña.');
  });

  it('muestra el error traducido si las credenciales no coinciden', async () => {
    const fixture = await render(() => Promise.reject({ message: 'Invalid login credentials' }));
    fixture.componentInstance.form.setValue({ email: 'a@b.cl', password: 'x' });
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('El correo o la contraseña no coinciden.');
  });

  it('al ingresar navega a la ruta pedida', async () => {
    const fixture = await render(() => Promise.resolve());
    const router = TestBed.inject(Router);
    const nav: string[] = [];
    router.navigateByUrl = ((u: string) => (nav.push(u), Promise.resolve(true))) as typeof router.navigateByUrl;
    fixture.componentInstance.form.setValue({ email: 'a@b.cl', password: 'secreta' });
    await fixture.componentInstance.submit();
    expect(nav).toEqual(['/']);
  });
});
