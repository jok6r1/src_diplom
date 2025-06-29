import { Component, OnInit, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import * as bcrypt from 'bcryptjs';
import { environment } from '../../../enviroments';
import { LoginResponse } from './interfaces/loginResponse.interface';

@Component({
  selector: 'app-main-login',
  imports: [CommonModule, HttpClientModule],
  template: `
    <div class="container h-100 d-flex justify-content-center align-items-center min-vh-100" style="z-index: 2; padding: 0px">
      <div class="flip-container">
        <div class="flip-card" [class.flipped]="isFlipped">
          <img [src]="gifSrc" [ngClass]="{'visible': showGif}" alt="Летающий орёл" class="eagle-gif">
          <div class="flip-front">
            <form class="register-form">
              <div class="text-adaptive-header text-center">Вход в аккаунт</div>
              <div class="form-group">
                <input class="text-adaptive" type="text" id="username" name="username" placeholder="Введите ваше имя" required>
              </div>
              <div class="form-group">
                <input class="text-adaptive" type="email" id="email" name="email" placeholder="Введите ваш email" required>
              </div>
              <div class="form-group text-adaptive">
                <input class="text-adaptive" type="password" id="password" name="password" placeholder="Введите пароль" required>
              </div>
              <button type="submit" class="submit-btn text-adaptive" (click)="onSubmitLogin($event)">Вход</button>
              <p class="login-link text-adaptive">Еще нет аккаунта? 
                <button class="link-button" (click)="onRegist($event)">Зарегистрироваться</button>
              </p>
            </form>
          </div>

          <div class="flip-back" [class.animate]="isConditionMet">
            <form *ngIf="!showText" class="register-form">
              <div class="text-adaptive-header text-center animate-element">Регистрация</div>
              <div class="form-group animate-element">
                <input class="text-adaptive" type="text" id="username" name="username" placeholder="Введите ваше имя" required>
              </div>
              <div class="form-group animate-element">
                <input class="text-adaptive" type="email" id="email" name="email" placeholder="Введите ваш email" required>
              </div>
              <div class="form-group animate-element">
                <input class="text-adaptive" type="password" id="password" name="password" placeholder="Введите пароль" required>
              </div>
              <button type="submit" class="submit-btn text-adaptive animate-element" (click)="onSubmitRegister($event)">Зарегистрироваться</button>
              <p class="login-link text-adaptive animate-element">Уже есть аккаунт?
                <button class="link-button" (click)="onBack($event)">Войти</button>
              </p>
            </form>
            <div *ngIf="showText" class="center-text">Успешная регистрация!</div>
          </div>
        </div>
      </div>
      
      <div>
        <div class="gif-container">
          <img
            #gifElement 
            class="animated-gif"
            [ngClass]="currentAnimationClass"
            src="assets/gif/Bestie_eagle.gif" 
            alt="Animated GIF"
          >
        </div>
      </div>
    </div>
  `,
  styleUrls: ['styles/login.component.scss']
})
export class MainLoginComponent implements OnInit {

  @ViewChild('gifElement', { static: false }) gifElement!: ElementRef;

  isFlipped : boolean = false;
  showGif : boolean = false;
  gifSrc: string = 'assets/gif/Bald_Eagle_GIF.gif';
  isConditionMet = false; // Переменная для запуска анимации
  showText = false;
  apiUrl = environment.apiUrl;
  //appUrl = environment.appUrl;

  currentAnimationClass: string = 'moveRightUp'; // Начальный класс
  private animationClasses = ['moveLeftUp', 'moveLeftDown', 'moveRightUp', 'moveRightDown', 'moveAcrossAtLeftToRight', 'moveAcrossAtRighToLeft' ];

  constructor(private http: HttpClient, 
    private cdr: ChangeDetectorRef, 
    private router: Router,
    private authService: AuthService
  ) {
  }

  ngOnInit(): void {
    // анимация каждые 8 секунд
    setInterval(() => {
      this.setRandomAnimation();
    }, 8000);
  }

  setRandomAnimation(): void {
    const randomIndex = Math.floor(Math.random() * this.animationClasses.length);
    this.currentAnimationClass = this.animationClasses[randomIndex];
  }

  onRegist(event: Event): void {
    event.preventDefault();
    this.isFlipped = true;
  }

  onBack(event: Event): void {
    event.preventDefault(); // Предотвращаем действие кнопки
    this.isFlipped = false; // Отключаем переворот (если используется)
  }

  stylishedText() {
    this.isConditionMet = true;

    setTimeout(() => {
      this.showText = true;
      this.cdr.detectChanges(); 

      setTimeout(() => {
        this.isFlipped = false;
        this.showText = false;

        setTimeout(() => {
          this.showText = false;
          this.isConditionMet = false;
          this.cdr.detectChanges();
        }, 500);
        
      }, 1000);

    }, 2000);
  }

  // Двойная проверка на бэкенде
  // Легкий запрос проверки (SELECT EXISTS) и тяжелый запрос только при реальной регистрации
  // поэтому использую check-ser а потом register

  async onSubmitRegister(event: Event): Promise<void> {
    event.preventDefault();
    const button = event.target as HTMLElement;
    const form = button.closest('form') as HTMLFormElement;
  
    if (!form || !form.checkValidity()) {
      alert('Заполните все поля корректно!');
      return;
    }
  
    try {
      // 1. Подготавливаем данные формы
      const formData = new FormData(form);
      const data = {
        username: formData.get('username') as string,
        email: formData.get('email') as string,
        password: formData.get('password') as string
      };

      // по-хорошему надо бы хэш передавать а не сам пароль!
      //const hashedPassword = await bcrypt.hash(data.password, 10);
      //formData.delete('password');
      //formData.append('password', hashedPassword);

      // 2. Проверяем существование пользователя/email через GET
      // пагинация не нужна, так как главное применение пагинации - получение списка а не проверка условия
      const checkResponse = await this.http.get<any>(
        `${this.apiUrl}/check-user?username=${data.username}&email=${data.email}`
      ).toPromise();
      
      // 3. Анализируем ответ сервера
      if (checkResponse.exists) {
        alert(checkResponse.message || 'Пользователь или email уже существуют');
        return;
      }
  
      // 4. Если проверка пройдена - регистрируем
      const registerResponse = await this.http.post(
        `${this.apiUrl}/register`, 
        data
      ).toPromise();
  
      // 5. Обработка успешной регистрации
      this.gifSrc = `assets/gif/Bald_Eagle_GIF.gif?v=1.0`;
      
      this.stylishedText()
  
    } catch (error: unknown) {
      this.handleError(error, false);
    }
  }
  
  async onSubmitLogin(event: Event): Promise<void> {
    event.preventDefault();
    const button = event.target as HTMLElement;
    const form = button.closest('form') as HTMLFormElement;
  
    if (!form || !form.checkValidity()) {
      alert('Заполните все поля корректно!');
      return;
    }
  
    try {
      // 1. Подготавливаем данные формы
      const formData = new FormData(form);
      const data = {
        username: formData.get('username') as string,
        email: formData.get('email') as string,
        password: formData.get('password') as string
      };

      // 2. Проверяем существование пользователя/email через GET
      // пагинация не нужна, так как главное применение пагинации - получение списка а не проверка условия
      const checkResponse = await this.http.get<any>(
        `${this.apiUrl}/check-user?username=${data.username}&email=${data.email}`
      ).toPromise();
      
      // 3. Анализируем ответ сервера
      if (!checkResponse.exists) {
        alert('Такой пользователь не найден');
        return;
      }
  
      // 4. Если проверка пройдена - регистрируем
      const loginResponse = await this.http.post<LoginResponse>(
        `${this.apiUrl}/login`, 
        data
      ).toPromise();

      if(loginResponse){
        this.authService.setAccessToken(loginResponse.accessToken);
      }

      // 5. Обработка успешной регистрации
      this.gifSrc = `assets/gif/Bald_Eagle_GIF.gif?v=1.0`;
      this.showGif = true;
      
      
      setTimeout(() => {
        this.showGif = false;
        this.router.navigate(['/main']);
      }, 1400);
  
    } catch (error: unknown) {
      this.handleError(error, true);
    }
  }
  
  /*
    Тип ошибки	             |Результат
    ---------------------------------------------------
    HttpErrorResponse (400)	 |Берёт error.error.message
    Error('Не хватает прав') |Берёт error.message
    'some string'	           |Сообщение по умолчанию
    null/undefined	         |Сообщение по умолчанию
  */
  private handleError(error: unknown, isLogin : boolean): void {
    let errorMessage = 'Ошибка при регистрации';
    if(isLogin){
      errorMessage = 'Ошибка при Вхаде в аккаунт';
    }

    if (typeof error === 'object' && error !== null) {
      if ('error' in error && typeof error.error === 'object' && error.error !== null) {
        const serverError = error.error as { message?: string };
        errorMessage = serverError.message || errorMessage;
      } else if ('message' in error && typeof error.message === 'string') {
        errorMessage = error.message;
      }
    }
    
    console.error('Ошибка:', error);
    alert(errorMessage);
  }

}
import { AuthService } from './services/authService.service';
