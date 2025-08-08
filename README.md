Este proyecto implementa un **sistema de gestión y ejecución de tareas técnicas** con:

- Prioridades
- Dependencias
- Concurrencia controlada
- Reintentos automáticos
- Detección de bloqueos
- Alertas del sistema
- UI en tiempo real con Angular + PrimeNG
- Motor reactivo usando RxJS

Stack

- **Angular** 15+
- **PrimeNG** 18 (UI)
- **RxJS** para flujos reactivos y control de ejecución
- **Karma + Jasmine** para testing
- **TypeScript** para tipado estricto

Estructura del proyecto

Se sigue el patrón smart/dumb components.

src/
  domain/ -> Definiciones de tipos y enums
  services/
    alerts/ -> Servicio centralizado de alertas
    api/ -> Api de ejemplo para obtener tareas iniciales
    task-engine/ -> Core de ejecucuón de las tareas
    task-scheduler/ -> Planificador de ejecución
  ui/
    components/ -> Directorio de componentes tontos
        task-controls/ -> Controles para crear una nueva tarea
        task-list/ -> Listado de las tareas
    containers/ -> Directorio de componentes listos
        dashboard/ -> Pagina principal donde se recuperan datos, con UI

Funcionalidades

    Motor de Tareas (TaskEngine)
        A través de BehaviorSubject mantiene un estado reactivo de las tareas
        Ejecuta las tareas según las condiciones especificadas
        El éxito es aleatorio, alrededor del 70%
        Los fallos son aleatorios
        Se bloque si la duración es el doble de la duración estimada
        Genera alertas

    Planificador
        Observa el estado de las tareas
        Cuando hay huevo ejecuta las taraes que pueden ejecutarse
        Order por prioridad y respeta el startAt

    Servicio de alertas
        Expone stream de alertas y se muestras en la UI usando p-toast de primeNg

    Ui
        Carga las tareas
        Arranca el sistema
        Muestra la lista y los controles para hacer las acciones epecificadas
        Muestra las alertas


Testing
    Para ejecutar "ng-test"
    Tests unitarios con Karma + Jasmine.

    Cobertura de:
        Motor (task-engine.service.spec.ts).
        Planificador (task-scheduler.service.spec.ts).    
