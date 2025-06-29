import { Component } from '@angular/core';
import { MainHeaderComponent } from './header.component';
import { MainFooterComponent } from './footer.component';
import { MainContentComponent } from './content.component';

@Component({
  selector: 'app-main',
  imports: [MainHeaderComponent, MainFooterComponent, MainContentComponent],
  template: `
    <div class="main-block">
      <div class="d-flex flex-column min-vh-100">
        <app-main-header (sendData)="receiveData($event)"></app-main-header>
        <main class="flex-grow-1">
          <app-main-content [shared_data_at_main_Component]="shared_data_to_content_Component"></app-main-content>
        </main>
        <app-main-footer></app-main-footer>
      </div>
    </div>

    <div class="secondary-block">
      <p class="d-flex justify-content-center align-items-center min-vh-100">Достигнут лимит ширины окна</p>
    </div>
  `,
  styleUrls: ['Styles/main.component.scss']
})
export class MainComponent {


  // можно вынести в main_component ?
  start_page_data = {
    id: 1,
    text: "Главная",
    isCurrentPage: true,
    route: "home"
  }
  shared_data_to_content_Component: any = this.start_page_data;
  //

  receiveData(pageData: any){
    this.shared_data_to_content_Component = pageData;
  }
  
}
