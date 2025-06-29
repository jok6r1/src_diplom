import signal
from threading import Thread, Lock, Event
from queue import Queue
from collections import defaultdict
from logger_config import init_loggers, service_logger
from interface_selector import NetworkInterfaceSelector
from traffic_stats import TrafficStats
from packet_processor import periodic_analysis
from robust_sniff import robust_sniff
from autoencoder import AutoEncoder
from simple_lstm import SimpleLSTM
import os
import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text
import psycopg2
from psycopg2 import pool
import joblib
import time
from dotenv import load_dotenv
import tensorflow as tf
import asyncio
import aiohttp
from sklearn.utils.validation import check_is_fitted
import warnings
from datetime import datetime

warnings.filterwarnings("ignore", category=UserWarning)

INTERVAL_SECONDS = 5
PREDICT_INTERVAL = 5
LEARNING_EPOCH_AE = 1
LEARNING_EPOCH_LSTM = 3
BATCH_SIZE = 32
ENCODING_DIM = 3
HIDDEN_LAYERS = 10
MIN_CONN = 1
MAX_CONN = 7
RETRAIN_INTERVAL = 60 * 60  # 20 минут в секундах

db_pool = None
stats_lock = Lock()
data_queue = Queue()
stop_event = Event()

ip = ''

DB_CONFIG = {
    "dbname": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT")
}
TABLE_NAME = os.getenv('TABLE_NAME', 'traffic_with_anomalies')



def load_or_train_autoencoder(
    model_path='saved_ml/autoencoder_model.keras',
    robust_scaler_path='saved_ml/autoencoder_robust_scaler.pkl',
    minmax_scaler_path='saved_ml/autoencoder_minmax_scaler.pkl'
):
    try:
        init_loggers()
        service_logger.info("Инициализация load_or_train_autoencoder")

        #service_logger.warning(f"Таблица '{TABLE_NAME}' отсутствует. Запуск без предварительного обучения.")
        service_logger.info("Модель Autoencoder обучена")
        ae = AutoEncoder(input_dim=10, encoding_dim=4, hidden_layers=[32, 16, 8])
        ae.build_model()
        dummy_data = np.random.rand(10, 10)
        ae.robust_scaler.fit(dummy_data)
        ae.minmax_scaler.fit(ae.robust_scaler.transform(dummy_data))
        #service_logger.info("Scalers AutoEncoder обучены на случайных данных")
        return ae
        
        choice = input("Переобучить модель AutoEncoder? (y/n): ").strip().lower()
        
        if choice == 'n':
            if os.path.exists(model_path) and os.path.exists(robust_scaler_path) and os.path.exists(minmax_scaler_path):
                service_logger.info(f"Попытка загрузки модели AutoEncoder из {model_path}")
                ae_model = tf.keras.models.load_model(model_path)
                ae = AutoEncoder(input_dim=10, encoding_dim=4, hidden_layers=[32, 16, 8])
                ae.autoencoder = ae_model
                ae.autoencoder.compile(optimizer='adam', loss='mae')
                ae.robust_scaler = joblib.load(robust_scaler_path)
                ae.minmax_scaler = joblib.load(minmax_scaler_path)
                service_logger.info("Модель AutoEncoder и scalers успешно загружены")
                return ae
            else:
                service_logger.warning("Файлы модели или scalers отсутствуют. Переход к обучению.")
        
        service_logger.info("Начало обучения новой модели AutoEncoder")
        with engine.connect() as conn:
            df = pd.read_sql_table(TABLE_NAME, conn)
        if df.empty:
            service_logger.warning(f"Таблица '{TABLE_NAME}' пуста. Обучение невозможно.")
            ae = AutoEncoder(input_dim=10, encoding_dim=4, hidden_layers=[32, 16, 8])
            ae.build_model()
            dummy_data = np.random.rand(10, 10)
            ae.robust_scaler.fit(dummy_data)
            ae.minmax_scaler.fit(ae.robust_scaler.transform(dummy_data))
            service_logger.info("Scalers AutoEncoder обучены на случайных данных")
            return ae
        
        df = df.sort_values(by='timestamp')
        X = df[['fl_byt_s', 'fl_pck_s', 'fwd_max_pack_size', 'fwd_avg_packet',
                'bck_max_pack_size', 'bck_avg_packet', 'fw_iat_std', 'fw_iat_min',
                'bck_iat_std', 'bck_iat_min']].values
        ae = AutoEncoder(input_dim=X.shape[1], encoding_dim=4, hidden_layers=[32, 16, 8])
        ae.train(X, epochs=LEARNING_EPOCH_AE, batch_size=64, threshold_percentile=90)
        os.makedirs('saved_ml', exist_ok=True)
        ae.autoencoder.save(model_path)
        joblib.dump(ae.robust_scaler, robust_scaler_path)
        joblib.dump(ae.minmax_scaler, minmax_scaler_path)
        service_logger.info(f"Модель обучена и сохранена: {model_path}, robust scaler: {robust_scaler_path}, minmax scaler: {minmax_scaler_path}")
        return ae
    except Exception as e:
        service_logger.error(f"Ошибка в load_or_train_autoencoder: {e}", exc_info=True)
        return None
    
def load_or_train_lstm(model_path='saved_ml/lstm_model.keras', scaler_path='saved_ml/lstm_scaler.pkl'):
    try:
        sequence_length = 3
        
        service_logger.info("Инициализация load_or_train_lstm")

        #service_logger.warning(f"Таблица '{TABLE_NAME}' отсутствует. Запуск без предварительного обучения.")
        service_logger.info("Модель LSTM обучена")
        lstm = SimpleLSTM(input_dim=10, sequence_length=sequence_length)
        lstm._build_model()
        dummy_data = np.random.rand(10, 10)
        lstm.scaler.fit(dummy_data)
        #service_logger.info("Scaler LSTM обучен на случайных данных")
        return lstm
        
        choice = input("Переобучить LSTM? (y/n): ").strip().lower()
        
        if choice == 'n':
            lstm = SimpleLSTM.load_model(model_path, scaler_path)
            if lstm:
                service_logger.debug(f"Scaler LSTM загружен: {hasattr(lstm.scaler, 'center_')}")
                return lstm
            service_logger.warning("Не удалось загрузить LSTM. Переход к обучению.")
        
        service_logger.info("Начало обучения новой модели LSTM")
        with engine.connect() as conn:
            df = pd.read_sql_table(TABLE_NAME, conn)
        if df.empty:
            service_logger.warning(f"Таблица '{TABLE_NAME}' пуста. Обучение LSTM невозможно.")
            lstm = SimpleLSTM(input_dim=10, sequence_length=sequence_length)
            lstm._build_model()
            dummy_data = np.random.rand(10, 10)
            lstm.scaler.fit(dummy_data)
            service_logger.info("Scaler LSTM обучен на случайных данных")
            return lstm
        
        df = df.sort_values(by='timestamp')
        X = df[['fl_byt_s', 'fl_pck_s', 'fwd_max_pack_size', 'fwd_avg_packet',
                'bck_max_pack_size', 'bck_avg_packet', 'fw_iat_std', 'fw_iat_min',
                'bck_iat_std', 'bck_iat_min']].values
        
        lstm = SimpleLSTM(input_dim=10, sequence_length=sequence_length)
        history = lstm.train(X, epochs=LEARNING_EPOCH_LSTM, batch_size=BATCH_SIZE, threshold_percentile=90)
        
        if history is None:
            service_logger.warning("Обучение не удалось из-за недостатка данных")
            return lstm
        
        anomalies, errors, threshold = lstm.detect_anomalies(X)
        service_logger.info(f"Обнаружено {sum(anomalies)} аномалий из {len(anomalies)} предсказаний")
        
        with engine.connect() as conn:
            df['anomaly_lstm'] = anomalies
            df.to_sql(TABLE_NAME, conn, if_exists='replace', index=False)
            service_logger.info(f"Таблица '{TABLE_NAME}' обновлена с предсказаниями anomaly_lstm")
        
        lstm.save_model(model_path, scaler_path)
        service_logger.info(f"Модель сохранена: {model_path}, scaler: {scaler_path}")
        return lstm
    except Exception as e:
        service_logger.error(f"Ошибка в load_or_train_lstm: {e}", exc_info=True)
        return None

async def get_data_from_server(page=1, page_size=100):
    url = f"http://{ip}:3000/pgadmin/anomalies?page={page}&page_size={page_size}"
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            if response.status == 200:
                data = await response.json()
                service_logger.info(f"Получено {len(data['data'])} записей со страницы {page}")
                return data['data']
            else:
                service_logger.error(f"Ошибка получения данных: {response.status} - {await response.text()}")
                return []

async def fetch_all_data():
    page = 1
    page_size = 100
    all_data = []
    
    while True:
        data = await get_data_from_server(page, page_size)
        if not data:
            break
        all_data.extend(data)
        page += 1
    return all_data

def retrain_models(ae, lstm, stop_event):
    while True:
        try:
            time.sleep(RETRAIN_INTERVAL)
            service_logger.info("Запуск переобучения моделей...")
            stop_event.set()
            
            data = asyncio.run(fetch_all_data())
            if not data:
                service_logger.warning("Данные с сервера не получены, переобучение пропущено")
                stop_event.clear()
                continue
            
            df = pd.DataFrame(data)
            df = df.sort_values(by='timestamp')
            X = df[['fl_byt_s', 'fl_pck_s', 'fwd_max_pack_size', 'fwd_avg_packet',
                    'bck_max_pack_size', 'bck_avg_packet', 'fw_iat_std', 'fw_iat_min',
                    'bck_iat_std', 'bck_iat_min']].values
            
            ae.train(X, epochs=LEARNING_EPOCH_AE, batch_size=BATCH_SIZE, threshold_percentile=90)
            ae.autoencoder.save('saved_ml/autoencoder_model.keras')
            joblib.dump(ae.robust_scaler, 'saved_ml/autoencoder_robust_scaler.pkl')
            joblib.dump(ae.minmax_scaler, 'saved_ml/autoencoder_minmax_scaler.pkl')
            service_logger.info("AutoEncoder переобучен и сохранён")
            
            lstm.train(X, epochs=LEARNING_EPOCH_LSTM, batch_size=BATCH_SIZE, threshold_percentile=90)
            lstm.save_model('saved_ml/lstm_model.keras', 'saved_ml/lstm_scaler.pkl')
            service_logger.info("LSTM переобучен и сохранён")
            
            stop_event.clear()
            service_logger.info("Переобучение завершено")
        
        except Exception as e:
            service_logger.error(f"Ошибка в retrain_models: {e}", exc_info=True)
            time.sleep(5)

async def send_data_to_server(session, url, data):
    try:
        async with session.post(url, json=data, headers={'Content-Type': 'application/json'}, timeout=aiohttp.ClientTimeout(total=10)) as response:
            if response.status == 200:
                service_logger.info(f"Данные успешно отправлены на сервер: {url}")
            else:
                service_logger.warning(f"Ошибка при отправке данных на сервер: {response.status} - {await response.text()}")
    except asyncio.TimeoutError:
        service_logger.error(f"Тайм-аут при отправке данных на сервер: {url}")
    except aiohttp.ClientError as e:
        service_logger.error(f"Не удалось отправить данные на сервер: {e}")

def predict_and_save_anomalies(ae, lstm, interval, data_queue, stop_event):
    EXPRESS_SERVER_URL = f"http://{ip}:3000/pgadmin/anomalies"
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

            # Логирование структуры данных для диагностики
            service_logger.debug(f"Структура данных из data_queue: {data}")
            service_logger.debug(f"Тип данных: {type(data)}")

            # Проверяем, что данные - список словарей
            if not isinstance(data, list):
                service_logger.error(f"Данные из очереди не являются списком: {type(data)}")
                data_queue.task_done()
                continue

            # Проверяем корректность каждого элемента
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

            # Создаем DataFrame
            df = pd.DataFrame(processed_data)
            if 'timestamp' not in df.columns:
                service_logger.error("Столбец 'timestamp' отсутствует в DataFrame")
                data_queue.task_done()
                continue

            # Сортировка по времени
            df = df.sort_values(by='timestamp')
            X = df[feature_names].values
            timestamps = df['timestamp'].values
            ips = df['ip'].values

            # Проверка наличия данных для анализа
            if X.size == 0:
                service_logger.warning("Нет данных для анализа аномалий")
                data_queue.task_done()
                continue

            # Используем только первые 10 признаков для анализа аномалий, исключая packet_count
            anomalies_ae, _, _ = ae.detect_anomalies(X[:, :10]) if ae else [None] * len(X)
            anomalies_lstm, _, _ = lstm.detect_anomalies(X[:, :10]) if lstm else [0] * len(X)

            results = []
            for i in range(len(X)):
                anomaly_ae = anomalies_ae[i] if anomalies_ae is not None else None
                anomaly_lstm = anomalies_lstm[i] if anomalies_lstm is not None else 0
                anomaly_consensus = 1 if (anomaly_ae == 1 and anomaly_lstm == 1) else 0

                features = X[i].tolist()
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
                    'packet_count': int(features[10]),
                    'anomaly_ae': int(anomaly_ae) if anomaly_ae is not None else None,
                    'anomaly_lstm': int(anomaly_lstm),
                    'anomaly_consensus': int(anomaly_consensus)
                }
                results.append(result)

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

def cleanup(signum, frame):
    global db_pool
    service_logger.info("Получен сигнал завершения, закрытие соединений...")
    stop_event.set()
    time.sleep(2)
    if db_pool:
        db_pool.closeall()
        service_logger.info("Все соединения с PostgreSQL закрыты")
    exit(0)

def main(ae, lstm):
    try:
        init_loggers()
        signal.signal(signal.SIGINT, cleanup)
        signal.signal(signal.SIGTERM, cleanup)

        service_logger.info("Запуск анализа сетевого трафика")
        stats_dict = defaultdict(TrafficStats)
        selector = NetworkInterfaceSelector()
        interface_info = None

        if selector.get_network_interfaces():
            selector.print_selected_interface()
            interface_info = selector.get_selected_info()
        else:
            service_logger.info("Выбор интерфейса отменён")
            return

        analysis_thread = Thread(
            target=periodic_analysis,
            args=(stats_dict, INTERVAL_SECONDS, stats_lock, ae, data_queue, stop_event),
            daemon=True,
            name="AnalysisThread"
        )
        predict_thread = Thread(
            target=predict_and_save_anomalies,
            args=(ae, lstm, PREDICT_INTERVAL, data_queue, stop_event),
            daemon=True,
            name="PredictThread"
        )
        retrain_thread = Thread(
            target=retrain_models,
            args=(ae, lstm, stop_event),
            daemon=True,
            name="RetrainThread"
        )
        sniff_thread = Thread(
            target=robust_sniff,
            args=(interface_info['interface_name'] if interface_info else None, stats_dict, stats_lock, stop_event),
            daemon=True,
            name="SniffThread"
        )

        service_logger.info("Запуск потока анализа")
        analysis_thread.start()
        service_logger.info("Запуск потока предсказания")
        predict_thread.start()
        service_logger.info("Запуск потока переобучения")
        retrain_thread.start()
        service_logger.info("Запуск потока сниффинга")
        sniff_thread.start()

        sniff_thread.join()

    except KeyboardInterrupt:
        service_logger.info("Завершение работы по сигналу пользователя")
    except Exception as e:
        service_logger.critical(f"Критическая ошибка в main: {str(e)}", exc_info=True)
        raise
    finally:
        stop_event.set()
        time.sleep(2)
        service_logger.info("Все потоки завершены")

if __name__ == "__main__":
    load_dotenv(override=True)

    ip = input("Введите ip адрес менеджера: ")

    ae = load_or_train_autoencoder()
    if ae is None:
        service_logger.error("Не удалось инициализировать AutoEncoder. Программа завершена.")
        exit(1)
    
    lstm = load_or_train_lstm()
    if lstm is None:
        service_logger.error("Не удалось инициализировать LSTM. Программа завершена.")
        exit(1)
    
    main(ae, lstm)
    if db_pool:
        db_pool.closeall()