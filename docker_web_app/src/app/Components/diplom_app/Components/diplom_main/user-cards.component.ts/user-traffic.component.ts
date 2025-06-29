import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TrafficTableComponent } from '../TrafficTable/traffic-table.component';

@Component({
  selector: 'app-user-traffic',
  standalone: true,
  imports: [MatProgressSpinnerModule, TrafficTableComponent],
  template: `
    <div class="container">
      <h2>Трафик пользователя {{ userId }}</h2>
      <app-traffic-table [userId]="userId"></app-traffic-table>
    </div>
  `,
  styles: [`
    .container { max-width: 1200px; margin: 20px auto; padding: 0 15px; }
  `]
})
export class UserTrafficComponent implements OnInit {
  userId: number;

  constructor(private route: ActivatedRoute) {
    this.userId = Number(this.route.snapshot.paramMap.get('userId')) || 0;
  }

  ngOnInit(): void {}
}