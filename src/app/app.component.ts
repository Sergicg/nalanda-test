import { Component } from '@angular/core';
import { DashboardComponent } from "./ui/containers/dashboard/dashboard.component";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DashboardComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Task Manager';
}
