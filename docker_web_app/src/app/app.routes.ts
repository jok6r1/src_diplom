import { Routes } from '@angular/router';
import { MainComponent } from './Components/main_page/Components/main.component';
import { MainLoginComponent } from './Components/login_regist/main_Login.component';
import { AuthGuard } from './Components/login_regist/services/authGuard.service';
import { SqlExecutorComponent } from './Components/diplom_app/Components/sql_component/sql-executor.component';
import { DownloadComponent } from './Components/diplom_app/Components/dowload/dowload.component';
import { TrafficDetailsComponent } from './Components/diplom_app/Components/diplom_main/TrafficDetails/traffic-details.component';
import { TrafficTableComponent } from './Components/diplom_app/Components/diplom_main/TrafficTable/traffic-table.component';
import { UserCardsComponent } from './Components/diplom_app/Components/diplom_main/user-cards.component.ts/user-cards.component';
import { UserTrafficComponent } from './Components/diplom_app/Components/diplom_main/user-cards.component.ts/user-traffic.component';

export const routes: Routes = [
    { 
        path: '', 
        redirectTo: '/users', 
        pathMatch: 'full' 
    },
    { 
        path: 'login', 
        component: MainLoginComponent 
    },
    { 
        path: 'main', 
        component: MainComponent, 
        canActivate: [AuthGuard] 
    },
    { 
        path: 'details/ip/:ip', component: TrafficDetailsComponent 

    },
    {
        path: 'sql',
        component: SqlExecutorComponent
    },
    {
        path: 'dowload',
        component: DownloadComponent
    },
    { 
        path: 'details/:id', 
        component: TrafficDetailsComponent 
    },
    { 
        path: 'users', 
        component: UserCardsComponent 

    },
    { 
        path: 'user-traffic/:userId', 
        component: TrafficTableComponent },
    { 
        // при бесконечном цикле
        path: '**', 
        redirectTo: '/login' 
    },
];
