export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
  }
  
  export interface TrafficData {
    id: number;
    user_id: number;
    ip: string;
    timestamp: string; // ISO 8601 string
    networkMetrics: {
      byteRate: number;
      packetRate: number;
      packetCount: number; // Added for packet_count
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
    anomalies: {
      autoencoder: number | null;
      lstm: number | null;
      consensus: number;
    };
  }
  
  export interface User {
    id: number;
    username: string;
    email: string;
    is_active: boolean;
    role: string;
  }