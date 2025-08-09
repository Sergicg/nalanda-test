import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TaskEngineService } from './task-engine.service';
import { AlertsService } from '../alerts/alerts.service';
import { Task, TaskStatus } from '@domain';

class AlertsServiceMock {
  success = jasmine.createSpy('success');
  info    = jasmine.createSpy('info');
  warn    = jasmine.createSpy('warn');
  error   = jasmine.createSpy('error');
}

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: Math.random().toString(36).slice(2),
  title: 'Tarea',
  completed: false,
  dependencies: [],
  priority: 2,
  duration: 50,              
  startAt: new Date(),       
  state: TaskStatus.PENDING,
  retries: 0,
  ...overrides,
});

describe('TaskEngineService (Karma/Jasmine)', () => {
  let service: TaskEngineService;
  let alerts: AlertsServiceMock;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TaskEngineService,
        { provide: AlertsService, useClass: AlertsServiceMock },
      ],
    });

    service = TestBed.inject(TaskEngineService);
    alerts  = TestBed.inject(AlertsService) as any;
  });

  afterEach(() => {    
    const anyRandom = Math.random as any;
    if (anyRandom.and?.originalFn) anyRandom.and.callThrough();
  });

  it('getTasks expone el estado y refleja addTask', fakeAsync(() => {
    let listTask: Task[] = [];
    const subscription = service.getTasks().subscribe(tasks => listTask = tasks);

    const task = makeTask({ title: 'A' });
    service.addTask(task);
    tick(0);

    expect(listTask.length).toBe(1);
    expect(listTask[0].title).toBe('A');

    subscription.unsubscribe();
  }));

  it('Éxito de tarea, pasa a COMPLETED y emite alerta success', fakeAsync(() => {
    spyOn(Math, 'random').and.returnValue(0.0); // fuerza éxito

    const task = makeTask({ title: 'OK', duration: 20 });
    service.addTask(task);
    tick(0);

    service.tryExecute(task.id).subscribe();
    tick(20);
    tick(0);

    let taskCompleted!: Task | undefined;
    const subscription = service.getTasks().subscribe(listTask => taskCompleted = listTask.find(t => t.id === task.id));
    tick(0);

    expect(taskCompleted!.state).toBe(TaskStatus.COMPLETED);
    expect(alerts.success).toHaveBeenCalledWith(`Completada ${task.title}`, undefined, task.id);

    subscription.unsubscribe();
  }));

  it('Fallo de la tarea, queda PENDING con retries=1 y emite alerta de reintento', fakeAsync(() => {
    spyOn(Math, 'random').and.returnValue(1.0);

    const task = makeTask({ title: 'KO', duration: 20 });
    service.addTask(task);
    tick(0);

    service.tryExecute(task.id).subscribe();
    tick(20);
    tick(0);

    let taskToRetryFinal!: Task;
    const subscription = service.getTasks().subscribe(list => taskToRetryFinal = list.find(t => t.id === task.id)!);
    tick(0);

    expect(taskToRetryFinal.state).toBe(TaskStatus.PENDING);
    expect(taskToRetryFinal.retries).toBe(1);
    expect(alerts.info).toHaveBeenCalledWith(
      `Reintentando ${task.title}`,
      `Intento 1/3`,
      task.id
    );

    subscription.unsubscribe();
  }));

  it('Canelación de la tarea: pasa a CANCELLED y emite alerta (según tu código actual usa error)', fakeAsync(() => {
    const task = makeTask({ title: 'Cancellable' });
    service.addTask(task);
    tick(0);

    service.cancelTask(task.id);
    tick(0);

    let taskCanceled!: Task;
    const subscription = service.getTasks().subscribe(list => taskCanceled = list.find(t => t.id === task.id)!);
    tick(0);

    expect(taskCanceled.state).toBe(TaskStatus.CANCELLED);
    expect(alerts.error).toHaveBeenCalledWith(`Falló ${task.title}`, `Sin más reintentos`, task.id);

    subscription.unsubscribe();
  }));

  it('Eliminación de la tarea: elimina y limpia dependencias en otras tareas', fakeAsync(() => {
    const taskRoot  = makeTask({ title: 'Root' });
    const child = makeTask({ title: 'Child', dependencies: [taskRoot] });

    service.addTask(taskRoot);
    service.addTask(child);
    tick(0);

    service.deleteTask(taskRoot.id);
    tick(0);

    let list: Task[] = [];
    const sub = service.getTasks().subscribe(v => list = v);
    tick(0);

    expect(list.find(t => t.id === taskRoot.id)).toBeUndefined();
    const childAfter = list.find(t => t.id === child.id)!;
    expect(childAfter.dependencies.find(d => d.id === taskRoot.id)).toBeUndefined();

    sub.unsubscribe();
  }));

  it('Reintentar: sobre FAILED pasa a PENDING con retries=1 y alerta info', fakeAsync(() => {
    const task = makeTask({ title: 'RetryMe', state: TaskStatus.FAILED, retries: 0 });
    service.addTask(task);
    tick(0);

    service.retryTask(task.id);
    tick(0);

    let after!: Task;
    const subscription = service.getTasks().subscribe(list => after = list.find(t => t.id === task.id)!);
    tick(0);

    expect(after.state).toBe(TaskStatus.PENDING);
    expect(after.retries).toBe(1);
    expect(alerts.info).toHaveBeenCalledWith(
      `Reintentando ${task.title}`,
      `Intento 1/3`,
      task.id
    );

    subscription.unsubscribe();
  }));

  it('alerta sistema: demasiadas P1 pendientes (>=5) lanza warn', fakeAsync(() => {
    const p1 = Array.from({ length: 5 }, (_, i) =>
      makeTask({ title: `P1-${i}`, priority: 1, state: TaskStatus.PENDING, startAt: undefined })
    );
    // usamos el método privado para disparar evaluateSystemAlerts
    (service as any).emitTasks(p1);
    tick(0);

    expect(alerts.warn).toHaveBeenCalledWith(
      'Demasiadas tareas de prioridad alta pendientes',
      'Hay 5 tareas P1 en cola'
    );
  }));

  it('alerta sistema: "Sistema inactivo" si no hay IN_PROGRESS ni PENDING listas', fakeAsync(() => {
    (service as any).emitTasks([]);
    tick(0);

    expect(alerts.info).toHaveBeenCalledWith('Sistema inactivo');
  }));
});
