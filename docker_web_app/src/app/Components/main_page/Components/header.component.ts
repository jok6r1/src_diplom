import { Component, Output, EventEmitter,} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-main-header',
  imports: [CommonModule],
  template: `
    <nav class="navbar navbar-dark bg-dark header-wrapper">
      <div class="container-fluid">
        <img src="/assets/images/eagle_white.png" alt="Eagle Icon" class="me-2 adaptive-icon" />
        <a class="navbar-brand text-adaptive-header header-title">Сайт Вовы</a>

        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" 
                data-bs-target="#navbarNav" aria-controls="navbarNav" 
                aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon button-icon-style"></span>
        </button>

        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav d-flex justify-content-center align-items-center" 
              *ngFor="let item of navBar">
                <li class="nav-item">
                  <a 
                    class="nav-link text-adaptive"
                    [class.active]="item.isCurrentPage" 
                    (click)="onSend(item)"
                    >
                      {{ item.text }}
                  </a>
                </li>
          </ul>
        </div>
      </div>
    </nav>
  `,
  styleUrls: ['Styles/header.component.scss'] 
})
export class MainHeaderComponent {
  
  @Output() sendData = new EventEmitter<any>();

  isExpanded = false;
  navBar : any[] = [
    {
      id: 1,
      text: "Главная",
      isCurrentPage: true,
      route: "home"
    },
    {
      id: 2,
      text: "О нас",
      isCurrentPage: false,
      route: "about"
    },
    {
      id: 3,
      text: "Контакты",
      isCurrentPage: false,
      route: "contact"
    }
  ];
  
  
  onSend(pageData: any){
    // pageData в цикле передается с привязкой к массиву за счет этого
    // его имзенение здесь поменяет его в самом массиве
    this.navBar.forEach(navItem => navItem.isCurrentPage = false);
    pageData.isCurrentPage = true;

    this.sendData.emit(pageData)
  }
  
}
