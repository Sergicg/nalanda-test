import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { TaskSchedulerService } from './task-scheduler.service';
import { TaskEngineService } from '../task-engine/task-engine.service';
import { Task, TaskStatus } from '@domain';

class TaskEngineServiceMock {  
  tasks$ = new Subject<Task[]>();
  hasCapacity = jasmine.createSpy('hasCapacity').and.returnValue(true);
  tryExecute = jasmine.createSpy('tryExecute').and.callFake((id: string) => of(void 0));

  getTasks() {
    return this.tasks$.asObservable();
  }
}
const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: Math.random().toString(36).slice(2),
  title: 'Tarea',
  completed: false,
  dependencies: [],
  priority: 3,
  duration: 10,
  startAt: new Date(),
  state: TaskStatus.PENDING,
  retries: 0,
  ...overrides,
});

describe('TaskSchedulerService', () => {
  let scheduler: TaskSchedulerService;
  let engine: TaskEngineServiceMock;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TaskSchedulerService,
        { provide: TaskEngineService, useClass: TaskEngineServiceMock },
      ],
    });

    scheduler = TestBed.inject(TaskSchedulerService);
    engine = TestBed.inject(TaskEngineService) as any;
  });

  afterEach(() => {
    // limpiar spies
    engine.hasCapacity.calls.reset();
    engine.tryExecute.calls.reset();
  });

  it('start(): se suscribe a getTasks() y planifica elegibles', () => {
    scheduler.start();

    const task1 = makeTask({ title: 'A' });
    const task2 = makeTask({ title: 'B' });

    engine.tasks$.next([task1, task2]);

    expect(engine.hasCapacity).toHaveBeenCalled();
    // Debe intentar ejecutar ambos, porque ambos son elegibles
    expect(engine.tryExecute).toHaveBeenCalledTimes(2);
    expect(engine.tryExecute).toHaveBeenCalledWith(task1.id);
    expect(engine.tryExecute).toHaveBeenCalledWith(task2.id);
  });

  it('no duplica suscripciones si llamo a start() dos veces', () => {
    scheduler.start();
    scheduler.start(); // segunda llamada no debe duplicar

    const task = makeTask({ title: 'SoloUnaVez' });
    engine.tasks$.next([task]);

    expect(engine.tryExecute).toHaveBeenCalledTimes(1);
  });

  it('respeta la concurrencia: no ejecuta más cuando hasCapacity() devuelve false', () => {
    scheduler.start();

    // Simula que solo hay capacidad para 1: true en la 1ª llamada, luego false
    let calls = 0;
    engine.hasCapacity.and.callFake(() => ++calls === 1);

    const taskA = makeTask({ title: 'A', priority: 1 });
    const taskB = makeTask({ title: 'B', priority: 1 });
    const taskC = makeTask({ title: 'C', priority: 1 });

    engine.tasks$.next([taskA, taskB, taskC]);

    // Solo la primera pasa; al perder capacidad, el bucle se corta
    expect(engine.tryExecute).toHaveBeenCalledTimes(1);
    expect(engine.tryExecute).toHaveBeenCalledWith(taskA.id); // por prioridad y orden
  });

  it('ordena por prioridad ascendente antes de planificar', () => {
    scheduler.start();

    // Capacidad ilimitada para la prueba
    engine.hasCapacity.and.returnValue(true);

    const taskLow  = makeTask({ title: 'Low',  priority: 5 });
    const taskMid  = makeTask({ title: 'Mid',  priority: 3 });
    const taskHigh = makeTask({ title: 'High', priority: 1 });

    engine.tasks$.next([taskLow, taskHigh, taskMid]);

    // Debe llamar en orden: High -> Mid -> Low
    expect(engine.tryExecute.calls.count()).toBe(3);
    expect(engine.tryExecute.calls.argsFor(0)[0]).toBe(taskHigh.id);
    expect(engine.tryExecute.calls.argsFor(1)[0]).toBe(taskMid.id);
    expect(engine.tryExecute.calls.argsFor(2)[0]).toBe(taskLow.id);
  });

  it('respeta dependencias: ejecuta B solo cuando A está COMPLETED', () => {
    scheduler.start();

    const taskA = makeTask({ title: 'A (root)' });
    const taskB = makeTask({ title: 'B (dep A)', dependencies: [taskA] });

    // Emisión 1: A pending, B pending -> solo A es elegible
    engine.tasks$.next([taskA, taskB]);
    expect(engine.tryExecute).toHaveBeenCalledTimes(1);
    expect(engine.tryExecute).toHaveBeenCalledWith(taskA.id);

    engine.tryExecute.calls.reset();

    // Emisión 2: A completed, B pending -> ahora B elegible
    const taskACompleted = { ...taskA, state: TaskStatus.COMPLETED };
    engine.tasks$.next([taskACompleted, taskB]);

    expect(engine.tryExecute).toHaveBeenCalledTimes(1);
    expect(engine.tryExecute).toHaveBeenCalledWith(taskB.id);
  });

  it('respeta startAt: no ejecuta tareas con startAt en el futuro', () => {
    scheduler.start();

    const future = new Date(Date.now() + 60_000);
    const past   = new Date(Date.now() - 60_000);

    const taskFuture = makeTask({ title: 'Futuro', startAt: future });
    const taskPast   = makeTask({ title: 'Pasado', startAt: past });

    engine.tasks$.next([taskFuture, taskPast]);

    // Solo debe ejecutar la de "Pasado"
    expect(engine.tryExecute).toHaveBeenCalledTimes(1);
    expect(engine.tryExecute).toHaveBeenCalledWith(taskPast.id);
  });

  it('stop(): deja de planificar en siguientes emisiones', () => {
    scheduler.start();

    const task1 = makeTask({ title: 'Antes de stop' });
    engine.tasks$.next([task1]);
    expect(engine.tryExecute).toHaveBeenCalledTimes(1);

    engine.tryExecute.calls.reset();
    scheduler.stop();

    const task2 = makeTask({ title: 'Después de stop' });
    engine.tasks$.next([task2]);

    expect(engine.tryExecute).not.toHaveBeenCalled();
  });
});
