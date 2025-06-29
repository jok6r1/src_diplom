import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MainCardComponent } from './card.component';

@Component({
  selector: 'app-main-content',
  imports: [CommonModule, MainCardComponent],
  template: `
    <div class="container-fluid py-4">
      <div class="wrapper">
        <div [ngSwitch]="shared_data_at_main_Component?.route"> 
          <div *ngSwitchCase="'home'">
            <h2 class="text-center">Основные направления</h2>
            <div class="row" *ngFor="let group of getGroupedCards()">
              <div class="col-md-4" *ngFor="let item of group">
                <app-main-card [cardInfo]="item"></app-main-card>
              </div>
            </div> 
          </div>   
        <div *ngSwitchDefault>Route: {{ shared_data_at_main_Component?.route || 'Undefined' }}</div>
      </div>
    </div>
  `,
  styles: `
    .container {
      /* перекрыть стандартные стили Bootstrap*/
      margin: 0 !important; 
      width: 100% !important;
      height: auto;
    }
  `
})
export class MainContentComponent implements OnChanges {
  
  @Input() shared_data_at_main_Component : any;

  ngOnChanges(changes: SimpleChanges): void {
    this.shared_data_at_main_Component.route = changes['shared_data_at_main_Component'].currentValue.route;
    console.log(changes['shared_data_at_main_Component'].currentValue.route);
  }

  cardsInfo = [
    {
      id: 1,
      title: "Диплом",
      text: "Кликни для просмотра",
      pageRoute: "diplom"
    },
    {
      id: 2,
      title: "Сайт для дедушки",
      text: "Дедушка - это твое",
      pageRoute: "ded"
    }
  ]

  getGroupedCards() : any[][] {
    const grouped = [];
    for(let i = 0; i < this.cardsInfo.length; i += 3){
      grouped.push(this.cardsInfo.slice(i, i+3));
    }
    return grouped;
  }
}