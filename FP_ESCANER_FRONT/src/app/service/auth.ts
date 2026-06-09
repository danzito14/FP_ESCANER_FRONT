import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { API_URL } from '../core/constants/api';
import { LoginRequest, LoginResponse } from '../core/interfaces/auth';
import { Usuario } from '../core/interfaces/usuario';

const TOKEN_KEY = 'access_token';
const USER_KEY = 'usuario';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Usuario autenticado actual (null si no hay sesión). */
  readonly currentUser = signal<Usuario | null>(this.readUser());
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  /** POST /usuarios/login */
  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${API_URL}/usuarios/login`, credentials)
      .pipe(tap((res) => this.setSession(res)));
  }

  logout(): void {
    if (this.isBrowser) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    this.currentUser.set(null);
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
  }

  private readUser(): Usuario | null {
    if (!this.isBrowser) return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Usuario) : null;
  }
}
