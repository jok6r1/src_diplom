import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tooltip-modal',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="modal-container">
      <div class="modal-header">
        <button mat-icon-button class="close-button" (click)="closeDialog()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="modal-content">
        <div class="text-container">
          <p>{{ data.message }}</p>
        </div>
      </div>
    </div>
  `,
    styles: `
    .modal-container {
          position: relative;
          padding: 20px;
          background-color: #fff;
          border-radius: 8px;
          width: 30vw; /* 30% ширины экрана */
          height: auto; /* 30% высоты экрана */
          max-width: 800px; /* Максимальная ширина */
          max-height: 600px; /* Максимальная высота */
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          animation: fadeIn 0.3s ease-in-out; /* Сохранена анимация */
        }

        .modal-header {
          height: 40px; /* Фиксированная высота для заголовка */
          position: relative; /* Для абсолютного позиционирования кнопки */
          display: flex;
          justify-content: flex-end;
        }

        .close-button {
          position: absolute; /* Абсолютное позиционирование */
          top: 10px; /* Отступ сверху */
          right: 10px; /* Отступ справа */
          color: #333;
          font-size: 24px; /* Размер иконки */
          z-index: 10; /* Высокий z-index для предотвращения перекрытия */
        }

        .modal-content {
          flex-grow: 1; /* Растягиваем контент по высоте */
          overflow-y: auto; /* Прокрутка, если текст не помещается */
        }

        .text-container {
          font-size: clamp(1rem, 2.5vw, 1.2rem); /* Адаптивный размер текста */
          line-height: 1.5;
          color: #333;
          padding: 10px 20px 10px 10px; /* Отступы, чтобы текст не приближался к кнопке */
          max-height: calc(100% - 50px); /* Ограничиваем высоту, учитывая .modal-header */
          overflow-y: auto; /* Прокрутка внутри текста */
        }

        /* Анимация открытия */
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        /* Анимация открытия */
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
  `
})
export class TooltipModalComponent {
  constructor(
    public dialogRef: MatDialogRef<TooltipModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { message: string }
  ) {}

  closeDialog(): void {
    this.dialogRef.close();
  }
}