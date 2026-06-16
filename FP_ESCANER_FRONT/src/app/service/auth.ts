import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';

import { API_URL } from '../core/constants/api';
import { LoginRequest, LoginResponse } from '../core/interfaces/auth';
import { Usuario, UsuarioMe } from '../core/interfaces/usuario';
import { expandirScopes } from '../core/utils/scopes';

const TOKEN_KEY = 'access_token';
const USER_KEY = 'usuario';
const SCOPES_KEY = 'scopes';
/** Empresa reservada para el super-admin (ve todas las empresas). */
const EMPRESA_SUPERADMIN = 99;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Usuario autenticado actual (null si no hay sesión). */
  readonly currentUser = signal<Usuario | null>(this.readUser());
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  /** Super-admin (empresa 99): ve y opera todas las empresas. Tolera string/number. */
  readonly esAdmin = computed(() => Number(this.currentUser()?.empresa) === EMPRESA_SUPERADMIN);
  /** Empresa del usuario logueado (null si no hay sesión). */
  readonly empresaActual = computed(() => this.currentUser()?.empresa ?? null);
  /** Scopes del usuario (ej. '*', '*:read', 'asistencias:read'). Fuente: GET /usuarios/me. */
  readonly scopes = signal<string[]>(this.readScopes());
  /**
   * Puede ver el panel/dashboard de inicio: super-admin o quien pueda leer
   * asistencias/incidencias (incluye comodines '*' y '*:read').
   */
  readonly puedeVerDashboard = computed(
    () =>
      this.esAdmin() ||
      this.tieneScope('asistencias:read') ||
      this.tieneScope('incidencias:read'),
  );

  constructor() {
    // Al iniciar (si ya hay sesión), rehidrata usuario + scopes con /usuarios/me.
    // Se difiere para que el constructor termine antes de disparar HTTP (evita el
    // ciclo con el interceptor, que a su vez inyecta AuthService).
    if (this.isBrowser && this.token) queueMicrotask(() => this.cargarMe().subscribe());
  }

  /** POST /usuarios/login — luego carga usuario+scopes (/me) antes de completar (para los guards). */
  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_URL}/usuarios/login`, credentials).pipe(
      tap((res) => this.setSession(res)),
      switchMap((res) => this.cargarMe().pipe(map(() => res))),
    );
  }

  logout(): void {
    if (this.isBrowser) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(SCOPES_KEY);
    }
    this.currentUser.set(null);
    this.scopes.set([]);
  }

  /** ¿El usuario tiene el scope dado? Considera comodines '*', '*:accion' y 'recurso:*'. */
  tieneScope(scope: string): boolean {
    const sc = this.scopes();
    if (sc.includes('*') || sc.includes(scope)) return true;
    const [recurso, accion] = scope.split(':');
    return !!accion && (sc.includes(`*:${accion}`) || sc.includes(`${recurso}:*`));
  }

  /** Permiso de lectura sobre un recurso (ej. 'usuarios'). */
  puedeLeer(recurso: string): boolean {
    return this.tieneScope(`${recurso}:read`);
  }

  /** Permiso de creación/edición sobre un recurso. */
  puedeEscribir(recurso: string): boolean {
    return this.tieneScope(`${recurso}:write`);
  }

  /** Permiso de borrado sobre un recurso (solo el comodín '*' o '<recurso>:delete'). */
  puedeBorrar(recurso: string): boolean {
    return this.tieneScope(`${recurso}:delete`);
  }

  /** Puede usar el scanner de reconocimiento facial. */
  readonly puedeUsarScanner = computed(() => this.tieneScope('scanner:use'));

  /**
   * Envuelve un listado auxiliar: si el usuario no puede leer ese recurso,
   * devuelve `of([])` y NO dispara la petición (evita 403). `list()` es frío,
   * así que el observable recibido no se ejecuta si no se suscribe.
   */
  listarSiPuede<T>(recurso: string, obs: Observable<T[]>): Observable<T[]> {
    return this.puedeLeer(recurso) ? obs : of<T[]>([]);
  }

  /** Como listarSiPuede pero pasa si tiene CUALQUIERA de los scopes dados. */
  listarSiAlguno<T>(scopes: string[], obs: Observable<T[]>): Observable<T[]> {
    return scopes.some((s) => this.tieneScope(s)) ? obs : of<T[]>([]);
  }

  get token(): string | null {
    return this.isBrowser ? localStorage.getItem(TOKEN_KEY) : null;
  }

  private setSession(res: LoginResponse): void {
    if (this.isBrowser) {
      localStorage.setItem(TOKEN_KEY, res.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.usuario));
    }
    this.currentUser.set(res.usuario);
    // Fail-closed: descarta scopes de una sesión anterior; cargarMe() pondrá los
    // del usuario actual. Si /me fallara, quedan vacíos (sin permisos), no heredados.
    this.guardarScopes([]);
  }

  /**
   * GET /usuarios/me: rehidrata el usuario actual y carga sus scopes desde
   * `rol.permisos.scopes`. Accesible por cualquier rol (no requiere roles:read).
   * Si falla, conserva lo cacheado sin romper la sesión.
   */
  private cargarMe(): Observable<string[]> {
    if (!this.isBrowser || !this.token) return of(this.scopes());
    return this.http.get<UsuarioMe>(`${API_URL}/usuarios/me`).pipe(
      tap((me) => {
        this.currentUser.set(me);
        localStorage.setItem(USER_KEY, JSON.stringify(me));
      }),
      map((me) => expandirScopes(me?.rol?.permisos?.scopes)),
      tap((sc) => this.guardarScopes(sc)),
      catchError(() => of(this.scopes())),
    );
  }

  private guardarScopes(sc: string[]): void {
    this.scopes.set(sc);
    if (this.isBrowser) localStorage.setItem(SCOPES_KEY, JSON.stringify(sc));
  }

  private readUser(): Usuario | null {
    if (!this.isBrowser) return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Usuario) : null;
  }

  private readScopes(): string[] {
    if (!this.isBrowser) return [];
    const raw = localStorage.getItem(SCOPES_KEY);
    return raw ? expandirScopes(JSON.parse(raw) as string[]) : [];
  }
}
