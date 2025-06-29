from scapy.all import sniff
import time
import psutil
from logger_config import service_logger
from packet_processor import packet_handler

RETRY_DELAY = 5
MAX_RETRIES = 10

def is_interface_available(interface_name):
    interfaces = psutil.net_if_addrs()
    if interface_name not in interfaces:
        return False
    stats = psutil.net_if_stats()
    return interface_name in stats and stats[interface_name].isup


def robust_sniff(iface, stats_dict, stats_lock, stop_event):
    retries = 0
    while retries < MAX_RETRIES:
        if stop_event.is_set():
            service_logger.info("Сниффинг приостановлен во время переобучения")
            time.sleep(5)
            continue
        
        try:
            if iface and not is_interface_available(iface):
                time.sleep(RETRY_DELAY)
                retries += 1
                continue
            
            sniff(iface=iface, prn=lambda pkt: packet_handler(pkt, stats_dict, stats_lock), store=0)
            retries = 0
        except Exception as e:
            service_logger.error(f"Ошибка захвата: {e}. Retry {retries + 1}/{MAX_RETRIES}")
            time.sleep(RETRY_DELAY)
            retries += 1