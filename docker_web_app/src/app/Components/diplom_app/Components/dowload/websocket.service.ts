import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environment_app';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private socket: WebSocket | null = null;
  private fileData: BlobPart[] = [];
  private fileSize = 0;
  private receivedSize = 0;

  public progress$ = new BehaviorSubject<number>(0);
  public error$ = new BehaviorSubject<string | null>(null);
  
  public production =  false;

  constructor(private http: HttpClient) {}

  // Новый метод для получения списка файлов
  getAvailableFiles(): Observable<{files: string[]}> {
    return this.http.get<{files: string[]}>(`${environment.apiUrl}/pgadmin/list-files`);
  }

  connect(fileName: string): void {
    this.reset();

     // Добавьте проверку окружения для URL
    const wsUrl = this.production 
    ? `wss://${window.location.host}`
    : 'ws://localhost:3000';

    this.socket = new WebSocket('ws://localhost:3000');

    this.socket.onopen = () => {
      this.socket?.send(JSON.stringify({
        action: 'download-exe',
        fileName: fileName
      }));
    };

    this.socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);
        
        if (message.type === 'metadata') {
          this.fileSize = message.size;
        }
        
        if (message.type === 'error') {
          this.error$.next(message.message);
          this.disconnect();
        }
        
        return;
      }

      this.fileData.push(event.data);
      this.receivedSize += event.data.size;
      this.progress$.next(
        Math.round((this.receivedSize / this.fileSize) * 100)
      );
    };

    this.socket.onclose = () => {
      if (this.fileSize > 0 && this.receivedSize === this.fileSize) {
        this.saveFile();
      }
      this.disconnect();
    };

    this.socket.onerror = (error) => {
      this.error$.next('WebSocket connection error');
      this.disconnect();
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private saveFile(): void {
    const blob = new Blob(this.fileData, { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'application.exe';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  private reset(): void {
    this.fileData = [];
    this.fileSize = 0;
    this.receivedSize = 0;
    this.progress$.next(0);
    this.error$.next(null);
  }
}