import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../dashboard.service';
import { Subscription, fromEvent } from 'rxjs';
import { ApiResponse, TrafficData } from '../dashboard.interface';
import { Router, ActivatedRoute, RouterModule, NavigationExtras } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { IpRecord } from '../dashboard.service';


@Component({
  selector: 'app-traffic-table',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule, MatIconModule, MatButtonModule, RouterModule],
  templateUrl: './traffic-table.component.html',
  styleUrls: ['./traffic-table.component.scss'],
})
export class TrafficTableComponent implements OnInit, OnDestroy {
  @Input() userId: number | null = null;
  @Input() userName: string = 'Unknown';

  // Изменено на массив строк
  trafficData: TrafficData[] = [];
  filteredTrafficData: TrafficData[] = [];
  loading = false;
  error: string | null = null;
  showActiveOnly = false;
  timeRange = 60;
  sortColumn: 'timestamp' | 'ip' | 'byteRate' | 'status' | 'packetCount' | null = null;
  sortDirection: 'asc' | 'desc' = 'asc';
  latestTimestamp: string | undefined;

  private dataSubscription?: Subscription;
  private visibilitySubscription?: Subscription;
  private isPageVisible = true;
  private ipList: IpRecord[] = [];

  constructor(
    private dashboardService: DashboardService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.userId = Number(params.get('userId')) || null;
      const stateUserName = this.router.getCurrentNavigation()?.extras.state?.['userName'] || history.state?.userName;
      if (stateUserName) {
        this.userName = stateUserName;
      } else if (this.userId) {
        this.fetchUserName();
      }
      this.setupVisibilityListener();
      this.startPolling();
    });

    this.dashboardService.getAllIps().subscribe({
      next: (ips) => {
        this.ipList = ips; // Сохраняем полученные данные
      },
      error: (error) => {
        console.error('API error:', error);
      }
    });
  }

  private fetchUserName(): void {
    this.dashboardService.getUserById(this.userId!).subscribe({
      next: (response: ApiResponse<{ userName: string }>) => {
        this.userName = response.data?.userName || `User ${this.userId}`;
        this.cdr.detectChanges();
      },
      error: () => {
        this.userName = `User ${this.userId}`;
        this.cdr.detectChanges();
      },
    });
  }

  private setupVisibilityListener(): void {
    this.visibilitySubscription = fromEvent(document, 'visibilitychange').subscribe(() => {
      this.isPageVisible = !document.hidden;
      if (this.isPageVisible && (!this.dataSubscription || this.dataSubscription.closed)) {
        this.startPolling();
      } else if (!this.isPageVisible) {
        this.dataSubscription?.unsubscribe();
      }
    });
  }

  private getLastHourStart(): Date {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 60);
    return now;
  }

  private checkIpInList(ipToCheck: string): boolean {
    return this.ipList.some(record => record.ip === ipToCheck);
  }

  startPolling(): void {
    if (this.dataSubscription?.closed === false) return;
    if (!this.userId) {
      this.error = 'User ID not provided';
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.error = null;
    const lastHourStart = this.getLastHourStart().toISOString();
    this.dataSubscription = this.dashboardService.getTrafficDataByUserIdPolling(
      this.userId,
      this.latestTimestamp,
      this.latestTimestamp ? undefined : lastHourStart
    ).subscribe({
      next: (response: ApiResponse<TrafficData[]>) => {
        this.loading = false;
        console.log('Received traffic data:', response.data?.map(item => ({
          ip: item.ip,
          byteRate: item.networkMetrics.byteRate,
          packetCount: item.networkMetrics.packetCount,
          timestamp: item.timestamp
        })));
        if (response.success && response.data) {
          if (!this.latestTimestamp) {
            this.trafficData = []; // Очистка при начальной загрузке
          }
          this.trafficData = this.latestTimestamp
            ? [...this.trafficData, ...response.data]
            : response.data.filter(item => new Date(item.timestamp) >= new Date(lastHourStart));
          if (response.data.length > 0) {
            this.latestTimestamp = response.data.reduce((latest, current) =>
              new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
            ).timestamp;
          }
          console.log('trafficData before filter:', this.trafficData.map(item => ({
            ip: item.ip,
            packetCount: item.networkMetrics.packetCount,
            timestamp: item.timestamp
          })));
          this.filterTrafficData();
          this.applySort();
        } else {
          this.error = response.error || `No traffic data available for user ${this.userId}`;
          this.trafficData = this.latestTimestamp ? this.trafficData : [];
          this.filteredTrafficData = [];
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.error = 'Failed to load traffic data. Retrying...';
        this.cdr.detectChanges();
      },
    });
  }

  selectRow(item: TrafficData): void {
    const navigationExtras: NavigationExtras = { state: { timeRange: this.timeRange, userName: this.userName } };
    this.router.navigate(['/details/ip', item.ip], navigationExtras);
  }

  toggleActiveFilter(): void {
    this.showActiveOnly = !this.showActiveOnly;
    this.filterTrafficData();
  }

  onTimeRangeChange(event: Event): void {
    this.timeRange = Number((event.target as HTMLInputElement).value);
    this.filterTrafficData();
  }


  private filterTrafficData(): void {
    const lastHourStart = this.getLastHourStart();
    let filteredData = this.trafficData.filter(item => new Date(item.timestamp) >= lastHourStart);


    const latestByIp = new Map<string, TrafficData>();


    filteredData = Array.from(latestByIp.values());
    if (this.showActiveOnly) {
      const cutoffTime = new Date(Date.now() - this.timeRange * 60 * 1000);
      filteredData = filteredData.filter(item => new Date(item.timestamp) >= cutoffTime);
    }

    this.filteredTrafficData = filteredData;
    console.log('Filtered traffic data:', filteredData.map(item => ({
      ip: item.ip,
      byteRate: item.networkMetrics.byteRate,
      packetCount: item.networkMetrics.packetCount,
      autoencoder: item.anomalies.autoencoder,
      lstm: item.anomalies.lstm,
      consensus: item.anomalies.consensus,
      timestamp: item.timestamp
    })));
    this.cdr.detectChanges();
  }

  sortTable(column: 'timestamp' | 'ip' | 'byteRate' | 'status' | 'packetCount'): void {
    this.showActiveOnly = true;
    this.timeRange = 60;
    this.filterTrafficData();

    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applySort();
  }

  private applySort(): void {
    if (!this.sortColumn) return;

    this.filteredTrafficData.sort((a, b) => {
      let valueA: any;
      let valueB: any;

      switch (this.sortColumn) {
        case 'timestamp':
          valueA = new Date(a.timestamp).getTime();
          valueB = new Date(b.timestamp).getTime();
          break;
        case 'ip':
          valueA = a.ip;
          valueB = b.ip;
          break;
        case 'byteRate':
          valueA = a.networkMetrics.byteRate;
          valueB = b.networkMetrics.byteRate;
          break;
        case 'status':
          valueA = this.getStatusText(a);
          valueB = this.getStatusText(b);
          break;
        case 'packetCount':
          valueA = a.networkMetrics.packetCount;
          valueB = b.networkMetrics.packetCount;
          break;
      }

      if (valueA < valueB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    this.cdr.detectChanges();
  }

  getStatusText(item: TrafficData): 'Опасность' | 'Угроза' | 'Норма' {
    if ( this.checkIpInList(item.ip)) {
      return 'Опасность';
    }
    else 
      return 'Норма'
  }

  getStatusClass(item: TrafficData): string {
    if ( this.checkIpInList(item.ip) ) {
      return 'table-danger';
    }
    const status = this.getStatusText(item);
    return {
      'Опасность': 'table-warning',
      'Угроза': 'table-danger',
      'Норма': 'table-success',
    }[status] || 'table-muted';
  }

  navigateTo(path: string): void {
    if (path === '/analytics') {
      const navigationExtras: NavigationExtras = { state: { trafficData: this.filteredTrafficData } };
      this.router.navigate([path], navigationExtras);
    } else {
      this.router.navigate([path]);
    }
  }

  ngOnDestroy(): void {
    this.dataSubscription?.unsubscribe();
    this.visibilitySubscription?.unsubscribe();
  }
}
