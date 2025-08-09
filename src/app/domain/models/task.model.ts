import { TaskStatus } from "../enums";

export type Task = {
    id: string;
    title: string;    
    completed: boolean;    
    dependencies: Task[];    
    priority: number
    duration: number;
    startAt: Date | undefined;
    state: TaskStatus;
    retries: number;
}