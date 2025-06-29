import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileService } from './file.service';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';

@Component({
  selector: 'app-file-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [FileService], // Добавляем сервис в providers
  template: `
    <div class="file-manager">
      <div class="header">
        <h3>Available Files</h3>
        <div class="button-group">
          <button (click)="navigateTo('/users')" class="btn-back">
            Back
          </button>
          <button (click)="refreshFiles()" [disabled]="isLoading" class="btn-refresh">
            {{ isLoading ? 'Refreshing...' : 'Refresh' }}
          </button>
        </div>
      </div>
      <div class="search-box">
        <input type="text" [(ngModel)]="searchTerm" 
               placeholder="Search files..." (input)="filterFiles()">
      </div>

      <div class="file-table">
        <div class="table-header">
          <div>Filename</div>
          <div>Actions</div>
        </div>

        <div class="table-body">
          <div class="table-row" *ngFor="let file of filteredFiles">
            <div class="filename">{{ file }}</div>
            <div class="actions">
              <button (click)="onFileSelect(file)" class="download-btn">
                Download
              </button>
            </div>
          </div>

          <div *ngIf="filteredFiles.length === 0" class="no-files">
            No files found
          </div>
        </div>
      </div>

      <div *ngIf="error" class="error-message">
        {{ error }}
      </div>
    </div>
  `,
  styleUrls: ['./file-list.component.scss']
})
export class FileListComponent implements OnInit {
  files: string[] = [];
  filteredFiles: string[] = [];
  searchTerm: string = '';
  isLoading: boolean = false;
  error: string | null = null;

  @Output() fileSelected = new EventEmitter<string>();

  constructor(
    private fileService: FileService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadFiles();
  }

  loadFiles(): void {
    this.isLoading = true;
    this.error = null;
    this.fileService.getFilesList().pipe(
      finalize(() => this.isLoading = false)
    ).subscribe({
      next: (response) => {
        this.files = response.files;
        this.filteredFiles = [...this.files];
      },
      error: (err) => {
        this.error = 'Failed to load files. Please try again.';
        console.error('Error loading files:', err);
      }
    });
  }

  refreshFiles(): void {
    this.loadFiles();
  }

  filterFiles(): void {
    if (!this.searchTerm) {
      this.filteredFiles = [...this.files];
      return;
    }
    this.filteredFiles = this.files.filter(file =>
      file.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  navigateTo(path: string): void {
    this.router.navigate([path]);
  }

  onFileSelect(filename: string): void {
    this.fileSelected.emit(filename);
  }
}