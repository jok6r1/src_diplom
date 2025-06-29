from scapy.all import IP
import time
import numpy as np
import pandas as pd
from logger_config import service_logger, packet_logger
from traffic_stats import TrafficStats

INTERVAL_SECONDS = 5
PREDICT_INTERVAL = 5

proto_names = {
    1: "ICMP",
    2: "IGMP",
    6: "TCP",
    17: "UDP",
    41: "IPv6",
    47: "GRE",
    50: "ESP",
    51: "AH",
    89: "OSPF",
    132: "SCTP",
    255: "RAW"
}

def packet_handler(pkt, stats_dict, stats_lock):
    if IP not in pkt:
        service_logger.debug("Пакет без IP пропущен")
        return

    timestamp = time.time()
    src_ip = pkt[IP].src
    dst_ip = pkt[IP].dst

    log_msg = f"{timestamp} - {src_ip} -> {dst_ip} Proto: {proto_names.get(pkt[IP].proto, 'Unknown')} Size: {len(pkt)}"
    packet_logger.info(log_msg)
    service_logger.debug(f"Обработка пакета: {src_ip} -> {dst_ip}")

    with stats_lock:
        if src_ip not in stats_dict:
            stats_dict[src_ip] = TrafficStats()
        if dst_ip not in stats_dict:
            stats_dict[dst_ip] = TrafficStats()

        stats_dict[src_ip].add_packet(pkt, timestamp)
        stats_dict[dst_ip].add_packet(pkt, timestamp)

def periodic_analysis(stats_dict, interval, stats_lock, ae, data_queue, stop_event):
    while True:
        if stop_event.is_set():
            service_logger.debug("Поток анализа приостановлен")
            time.sleep(5)
            continue
        try:
            time.sleep(interval)
            service_logger.debug(f"Запуск анализа за последние {interval} сек...")
            with stats_lock:
                if not stats_dict:
                    service_logger.debug("stats_dict пуст. Пропуск анализа")
                    continue
                ip_list = list(stats_dict.keys())
                service_logger.debug(f"В stats_dict: {len(ip_list)} IP-адресов")
            processed_data = []
            feature_names = ['fl_byt_s', 'fl_pck_s', 'fwd_max_pack_size', 'fwd_avg_packet',
                             'bck_max_pack_size', 'bck_avg_packet', 'fw_iat_std', 'fw_iat_min',
                             'bck_iat_std', 'bck_iat_min', 'packet_count']
            for ip in ip_list:
                with stats_lock:
                    stats = stats_dict.get(ip)
                    if stats:
                        stats.set_ip(ip)
                        features = stats.aggregate_and_store()
                        if features:
                            processed_item = {
                                'ip': ip,
                                'timestamp': pd.Timestamp.now(),
                            }
                            processed_item.update({name: value for name, value in zip(feature_names, features)})
                            service_logger.debug(f"processed_item для IP {ip}: {processed_item}")
                            processed_data.append(processed_item)
            if not processed_data:
                service_logger.debug("Недостаточно данных для анализа")
                continue
            data_queue.put(processed_data)
            service_logger.debug(f"Добавлено {len(processed_data)} записей в очередь")
        except Exception as e:
            service_logger.error(f"Ошибка в periodic_analysis: {str(e)}", exc_info=True)
            time.sleep(interval)

def predict_and_save_anomalies(ae, lstm, interval, data_queue, stop_event):
    EXPRESS_SERVER_URL = "http://localhost:3000/pgadmin/anomalies"
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    while True:
        if stop_event.is_set():
            time.sleep(5)
            continue
        try:
            while data_queue.empty():
                time.sleep(1)
            data = data_queue.get()
            if not data:
                data_queue.task_done()
                continue
            service_logger.debug(f"Структура данных из data_queue: {data}")
            if not isinstance(data, list):
                service_logger.error(f"Данные из очереди не являются списком: {type(data)}")
                data_queue.task_done()
                continue
            processed_data = []
            feature_names = ['fl_byt_s', 'fl_pck_s', 'fwd_max_pack_size', 'fwd_avg_packet',
                             'bck_max_pack_size', 'bck_avg_packet', 'fw_iat_std', 'fw_iat_min',
                             'bck_iat_std', 'bck_iat_min', 'packet_count']
            for item in data:
                if not isinstance(item, dict):
                    service_logger.warning(f"Элемент не является словарем: {item}")
                    continue
                if 'ip' not in item or 'timestamp' not in item:
                    service_logger.warning(f"Отсутствуют обязательные ключи в элементе: {item}")
                    continue
                if not all(feature in item for feature in feature_names):
                    service_logger.warning(f"Отсутствуют необходимые признаки в элементе: {item}")
                    continue
                processed_data.append(item)
            if not processed_data:
                service_logger.warning("Нет корректных данных для обработки")
                data_queue.task_done()
                continue
            df = pd.DataFrame(processed_data)
            if 'timestamp' not in df.columns:
                service_logger.error("Столбец 'timestamp' отсутствует в DataFrame")
                data_queue.task_done()
                continue
            df = df.sort_values(by='timestamp')
            X = df[feature_names].values
            timestamps = df['timestamp'].values
            ips = df['ip'].values
            if X.size == 0:
                service_logger.warning("Нет данных для анализа аномалий")
                data_queue.task_done()
                continue
            anomalies_ae, _, _ = ae.detect_anomalies(X[:, :10]) if ae else [None] * len(X)
            anomalies_lstm, _, _ = lstm.detect_anomalies(X[:, :10]) if lstm else [0] * len(X)
            results = []
            for i in range(len(X)):
                anomaly_ae = anomalies_ae[i] if anomalies_ae is not None else None
                anomaly_lstm = anomalies_lstm[i] if anomalies_lstm is not None else 0
                anomaly_consensus = 1 if (anomaly_ae == 1 and anomaly_lstm == 1) else 0
                features = X[i].tolist()
                service_logger.debug(f"features для IP {ips[i]}: {features}")
                result = {
                    'user_id': 1,
                    'ip': ips[i],
                    'timestamp': str(timestamps[i]),
                    'fl_byt_s': features[0],
                    'fl_pck_s': features[1],
                    'fwd_max_pack_size': features[2],
                    'fwd_avg_packet': features[3],
                    'bck_max_pack_size': features[4],
                    'bck_avg_packet': features[5],
                    'fw_iat_std': features[6],
                    'fw_iat_min': features[7],
                    'bck_iat_std': features[8],
                    'bck_iat_min': features[9],
                    'packet_count': int(features[10]) if features[10] is not None else 0,
                    'anomaly_ae': int(anomaly_ae) if anomaly_ae is not None else None,
                    'anomaly_lstm': int(anomaly_lstm),
                    'anomaly_consensus': int(anomaly_consensus)
                }
                results.append(result)
            service_logger.debug(f"results для отправки: {results}")
            async def run_async_tasks():
                async with aiohttp.ClientSession() as session:
                    await send_data_to_server(session, EXPRESS_SERVER_URL, results)
            loop.run_until_complete(run_async_tasks())
            data_queue.task_done()
            service_logger.info(f"Отправлено {len(results)} записей на сервер")
        except Exception as e:
            service_logger.error(f"Ошибка в predict_and_save_anomalies: {e}", exc_info=True)
            time.sleep(interval)
    loop.close()
    while True:
        if stop_event.is_set():
            service_logger.debug("Поток анализа приостановлен")
            time.sleep(5)
            continue
        
        try:
            time.sleep(interval)
            service_logger.debug(f"Запуск анализа за последние {interval} сек...")
            with stats_lock:
                if not stats_dict:
                    service_logger.debug("stats_dict пуст. Пропуск анализа")
                    continue
                ip_list = list(stats_dict.keys())
                service_logger.debug(f"В stats_dict: {len(ip_list)} IP-адресов")

            processed_data = []
            feature_names = ['fl_byt_s', 'fl_pck_s', 'fwd_max_pack_size', 'fwd_avg_packet',
                             'bck_max_pack_size', 'bck_avg_packet', 'fw_iat_std', 'fw_iat_min',
                             'bck_iat_std', 'bck_iat_min', 'packet_count']

            for ip in ip_list:
                with stats_lock:
                    stats = stats_dict.get(ip)
                    if stats:
                        stats.set_ip(ip)
                        features = stats.aggregate_and_store()
                        if features:
                            processed_item = {
                                'ip': ip,
                                'timestamp': pd.Timestamp.now(),
                            }
                            processed_item.update({name: value for name, value in zip(feature_names, features)})
                            processed_data.append(processed_item)
                
            if not processed_data:
                service_logger.debug("Недостаточно данных для анализа")
                continue
                
            data_queue.put(processed_data)
            service_logger.debug(f"Добавлено {len(processed_data)} записей в очередь")
        except Exception as e:
            service_logger.error(f"Ошибка в periodic_analysis: {str(e)}", exc_info=True)
            time.sleep(interval)

__all__ = ['packet_handler', 'periodic_analysis']