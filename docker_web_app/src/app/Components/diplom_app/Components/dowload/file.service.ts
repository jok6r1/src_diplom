import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError, finalize, map, of } from 'rxjs';
import { environment } from '../../../../environment_app';
import { saveAs } from 'file-saver';

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private apiUrl = `${environment.apiUrl}/pgadmin`;
  private cachedFiles: string[] = [];

  constructor(private http: HttpClient) { }

  // Получение списка файлов
  getFilesList(refresh: boolean = false): Observable<{files: string[]}> {
    if (this.cachedFiles.length > 0 && !refresh) {
      return of({files: this.cachedFiles});
    }

    return this.http.get<{files: string[]}>(`${this.apiUrl}/list-files`).pipe(
      map(response => {
        this.cachedFiles = response.files;
        return response;
      }),
      catchError(this.handleError)
    );
  }

  // Скачивание файла
  downloadFile(filename: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/download/${filename}`, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      catchError(this.handleError),
      map(response => {
        if (!response.body) {
          throw new Error('Empty response body');
        }
        return response.body;
      })
    );
  }

  // Обработка ошибок
  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Клиентская ошибка
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Серверная ошибка
      errorMessage = `Server returned code ${error.status}: ${error.message}`;
    }
    
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}