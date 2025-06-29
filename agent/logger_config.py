# Настройка логгеров

import logging
from logging.handlers import RotatingFileHandler

# Получаем логгеры
service_logger = logging.getLogger('service')
packet_logger = logging.getLogger('packet')

def init_loggers():
    # Устанавливаем уровни логирования
    service_logger.setLevel(logging.INFO)
    packet_logger.setLevel(logging.INFO)

    # Очищаем старые обработчики
    for logger in [service_logger, packet_logger]:
        for handler in logger.handlers[:]:
            logger.removeHandler(handler)

    # Настройка форматтеров
    service_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    packet_formatter = logging.Formatter('%(asctime)s - %(message)s')

    # Обработчики для service логгера
    service_handler = RotatingFileHandler('log_files/service.log', maxBytes=1_000_000, backupCount=3)
    service_handler.setFormatter(service_formatter)
    service_logger.addHandler(service_handler)

    # Обработчики для packet логгера
    packet_handler = RotatingFileHandler('log_files/packets.log', maxBytes=50_000_000, backupCount=5)
    packet_handler.setFormatter(packet_formatter)
    packet_logger.addHandler(packet_handler)

    # Добавляем консольный обработчик
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    service_logger.addHandler(console_handler)

# Экспортируем логгеры для использования в других модулях
__all__ = ['init_loggers', 'service_logger', 'packet_logger']