import { Component } from '@angular/core';

@Component({
  selector: 'app-main-footer',
  imports: [],
  template: `
    <footer class="bg-dark text-white text-center py-3">
        <p>&copy; 2025 Сайт Вовы. Все права защищены.</p>
    </footer>
  `,
  styles: `
    footer {
        flex-shrink: 0; /* Футер не сжимается */
    }
  `
})
export class MainFooterComponent {
  
  constructor(){

  }
  
}