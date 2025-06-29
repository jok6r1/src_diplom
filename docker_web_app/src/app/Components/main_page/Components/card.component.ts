import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-main-card',
  imports: [RouterModule],
  template: `
    <a [routerLink]="[this.cardInfo.pageRoute]" class="card-link">
      <div class="card">
        <div class="card-body">
          <div class="d-flex justify-content-center">
            <h5 class="card-title">{{ this.cardInfo.title }}</h5>
          </div>
          <div class="d-flex justify-content-center">
            <p class="card-text">{{ this.cardInfo.text }}.</p>
          </div>
        </div>
      </div>
    </a>
  `,
  styleUrls: ['Styles/card.component.scss']
})
export class MainCardComponent{
  @Input() cardInfo: any;

}
