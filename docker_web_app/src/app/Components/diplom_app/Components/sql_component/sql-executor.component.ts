import { Component, OnInit, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SqlService } from './sql.service';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sql-executor',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './sql-executor.component.html',
  styleUrls: ['./sql-executor.component.scss']
})
export class SqlExecutorComponent implements OnInit {
  sqlForm: FormGroup;
  isConnected = false;
  loading = false;
  error: string | null = null;
  resultMessage: string | null = null;
  tableData: any[] = [];
  tableColumns: string[] = [];
  showPredefinedQueries = false;
  
  isPopupVisible = false;
  private isPPressed = false;
  private isBacktickPressed = false;

  predefinedQueries: { [key: string]: string } = {
    '1. Первые 10 записей в traffic_with_anomalies': 'SELECT * FROM traffic_with_anomalies LIMIT 10',
    '2. Создание таблицы traffic_with_anomalies': `
        CREATE TABLE IF NOT EXISTS traffic_with_anomalies (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            ip VARCHAR(45),
            timestamp TIMESTAMP,
            fl_byt_s FLOAT,
            fl_pck_s FLOAT,
            fwd_max_pack_size FLOAT,
            fwd_avg_packet FLOAT,
            bck_max_pack_size FLOAT,
            bck_avg_packet FLOAT,
            fw_iat_std FLOAT,
            fw_iat_min FLOAT,
            bck_iat_std FLOAT,
            bck_iat_min FLOAT,
            packet_count INTEGER,
            anomaly_ae INTEGER,
            anomaly_lstm INTEGER,
            anomaly_consensus INTEGER
        );
    `,
    '3. Удаление таблицы traffic_with_anomalies': `DROP TABLE traffic_with_anomalies`,
    '4. Первые 10 записей в users': 'SELECT * FROM users LIMIT 10',
    '5. Создание таблицы users': `
        CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            email VARCHAR(100) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL, 
            is_active BOOLEAN DEFAULT TRUE,
            role VARCHAR(20) DEFAULT 'user',
            refresh_token VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
    `,
    '6. Удаление таблицы users': `DROP TABLE users`,
    '7. Статистика по таблицам': `SELECT 
      table_name,
      pg_size_pretty(pg_total_relation_size('"' || table_name || '"')) AS size
      FROM information_schema.tables
      WHERE table_schema = 'public'`,
    '8. Статистика по IP адресам' : `SELECT 
        ip,
        COUNT(*) AS total_records,
        SUM(CASE WHEN anomaly_lstm = 0 THEN 1 ELSE 0 END) AS lstm_0_count,
        SUM(CASE WHEN anomaly_lstm = 1 THEN 1 ELSE 0 END) AS lstm_1_count,
        SUM(CASE WHEN anomaly_ae = 0 THEN 1 ELSE 0 END) AS ae_0_count,
        SUM(CASE WHEN anomaly_ae = 1 THEN 1 ELSE 0 END) AS ae_1_count
      FROM traffic_with_anomalies
      GROUP BY ip
      ORDER BY ip;
    `,
    '9. Статус соединений': 'SELECT * FROM pg_stat_activity',
    '_10. Текущее время БД': `SELECT 
      TO_CHAR(
          NOW() AT TIME ZONE 'Europe/Moscow',
          'DD Month YYYY HH24:MI:SS'
      ) AS "Текущее время"
    `,
  };


  temp_predefinedQueries = this.predefinedQueries;
  is_hide = true;

  constructor(
    private sqlService: SqlService, 
    private fb: FormBuilder,
    private router: Router
  ) {
    this.sqlForm = this.fb.group({
      sqlQuery: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.checkDatabaseConnection();
  }


  togglePredefinedQueries(): void {
    this.showPredefinedQueries = !this.showPredefinedQueries;
  }

  executePredefinedQuery(sql: string): void {
    this.sqlForm.patchValue({ sqlQuery: sql });
    this.showPredefinedQueries = false;
    this.onSubmit();
  }

  private checkDatabaseConnection(): void {
    this.sqlService.checkConnection().subscribe(connected => {
      this.isConnected = connected;
      if (!connected) {
        this.error = 'Не удалось подключиться к базе данных';
      }
    });
  }

  onSubmit(): void {
    if (this.sqlForm.invalid) return;
  
    this.loading = true;
    this.error = null;
    this.resultMessage = null;
    this.tableData = [];
    this.tableColumns = [];
  
    const sql = this.sqlForm.value.sqlQuery;
  
    this.sqlService.executeQuery(sql).subscribe({
      next: (response: any) => {
        if (response.success && Array.isArray(response.data)) {
          this.tableData = response.data;
          this.tableColumns = Object.keys(response.data[0] || {});
        } else if (response.message) {
          this.resultMessage = response.message;
        } else {
          this.resultMessage = 'Команда выполнена успешно';
        }
        this.loading = false;
      },
      error: (err: unknown) => {
        if (err instanceof Error) {
          this.error = err.message || 'Ошибка при выполнении запроса';
        } else {
          this.error = 'Неизвестная ошибка';
        }
        this.loading = false;
      }
    });
  }
}
