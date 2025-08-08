import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { of, Subject } from 'rxjs';

import { DashboardComponent } from './dashboard.component';

// Servicios reales a mockear
import { TaskEngineService } from '../../../services/task-engine/task-engine.service';
import { TaskSchedulerService } from '../../../services/task-scheduler/task-scheduler.service';
import { TasksApiService } from 'app/services/api/task.api.service';
import { AlertsService } from 'app/services/alerts/alerts.service';
import { MessageService } from 'primeng/api';

// ===== Tipos mínimos (ajusta import si ya los tienes en @domain) =====
enum TaskStatus {
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
}

type Task = {
  id: string;
  title: string;
  completed: boolean;
  dependencies: Task[];
  priority: 1 | 2 | 3 | 4 | 5;
  duration: number;
  startAt: Date | undefined;
  state: TaskStatus;
  retries: number;
};

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: Math.random().toString(36).slice(2),
  title: 'Tarea',
  completed: false,
  dependencies: [],
  priority: 2,
  duration: 10,
  startAt: new Date(),
  state: TaskStatus.PENDING,
  retries: 0,
  ...over,
});

// ====== Mocks ======
class EngineMock {
  private tasks$ = new Subject<Task[]>();
  getTasks = jasmine.createSpy('getTasks').and.callFake(() => this.tasks$.asObservable());
  addTask = jasmine.createSpy('addTask');
  retryTask = jasmine.createSpy('retryTask');
  updateCreateAt = jasmine.createSpy('updateCreateAt');
  cancelTask = jasmine.createSpy('cancelTask');

  // para los tests, exponer un helper para emitir
  emitTasks(list: Task[]) { this.tasks$.next(list); }
}

class SchedulerMock {
  start = jasmine.createSpy('start');
  stop = jasmine.createSpy('stop');
}

class TasksApiMock {
  getAll = jasmine.createSpy('getAll').and.returnValue(of([]));
}

class AlertsServiceMock {
  private stream$ = new Subject<{severity: 'success'|'info'|'warn'|'error', summary: string, detail?: string}>();
  asStream = jasmine.createSpy('asStream').and.callFake(() => this.stream$.asObservable());
  emit(evt: {severity: 'success'|'info'|'warn'|'error', summary: string, detail?: string}) { this.stream$.next(evt); }
}

class MessageServiceMock {
  add = jasmine.createSpy('add');
}

xdescribe('DashboardComponent', () => {
  let fixture: any;
  let component: DashboardComponent;

  let engine: EngineMock;
  let scheduler: SchedulerMock;
  let tasksApi: TasksApiMock;
  let alerts: AlertsServiceMock;
  let messageService: MessageServiceMock;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent], // es standalone
      providers: [
        { provide: TaskEngineService, useClass: EngineMock },
        { provide: TaskSchedulerService, useClass: SchedulerMock },
        { provide: TasksApiService, useClass: TasksApiMock },
        { provide: AlertsService, useClass: AlertsServiceMock },
        { provide: MessageService, useClass: MessageServiceMock },
      ],
    })
    // Evitamos depender del template/HTML real
    .overrideComponent(DashboardComponent, { set: { template: '' } })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;

    engine = TestBed.inject(TaskEngineService) as any;
    scheduler = TestBed.inject(TaskSchedulerService) as any;
    tasksApi = TestBed.inject(TasksApiService) as any;
    alerts = TestBed.inject(AlertsService) as any;
    messageService = TestBed.inject(MessageService) as any;
  });

  it('ngOnInit: carga tareas del API y llama a engine.addTask por cada una', () => {
    const t1 = makeTask({ title: 'A' });
    const t2 = makeTask({ title: 'B' });
    tasksApi.getAll.and.returnValue(of([t1, t2]));

    fixture.detectChanges(); // dispara ngOnInit

    expect(tasksApi.getAll).toHaveBeenCalled();
    expect(engine.addTask).toHaveBeenCalledTimes(2);
    expect(engine.addTask).toHaveBeenCalledWith(t1);
    expect(engine.addTask).toHaveBeenCalledWith(t2);
  });

  it('ngOnInit: llama a scheduler.start y se suscribe a engine.getTasks para actualizar tasks', () => {
    fixture.detectChanges(); // ngOnInit

    expect(scheduler.start).toHaveBeenCalled();

    const list = [makeTask({ title: 'X' }), makeTask({ title: 'Y' })];
    engine.emitTasks(list);

    // No usamos fixture.detectChanges porque no hay template; comprobamos la propiedad
    expect(component['tasks']).toEqual(list);
  });

  it('ngOnInit: muestra toasts al recibir alertas', () => {
    fixture.detectChanges(); // ngOnInit

    alerts.emit({ severity: 'warn', summary: 'Algo pasó', detail: 'Detalle' });

    expect(messageService.add).toHaveBeenCalledWith({
      severity: 'warn',
      summary: 'Algo pasó',
      detail: 'Detalle',
      life: 2000,
    });
  });

  it('ngOnDestroy: llama a scheduler.stop y deja de reaccionar a nuevas alertas', () => {
    fixture.detectChanges();
    expect(scheduler.start).toHaveBeenCalled();

    // destruir componente
    fixture.destroy();
    expect(scheduler.stop).toHaveBeenCalled();

    // Emitir alerta tras destroy -> no debería añadir nuevos toasts
    const callsBefore = messageService.add.calls.count();
    alerts.emit({ severity: 'info', summary: 'Post-destroy' });

    expect(messageService.add.calls.count()).toBe(callsBefore);
  });

  it('addTask delega en engine.addTask', () => {
    const task = makeTask({ title: 'Nueva' });
    component.addTask(task);
    expect(engine.addTask).toHaveBeenCalledWith(task);
  });

  it('retryTask delega en engine.retryTask', () => {
    component.retryTask('id-123');
    expect(engine.retryTask).toHaveBeenCalledWith('id-123');
  });

  it('updateCreateAt delega en engine.updateCreateAt', () => {
    const t = makeTask({ id: 'abc', title: 'T' });
    component.updateCreateAt(t);
    expect(engine.updateCreateAt).toHaveBeenCalledWith(t);
  });

  it('cancelTask delega en engine.cancelTask', () => {
    component.cancelTask('id-999');
    expect(engine.cancelTask).toHaveBeenCalledWith('id-999');
  });
});
