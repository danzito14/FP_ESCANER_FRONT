import { Usuario } from './usuario';

export interface LoginRequest {
  nombre_usuario: string;
  contrasena: string;
}

export interface LoginResponse {
  access_token: string;
  usuario: Usuario;
}
