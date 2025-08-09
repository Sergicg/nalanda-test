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
    let snapshot: Task[] = [];
    const sub = service.getTasks().subscribe(v => snapshot = v);

    const t = makeTask({ title: 'A' });
    service.addTask(t);
    tick(0);

    expect(snapshot.length).toBe(1);
    expect(snapshot[0].title).toBe('A');

    sub.unsubscribe();
  }));

  it('tryExecute (éxito): pasa a COMPLETED y emite alerta success', fakeAsync(() => {
    spyOn(Math, 'random').and.returnValue(0.0); // fuerza éxito

    const t = makeTask({ title: 'OK', duration: 20 });
    service.addTask(t);
    tick(0);

    service.tryExecute(t.id).subscribe();
    tick(20);
    tick(0);

    let final!: Task | undefined;
    const sub = service.getTasks().subscribe(list => final = list.find(x => x.id === t.id));
    tick(0);

    expect(final!.state).toBe(TaskStatus.COMPLETED);
    expect(alerts.success).toHaveBeenCalledWith(`Completada ${t.title}`, undefined, t.id);

    sub.unsubscribe();
  }));

  it('tryExecute (fallo): queda PENDING con retries=1 y emite alerta de reintento', fakeAsync(() => {
    spyOn(Math, 'random').and.returnValue(1.0);

    const t = makeTask({ title: 'KO', duration: 20 });
    service.addTask(t);
    tick(0);

    service.tryExecute(t.id).subscribe();
    tick(20);
    tick(0);

    let final!: Task;
    const sub = service.getTasks().subscribe(list => final = list.find(x => x.id === t.id)!);
    tick(0);

    expect(final.state).toBe(TaskStatus.PENDING);
    expect(final.retries).toBe(1);
    expect(alerts.info).toHaveBeenCalledWith(
      `Reintentando ${t.title}`,
      `Intento 1/3`,
      t.id
    );

    sub.unsubscribe();
  }));

  it('cancelTask: pasa a CANCELLED y emite alerta (según tu código actual usa error)', fakeAsync(() => {
    const t = makeTask({ title: 'Cancellable' });
    service.addTask(t);
    tick(0);

    service.cancelTask(t.id);
    tick(0);

    let final!: Task;
    const sub = service.getTasks().subscribe(list => final = list.find(x => x.id === t.id)!);
    tick(0);

    expect(final.state).toBe(TaskStatus.CANCELLED);    
    expect(alerts.error).toHaveBeenCalledWith(`Falló ${t.title}`, `Sin más reintentos`, t.id);

    sub.unsubscribe();
  }));

  it('deleteTask: elimina y limpia dependencias en otras tareas', fakeAsync(() => {
    const root  = makeTask({ title: 'Root' });
    const child = makeTask({ title: 'Child', dependencies: [root] });

    service.addTask(root);
    service.addTask(child);
    tick(0);

    service.deleteTask(root.id);
    tick(0);

    let list: Task[] = [];
    const sub = service.getTasks().subscribe(v => list = v);
    tick(0);

    expect(list.find(t => t.id === root.id)).toBeUndefined();
    const childAfter = list.find(t => t.id === child.id)!;
    expect(childAfter.dependencies.find(d => d.id === root.id)).toBeUndefined();

    sub.unsubscribe();
  }));

  it('retryTask: sobre FAILED pasa a PENDING con retries=1 y alerta info', fakeAsync(() => {
    const t = makeTask({ title: 'RetryMe', state: TaskStatus.FAILED, retries: 0 });
    service.addTask(t);
    tick(0);

    service.retryTask(t.id);
    tick(0);

    let after!: Task;
    const sub = service.getTasks().subscribe(list => after = list.find(x => x.id === t.id)!);
    tick(0);

    expect(after.state).toBe(TaskStatus.PENDING);
    expect(after.retries).toBe(1);
    expect(alerts.info).toHaveBeenCalledWith(
      `Reintentando ${t.title}`,
      `Intento 1/3`,
      t.id
    );

    sub.unsubscribe();
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
    (service as any).emitTasks([]); // sin tareas
    tick(0);

    expect(alerts.info).toHaveBeenCalledWith('Sistema inactivo');
  }));
});
