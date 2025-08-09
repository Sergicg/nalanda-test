import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Task } from '@domain';
import { TaskEngineService } from '../../../services/task-engine/task-engine.service';
import { TaskSchedulerService } from '../../../services/task-scheduler/task-scheduler.service';
import { TaskListComponent } from 'app/ui/components/task-list/task-list.component';
import { TaskControlsComponent } from 'app/ui/components/task-controls/task-controls.component';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { AlertsService } from 'app/services/alerts/alerts.service';
import { TasksApiService } from 'app/services/api/task.api.service';

@Component({
  selector: 'nl-dashboard',
  standalone: true,
  imports: [CardModule, ToastModule, TaskListComponent, TaskControlsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  providers: [MessageService]
})
export class DashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private messageService = inject(MessageService);

  private taskApiService = inject(TasksApiService);
  private engine = inject(TaskEngineService);
  private scheduler = inject(TaskSchedulerService);
  private alerts = inject(AlertsService);

  protected tasks: Task[] = [];
  // protected alerts: string[] = [];

  ngOnInit(): void {

    this.taskApiService.getAll()
      .pipe(
        takeUntil(this.destroy$),
        map(tasks => tasks.map(task => this.engine.addTask(task))))      
      .subscribe();

    // Arranca el scheduler (el engine lo usa internamente)
    this.scheduler.start();

    this.engine.getTasks().pipe(takeUntil(this.destroy$))
      .subscribe(ts => this.tasks = ts);

    this.alerts.asStream()
      .pipe(takeUntil(this.destroy$))
      .subscribe(a => {
        this.messageService.add({
          severity: a.severity,
          summary: a.summary,
          detail: a.detail,
          life: 2000,
        });
      });      
  }

  ngOnDestroy(): void {
    this.scheduler.stop();
    this.destroy$.next();
    this.destroy$.complete();
  }

  addTask(task: Task) {
    this.engine.addTask(task);
  }

  retryTask(taskId: string) {
    this.engine.retryTask(taskId);
  }

  updateCreateAt(task: Task) {
    this.engine.updateCreateAt(task);
  }

  cancelTask(taskId: string) {
    this.engine.cancelTask(taskId);
  }
}
