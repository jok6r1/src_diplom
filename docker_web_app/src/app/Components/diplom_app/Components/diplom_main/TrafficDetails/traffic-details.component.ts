import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../dashboard.service';
import { Subscription, interval, Subject } from 'rxjs';
import { ApiResponse, TrafficData } from '../dashboard.interface';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import Chart from 'chart.js/auto';
import { startWith, switchMap, debounceTime } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { IpRecord } from '../dashboard.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TooltipModalComponent } from './tooltip-modal.component';

@Component({
    selector: 'app-traffic-details',
    standalone: true,
    imports: [CommonModule, MatProgressSpinnerModule, MatIconModule, MatButtonModule, MatDialogModule, MatTooltipModule],
    templateUrl: './traffic-details.component.html',
    styleUrls: ['./traffic-details.component.scss']
})
export class TrafficDetailsComponent implements OnInit, AfterViewInit, OnDestroy {
    selectedData: TrafficData | null = null;
    last15MinData: TrafficData[] = [];
    loading = false;
    timeRangeLoading = false;
    error: string | null = null;
    timeRange: number = 15;

    @ViewChild('anomalyChartCanvas') anomalyChartCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('iatChartCanvas') iatChartCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('stackedChartCanvas') stackedChartCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('packetCountChartCanvas') packetCountChartCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('packetRateChartCanvas') packetRateChartCanvas!: ElementRef<HTMLCanvasElement>;

    private anomalyChart?: Chart;
    private iatChart?: Chart;
    private stackedChart?: Chart;
    private packetCountChart?: Chart;
    private packetRateChart?: Chart;
    private dataSubscription?: Subscription;
    private timeRangeChange = new Subject<number>();
    private ip: string | null = null;
    private ipList: IpRecord[] = [];

    constructor(
        private dashboardService: DashboardService,
        private route: ActivatedRoute,
        private router: Router,
        private cdr: ChangeDetectorRef,
        private dialog: MatDialog
    ) {}

    ngOnInit(): void {
        this.route.paramMap.subscribe(params => {
            this.ip = params.get('ip');
            const navigation = this.router.getCurrentNavigation();
            const stateTimeRange = navigation?.extras.state?.['timeRange'] || history.state?.timeRange;
            this.timeRange = typeof stateTimeRange === 'number' && stateTimeRange >= 5 && stateTimeRange <= 60 ? stateTimeRange : 15;
            console.log('Retrieved timeRange:', this.timeRange, { fromNavigation: !!navigation?.extras.state?.['timeRange'], fromHistory: !!history.state?.timeRange });
            if (this.ip) {
                this.loadDataByIp(this.ip);
            } else {
                this.error = 'IP address not provided';
            }
        });

        // Debounce time range changes
        this.timeRangeChange.pipe(
            debounceTime(300)
        ).subscribe(timeRange => {
            this.timeRange = timeRange;
            console.log('Debounced time range changed to:', this.timeRange);
            this.timeRangeLoading = true;
            this.cdr.detectChanges();
            this.dataSubscription?.unsubscribe();
            this.startLast15MinPolling();
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

    ngAfterViewInit(): void {
        setTimeout(() => {
            if (this.selectedData && this.ip) {
                this.startLast15MinPolling();
            }
        }, 0);
    }

    openTooltipModal(type: string): void {
        let text_mass : Map<string, string> = new Map([
            ['anomaly', 'Разметка нормального и аномального трафика '],
            ['iat', 'Нормированное и инверсированное среднее время передачи пакета в прямом и обратном направлении'],
            ['stacked', 'Средний размер пакетов в прямом и обратном направлении'],
            ['packetCount', '4'],
            ['packetRate', '5']

        ]);

        const dialogRef = this.dialog.open(TooltipModalComponent, {
          data: {
            message: text_mass.get(type),
          },
          panelClass: 'tooltip-modal' // Для стилизации
        });
    
        // Применяем blur при открытии
        document.querySelector('.dashboard-container')?.classList.add('blurred');
    
        // Убираем blur при закрытии
        dialogRef.afterClosed().subscribe(() => {
          document.querySelector('.dashboard-container')?.classList.remove('blurred');
        });
      }
      
    loadDataByIp(ip: string): void {
        this.loading = true;
        this.error = null;

        this.dataSubscription?.unsubscribe();
        this.dataSubscription = this.dashboardService.getTrafficDataByIp(ip).subscribe({
            next: (response: ApiResponse<TrafficData[]>) => {
                this.loading = false;
                if (response.success && response.data && response.data.length > 0) {
                    this.selectedData = response.data[0];
                    console.log('selectedData loaded:', {
                        ip: this.selectedData.ip,
                        timestamp: this.selectedData.timestamp,
                        anomalies: this.selectedData.anomalies,
                        packetCount: this.selectedData.networkMetrics.packetCount,
                        status: this.getStatusText(this.selectedData.anomalies)
                    });
                    this.startLast15MinPolling();
                    this.cdr.detectChanges();
                } else {
                    this.error = response.error || `No data found for IP: ${ip}`;
                    this.selectedData = null;
                    this.cdr.detectChanges();
                }
            },
            error: (err) => {
                this.loading = false;
                this.error = `Failed to fetch data for IP: ${ip}`;
                this.selectedData = null;
                this.cdr.detectChanges();
            },
        });
    }

    retryLoad(): void {
        if (this.ip) {
            this.loadDataByIp(this.ip);
        } else {
            this.error = 'No IP address to retry';
        }
    }

    onTimeRangeChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        const newTimeRange = Number(target.value);
        this.timeRangeChange.next(newTimeRange);
    }

    private startLast15MinPolling(): void {
        if (!this.selectedData?.ip) {
            console.error('No IP selected for polling');
            return;
        }

        this.dataSubscription?.unsubscribe();
        this.dataSubscription = interval(5000)
            .pipe(
                startWith(0),
                switchMap(() => this.dashboardService.getLast15MinData(this.selectedData!.ip, this.timeRange))
            )
            .subscribe({
                next: (response: ApiResponse<TrafficData[]>) => {
                    this.timeRangeLoading = false;
                    if (response.success && response.data) {
                        this.last15MinData = [...response.data].sort(
                            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                        );
                        this.updateSelectedDataFromLast15Min();
                        this.updateCharts();
                        this.cdr.detectChanges();
                    } else {
                        this.error = response.error || `No recent data for ${this.timeRange} minutes`;
                        this.cdr.detectChanges();
                    }
                },
                error: (err) => {
                    this.timeRangeLoading = false;
                    this.error = `Failed to load last ${this.timeRange} min data: ` + err.message;
                    this.cdr.detectChanges();
                },
            });
    }

    private updateSelectedDataFromLast15Min(): void {
        if (this.last15MinData.length && this.selectedData) {
            // Find the most recent record with anomalies (if any)
            const latestAnomalyRecord = this.last15MinData.slice().reverse().find(d => 
                d.anomalies && (
                    (d.anomalies.autoencoder ?? 0) >= 0.8 ||
                    (d.anomalies.lstm ?? 0) >= 0.8 ||
                    (d.anomalies.consensus ?? 0) >= 0.8
                )
            );
            // Use anomaly record if found, otherwise use latest record
            const selectedRecord = latestAnomalyRecord || this.last15MinData[this.last15MinData.length - 1];
            if (selectedRecord) {
                this.selectedData = { ...selectedRecord };
                this.cdr.markForCheck(); // Force change detection
            }
        }
    }

    private groupDataByTime(
        data: TrafficData[],
        intervalMs: number = 10000
    ): { timestamp: string; autoencoder: number; lstm: number; consensus: number; packetCount: number; ips: string[] }[] {
        const grouped: { [key: string]: { autoencoder: number[]; lstm: number[]; consensus: number[]; packetCount: number[]; ips: string[] } } = {};
        data.forEach((d) => {
            const time = new Date(d.timestamp).getTime();
            const bucket = Math.floor(time / intervalMs) * intervalMs;
            const key = new Date(bucket).toLocaleTimeString();
            if (!grouped[key]) {
                grouped[key] = { autoencoder: [], lstm: [], consensus: [], packetCount: [], ips: [] };
            }
            grouped[key].autoencoder.push(d.anomalies.autoencoder ?? 0);
            grouped[key].lstm.push(d.anomalies.lstm ?? 0);
            grouped[key].consensus.push(d.anomalies.consensus ?? 0);
            grouped[key].packetCount.push(d.networkMetrics.packetCount ?? 0);
            grouped[key].ips.push(d.ip);
        });
        return Object.keys(grouped)
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
            .map((key) => ({
                timestamp: key,
                autoencoder: Math.max(...grouped[key].autoencoder),
                lstm: Math.max(...grouped[key].lstm),
                consensus: Math.max(...grouped[key].consensus),
                packetCount: Math.max(...grouped[key].packetCount),
                ips: grouped[key].ips,
            }));
    }

    ipToNumber(ip: string | null = null): number {
        if (ip != null) {
            const parts = ip.split('.').map(Number);
            if (parts.length !== 4 || parts.some(part => isNaN(part) || part < 0 || part > 255)) {
                throw new Error("Некорректный IP-адрес");
            }
            return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
        }
        return -1;
    }

    isIpIn24Subnet(ip: string | null = null, subnet: string): boolean {
        try {
            const ipNum = this.ipToNumber(ip);
            const subnetBaseNum = this.ipToNumber(subnet);
            const mask = 0xFFFFFF00; // Маска /24
            return (ipNum & mask) === (subnetBaseNum & mask);
        } catch {
            return false;
        }
    }

    private invertStdDevValues(data: TrafficData[], direction: string): number[] {
        // Извлекаем все stdDev
        let stdDevValues : number[] = [];
        if(direction == "forward"){
            stdDevValues = data.map(d => d.networkMetrics?.interArrivalTime?.forward?.min ?? 0);
        } else if(direction == "back") {
            stdDevValues = data.map(d => d.networkMetrics?.interArrivalTime?.backward?.min ?? 0);
        }
        
        if (stdDevValues.length === 0) {
            return [];
        }
        const maxStdDev = Math.max(...stdDevValues);
        const minStdDev = Math.min(...stdDevValues);
        if (maxStdDev === minStdDev) {
            console.log('All stdDev values are equal, returning constant array');
            return new Array(stdDevValues.length).fill(100); // Все значения равны, возвращаем 100
        }
    
        // Параметры инверсии
        const k = 1; // Масштабный коэффициент
        const epsilon = 0.000001; // Для избежания деления на 0 и усиления малых значений
    
        // Инверсия: k / (stdDev + ε)
        const invertedValues = stdDevValues.map(stdDev => k / (stdDev + epsilon));
        
        // Нормализация: приведение к диапазону [0, 100]
        const maxInverted = Math.max(...invertedValues);
        const normalizedValues = invertedValues.map(inverted => (inverted / maxInverted) * 100);
    
        //console.log('Inverted and normalized stdDev values:', normalizedValues);
        return normalizedValues;
    }

    private updateCharts(): void {
        if (!this.last15MinData.length || !this.selectedData) return;

        const now = new Date();
        const cutoffTime = new Date(now.getTime() - this.timeRange * 60 * 1000);
        const filteredData = this.last15MinData.filter(
            (d) => d.ip === this.selectedData!.ip && new Date(d.timestamp) >= cutoffTime
        );

        //console.log('updateCharts: filteredData for timeRange', this.timeRange, 'records:', filteredData.map(d => ({
        //    timestamp: d.timestamp,
        //    anomalies: d.anomalies,
        //    packetCount: d.networkMetrics.packetCount
        //})));

        if (!filteredData.length) {
            console.warn('No data to update charts for timeRange:', this.timeRange);
            this.anomalyChart?.destroy();
            this.iatChart?.destroy();
            this.stackedChart?.destroy();
            this.packetCountChart?.destroy();
            this.packetRateChart?.destroy();
            return;
        }

        const timestamps = filteredData.map((d) => new Date(d.timestamp).toLocaleTimeString());
        const groupedData = this.groupDataByTime(filteredData, 10000);
        const anomalyTimestamps = groupedData.map((d) => d.timestamp);
        let anomalyAutoencoder = groupedData.map((d) => d.autoencoder);
        let anomalyLstm = groupedData.map((d) => d.lstm);
        let anomalyConsensus = groupedData.map((d) => d.consensus);
        const anomalyPacketCount = groupedData.map((d) => d.packetCount);
        //const anomalyRateCount = groupedData.map((d) => d.packetRate);
        const anomalyIps = groupedData.map((d) => d.ips);

        // Destroy existing charts
        this.anomalyChart?.destroy();
        this.iatChart?.destroy();
        this.stackedChart?.destroy();
        this.packetCountChart?.destroy();
        this.packetRateChart?.destroy();

        anomalyAutoencoder = new Array(anomalyAutoencoder.length).fill(0);
        anomalyLstm = new Array(anomalyLstm.length).fill(0);
        anomalyConsensus = new Array(anomalyConsensus.length).fill(0);

        this.ipList.forEach(element => {
            if (this.ip == element.ip) {
                anomalyAutoencoder[index] = 1;
                anomalyLstm[index] = 1;
                anomalyConsensus[index] = 1;
            }            
        });


        this.anomalyChart = new Chart(this.anomalyChartCanvas.nativeElement, {
            type: 'line',
            data: {
                labels: anomalyTimestamps,
                datasets: [
                    { label: 'Autoencoder', data: anomalyAutoencoder, borderColor: '#FF6384', fill: false },
                    { label: 'LSTM', data: anomalyLstm, borderColor: '#36A2EB', fill: false },
                    { label: 'Consensus', data: anomalyConsensus, borderColor: '#FFCE56', fill: false },
                ],
            },
            options: {
                responsive: true,
                scales: {
                    x: { display: true, title: { display: true, text: 'Время' } },
                    y: { display: true, title: { display: true, text: 'Значение' }, min: 0 },
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const index = context.dataIndex;
                                const ips = anomalyIps[index];
                                return `${context.dataset.label}: ${context.raw} (IP: ${ips.join(', ')})`;
                            },
                        },
                    },
                },
            },
        });
        

        this.iatChart = new Chart(this.iatChartCanvas.nativeElement, {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    {
                        label: 'FWD IAT StdDev',
                        data: this.invertStdDevValues(filteredData, 'forward'),
                        borderColor: '#4BC0C0',
                        fill: false,
                    },
                    {
                        label: 'BCK IAT StdDev',
                        data: this.invertStdDevValues(filteredData, 'backward'),
                        borderColor: '#9966FF',
                        fill: false,
                    },
                ],
            },
            options: {
                responsive: true,
                scales: {
                    x: { display: true, title: { display: true, text: 'Время' } },
                    y: { display: true, title: { display: true, text: 'Normalized_Min_Time' }, min: 0 },
                },
            },
        });

        this.stackedChart = new Chart(this.stackedChartCanvas.nativeElement, {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    {
                        label: 'FWD Packets',
                        data: filteredData.map((d) => d.networkMetrics?.forward?.avgPacketSize ?? 0),
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        fill: true,
                        stack: 'Stack',
                    },
                    {
                        label: 'BCK Packets',
                        data: filteredData.map((d) => d.networkMetrics?.backward?.avgPacketSize ?? 0),
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        fill: true,
                        stack: 'Stack',
                    },
                ],
            },
            options: {
                responsive: true,
                scales: {
                    x: { display: true, title: { display: true, text: 'Время' } },
                    y: { display: true, title: { display: true, text: 'Количество пакетов' }, stacked: true },
                },
            },
        });

        this.packetCountChart = new Chart(this.packetCountChartCanvas.nativeElement, {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    {
                        label: 'Packet Count',
                        data: filteredData.map((d) => d.networkMetrics?.packetCount ?? 0),
                        borderColor: '#4CAF50',
                        fill: false,
                    },
                ],
            },
            options: {
                responsive: true,
                scales: {
                    x: { display: true, title: { display: true, text: 'Время' } },
                    y: { display: true, title: { display: true, text: 'Количество пакетов' }, min: 0 },
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const index = context.dataIndex;
                                const ips = anomalyIps[index];
                                return `${context.dataset.label}: ${context.raw} (IP: ${ips.join(', ')})`;
                            },
                        },
                    },
                },
            },
        });

        this.packetRateChart = new Chart(this.packetRateChartCanvas.nativeElement, {
            type: 'line',
            data: {
                labels: anomalyTimestamps,
                datasets: [
                    {
                        label: 'Packet Rate',
                        data: filteredData.map((d) => d.networkMetrics?.packetRate ?? 0),
                        borderColor: '#4CAF50',
                        fill: false,
                    },
                ],
            },
            options: {
                responsive: true,
                scales: {
                    x: { display: true, title: { display: true, text: 'Время' } },
                    y: { display: true, title: { display: true, text: 'Packet Rate' }, min: 0 },
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const index = context.dataIndex;
                                const ips = anomalyIps[index];
                                return `${context.dataset.label}: ${context.raw} (IP: ${ips.join(', ')})`;
                            },
                        },
                    },
                },
            },
        });
        
    }

    getStatusText(anomalies: { autoencoder: number | null; lstm: number | null; consensus: number }): 'Опасность' | 'Норма' {
        const anomalyCount = this.getAnomalyCount();
        //console.log('getStatusText called with anomalyCount:', anomalyCount);
        
        const result = anomalyCount === 0 ? 'Норма' : 'Опасность';
        //console.log('Status result:', result);
        return result;
    }

    getAnomalyCount(): number {
        const isAnomaly = new Array(this.last15MinData.length).fill(false);
        const anomalyPacketCount = this.last15MinData.map(d => d.networkMetrics?.packetCount ?? 0);
    

         this.ipList.forEach(element => {
            if (this.ip == element.ip) {
                isAnomaly[index] = true; 
              ); 
            }            
        });
    
        const totalAnomalies = isAnomaly.filter(flag => flag).length;
        //console.log('isAnomaly:', isAnomaly);
        //console.log('totalAnomalies:', totalAnomalies);
        return totalAnomalies;
    }

    goBack(): void {
        if (this.selectedData?.user_id) {
            this.router.navigate([`/user-traffic/${this.selectedData.user_id}`]);
        } else {
            this.router.navigate(['/dashboard']);
        }
    }

    ngOnDestroy(): void {
        this.dataSubscription?.unsubscribe();
        this.timeRangeChange.complete();
        this.anomalyChart?.destroy();
        this.iatChart?.destroy();
        this.stackedChart?.destroy();
        this.packetCountChart?.destroy();
    }
}
