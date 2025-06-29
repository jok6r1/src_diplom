import numpy as np
import os
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, Dense
from tensorflow.keras.callbacks import EarlyStopping
from sklearn.preprocessing import RobustScaler, MinMaxScaler
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

class AutoEncoder:
    def __init__(self, input_dim, encoding_dim=4, hidden_layers=[32, 16, 8], activation='relu', optimizer='adam', loss='mae'):
        self.input_dim = input_dim
        self.encoding_dim = encoding_dim
        self.hidden_layers = hidden_layers
        self.activation = activation
        self.optimizer = optimizer
        self.loss = loss
        self.autoencoder = None
        self.encoder = None
        self.history = None
        self.robust_scaler = RobustScaler()
        self.minmax_scaler = MinMaxScaler()

    def preprocess_data(self, X):
        """Предобработка данных с RobustScaler и MinMaxScaler."""
        # Замена бесконечных значений и NaN
        X = np.where(np.isinf(X), np.nan, X)
        col_medians = np.nanmedian(X, axis=0)
        for i in range(X.shape[1]):
            X[:, i] = np.where(np.isnan(X[:, i]), col_medians[i], X[:, i])
        # Ограничение выбросов
        X = np.clip(X, -1e6, 1e6)
        X_robust = self.robust_scaler.fit_transform(X)
        X_scaled = self.minmax_scaler.fit_transform(X_robust)
        return X_scaled

    def inverse_preprocess(self, X_scaled):
        """Обратное преобразование данных."""
        X_robust = self.minmax_scaler.inverse_transform(X_scaled)
        X_original = self.robust_scaler.inverse_transform(X_robust)
        return X_original

    def build_model(self, input_dim=None):
        """Построение архитектуры автоэнкодера."""
        if input_dim is None:
            input_dim = self.input_dim
        
        input_layer = Input(shape=(input_dim,))
        encoded = input_layer
        for units in self.hidden_layers:
            encoded = Dense(units, activation=self.activation)(encoded)
        encoded = Dense(self.encoding_dim, activation=self.activation)(encoded)
        
        decoded = encoded
        for units in reversed(self.hidden_layers):
            decoded = Dense(units, activation=self.activation)(decoded)
        decoded = Dense(input_dim, activation='sigmoid')(decoded)
        
        self.autoencoder = Model(input_layer, decoded)
        self.encoder = Model(input_layer, encoded)
        self.autoencoder.compile(optimizer=self.optimizer, loss=self.loss)
        return self.autoencoder

    def train(self, X_train, epochs=100, batch_size=64, validation_split=0.2, verbose=1, threshold_percentile=98):
        """Обучение автоэнкодера."""
        self.X_transformed = self.preprocess_data(X_train)
        self.input_dim = X_train.shape[1]
        
        if self.autoencoder is None:
            self.build_model(input_dim=self.input_dim)
        
        early_stopping = EarlyStopping(monitor='val_loss', patience=10, restore_best_weights=True)
        self.history = self.autoencoder.fit(
            self.X_transformed, self.X_transformed,
            epochs=epochs,
            batch_size=batch_size,
            shuffle=True,
            validation_split=validation_split,
            callbacks=[early_stopping],
            verbose=verbose
        )
        self.plot_training_history()
        return self.history

    def predict(self, X):
        """Предсказание восстановленных данных."""
        if self.autoencoder is None:
            raise ValueError("Модель не построена. Сначала вызовите train().")
        
        X_processed = self.preprocess_data(X)
        X_reconstructed = self.autoencoder.predict(X_processed, verbose=0)
        X_reconstructed = self.inverse_preprocess(X_reconstructed)
        return X_reconstructed

    def detect_anomalies(self, X, threshold_percentile=90):
        """Обнаружение аномалий на основе ошибки восстановления."""
        X_reconstructed = self.predict(X)
        mse = np.mean(np.square(X - X_reconstructed), axis=1)
        threshold = np.percentile(mse, threshold_percentile)
        anomalies = (mse > threshold).astype(int)
        
        self.plot_anomalies(X, anomalies, mse, threshold)
        return anomalies, mse, threshold

    def plot_anomalies(self, X, anomalies, mse, threshold, prefix='ae'):
        """Визуализация аномалий."""
        os.makedirs('autoencoder_png', exist_ok=True)
        plt.figure(figsize=(12, 6))
        plt.hist(mse, bins=100, color='skyblue', edgecolor='black', alpha=0.7)
        plt.axvline(threshold, color='red', linestyle='--', label=f'Порог ({threshold:.4f})')
        plt.title('Распределение ошибок восстановления')
        plt.xlabel('MSE')
        plt.ylabel('Частота')
        plt.legend()
        plt.savefig(f'autoencoder_png/{prefix}_mse_histogram.png')
        plt.close()
        
        plt.figure(figsize=(10, 6))
        plt.scatter(X[:, 0], X[:, 1], c=anomalies, cmap='coolwarm', alpha=0.5)
        plt.title('Обнаруженные аномалии (fl_byt_s vs fl_pck_s)')
        plt.xlabel('fl_byt_s')
        plt.ylabel('fl_pck_s')
        plt.colorbar(label='0 - норма, 1 - аномалия')
        plt.savefig(f'autoencoder_png/{prefix}_anomalies_scatter.png')
        plt.close()

    def plot_training_history(self, prefix='ae'):
        """Визуализация кривых обучения."""
        if self.history is None:
            return
        os.makedirs('autoencoder_png', exist_ok=True)
        plt.figure(figsize=(10, 6))
        plt.plot(self.history.history['loss'], label='Training Loss')
        plt.plot(self.history.history['val_loss'], label='Validation Loss')
        plt.title('Кривые обучения автоэнкодера')
        plt.xlabel('Эпоха')
        plt.ylabel(f'{self.loss.upper()} Loss')
        plt.legend()
        plt.grid(True)
        plt.savefig(f'autoencoder_png/{prefix}_training_history.png')
        plt.close()