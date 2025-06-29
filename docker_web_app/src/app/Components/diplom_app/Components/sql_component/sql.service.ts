import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SqlService {
  private apiUrl = 'http://localhost:3000/pgadmin/execute-sql';

  constructor(private http: HttpClient) { }

  checkConnection(): Observable<boolean> {
    return this.http.get<boolean>(`${this.apiUrl}/check-connection`).pipe(
      catchError(() => of(false))
    );
  }

  executeQuery(sql: string): Observable<any> {
    return this.http.post(this.apiUrl, { query: sql }).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'Неизвестная ошибка';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Ошибка: ${error.error.message}`;
    } else {
      errorMessage = `Код ошибки: ${error.status}\nСообщение: ${error.message}`;
    }
    return throwError(() => new Error(errorMessage));
  }
}