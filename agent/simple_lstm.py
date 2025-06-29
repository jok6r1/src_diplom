import numpy as np
import os
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.regularizers import l2
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping
from sklearn.preprocessing import RobustScaler
import matplotlib.pyplot as plt

class SimpleLSTM:
    def __init__(self, input_dim, sequence_length=3, units=32, dropout=0.3):
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.min_data_points = sequence_length
        self.units = units
        self.dropout = dropout
        self.scaler = RobustScaler()
        self.model = self._build_model()

    def _build_model(self):
        model = Sequential([
            LSTM(self.units, 
                 input_shape=(self.sequence_length, self.input_dim),
                 return_sequences=True,
                 kernel_regularizer=l2(0.001)),
            Dropout(self.dropout),
            LSTM(self.units // 2),
            Dense(self.input_dim)
        ])
        model.compile(optimizer=Adam(learning_rate=0.0001), loss='mse')
        return model

    def preprocess_data(self, X):
        """Предобработка данных."""
        X = np.array(X, dtype=np.float32)
        X = np.where(np.isinf(X), np.nan, X)
        if np.isnan(X).any():
            col_medians = np.nanmedian(X, axis=0)
            for i in range(X.shape[1]):
                X[:, i] = np.where(np.isnan(X[:, i]), col_medians[i], X[:, i])
        X = np.clip(X, -1e6, 1e6)
        return X

    def visualize_sequences(self, X, num_samples=3):
        """Визуализация последовательностей."""
        os.makedirs('lstm_png', exist_ok=True)
        for i in range(min(num_samples, len(X))):
            group = X[i]
            plt.figure(figsize=(10, 4))
            for j in range(group.shape[1]):
                plt.plot(group[:, j], label=f'Feature {j}')
            plt.title(f'Sample {i+1}')
            plt.xlabel('Timestep')
            plt.ylabel('Value')
            plt.legend()
            plt.savefig(f'lstm_png/sample_{i+1}.png')
            plt.close()

            scaled_group = self.scaler.transform(group)
            plt.figure(figsize=(10, 4))
            for j in range(scaled_group.shape[1]):
                plt.plot(scaled_group[:, j], label=f'Scaled Feature {j}')
            plt.title(f'Sample {i+1} (Scaled)')
            plt.xlabel('Timestep')
            plt.ylabel('Scaled Value')
            plt.legend()
            plt.savefig(f'lstm_png/sample_{i+1}_scaled.png')
            plt.close()

    def create_sequences(self, data):
        """Создание последовательностей из временного ряда."""
        xs, ys = [], []
        if len(data) > self.sequence_length:
            for i in range(len(data) - self.sequence_length):
                x = data[i:i + self.sequence_length]
                y = data[i + self.sequence_length]
                xs.append(x)
                ys.append(y)
        return np.array(xs), np.array(ys)

    def train(self, X_data, epochs=7, batch_size=16, validation_split=0.2, verbose=1, threshold_percentile=98):
        """Обучение модели LSTM."""
        X_data = self.preprocess_data(X_data)
        self.scaler.fit(X_data)
        self.visualize_sequences([X_data[:self.sequence_length * 3]], num_samples=3)
        
        scaled_data = self.scaler.transform(X_data)
        scaled_data = np.clip(scaled_data, -10, 10)
        
        X_sequences, y_sequences = self.create_sequences(scaled_data)
        
        if len(X_sequences) == 0:
            print("Недостаточно данных для создания временных окон")
            return None
        
        early_stopping = EarlyStopping(monitor='val_loss', patience=10, restore_best_weights=True)
        history = self.model.fit(
            X_sequences, y_sequences,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=validation_split,
            callbacks=[early_stopping],
            verbose=verbose
        )
        self.plot_training_history(history)
        return history

    def predict(self, X_data):
        """Предсказание следующих значений."""
        X_data = self.preprocess_data(X_data)
        scaled_data = self.scaler.transform(X_data)
        scaled_data = np.clip(scaled_data, -10, 10)
        
        predictions = []
        if len(scaled_data) >= self.sequence_length:
            X_seq = np.array([scaled_data[i:i + self.sequence_length] 
                              for i in range(len(scaled_data) - self.sequence_length + 1)])
            pred = self.model.predict(X_seq, verbose=0)
            predictions.append(pred)
        else:
            predictions.append(np.zeros((1, self.input_dim)))
        
        return predictions

    def detect_anomalies(self, X_data, threshold_percentile=90):
        """Обнаружение аномалий на основе ошибки предсказания."""
        X_data = self.preprocess_data(X_data)
        scaled_data = self.scaler.transform(X_data)
        scaled_data = np.clip(scaled_data, -10, 10)
        errors = []
        
        if len(scaled_data) > self.sequence_length:
            X_seq = np.array([scaled_data[i:i + self.sequence_length] 
                              for i in range(len(scaled_data) - self.sequence_length)])
            if X_seq.shape[0] == 0:
                return np.array([0] * len(X_data)), np.array([]), 0
            y_true = scaled_data[self.sequence_length:]
            y_pred = self.model.predict(X_seq, verbose=0)
            mse = np.mean(np.square(y_true - y_pred), axis=1)
            errors.extend(mse)
        
        if not errors:
            return np.array([0] * len(X_data)), np.array([]), 0
        
        errors = np.array(errors)
        threshold = np.percentile(errors, threshold_percentile)
        
        plt.figure(figsize=(10, 6))
        plt.hist(errors, bins=50, color='skyblue', edgecolor='black', alpha=0.7)
        plt.axvline(threshold, color='red', linestyle='--', label=f'Threshold ({threshold:.4f})')
        plt.title('Distribution of Prediction Errors')
        plt.xlabel('MSE')
        plt.ylabel('Frequency')
        plt.legend()
        os.makedirs('lstm_png', exist_ok=True)
        plt.savefig('lstm_png/error_distribution.png')
        plt.close()
        
        anomalies = []
        if len(scaled_data) > self.sequence_length:
            X_seq = np.array([scaled_data[i:i + self.sequence_length] 
                              for i in range(len(scaled_data) - self.sequence_length)])
            y_true = scaled_data[self.sequence_length:]
            y_pred = self.model.predict(X_seq, verbose=0)
            mse = np.mean(np.square(y_true - y_pred), axis=1)
            anomalies.extend((mse > threshold).astype(int))
            anomalies = [0] * self.sequence_length + anomalies
        else:
            anomalies = [0] * len(X_data)
        
        return np.array(anomalies), errors, threshold

    def plot_training_history(self, history):
        """Визуализация истории обучения."""
        plt.figure(figsize=(10, 6))
        plt.plot(history.history['loss'], label='Train Loss')
        plt.plot(history.history['val_loss'], label='Validation Loss')
        plt.yscale('log')
        plt.xlabel('Epoch')
        plt.ylabel('Loss')
        plt.title('Training and Validation Loss')
        plt.legend()
        os.makedirs('lstm_png', exist_ok=True)
        plt.savefig('lstm_png/lstm_training_history.png')
        plt.close()

    def save_model(self, model_path, scaler_path):
        self.model.save(model_path)
        import joblib
        joblib.dump(self.scaler, scaler_path)

    @classmethod
    def load_model(cls, model_path, scaler_path):
        import tensorflow as tf
        import joblib
        if not (os.path.exists(model_path) and os.path.exists(scaler_path)):
            return None
        model = tf.keras.models.load_model(model_path)
        scaler = joblib.load(scaler_path)
        lstm = cls(input_dim=10)
        lstm.model = model
        lstm.scaler = scaler
        return lstm