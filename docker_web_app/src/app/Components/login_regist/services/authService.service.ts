import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private accessTokenKey = 'accessToken';

  // Сохраняем токен после логина
  setAccessToken(token: string): void {
    localStorage.setItem(this.accessTokenKey, token);
  }

  // Получаем токен
  getAccessToken(): string | null {
    return localStorage.getItem(this.accessTokenKey);
  }

  // Проверяем, авторизован ли пользователь
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    return !!token; // Возвращает true, если токен есть
  }

  // Удаляем токен при выходе
  // не реализовано
  logout(): void {
    localStorage.removeItem(this.accessTokenKey);
  }
}

// localStorage.clear(); - отчитстить токен