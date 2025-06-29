import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileListComponent } from './file-list.component';
import { FileService } from './file.service';
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-download',
  standalone: true,
  imports: [CommonModule, FileListComponent],
  template: `
    <div class="download-page">
      <div class="download-card">
        <h2>File Download Center</h2>
        
        <div class="file-list-container">
          <app-file-list (fileSelected)="downloadFile($event)"></app-file-list>
        </div>

        <div class="download-status">
          <div *ngIf="isDownloading" class="progress-container">
            <div class="progress-bar" [style.width]="progress + '%'">
              {{ progress }}%
            </div>
          </div>
          
          <div *ngIf="downloadError" class="error">
            {{ downloadError }}
          </div>
          
          <div *ngIf="downloadSuccess" class="success">
            File downloaded successfully!
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['dowload.component.scss']
})
export class DownloadComponent {
  progress: number = 0;
  isDownloading: boolean = false;
  downloadError: string | null = null;
  downloadSuccess: boolean = false;

  constructor(private fileService: FileService) {}

  downloadFile(filename: string): void {
    this.isDownloading = true;
    this.downloadError = null;
    this.downloadSuccess = false;
    this.progress = 0;
  
    // Симуляция прогресса
    const progressInterval = setInterval(() => {
      this.progress = Math.min(this.progress + 5, 90);
    }, 200);
  
    this.fileService.downloadFile(filename).subscribe({
      next: (blob) => {
        clearInterval(progressInterval);
        this.progress = 100;
        
        // Сохраняем файл
        saveAs(blob, filename);
        
        this.downloadSuccess = true;
        this.isDownloading = false;
        
        setTimeout(() => {
          this.progress = 0;
          this.downloadSuccess = false;
        }, 3000);
      },
      error: (err) => {
        clearInterval(progressInterval);
        this.downloadError = err.message || 'Download failed';
        this.isDownloading = false;
        
        // Автоочистка ошибки через 5 сек
        setTimeout(() => {
          this.downloadError = null;
        }, 5000);
      }
    });
  }
}