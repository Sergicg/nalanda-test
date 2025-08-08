// src/app/services/task-scheduler.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { TaskSchedulerService } from './task-scheduler.service';
import { TaskEngineService } from '../task-engine/task-engine.service';
import { Task, TaskStatus } from '@domain';

// ---------- Mock del Engine ----------
class TaskEngineServiceMock {
  // getTasks() emitirá desde aquí
  tasks$ = new Subject<Task[]>();

  // spies
  hasCapacity = jasmine.createSpy('hasCapacity').and.returnValue(true);
  tryExecute = jasmine.createSpy('tryExecute').and.callFake((id: string) => of(void 0));

  getTasks() {
    return this.tasks$.asObservable();
  }
}

// ---------- Utilidades ----------
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

    const t1 = makeTask({ title: 'A' });
    const t2 = makeTask({ title: 'B' });

    engine.tasks$.next([t1, t2]);

    expect(engine.hasCapacity).toHaveBeenCalled();
    // Debe intentar ejecutar ambos, porque ambos son elegibles
    expect(engine.tryExecute).toHaveBeenCalledTimes(2);
    expect(engine.tryExecute).toHaveBeenCalledWith(t1.id);
    expect(engine.tryExecute).toHaveBeenCalledWith(t2.id);
  });

  it('no duplica suscripciones si llamo a start() dos veces', () => {
    scheduler.start();
    scheduler.start(); // segunda llamada no debe duplicar

    const t = makeTask({ title: 'SoloUnaVez' });
    engine.tasks$.next([t]);

    expect(engine.tryExecute).toHaveBeenCalledTimes(1);
  });

  it('respeta la concurrencia: no ejecuta más cuando hasCapacity() devuelve false', () => {
    scheduler.start();

    // Simula que solo hay capacidad para 1: true en la 1ª llamada, luego false
    let calls = 0;
    engine.hasCapacity.and.callFake(() => ++calls === 1);

    const a = makeTask({ title: 'A', priority: 1 });
    const b = makeTask({ title: 'B', priority: 1 });
    const c = makeTask({ title: 'C', priority: 1 });

    engine.tasks$.next([a, b, c]);

    // Solo la primera pasa; al perder capacidad, el bucle se corta
    expect(engine.tryExecute).toHaveBeenCalledTimes(1);
    expect(engine.tryExecute).toHaveBeenCalledWith(a.id); // por prioridad y orden
  });

  it('ordena por prioridad ascendente antes de planificar', () => {
    scheduler.start();

    // Capacidad ilimitada para la prueba
    engine.hasCapacity.and.returnValue(true);

    const low  = makeTask({ title: 'Low',  priority: 5 });
    const mid  = makeTask({ title: 'Mid',  priority: 3 });
    const high = makeTask({ title: 'High', priority: 1 });

    engine.tasks$.next([low, high, mid]);

    // Debe llamar en orden: High -> Mid -> Low
    expect(engine.tryExecute.calls.count()).toBe(3);
    expect(engine.tryExecute.calls.argsFor(0)[0]).toBe(high.id);
    expect(engine.tryExecute.calls.argsFor(1)[0]).toBe(mid.id);
    expect(engine.tryExecute.calls.argsFor(2)[0]).toBe(low.id);
  });

  it('respeta dependencias: ejecuta B solo cuando A está COMPLETED', () => {
    scheduler.start();

    const A = makeTask({ title: 'A (root)' });
    const B = makeTask({ title: 'B (dep A)', dependencies: [A] });

    // Emisión 1: A pending, B pending -> solo A es elegible
    engine.tasks$.next([A, B]);
    expect(engine.tryExecute).toHaveBeenCalledTimes(1);
    expect(engine.tryExecute).toHaveBeenCalledWith(A.id);

    engine.tryExecute.calls.reset();

    // Emisión 2: A completed, B pending -> ahora B elegible
    const Adone = { ...A, state: TaskStatus.COMPLETED };
    engine.tasks$.next([Adone, B]);

    expect(engine.tryExecute).toHaveBeenCalledTimes(1);
    expect(engine.tryExecute).toHaveBeenCalledWith(B.id);
  });

  it('respeta startAt: no ejecuta tareas con startAt en el futuro', () => {
    scheduler.start();

    const future = new Date(Date.now() + 60_000);
    const past   = new Date(Date.now() - 60_000);

    const Tfuture = makeTask({ title: 'Futuro', startAt: future });
    const Tpast   = makeTask({ title: 'Pasado', startAt: past });

    engine.tasks$.next([Tfuture, Tpast]);

    // Solo debe ejecutar la de "Pasado"
    expect(engine.tryExecute).toHaveBeenCalledTimes(1);
    expect(engine.tryExecute).toHaveBeenCalledWith(Tpast.id);
  });

  it('stop(): deja de planificar en siguientes emisiones', () => {
    scheduler.start();

    const t1 = makeTask({ title: 'Antes de stop' });
    engine.tasks$.next([t1]);
    expect(engine.tryExecute).toHaveBeenCalledTimes(1);

    engine.tryExecute.calls.reset();
    scheduler.stop();

    const t2 = makeTask({ title: 'Después de stop' });
    engine.tasks$.next([t2]);

    expect(engine.tryExecute).not.toHaveBeenCalled();
  });
});
