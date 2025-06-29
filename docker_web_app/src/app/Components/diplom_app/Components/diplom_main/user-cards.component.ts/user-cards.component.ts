import { Component, OnInit, OnDestroy  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../dashboard.service';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import { ApiResponse, TrafficData, User } from '../dashboard.interface';
import { Router } from '@angular/router';

@Component({
  selector: 'app-user-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-cards.component.html',
  styleUrls: ['./user-cards.component.scss'],
})
export class UserCardsComponent implements OnInit, OnDestroy {
  users: User[] = [];
  trafficData: TrafficData[] = [];
  loading = false;
  error: string | null = null;

  isPopupVisible = false;
  private isPPressed = false;
  private isBacktickPressed = false;

  
  private pollingSubscription?: Subscription;

  constructor(
    private dashboardService: DashboardService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.startPolling();
  }

  private startPolling(): void {
    this.pollingSubscription = interval(5000).pipe(
      startWith(0),
      switchMap(() => this.dashboardService.getUsersAndTraffic())
    ).subscribe({
      next: (response: ApiResponse<{ users: User[]; traffic: TrafficData[] }>) => {
        this.loading = false;
        if (response.success && response.data) {
          this.users = response.data.users;
          this.trafficData = response.data.traffic;
          console.log('Received users:', this.users.map(u => ({ id: u.id, username: u.username })));
          console.log('Received trafficData:', this.trafficData.map(t => ({
            user_id: t.user_id,
            user_id_type: typeof t.user_id,
            timestamp: t.timestamp,
            ip: t.ip
          })));
          console.log('Traffic data count:', this.trafficData.length);
          console.log('Traffic by user_id:', Array.from(new Set(this.trafficData.map(t => t.user_id))));
          console.log('Recent traffic (last 15s):', this.trafficData.filter(t => {
            const lastActivityTime = new Date(t.timestamp).getTime();
            const fifteenSecondsAgo = new Date().getTime() - 15 * 1000;
            return lastActivityTime >= fifteenSecondsAgo;
          }).map(t => ({ user_id: t.user_id, timestamp: t.timestamp, ip: t.ip })));
        } else {
          this.error = response.error || 'No data available';
          this.users = [];
          this.trafficData = [];
          console.warn('API response unsuccessful or no data:', response);
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err.message || 'Failed to load data';
        console.error('Polling error:', err);
      },
    });
  }

  getConnectionStatus(userId: number): string {
    const now = new Date().getTime();
    const fifteenSecondsAgo = now - 15 * 1000;
    const userTraffic = this.trafficData.filter(t => {
      const trafficUserId = typeof t.user_id === 'string' ? Number(t.user_id) : t.user_id;
      return trafficUserId === userId;
    });
    console.log(`User ${userId} - Traffic records:`, userTraffic.map(t => ({
      user_id: t.user_id,
      user_id_type: typeof t.user_id,
      timestamp: t.timestamp,
      ip: t.ip
    })));
    const recentTraffic = userTraffic.some(t => {
      const lastActivityTime = new Date(t.timestamp).getTime();
      const isRecent = lastActivityTime >= fifteenSecondsAgo;
      console.log(`User ${userId} - Timestamp: ${t.timestamp}, Last Activity: ${lastActivityTime}, 15s Ago: ${fifteenSecondsAgo}, Recent: ${isRecent}`);
      return isRecent;
    });
    console.log(`User ${userId} Connection Status: ${recentTraffic ? 'Активен' : 'Неактивен'}`);
    return recentTraffic ? 'Активен' : 'Неактивен';
  }

  getUserStatus(userId: number): string {
    const connectionStatus = this.getConnectionStatus(userId);
    if (connectionStatus === 'Неактивен') {
      return 'Отсутствует';
    }
    const latestTraffic = this.trafficData
      .filter(t => {
        const trafficUserId = typeof t.user_id === 'string' ? Number(t.user_id) : t.user_id;
        return trafficUserId === userId;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    if (!latestTraffic || !latestTraffic.anomalies) return 'Норма';
    const { autoencoder, lstm } = latestTraffic.anomalies;
    const autoencoderAnomaly = (autoencoder ?? 0) === 1;
    const lstmAnomaly = (lstm ?? 0) === 1;
    return autoencoderAnomaly && lstmAnomaly ? 'Опасность' : autoencoderAnomaly || lstmAnomaly ? 'Угроза' : 'Норма';
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Норма':
        return 'text-success';
      case 'Угроза':
        return 'text-warning';
      case 'Опасность':
        return 'text-danger';
      case 'Отсутствует':
        return 'text-muted';
      default:
        return 'text-muted';
    }
  }

  goToUserTraffic(userId: number): void {
    this.router.navigate(['/user-traffic', userId]);
  }

  navigateTo(path: string): void {
    this.router.navigate([path]);
  }

  ngOnDestroy(): void {
    this.pollingSubscription?.unsubscribe();
  }
}