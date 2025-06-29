import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, of } from 'rxjs';
import { switchMap, startWith, catchError, map, retry, tap } from 'rxjs/operators';
import { ApiResponse, TrafficData, User } from './dashboard.interface';

export interface IpRecord {
  id: number;
  ip: string;
}

interface RawTrafficData {
  id: number | null;
  user_id: string | number;
  ip: string;
  timestamp: string;
  // Плоские поля (для /anomalies/last15min)
  fl_byt_s?: number;
  fl_pck_s?: number;
  packet_count?: number;
  fwd_max_pack_size?: number;
  fwd_avg_packet?: number;
  bck_max_pack_size?: number;
  bck_avg_packet?: number;
  fw_iat_std?: number;
  fw_iat_min?: number;
  bck_iat_std?: number;
  bck_iat_min?: number;
  anomaly_ae?: number | null;
  anomaly_lstm?: number | null;
  anomaly_consensus?: number;
  // Вложенная структура (для /traffic/user/:userId, /traffic/ip/:ip)
  networkMetrics?: {
    byteRate: number;
    packetRate: number;
    packetCount: number;
    forward: {
      maxPacketSize: number;
      avgPacketSize: number;
    };
    backward: {
      maxPacketSize: number;
      avgPacketSize: number;
    };
    interArrivalTime: {
      forward: {
        stdDev: number;
        min: number;
      };
      backward: {
        stdDev: number;
        min: number;
      };
    };
  };
  anomalies?: {
    autoencoder: number | null;
    lstm: number | null;
    consensus: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private apiUrl = 'http://localhost:3000/pgadmin';
  private pollingInterval = 5000;

  constructor(private http: HttpClient) {}

  getTrafficDataById(id: number): Observable<ApiResponse<TrafficData>> {
    return this.http.get<ApiResponse<RawTrafficData>>(`${this.apiUrl}/traffic/${id}`).pipe(
      map(this.transformResponseSingle),
      retry({ count: 2, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  getAllIps(): Observable<IpRecord[]> {
    return this.http.get<IpRecord[]>(`${this.apiUrl}/hide_ip`);
  }

  getTrafficDataByIp(ip: string): Observable<ApiResponse<TrafficData[]>> {
    return this.http.get<ApiResponse<RawTrafficData[]>>(`${this.apiUrl}/traffic/ip/${encodeURIComponent(ip)}`).pipe(
      map(this.transformResponseArray),
      retry({ count: 2, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  getLast15MinData(ip?: string, timeRange: number = 15): Observable<ApiResponse<TrafficData[]>> {
    const url = ip
      ? `${this.apiUrl}/anomalies/last15min?ip=${encodeURIComponent(ip)}&minutes=${timeRange}`
      : `${this.apiUrl}/anomalies/last15min?minutes=${timeRange}`;
    return this.http.get<ApiResponse<RawTrafficData[]>>(url).pipe(
      map(this.transformResponseArray),
      retry({ count: 2, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  getUsersAndTraffic(): Observable<ApiResponse<{ users: User[]; traffic: TrafficData[] }>> {
    return this.http.get<ApiResponse<{ users: User[]; traffic: RawTrafficData[] }>>(`${this.apiUrl}/users-and-traffic`).pipe(
      map(response => ({
        ...response,
        data: response.data ? {
          users: response.data.users,
          traffic: this.transformToTrafficDataArray(response.data.traffic),
        } : undefined,
      })),
      retry({ count: 2, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  getTrafficDataByUserId(userId: number): Observable<ApiResponse<TrafficData[]>> {
    return this.http.get<ApiResponse<RawTrafficData[]>>(`${this.apiUrl}/traffic/user/${userId}`).pipe(
      map(this.transformResponseArray),
      retry({ count: 2, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  getTrafficDataByUserIdPolling(userId: number, since?: string, from?: string): Observable<ApiResponse<TrafficData[]>> {
    let url = `${this.apiUrl}/traffic/user/${userId}`;
    if (since) {
      url += `?since=${encodeURIComponent(since)}`;
    } else if (from) {
      url += `?from=${encodeURIComponent(from)}`;
    }
    return interval(this.pollingInterval).pipe(
      startWith(0),
      switchMap(() => this.http.get<ApiResponse<RawTrafficData[]>>(url).pipe(
        tap(response => console.log('Raw server response:', response))
      )),
      map(this.transformResponseArray),
      retry({ count: 2, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  getUserById(userId: number): Observable<ApiResponse<{ userName: string }>> {
    return this.http.get<ApiResponse<User[]>>(`${this.apiUrl}/getUsers?id=${userId}`).pipe(
      map(response => ({
        success: response.success,
        data: response.data && response.data.length > 0 ? { userName: response.data[0].username } : undefined,
        error: response.error || (response.data && response.data.length === 0 ? 'User not found' : undefined),
      })),
      retry({ count: 2, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  private transformResponseArray = (input: ApiResponse<RawTrafficData[]>): ApiResponse<TrafficData[]> => {
    return {
      success: input.success,
      data: input.data ? this.transformToTrafficDataArray(input.data) : undefined,
      error: input.error,
    };
  };

  private transformResponseSingle = (input: ApiResponse<RawTrafficData>): ApiResponse<TrafficData> => ({
    success: input.success,
    data: input.data ? this.mapToTrafficData(input.data) : undefined,
    error: input.error,
  });

  private transformToTrafficDataArray(data: RawTrafficData[]): TrafficData[] {
    return data.map(this.mapToTrafficData);
  }

  private mapToTrafficData(item: RawTrafficData): TrafficData {
    // Определяем, есть ли вложенная структура networkMetrics
    const hasNestedStructure = !!item.networkMetrics;
    return {
      id: item.id ?? 0,
      user_id: typeof item.user_id === 'string' ? parseInt(item.user_id, 10) : item.user_id,
      ip: item.ip,
      timestamp: item.timestamp,
      networkMetrics: {
        byteRate: hasNestedStructure ? (item.networkMetrics?.byteRate ?? 0) : (item.fl_byt_s ?? 0),
        packetRate: hasNestedStructure ? (item.networkMetrics?.packetRate ?? 0) : (item.fl_pck_s ?? 0),
        packetCount: hasNestedStructure ? (item.networkMetrics?.packetCount ?? 0) : (item.packet_count ?? 0),
        forward: {
          maxPacketSize: hasNestedStructure
            ? (item.networkMetrics?.forward.maxPacketSize ?? 0)
            : (item.fwd_max_pack_size ?? 0),
          avgPacketSize: hasNestedStructure
            ? (item.networkMetrics?.forward.avgPacketSize ?? 0)
            : (item.fwd_avg_packet ?? 0),
        },
        backward: {
          maxPacketSize: hasNestedStructure
            ? (item.networkMetrics?.backward.maxPacketSize ?? 0)
            : (item.bck_max_pack_size ?? 0),
          avgPacketSize: hasNestedStructure
            ? (item.networkMetrics?.backward.avgPacketSize ?? 0)
            : (item.bck_avg_packet ?? 0),
        },
        interArrivalTime: {
          forward: {
            stdDev: hasNestedStructure
              ? (item.networkMetrics?.interArrivalTime.forward.stdDev ?? 0)
              : (item.fw_iat_std ?? 0),
            min: hasNestedStructure
              ? (item.networkMetrics?.interArrivalTime.forward.min ?? 0)
              : (item.fw_iat_min ?? 0),
          },
          backward: {
            stdDev: hasNestedStructure
              ? (item.networkMetrics?.interArrivalTime.backward.stdDev ?? 0)
              : (item.bck_iat_std ?? 0),
            min: hasNestedStructure
              ? (item.networkMetrics?.interArrivalTime.backward.min ?? 0)
              : (item.bck_iat_min ?? 0),
          },
        },
      },
      anomalies: {
        autoencoder: item.anomalies?.autoencoder ?? item.anomaly_ae ?? null,
        lstm: item.anomalies?.lstm ?? item.anomaly_lstm ?? null,
        consensus: item.anomalies?.consensus ?? item.anomaly_consensus ?? 0,
      },
    };
  }

  private handleError = (err: any): Observable<ApiResponse<any>> => {
    const errorMessage = err.message || 'Failed to fetch data';
    console.error('API Error:', errorMessage, err);
    return of({
      success: false,
      data: undefined,
      error: errorMessage,
    });
  };
}