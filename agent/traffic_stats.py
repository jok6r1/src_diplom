import time
import numpy as np
from scapy.all import IP

class TrafficStats:
    def __init__(self, max_history=10):
        self.packets = []
        self.start_time = time.time()
        self.history = []
        self.max_history = max_history
        self.ip = None
        self.interval_gap = 0.25  # Максимальный допустимый разрыв между интервалами (в секундах)

    def add_packet(self, pkt, timestamp):
        self.packets.append((pkt, timestamp))

    def reset_packets(self):
        self.packets = []
        self.start_time = time.time()

    def _split_into_intervals(self):
        """Разделяет пакеты на временные интервалы активности"""
        if not self.packets:
            return []

        sorted_packets = sorted(self.packets, key=lambda x: x[1])
        intervals = []
        current_interval = [sorted_packets[0]]

        for pkt, ts in sorted_packets[1:]:
            last_ts = current_interval[-1][1]
            if ts - last_ts > self.interval_gap:
                intervals.append(current_interval)
                current_interval = [(pkt, ts)]
            else:
                current_interval.append((pkt, ts))
        intervals.append(current_interval)
        
        return intervals

    def set_ip(self, ip):
        self.ip = ip

    def aggregate_and_store(self):
        if not self.packets:
            return None

        intervals = self._split_into_intervals()

        total_active_duration = sum(
            max(interval[-1][1] - interval[0][1], 1e-6)
            for interval in intervals
        )

        total_bytes = sum(len(p) for p, _ in self.packets)
        total_packets = len(self.packets)

        fl_byt_s = total_bytes / total_active_duration
        fl_pck_s = total_packets / total_active_duration

        fwd_packets = [p for p, _ in self.packets if p[IP].src == self.ip]
        bck_packets = [p for p, _ in self.packets if p[IP].dst == self.ip]

        fwd_sizes = [len(p) for p in fwd_packets]
        fwd_max = max(fwd_sizes) if fwd_sizes else 0
        fwd_avg = np.mean(fwd_sizes) if fwd_sizes else 0

        bck_sizes = [len(p) for p in bck_packets]
        bck_max = max(bck_sizes) if bck_sizes else 0
        bck_avg = np.mean(bck_sizes) if bck_sizes else 0

        fwd_timestamps = [t for p, t in self.packets if p[IP].src == self.ip]
        bck_timestamps = [t for p, t in self.packets if p[IP].dst == self.ip]

        fwd_iat = np.diff(fwd_timestamps) if len(fwd_timestamps) > 1 else []
        bck_iat = np.diff(bck_timestamps) if len(bck_timestamps) > 1 else []

        features = [
            fl_byt_s,
            fl_pck_s,
            fwd_max,
            fwd_avg,
            bck_max,
            bck_avg,
            np.std(fwd_iat) if len(fwd_iat) > 0 else 0,
            np.min(fwd_iat) if len(fwd_iat) > 0 else 0,
            np.std(bck_iat) if len(bck_iat) > 0 else 0,
            np.min(bck_iat) if len(bck_iat) > 0 else 0,
            total_packets  # Добавляем packet_count
        ]

        self.history.append(features)
        if len(self.history) > self.max_history:
            self.history.pop(0)
        self.reset_packets()
        return features

__all__ = ['TrafficStats']